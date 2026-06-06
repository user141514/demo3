"""Test fixtures for Leadership AI Workshop backend.

Uses async SQLAlchemy with aiosqlite :memory: to match the app's async engine.
"""

import sys
from pathlib import Path
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session")
async def async_engine():
    """Create async SQLite :memory: engine for the entire test session."""
    import models  # noqa: F401  ensure all tables registered on Base.metadata
    from database import Base
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(async_engine) -> AsyncGenerator[AsyncSession, None]:
    """Provide an async session, rolled back after each test."""
    factory = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def async_client(async_engine, db_session) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client with injected test database session and services."""
    from main import app
    from database import get_db
    from dependencies import get_ws_manager, get_ai_service
    from websocket_manager import WebSocketManager
    from services.ai_service import DeepSeekService

    async def _override_get_db():
        yield db_session

    # Create fresh instances per client so tests are isolated
    test_ws_manager = WebSocketManager()
    test_ai_service = DeepSeekService(api_key="test-key")

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_ws_manager] = lambda: test_ws_manager
    app.dependency_overrides[get_ai_service] = lambda: test_ai_service

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


# ── factory helpers ──────────────────────────────────────────────────────────


async def create_workshop(client: AsyncClient, title: str = "测试工作坊", host_name: str = "测试主持人") -> dict:
    resp = await client.post("/api/workshops", json={"title": title, "host_name": host_name})
    assert resp.status_code == 201, f"Create workshop failed ({resp.status_code}): {resp.text}"
    return resp.json()


async def join_workshop(client: AsyncClient, workshop_id: int, name: str = "张三") -> dict:
    # Need workshop data to get invite_code
    w_resp = await client.get(f"/api/workshops/{workshop_id}")
    w = w_resp.json()
    resp = await client.post(
        f"/api/workshops/{workshop_id}/join",
        json={"name": name, "invite_code": w["invite_code"]},
    )
    assert resp.status_code == 200, f"Join workshop failed ({resp.status_code}): {resp.text}"
    return resp.json()


async def add_answer(client: AsyncClient, round_id: int, question_id: int, participant_id: int, content: str = "测试回答") -> dict:
    resp = await client.post(
        f"/api/rounds/{round_id}/answers",
        json={
            "question_id": question_id,
            "participant_id": participant_id,
            "content": content,
        },
    )
    assert resp.status_code == 201, f"Submit answer failed ({resp.status_code}): {resp.text}"
    return resp.json()


@pytest_asyncio.fixture
async def workshop_with_participants(async_client: AsyncClient) -> dict:
    """Workshop with 3 participants."""
    workshop = await create_workshop(async_client)
    w_id = workshop["id"]
    participants = []
    for name in ["张总", "李经理", "王专员"]:
        p = await join_workshop(async_client, w_id, name)
        participants.append(p)
    workshop["participants"] = participants
    return workshop


@pytest_asyncio.fixture
async def workshop_at_round2(async_client: AsyncClient) -> dict:
    """Workshop advanced to round 2 with a participant."""
    workshop = await create_workshop(async_client)
    w_id = workshop["id"]
    await join_workshop(async_client, w_id, "测试用户")
    resp = await async_client.post(f"/api/workshops/{w_id}/next-round")
    assert resp.status_code == 200
    return resp.json()
