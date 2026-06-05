import logging
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from dependencies import get_ws_manager, get_ai_service
from models import (
    Round, Question, Answer, Participant, GroupRoundResult,
    SynthesisResult, GroupResultStatus, Workshop, HostInput,
)
from schemas import (
    AnswerSubmit, AnswerOut, QuestionOut, GroupRoundResultOut,
    SynthesisResultOut, GroupResultEdit, GroupResultMemberEdit,
)
from services.ai_service import DeepSeekService
from websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["rounds"])


def _as_utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _timer_remaining_seconds(rd: Round) -> Optional[int]:
    if not rd.timer_started_at:
        return None
    elapsed = int((datetime.now(timezone.utc) - _as_utc(rd.timer_started_at)).total_seconds())
    return max((rd.discussion_time or 0) * 60 - elapsed, 0)


def _is_timer_expired(rd: Round) -> bool:
    remaining = _timer_remaining_seconds(rd)
    return remaining is not None and remaining <= 0


# ── group question/answer endpoints ─────────────────────────────────────

@router.get("/groups/{group_id}/questions", response_model=List[QuestionOut])
async def get_group_questions(
    group_id: int, workshop_id: int = Query(...), db: AsyncSession = Depends(get_db),
):
    w = await db.get(Workshop, workshop_id)
    if not w:
        raise HTTPException(status_code=404, detail="Workshop not found")
    result = await db.execute(
        select(Round).where(
            Round.workshop_id == workshop_id,
            Round.round_number == w.current_round,
        )
    )
    active_round = result.scalar_one_or_none()
    if not active_round:
        raise HTTPException(status_code=404, detail="No active round")
    result = await db.execute(
        select(Question).where(Question.round_id == active_round.id).order_by(Question.order)
    )
    questions = result.scalars().all()
    return [QuestionOut(id=q.id, round_id=q.round_id, content=q.content, order=q.order) for q in questions]


