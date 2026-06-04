"""Tests for Round API endpoints (async)."""

import pytest
from httpx import AsyncClient

from tests.conftest import create_workshop, join_workshop, add_answer


async def _get_first_round(client: AsyncClient, workshop_id: int) -> dict:
    resp = await client.get(f"/api/workshops/{workshop_id}")
    return resp.json()["rounds"][0]


async def _get_first_question(client: AsyncClient, round_id: int) -> dict:
    resp = await client.get(f"/api/rounds/{round_id}/questions")
    return resp.json()[0]


# ── Get Questions ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_questions(async_client: AsyncClient):
    w = await create_workshop(async_client)
    r = await _get_first_round(async_client, w["id"])
    resp = await async_client.get(f"/api/rounds/{r['id']}/questions")
    assert resp.status_code == 200
    questions = resp.json()
    assert len(questions) == 7


@pytest.mark.asyncio
async def test_round_2_questions(async_client: AsyncClient):
    w = await create_workshop(async_client)
    await async_client.post(f"/api/workshops/{w['id']}/next-round")
    resp = await async_client.get(f"/api/workshops/{w['id']}")
    round2 = resp.json()["rounds"][1]
    q_resp = await async_client.get(f"/api/rounds/{round2['id']}/questions")
    assert len(q_resp.json()) == 4


@pytest.mark.asyncio
async def test_round_3_questions(async_client: AsyncClient):
    w = await create_workshop(async_client)
    for _ in range(2):
        await async_client.post(f"/api/workshops/{w['id']}/next-round")
    resp = await async_client.get(f"/api/workshops/{w['id']}")
    round3 = resp.json()["rounds"][2]
    q_resp = await async_client.get(f"/api/rounds/{round3['id']}/questions")
    assert len(q_resp.json()) == 5


@pytest.mark.asyncio
async def test_round_4_questions(async_client: AsyncClient):
    w = await create_workshop(async_client)
    for _ in range(3):
        await async_client.post(f"/api/workshops/{w['id']}/next-round")
    resp = await async_client.get(f"/api/workshops/{w['id']}")
    round4 = resp.json()["rounds"][3]
    q_resp = await async_client.get(f"/api/rounds/{round4['id']}/questions")
    assert len(q_resp.json()) == 5


@pytest.mark.asyncio
async def test_get_questions_not_found(async_client: AsyncClient):
    resp = await async_client.get("/api/rounds/99999/questions")
    assert resp.status_code == 404


# ── Submit Answer ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_submit_answer(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    r = await _get_first_round(async_client, w["id"])
    q = await _get_first_question(async_client, r["id"])

    resp = await async_client.post(
        f"/api/rounds/{r['id']}/answers",
        json={"question_id": q["id"], "participant_id": p["id"], "content": "领导力需要战略眼光和团队协作能力。"},
    )
    assert resp.status_code == 201
    a = resp.json()
    assert a["question_id"] == q["id"]
    assert a["content"] == "领导力需要战略眼光和团队协作能力。"


@pytest.mark.asyncio
async def test_submit_answer_empty_content(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    r = await _get_first_round(async_client, w["id"])
    q = await _get_first_question(async_client, r["id"])

    resp = await async_client.post(
        f"/api/rounds/{r['id']}/answers",
        json={"question_id": q["id"], "participant_id": p["id"], "content": ""},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_submit_answer_round_not_found(async_client: AsyncClient):
    resp = await async_client.post("/api/rounds/99999/answers", json={"question_id": 1, "participant_id": 1, "content": "test"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_multiple_participants_same_question(async_client: AsyncClient):
    w = await create_workshop(async_client)
    r = await _get_first_round(async_client, w["id"])
    q = await _get_first_question(async_client, r["id"])

    ids = set()
    for name in ["用户A", "用户B", "用户C"]:
        p = await join_workshop(async_client, w["id"], name)
        resp = await async_client.post(
            f"/api/rounds/{r['id']}/answers",
            json={"question_id": q["id"], "participant_id": p["id"], "content": f"{name}的回答"},
        )
        assert resp.status_code == 201
        ids.add(resp.json()["id"])
    assert len(ids) == 3


# ── Get Answers ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_answers(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    r = await _get_first_round(async_client, w["id"])
    q = await _get_first_question(async_client, r["id"])

    await add_answer(async_client, r["id"], q["id"], p["id"], "回答1")
    # Get second question too
    q_resp = await async_client.get(f"/api/rounds/{r['id']}/questions")
    q2 = q_resp.json()[1]
    await add_answer(async_client, r["id"], q2["id"], p["id"], "回答2")

    resp = await async_client.get(f"/api/rounds/{r['id']}/answers")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_get_answers_includes_participant_name(async_client: AsyncClient):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"], "王总")
    r = await _get_first_round(async_client, w["id"])
    q = await _get_first_question(async_client, r["id"])
    await add_answer(async_client, r["id"], q["id"], p["id"], "测试回答")

    resp = await async_client.get(f"/api/rounds/{r['id']}/answers")
    answers = resp.json()
    assert answers[0]["participant_name"] == "王总"


@pytest.mark.asyncio
async def test_get_answers_empty_round(async_client: AsyncClient):
    w = await create_workshop(async_client)
    r = await _get_first_round(async_client, w["id"])
    resp = await async_client.get(f"/api/rounds/{r['id']}/answers")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_answers_round_not_found(async_client: AsyncClient):
    resp = await async_client.get("/api/rounds/99999/answers")
    assert resp.status_code == 404


# ── Summarize ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_summarize(async_client: AsyncClient, mock_anthropic):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    r = await _get_first_round(async_client, w["id"])
    q_resp = await async_client.get(f"/api/rounds/{r['id']}/questions")
    for q in q_resp.json()[:3]:
        await add_answer(async_client, r["id"], q["id"], p["id"], "领导力需要战略眼光。")

    resp = await async_client.post(f"/api/rounds/{r['id']}/summarize")
    assert resp.status_code == 200
    data = resp.json()
    assert "content" in data
    assert len(data["content"]) > 0


@pytest.mark.asyncio
async def test_summarize_empty_round(async_client: AsyncClient):
    w = await create_workshop(async_client)
    r = await _get_first_round(async_client, w["id"])
    resp = await async_client.post(f"/api/rounds/{r['id']}/summarize")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_summarize_round_not_found(async_client: AsyncClient):
    resp = await async_client.post("/api/rounds/99999/summarize")
    assert resp.status_code == 404


# ── Get Summary ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_summary(async_client: AsyncClient, mock_anthropic):
    w = await create_workshop(async_client)
    p = await join_workshop(async_client, w["id"])
    r = await _get_first_round(async_client, w["id"])
    q_resp = await async_client.get(f"/api/rounds/{r['id']}/questions")
    for q in q_resp.json()[:2]:
        await add_answer(async_client, r["id"], q["id"], p["id"], "测试内容。")

    await async_client.post(f"/api/rounds/{r['id']}/summarize")
    resp = await async_client.get(f"/api/rounds/{r['id']}/summary")
    assert resp.status_code == 200
    assert len(resp.json()["content"]) > 0


@pytest.mark.asyncio
async def test_get_summary_not_found(async_client: AsyncClient):
    w = await create_workshop(async_client)
    r = await _get_first_round(async_client, w["id"])
    resp = await async_client.get(f"/api/rounds/{r['id']}/summary")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_summary_round_not_found(async_client: AsyncClient):
    resp = await async_client.get("/api/rounds/99999/summary")
    assert resp.status_code == 404
