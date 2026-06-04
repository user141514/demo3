"""Tests for Workshop API endpoints (async)."""

import pytest
from httpx import AsyncClient

from tests.conftest import create_workshop, join_workshop


@pytest.mark.asyncio
async def test_create_workshop(async_client: AsyncClient):
    w = await create_workshop(async_client)
    assert w["title"] == "测试工作坊"
    assert w["status"] == "active"
    assert w["current_round"] == 1
    assert len(w["rounds"]) == 4


@pytest.mark.asyncio
async def test_create_workshop_empty_title(async_client: AsyncClient):
    resp = await async_client.post("/api/workshops", json={"title": ""})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_workshop_missing_title(async_client: AsyncClient):
    resp = await async_client.post("/api/workshops", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_workshop(async_client: AsyncClient):
    w = await create_workshop(async_client)
    resp = await async_client.get(f"/api/workshops/{w['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "测试工作坊"
    assert len(data["rounds"]) == 4


@pytest.mark.asyncio
async def test_get_workshop_not_found(async_client: AsyncClient):
    resp = await async_client.get("/api/workshops/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_workshop_includes_participants(async_client: AsyncClient):
    w = await create_workshop(async_client)
    await join_workshop(async_client, w["id"], "张总", "senior")
    await join_workshop(async_client, w["id"], "李经理", "middle")
    resp = await async_client.get(f"/api/workshops/{w['id']}")
    participants = resp.json().get("participants", [])
    names = {p["name"] for p in participants}
    assert "张总" in names
    assert "李经理" in names


@pytest.mark.asyncio
async def test_join_workshop(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    assert p["name"] == "张三"
    assert p["role"] == "senior"


@pytest.mark.asyncio
async def test_join_workshop_three_roles(async_client: AsyncClient):
    w = await create_workshop(async_client)
    roles = ["senior", "middle", "junior"]
    for role in roles:
        p = await join_workshop(async_client, w["id"], f"测试-{role}", role)
        assert p["role"] == role


@pytest.mark.asyncio
async def test_join_workshop_not_found(async_client: AsyncClient):
    resp = await async_client.post("/api/workshops/99999/join", json={"name": "测试", "role": "senior"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_join_workshop_duplicate_name(async_client: AsyncClient):
    w = await create_workshop(async_client)
    r1 = await async_client.post(f"/api/workshops/{w['id']}/join", json={"name": "张三", "role": "senior"})
    r2 = await async_client.post(f"/api/workshops/{w['id']}/join", json={"name": "张三", "role": "junior"})
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] != r2.json()["id"]


@pytest.mark.asyncio
async def test_next_round(async_client: AsyncClient):
    w = await create_workshop(async_client)
    resp = await async_client.post(f"/api/workshops/{w['id']}/next-round")
    assert resp.status_code == 200
    assert resp.json()["current_round"] == 2


@pytest.mark.asyncio
async def test_next_round_full_cycle(async_client: AsyncClient):
    w = await create_workshop(async_client)
    # 1→2, 2→3, 3→4
    for i in range(3):
        resp = await async_client.post(f"/api/workshops/{w['id']}/next-round")
        assert resp.status_code == 200
        w = resp.json()
    assert w["current_round"] == 4
    # 4→completed
    resp = await async_client.post(f"/api/workshops/{w['id']}/next-round")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_next_round_not_found(async_client: AsyncClient):
    resp = await async_client.post("/api/workshops/99999/next-round")
    assert resp.status_code == 404
