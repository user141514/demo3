"""Tests for WebSocket endpoints (requires running server — skip in unit test suite)."""

import json

import pytest
from httpx import AsyncClient

from conftest import create_workshop, join_workshop

pytestmark = pytest.mark.skip(reason="WebSocket tests require a running ASGI server; run with uvicorn for integration testing")


@pytest.mark.asyncio
async def test_websocket_connect(async_client: AsyncClient):
    """Client can connect to WebSocket endpoint."""
    w = await create_workshop(async_client)
    ws_url = f"ws://test/ws/{w['id']}"
    async with websockets.connect(ws_url) as ws:
        assert ws is not None


@pytest.mark.asyncio
async def test_websocket_invalid_workshop():
    """Connecting to non-existent workshop should be rejected."""
    with pytest.raises(Exception):
        async with websockets.connect("ws://test/ws/99999") as ws:
            await ws.recv()


@pytest.mark.asyncio
async def test_websocket_broadcast_on_new_answer(async_client: AsyncClient):
    """When an answer is submitted, connected WebSocket receives broadcast."""
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    r_resp = await async_client.get(f"/api/workshops/{w['id']}")
    round_id = r_resp.json()["rounds"][0]["id"]
    q_resp = await async_client.get(f"/api/rounds/{round_id}/questions")
    q = q_resp.json()[0]

    ws_url = f"ws://test/ws/{w['id']}"
    async with websockets.connect(ws_url) as ws:
        # Send a ping first (the backend reads text to keep connection alive)
        # Submit an answer via REST
        resp = await async_client.post(
            f"/api/rounds/{round_id}/answers",
            json={"question_id": q["id"], "participant_id": p["id"], "content": "WebSocket广播测试"},
        )
        assert resp.status_code == 201

        # Receive broadcast message
        try:
            msg = await ws.recv()
            data = json.loads(msg)
            assert "type" in data
            assert data["type"] == "new_answer"
            assert data["data"]["content"] == "WebSocket广播测试"
        except Exception as e:
            pytest.fail(f"Did not receive broadcast: {e}")


@pytest.mark.asyncio
async def test_websocket_disconnect_cleanup(async_client: AsyncClient):
    """Disconnecting one client doesn't break other clients."""
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    r_resp = await async_client.get(f"/api/workshops/{w['id']}")
    round_id = r_resp.json()["rounds"][0]["id"]
    q_resp = await async_client.get(f"/api/rounds/{round_id}/questions")
    q = q_resp.json()[0]

    ws_url = f"ws://test/ws/{w['id']}"
    async with websockets.connect(ws_url) as ws1:
        async with websockets.connect(ws_url) as ws2:
            await ws1.close()

            # ws2 should still work - submit answer and receive broadcast
            resp = await async_client.post(
                f"/api/rounds/{round_id}/answers",
                json={"question_id": q["id"], "participant_id": p["id"], "content": "断开测试"},
            )
            assert resp.status_code == 201

            try:
                msg = await ws2.recv()
                data = json.loads(msg)
                assert data["type"] == "new_answer"
            except Exception as e:
                pytest.fail(f"Surviving client did not receive broadcast: {e}")
