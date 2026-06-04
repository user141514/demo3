import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_ai_service, get_kb_service
from models import AIQuestionLog, Participant, Workshop
from schemas import AIQuestionSubmit, AIQuestionOut
from services.ai_service import DeepSeekService
from services.knowledge_base_service import KnowledgeBaseService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workshops", tags=["ai-qa"])


@router.post("/{workshop_id}/ai-ask", response_model=AIQuestionOut)
async def ask_ai(
    workshop_id: int,
    data: AIQuestionSubmit,
    db: AsyncSession = Depends(get_db),
    ai_service: DeepSeekService = Depends(get_ai_service),
    kb_service: KnowledgeBaseService = Depends(get_kb_service),
):
    participant = await db.get(Participant, data.participant_id)
    if not participant or participant.workshop_id != workshop_id:
        raise HTTPException(status_code=403, detail="Participant not in this workshop")

    # Get group context from group's answers
    result = await db.execute(
        select(AIQuestionLog)
        .where(AIQuestionLog.workshop_id == workshop_id, AIQuestionLog.group_id == participant.group_id)
        .order_by(AIQuestionLog.created_at.asc())
    )
    history = result.scalars().all()

    group_context = "本组讨论历史：\n"
    for h in history[-5:]:
        group_context += f"Q: {h.question}\nA: {h.answer or '(等待回答)'}\n\n"

    # Search knowledge base
    kb_chunks = await kb_service.search(data.question, workshop_id, top_k=3)

    answer = await ai_service.answer_member_question(data.question, group_context, kb_chunks)

    log = AIQuestionLog(
        workshop_id=workshop_id, participant_id=data.participant_id,
        group_id=participant.group_id, question=data.question, answer=answer,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return AIQuestionOut(id=log.id, question=log.question, answer=log.answer, created_at=log.created_at)


@router.get("/{workshop_id}/ai-questions", response_model=list[AIQuestionOut])
async def get_ai_questions(
    workshop_id: int,
    participant_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    participant = await db.get(Participant, participant_id)
    if not participant or participant.workshop_id != workshop_id:
        raise HTTPException(status_code=403, detail="Not in this workshop")

    result = await db.execute(
        select(AIQuestionLog)
        .where(AIQuestionLog.participant_id == participant_id)
        .order_by(AIQuestionLog.created_at.desc())
    )
    logs = result.scalars().all()
    return [AIQuestionOut(id=l.id, question=l.question, answer=l.answer, created_at=l.created_at) for l in logs]
