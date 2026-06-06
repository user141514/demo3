"""Tests for Group/Round API endpoints."""

import pytest
from httpx import AsyncClient

from conftest import create_workshop, join_workshop


@pytest.mark.asyncio
async def test_get_questions(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    gid = p["group_id"]

    resp = await async_client.get(
        f"/api/groups/{gid}/questions", params={"workshop_id": w["id"]}
    )
    assert resp.status_code == 200
    questions = resp.json()
    assert len(questions) > 0


@pytest.mark.asyncio
async def test_get_questions_no_workshop(async_client: AsyncClient):
    resp = await async_client.get(
        "/api/groups/1/questions", params={"workshop_id": 99999}
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_submit_answer(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    gid = p["group_id"]
    resp = await async_client.get(
        f"/api/groups/{gid}/questions", params={"workshop_id": w["id"]}
    )
    q = resp.json()[0]

    resp = await async_client.post(
        f"/api/groups/{gid}/answers",
        json={
            "question_id": q["id"],
            "participant_id": p["id"],
            "session_token": p["session_token"],
            "content": "领导力需要战略眼光和团队协作能力。",
        },
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_submit_answer_empty_content(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    gid = p["group_id"]
    resp = await async_client.get(
        f"/api/groups/{gid}/questions", params={"workshop_id": w["id"]}
    )
    q = resp.json()[0]

    resp = await async_client.post(
        f"/api/groups/{gid}/answers",
        json={
            "question_id": q["id"],
            "participant_id": p["id"],
            "session_token": p["session_token"],
            "content": "",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_answers(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    gid = p["group_id"]
    resp = await async_client.get(
        f"/api/groups/{gid}/questions", params={"workshop_id": w["id"]}
    )
    q = resp.json()[0]

    await async_client.post(
        f"/api/groups/{gid}/answers",
        json={
            "question_id": q["id"],
            "participant_id": p["id"],
            "session_token": p["session_token"],
            "content": "回答1",
        },
    )
    resp = await async_client.get(
        f"/api/groups/{gid}/answers", params={"workshop_id": w["id"]}
    )
    assert resp.status_code == 200
    assert len(resp.json()) > 0


@pytest.mark.asyncio
async def test_get_answers_includes_participant_name(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"], "王总")
    gid = p["group_id"]
    resp = await async_client.get(
        f"/api/groups/{gid}/questions", params={"workshop_id": w["id"]}
    )
    q = resp.json()[0]

    await async_client.post(
        f"/api/groups/{gid}/answers",
        json={
            "question_id": q["id"],
            "participant_id": p["id"],
            "session_token": p["session_token"],
            "content": "测试回答",
        },
    )
    resp = await async_client.get(
        f"/api/groups/{gid}/answers", params={"workshop_id": w["id"]}
    )
    answers = resp.json()
    assert len(answers) > 0
    assert answers[0]["participant_name"] == "王总"
