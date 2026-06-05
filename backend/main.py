import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Depends

from config import settings
from database import init_db
from dependencies import get_ws_manager_from_ws
from routes import workshops_router, rounds_router, knowledge_router, ai_qa_router
from websocket_manager import WebSocketManager
from services.ai_service import DeepSeekService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database...")
    await init_db()
    logger.info("Database initialized.")
    app.state.ws_manager = WebSocketManager()
    app.state.ai_service = DeepSeekService()
    logger.info("Services initialized (WebSocketManager, DeepSeekService).")
    yield


app = FastAPI(
    title="领导力共创研讨会 API",
    description="Leadership Co-creation Workshop AI Agent Backend",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    __import__("fastapi.middleware.cors").middleware.cors.CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workshops_router)
app.include_router(rounds_router)
app.include_router(knowledge_router)
app.include_router(ai_qa_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "领导力共创研讨会 API is running"}


@app.websocket("/ws/{workshop_id}")
async def websocket_endpoint(
    workshop_id: int,
    websocket: WebSocket,
    channel: str = Query(default="all"),
    ws_manager: WebSocketManager = Depends(get_ws_manager_from_ws),
):
    await ws_manager.connect(workshop_id, websocket, channel=channel)
    try:
        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(workshop_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(workshop_id, websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.API_HOST, port=settings.API_PORT, reload=True)
