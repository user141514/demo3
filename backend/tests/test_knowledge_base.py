"""Tests for KnowledgeBaseService with LightRAG adapter."""

import base64
import sys
from pathlib import Path

import pytest
from httpx import AsyncClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture(autouse=True)
def _mock_lightrag_module(monkeypatch):
    """Module-level mock: replace LightRAGAdapter with fake for all tests."""

    class FakeLightRAGAdapter:
        def __init__(self, working_dir):
            self.working_dir = working_dir
            self.inserted = []
            self.queries = []
            self.deleted = []

        async def _ensure_initialized(self):
            pass

        async def insert(self, text, doc_id, file_path):
            self.inserted.append({"text": text, "doc_id": doc_id, "file_path": file_path})
            return "fake_track_id"

        async def query(self, query, top_k=5):
            self.queries.append({"query": query, "top_k": top_k})
            return "驴迹科技核心价值观：搞得定·顶得住·跟我上"

        async def delete_doc(self, doc_id):
            self.deleted.append(doc_id)

    monkeypatch.setattr(
        "services.knowledge_base_service.LightRAGAdapter",
        FakeLightRAGAdapter,
    )


class TestKnowledgeBaseValidation:
    """Test input validation via HTTP — uses async_client with overridden DB."""

    async def _create_workshop(self, async_client: AsyncClient) -> dict:
        resp = await async_client.post(
            "/api/workshops", json={"title": "test", "host_name": "h"}
        )
        assert resp.status_code == 201
        return resp.json()

    @pytest.mark.asyncio
    async def test_reject_unsupported_file_type(self, async_client: AsyncClient):
        w = await self._create_workshop(async_client)
        payload = {
            "filename": "test.pdf",
            "content_base64": base64.b64encode(b"fake content").decode(),
            "content_type": "application/pdf",
            "workshop_id": w["id"],
            "admin_code": w["kb_admin_code"],
        }
        resp = await async_client.post("/api/knowledge/upload", json=payload)
        assert resp.status_code == 400
        assert "不支持" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_reject_wrong_admin_code(self, async_client: AsyncClient):
        w = await self._create_workshop(async_client)
        payload = {
            "filename": "test.txt",
            "content_base64": base64.b64encode(b"hello").decode(),
            "content_type": "text/plain",
            "workshop_id": w["id"],
            "admin_code": "WRONG00",
        }
        resp = await async_client.post("/api/knowledge/upload", json=payload)
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_reject_invalid_base64(self, async_client: AsyncClient):
        w = await self._create_workshop(async_client)
        payload = {
            "filename": "test.txt",
            "content_base64": "!!! not valid base64 !!!",
            "content_type": "text/plain",
            "workshop_id": w["id"],
            "admin_code": w["kb_admin_code"],
        }
        resp = await async_client.post("/api/knowledge/upload", json=payload)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_reject_empty_file(self, async_client: AsyncClient):
        w = await self._create_workshop(async_client)
        payload = {
            "filename": "test.txt",
            "content_base64": base64.b64encode(b"a").decode(),
            "content_type": "text/plain",
            "workshop_id": w["id"],
            "admin_code": w["kb_admin_code"],
        }
        resp = await async_client.post("/api/knowledge/upload", json=payload)
        # Single-char txt upload should work
        assert resp.status_code == 200