@router.post("/groups/{group_id}/answers", response_model=AnswerOut, status_code=201)
async def submit_group_answer(
    group_id: int, data: AnswerSubmit,
    db: AsyncSession = Depends(get_db),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
):
    participant = await db.get(Participant, data.participant_id)
    if not participant or participant.group_id != group_id:
        raise HTTPException(status_code=403, detail="Participant not in this group")

    question = await db.get(Question, data.question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    rd = await db.get(Round, question.round_id)
    if not rd:
        raise HTTPException(status_code=404, detail="Round not found")
    if rd.status not in ("active", "input"):
        raise HTTPException(status_code=400, detail="Round is not accepting answers")
    if _is_timer_expired(rd):
        raise HTTPException(status_code=400, detail="Time is up; answers are closed")

    answer = Answer(question_id=data.question_id, participant_id=data.participant_id, content=data.content)
    db.add(answer)
    await db.commit()
    await db.refresh(answer)

    answer_out = AnswerOut(
        id=answer.id, question_id=answer.question_id, participant_id=answer.participant_id,
        content=answer.content, created_at=answer.created_at,
        participant_name=participant.name, group_id=participant.group_id,
    )
    await ws_manager.broadcast_new_answer(rd.workshop_id, group_id, answer_out.model_dump())
    return answer_out


@router.get("/groups/{group_id}/answers", response_model=List[AnswerOut])
async def get_group_answers(
    group_id: int, workshop_id: int = Query(...), db: AsyncSession = Depends(get_db),
):
    w = await db.get(Workshop, workshop_id)
    if not w:
        raise HTTPException(status_code=404, detail="Workshop not found")
    result = await db.execute(
        select(Round).where(
            Round.workshop_id == workshop_id,
            Round.round_number == w.current_round,
        )
    )
    active_round = result.scalar_one_or_none()
    if not active_round:
        return []

    result = await db.execute(
        select(Question).where(Question.round_id == active_round.id).order_by(Question.order)
    )
    questions = result.scalars().all()
    q_ids = [q.id for q in questions]

    result = await db.execute(
        select(Answer, Participant)
        .join(Participant, Answer.participant_id == Participant.id)
        .where(Answer.question_id.in_(q_ids), Participant.group_id == group_id)
        .order_by(Answer.created_at)
    )
    return [
        AnswerOut(
            id=a.id, question_id=a.question_id, participant_id=a.participant_id,
            content=a.content, created_at=a.created_at,
            participant_name=p.name, group_id=p.group_id,
        )
        for a, p in result.all()
    ]


# ── AI generation ───────────────────────────────────────────────────────

@router.post("/groups/{group_id}/ai-generate", response_model=GroupRoundResultOut)
async def trigger_group_ai(
    group_id: int, workshop_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    ai_service: DeepSeekService = Depends(get_ai_service),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
):
    w = await db.get(Workshop, workshop_id)
    if not w:
        raise HTTPException(status_code=404, detail="Workshop not found")

    result = await db.execute(
        select(Round).where(
            Round.workshop_id == workshop_id,
            Round.round_number == w.current_round,
        )
    )
    active_round = result.scalar_one_or_none()
    if not active_round:
        raise HTTPException(status_code=404, detail="No active round")

    # Check existing
    result = await db.execute(
        select(GroupRoundResult).where(
            GroupRoundResult.round_id == active_round.id,
            GroupRoundResult.group_id == group_id,
        )
    )
    gr = result.scalar_one_or_none()
    if gr and gr.status == GroupResultStatus.PROCESSING:
        raise HTTPException(status_code=400, detail="AI already generating")

    if not gr:
        gr = GroupRoundResult(round_id=active_round.id, group_id=group_id, status=GroupResultStatus.PROCESSING)
        db.add(gr)
    else:
        gr.status = GroupResultStatus.PROCESSING
    await db.commit()
    await db.refresh(gr)

    # Gather answers
    result = await db.execute(
        select(Question).where(Question.round_id == active_round.id).order_by(Question.order)
    )
    questions = result.scalars().all()
    q_ids = [q.id for q in questions]

    result = await db.execute(
        select(Answer, Participant, Question)
        .join(Participant, Answer.participant_id == Participant.id)
        .join(Question, Answer.question_id == Question.id)
        .where(Answer.question_id.in_(q_ids), Participant.group_id == group_id)
        .order_by(Question.order, Answer.created_at)
    )
    rows = result.all()
    if not rows:
        gr.status = GroupResultStatus.PENDING
        await db.commit()
        raise HTTPException(status_code=400, detail="No answers from this group")

    answers_text = ""
    for a, _p, q in rows:
        answers_text += f"**{q.content}**\n回答：{a.content}\n\n"

    try:
        round_num = active_round.round_number
        if round_num == 1:
            content, version, err = await ai_service.generate_group_dimensions(answers_text)
        elif round_num == 2:
            framework = await _get_host_input(workshop_id, 1, db)
            content, version, err = await ai_service.generate_group_layer_table(answers_text, framework)
        elif round_num == 3:
            consensus = await _get_synthesis_or_host_input(workshop_id, 2, db)
            content, version, err = await ai_service.generate_group_behaviors(answers_text, consensus)
        else:
            content, version, err = f"# 讨论四：落地应用场景\n\n{answers_text}", 1, None

        gr.original_content = content
        gr.version = version
        gr.validation_error = err
        if err:
            gr.status = GroupResultStatus.VALIDATION_FAILED
        else:
            gr.status = GroupResultStatus.READY
    except Exception as e:
        logger.error(f"AI generation failed: {e}")
        gr.status = GroupResultStatus.VALIDATION_FAILED
        gr.validation_error = str(e)

    await db.commit()
    await db.refresh(gr)

    out = GroupRoundResultOut.model_validate(gr)
    await ws_manager.broadcast_result_ready(workshop_id, group_id, round_num, out.model_dump())
    return out


@router.get("/groups/{group_id}/ai-result", response_model=GroupRoundResultOut)
async def get_group_ai_result(
    group_id: int, workshop_id: int = Query(...), db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Round).where(Round.workshop_id == workshop_id, Round.round_number == select(Workshop.current_round).where(Workshop.id == workshop_id).scalar_subquery())
    )
    active_round = result.scalar_one_or_none()
    if not active_round:
        raise HTTPException(status_code=404, detail="No active round")

    result = await db.execute(
        select(GroupRoundResult).where(
            GroupRoundResult.round_id == active_round.id, GroupRoundResult.group_id == group_id,
        ).order_by(GroupRoundResult.created_at.desc()).limit(1)
    )
    gr = result.scalar_one_or_none()
    if not gr:
        raise HTTPException(status_code=404, detail="No result yet")
    return GroupRoundResultOut.model_validate(gr)


@router.put("/groups/{group_id}/ai-result", response_model=GroupRoundResultOut)
async def edit_group_ai_result(
    group_id: int,
    data: GroupResultMemberEdit,
    workshop_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
):
    participant = await db.get(Participant, data.participant_id)
    if (
        not participant
        or participant.workshop_id != workshop_id
        or participant.group_id != group_id
        or participant.session_token != data.session_token
    ):
        raise HTTPException(status_code=403, detail="Invalid participant")
    if not participant.is_group_leader:
        raise HTTPException(status_code=403, detail="Only group leader can edit AI result")

    w = await db.get(Workshop, workshop_id)
    if not w:
        raise HTTPException(status_code=404, detail="Workshop not found")

    result = await db.execute(
        select(Round).where(Round.workshop_id == workshop_id, Round.round_number == w.current_round)
    )
    active_round = result.scalar_one_or_none()
    if not active_round:
        raise HTTPException(status_code=404, detail="No active round")

    result = await db.execute(
        select(GroupRoundResult).where(
            GroupRoundResult.round_id == active_round.id,
            GroupRoundResult.group_id == group_id,
        ).order_by(GroupRoundResult.created_at.desc()).limit(1)
    )
    gr = result.scalar_one_or_none()
    if not gr:
        raise HTTPException(status_code=404, detail="No result yet")

    gr.edited_content = data.edited_content
    gr.status = GroupResultStatus.EDITED
    await db.commit()
    await db.refresh(gr)

    out = GroupRoundResultOut.model_validate(gr)
    await ws_manager.broadcast_result_ready(workshop_id, group_id, active_round.round_number, out.model_dump())
    return out


