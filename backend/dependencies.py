from fastapi import Depends, Request, WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from websocket_manager import WebSocketManager
from services.ai_service import DeepSeekService, get_deepseek_service
from services.knowledge_base_service import KnowledgeBaseService
from services.export_service import ExportService


def get_ws_manager(request: Request) -> WebSocketManager:
    return request.app.state.ws_manager


def get_ws_manager_from_ws(websocket: WebSocket) -> WebSocketManager:
    return websocket.app.state.ws_manager


def get_ai_service(request: Request) -> DeepSeekService:
    return request.app.state.ai_service


def get_kb_service(db: AsyncSession = Depends(get_db)) -> KnowledgeBaseService:
    return KnowledgeBaseService(db)


def get_export_service(db: AsyncSession = Depends(get_db)) -> ExportService:
    return ExportService(db)
