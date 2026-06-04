import base64
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_kb_service
from models import Workshop
from schemas import KnowledgeDocumentOut, ValidateAdminRequest, ValidateResponse
from services.knowledge_base_service import KnowledgeBaseService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class KnowledgeUploadRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=500)
    content_base64: str = Field(..., min_length=1)
    content_type: str = Field(default="application/octet-stream")
    workshop_id: int
    admin_code: str


@router.post("/validate-admin", response_model=ValidateResponse)
async def validate_admin(data: ValidateAdminRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workshop).where(Workshop.kb_admin_code == data.admin_code))
    w = result.scalar_one_or_none()
    if not w:
        return ValidateResponse(valid=False)
    return ValidateResponse(valid=True, workshop_id=w.id, workshop_title=w.title)


@router.post("/upload", response_model=KnowledgeDocumentOut)
async def upload_document(
    data: KnowledgeUploadRequest,
    db: AsyncSession = Depends(get_db),
    kb_service: KnowledgeBaseService = Depends(get_kb_service),
):
    result = await db.execute(select(Workshop).where(Workshop.id == data.workshop_id))
    w = result.scalar_one_or_none()
    if not w or w.kb_admin_code != data.admin_code:
        raise HTTPException(status_code=403, detail="Invalid admin code")

    try:
        content = base64.b64decode(data.content_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 content")

    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    doc = await kb_service.upload(
        filename=data.filename,
        content=content,
        content_type=data.content_type,
        workshop_id=data.workshop_id,
    )
    return KnowledgeDocumentOut.model_validate(doc)


@router.get("/documents", response_model=list[KnowledgeDocumentOut])
async def list_documents(
    workshop_id: int = Query(...),
    admin_code: str = Query(...),
    db: AsyncSession = Depends(get_db),
    kb_service: KnowledgeBaseService = Depends(get_kb_service),
):
    result = await db.execute(select(Workshop).where(Workshop.id == workshop_id))
    w = result.scalar_one_or_none()
    if not w or w.kb_admin_code != admin_code:
        raise HTTPException(status_code=403, detail="Invalid admin code")

    docs = await kb_service.list_docs(workshop_id)
    return [KnowledgeDocumentOut.model_validate(d) for d in docs]


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    workshop_id: int = Query(...),
    admin_code: str = Query(...),
    db: AsyncSession = Depends(get_db),
    kb_service: KnowledgeBaseService = Depends(get_kb_service),
):
    result = await db.execute(select(Workshop).where(Workshop.id == workshop_id))
    w = result.scalar_one_or_none()
    if not w or w.kb_admin_code != admin_code:
        raise HTTPException(status_code=403, detail="Invalid admin code")

    ok = await kb_service.delete(doc_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"status": "deleted"}