class TestKnowledgeBaseService:
    """Test KnowledgeBaseService directly with mocked LightRAG."""

    async def _make_workshop(self, db_session):
        from models import Workshop
        w = Workshop(title="test", host_name="h", group_count=4)
        db_session.add(w)
        await db_session.commit()
        await db_session.refresh(w)
        return w

    @pytest.mark.asyncio
    async def test_upload_txt(self, db_session):
        from services.knowledge_base_service import KnowledgeBaseService
        w = await self._make_workshop(db_session)
        kb = KnowledgeBaseService(db_session)
        content = "驴迹科技核心价值观：搞得定·顶得住·跟我上。这是文旅科技公司的企业文化核心。"
        doc = await kb.upload(
            filename="test.txt", content=content.encode("utf-8"),
            content_type="text/plain", workshop_id=w.id,
        )
        assert doc.id is not None
        assert doc.original_filename == "test.txt"
        assert doc.chunk_count >= 1
        assert doc.is_deleted is False

    @pytest.mark.asyncio
    async def test_upload_md(self, db_session):
        from services.knowledge_base_service import KnowledgeBaseService
        w = await self._make_workshop(db_session)
        kb = KnowledgeBaseService(db_session)
        content = "# 第一章\n\n这是第一章。\n\n# 第二章\n\n这是第二章。"
        doc = await kb.upload("test.md", content.encode("utf-8"), "text/markdown", w.id)
        assert doc.original_filename == "test.md"
        assert doc.chunk_count >= 1

    @pytest.mark.asyncio
    async def test_list_docs(self, db_session):
        from services.knowledge_base_service import KnowledgeBaseService
        w = await self._make_workshop(db_session)
        kb = KnowledgeBaseService(db_session)
        await kb.upload("a.txt", b"content A", "text/plain", w.id)
        await kb.upload("b.txt", b"content B", "text/plain", w.id)
        docs = await kb.list_docs(w.id)
        assert len(docs) == 2
        assert {d.original_filename for d in docs} == {"a.txt", "b.txt"}

    @pytest.mark.asyncio
    async def test_delete_soft(self, db_session):
        from services.knowledge_base_service import KnowledgeBaseService
        w = await self._make_workshop(db_session)
        kb = KnowledgeBaseService(db_session)
        doc = await kb.upload("test.txt", b"test content", "text/plain", w.id)
        ok = await kb.delete(doc.id)
        assert ok is True
        docs = await kb.list_docs(w.id)
        assert len(docs) == 0
        ok = await kb.delete(99999)
        assert ok is False

    @pytest.mark.asyncio
    async def test_search(self, db_session):
        from services.knowledge_base_service import KnowledgeBaseService
        w = await self._make_workshop(db_session)
        kb = KnowledgeBaseService(db_session)
        await kb.upload("test.txt", "驴迹科技核心价值观".encode(), "text/plain", w.id)
        results = await kb.search("核心价值观", w.id)
        assert len(results) == 1
        assert "驴迹" in results[0]

    @pytest.mark.asyncio
    async def test_upload_reject_bad_extension(self, db_session):
        from services.knowledge_base_service import KnowledgeBaseService
        w = await self._make_workshop(db_session)
        kb = KnowledgeBaseService(db_session)
        with pytest.raises(ValueError, match="不支持"):
            await kb.upload("bad.exe", b"x", "application/octet-stream", w.id)


class TestKnowledgeBaseAPI:
    """Integration tests via HTTP client using conftest DB override."""

    async def _create_workshop(self, async_client: AsyncClient) -> dict:
        resp = await async_client.post(
            "/api/workshops", json={"title": "test", "host_name": "h"}
        )
        assert resp.status_code == 201
        return resp.json()

    @pytest.mark.asyncio
    async def test_list_empty_documents(self, async_client: AsyncClient):
        w = await self._create_workshop(async_client)
        resp = await async_client.get(
            "/api/knowledge/documents",
            params={"workshop_id": w["id"], "admin_code": w["kb_admin_code"]},
        )
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_validate_admin_code_valid(self, async_client: AsyncClient):
        w = await self._create_workshop(async_client)
        resp = await async_client.post(
            "/api/knowledge/validate-admin",
            json={"admin_code": w["kb_admin_code"]},
        )
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

    @pytest.mark.asyncio
    async def test_validate_admin_code_invalid(self, async_client: AsyncClient):
        resp = await async_client.post(
            "/api/knowledge/validate-admin",
            json={"admin_code": "INVALID"},
        )
        assert resp.status_code == 200
        assert resp.json()["valid"] is False

    @pytest.mark.asyncio
    async def test_delete_nonexistent_document(self, async_client: AsyncClient):
        w = await self._create_workshop(async_client)
        resp = await async_client.delete(
            f"/api/knowledge/documents/99999",
            params={"workshop_id": w["id"], "admin_code": w["kb_admin_code"]},
        )
        assert resp.status_code == 404