# ── synthesis ───────────────────────────────────────────────────────────

@router.post("/rounds/{round_id}/synthesize", response_model=SynthesisResultOut)
async def trigger_synthesis(
    round_id: int,
    db: AsyncSession = Depends(get_db),
    ai_service: DeepSeekService = Depends(get_ai_service),
    ws_manager: WebSocketManager = Depends(get_ws_manager),
):
    rd = await db.get(Round, round_id)
    if not rd:
        raise HTTPException(status_code=404, detail="Round not found")

    result = await db.execute(
        select(GroupRoundResult).where(GroupRoundResult.round_id == round_id)
    )
    group_results = result.scalars().all()
    ready_results = [g for g in group_results if g.original_content and g.status in (GroupResultStatus.READY, GroupResultStatus.EDITED)]
    if len(ready_results) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 group results")

    # Upsert synthesis result
    result = await db.execute(
        select(SynthesisResult).where(SynthesisResult.round_id == round_id, SynthesisResult.workshop_id == rd.workshop_id)
    )
    sr = result.scalar_one_or_none()
    if not sr:
        sr = SynthesisResult(workshop_id=rd.workshop_id, round_id=round_id, status=GroupResultStatus.PROCESSING)
        db.add(sr)
    else:
        sr.status = GroupResultStatus.PROCESSING
        sr.validation_error = None
    await db.commit()
    await db.refresh(sr)

    groups_data = [{"group_id": g.group_id, "content": g.edited_content or g.original_content} for g in ready_results]

    try:
        if rd.round_number == 1:
            content, version, err = await ai_service.synthesize_dimensions(groups_data)
        elif rd.round_number == 2:
            content, version, err = await ai_service.synthesize_layer_table(groups_data)
        elif rd.round_number == 3:
            content, version, err = await ai_service.synthesize_behaviors(groups_data)
        else:
            content, version, err = "综合结果参见各组回答", 1, None

        sr.original_content = content
        sr.version = version
        sr.validation_error = err
        sr.status = GroupResultStatus.VALIDATION_FAILED if err else GroupResultStatus.READY
    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        sr.status = GroupResultStatus.VALIDATION_FAILED
        sr.validation_error = str(e)

    await db.commit()
    await db.refresh(sr)

    out = SynthesisResultOut.model_validate(sr)
    await ws_manager.broadcast_synthesis_ready(rd.workshop_id, rd.round_number, out.model_dump())
    return out


@router.get("/rounds/{round_id}/synthesis", response_model=SynthesisResultOut)
async def get_synthesis(round_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SynthesisResult).where(SynthesisResult.round_id == round_id).order_by(SynthesisResult.created_at.desc()).limit(1)
    )
    sr = result.scalar_one_or_none()
    if not sr:
        raise HTTPException(status_code=404, detail="No synthesis yet")
    return SynthesisResultOut.model_validate(sr)


# ── helpers ──────────────────────────────────────────────────────────────

async def _get_host_input(workshop_id: int, round_number: int, db: AsyncSession) -> str:
    result = await db.execute(
        select(Round).where(Round.workshop_id == workshop_id, Round.round_number == round_number)
    )
    rd = result.scalar_one_or_none()
    if not rd:
        return ""
    result = await db.execute(
        select(HostInput).where(HostInput.round_id == rd.id).order_by(HostInput.created_at.desc()).limit(1)
    )
    hi = result.scalar_one_or_none()
    return hi.content if hi else ""


async def _get_synthesis_or_host_input(workshop_id: int, round_number: int, db: AsyncSession) -> str:
    result = await db.execute(
        select(Round).where(Round.workshop_id == workshop_id, Round.round_number == round_number)
    )
    rd = result.scalar_one_or_none()
    if not rd:
        return ""
    result = await db.execute(
        select(SynthesisResult).where(SynthesisResult.round_id == rd.id).order_by(SynthesisResult.created_at.desc()).limit(1)
    )
    sr = result.scalar_one_or_none()
    if sr and sr.original_content:
        return sr.edited_content or sr.original_content
    return await _get_host_input(workshop_id, round_number, db)
