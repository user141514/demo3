from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import inspect, text

from config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    from models import Base as ModelsBase  # noqa: F811
    async with engine.begin() as conn:
        await conn.run_sync(ModelsBase.metadata.create_all)
        await conn.run_sync(_ensure_workshop_group_count_column)
        await conn.run_sync(_ensure_workshop_review_columns)
        await conn.run_sync(_ensure_round_timer_columns)
        await conn.run_sync(_ensure_synthesis_validation_error_column)
        await conn.run_sync(_ensure_ai_question_round_column)


def _ensure_round_timer_columns(sync_conn):
    inspector = inspect(sync_conn)
    columns = {col["name"] for col in inspector.get_columns("rounds")}
    if "timer_started_at" not in columns:
        sync_conn.execute(text("ALTER TABLE rounds ADD COLUMN timer_started_at DATETIME"))
    if "timer_phase" not in columns:
        sync_conn.execute(text("ALTER TABLE rounds ADD COLUMN timer_phase VARCHAR(20)"))


def _ensure_workshop_group_count_column(sync_conn):
    inspector = inspect(sync_conn)
    columns = {col["name"] for col in inspector.get_columns("workshops")}
    if "group_count" not in columns:
        sync_conn.execute(text("ALTER TABLE workshops ADD COLUMN group_count INTEGER DEFAULT 4 NOT NULL"))


def _ensure_workshop_review_columns(sync_conn):
    inspector = inspect(sync_conn)
    columns = {col["name"] for col in inspector.get_columns("workshops")}
    if "flow_round_number" not in columns:
        sync_conn.execute(text("ALTER TABLE workshops ADD COLUMN flow_round_number INTEGER DEFAULT 1 NOT NULL"))
        sync_conn.execute(text("UPDATE workshops SET flow_round_number = current_round WHERE current_round IS NOT NULL"))
    if "is_review_mode" not in columns:
        sync_conn.execute(text("ALTER TABLE workshops ADD COLUMN is_review_mode BOOLEAN DEFAULT 0 NOT NULL"))


def _ensure_synthesis_validation_error_column(sync_conn):
    inspector = inspect(sync_conn)
    columns = {col["name"] for col in inspector.get_columns("synthesis_results")}
    if "validation_error" not in columns:
        sync_conn.execute(text("ALTER TABLE synthesis_results ADD COLUMN validation_error TEXT"))


def _ensure_ai_question_round_column(sync_conn):
    inspector = inspect(sync_conn)
    columns = {col["name"] for col in inspector.get_columns("ai_question_logs")}
    if "round_id" not in columns:
        sync_conn.execute(text("ALTER TABLE ai_question_logs ADD COLUMN round_id INTEGER"))
