"""Tests for Workshop API endpoints (async)."""

import pytest
from httpx import AsyncClient

from conftest import create_workshop, join_workshop


@pytest.mark.asyncio
async def test_create_workshop(async_client: AsyncClient):
    w = await create_workshop(async_client)
    assert w["title"] == "测试工作坊"
    assert w["host_name"] == "测试主持人"
    assert w["invite_code"] is not None
    assert w["host_code"] is not None


@pytest.mark.asyncio
async def test_create_workshop_missing_host(async_client: AsyncClient):
    resp = await async_client.post("/api/workshops", json={"title": "test"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_workshop_empty_body(async_client: AsyncClient):
    resp = await async_client.post("/api/workshops", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_workshop(async_client: AsyncClient):
    w = await create_workshop(async_client)
    resp = await async_client.get(f"/api/workshops/{w['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "测试工作坊"


@pytest.mark.asyncio
async def test_get_workshop_not_found(async_client: AsyncClient):
    resp = await async_client.get("/api/workshops/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_workshop_includes_participants(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p1 = await join_workshop(async_client, w["id"], "张总")
    await join_workshop(async_client, w["id"], "李经理")

    # Access workshop view as participant p1 to see group_members
    resp = await async_client.get(
        f"/api/workshops/{w['id']}",
        params={"participant_id": p1["id"], "session_token": p1["session_token"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "participant" in data
    assert "group_members" in data


@pytest.mark.asyncio
async def test_join_workshop(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"], "张三")
    assert p["name"] == "张三"
    assert p["group_id"] in (1, 2, 3, 4)


@pytest.mark.asyncio
async def test_join_workshop_multiple(async_client: AsyncClient):
    w = await create_workshop(async_client)
    for name in ["张三", "李四", "王五"]:
        p = await join_workshop(async_client, w["id"], name)
        assert p["name"] == name


@pytest.mark.asyncio
async def test_join_workshop_not_found(async_client: AsyncClient):
    resp = await async_client.post(
        "/api/workshops/99999/join",
        json={"name": "测试", "invite_code": "XXXXXX"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_join_workshop_duplicate_name(async_client: AsyncClient):
    w = await create_workshop(async_client)
    payload = {"name": "张三", "invite_code": w["invite_code"]}
    r1 = await async_client.post(f"/api/workshops/{w['id']}/join", json=payload)
    r2 = await async_client.post(f"/api/workshops/{w['id']}/join", json=payload)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] != r2.json()["id"]


@pytest.mark.asyncio
async def test_host_view(async_client: AsyncClient):
    w = await create_workshop(async_client)
    resp = await async_client.get(
        f"/api/workshops/{w['id']}/host", params={"code": w["host_code"]}
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_host_view_bad_code(async_client: AsyncClient):
    w = await create_workshop(async_client)
    resp = await async_client.get(
        f"/api/workshops/{w['id']}/host", params={"code": "WRONG"}
    )
    assert resp.status_code == 403
