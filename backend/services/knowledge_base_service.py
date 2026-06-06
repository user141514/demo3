import hashlib
import json
import logging
import os
import re
import threading
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import KnowledgeDocument

logger = logging.getLogger(__name__)

ALLOWED_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "md": "text/markdown",
    "txt": "text/plain",
}
ALLOWED_EXTENSIONS = {"docx", "xlsx", "pptx", "md", "txt"}

_embed_model = None
_embed_lock = threading.Lock()


def _get_embedding_model():
    global _embed_model
    if _embed_model is not None:
        return _embed_model
    with _embed_lock:
        if _embed_model is not None:
            return _embed_model
        from sentence_transformers import SentenceTransformer
        model_name = getattr(settings, "LOCAL_EMBEDDING_MODEL", "BAAI/bge-small-zh-v1.5")
        logger.info(f"Loading local embedding model: {model_name}")
        _embed_model = SentenceTransformer(model_name)
        dim = _embed_model.get_sentence_embedding_dimension() if hasattr(_embed_model, "get_sentence_embedding_dimension") else _embed_model.get_embedding_dimension()
        logger.info(f"Embedding model loaded, dim={dim}")
        return _embed_model


class LightRAGAdapter:
    """LightRAG 适配器 — 封装 LightRAG 实例的创建与调用。"""

    def __init__(self, working_dir: str):
        self._working_dir = working_dir
        self._rag = None
        self._initialized = False

    async def _ensure_initialized(self):
        if self._initialized:
            return
        from lightrag import LightRAG, QueryParam
        from lightrag.utils import EmbeddingFunc

        os.makedirs(self._working_dir, exist_ok=True)

        llm_api_key = settings.DEEPSEEK_API_KEY
        llm_base_url = settings.DEEPSEEK_BASE_URL.rstrip("/")
        chat_model = settings.DEEPSEEK_CHAT_MODEL

        import httpx

        # Direct httpx LLM func — bypasses LightRAG's openai_complete_if_cache
        # which sends response_format that DeepSeek rejects
        async def llm_func(prompt, system_prompt=None, history_messages=None, **kwargs):
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            if history_messages:
                messages.extend(history_messages)
            messages.append({"role": "user", "content": prompt})

            body = {
                "model": chat_model,
                "messages": messages,
                "max_tokens": kwargs.get("max_tokens", 4096),
                "temperature": kwargs.get("temperature", 0.7),
            }
            if kwargs.get("response_format"):
                body["response_format"] = {"type": "json_object"}

            async with httpx.AsyncClient(timeout=180.0) as client:
                resp = await client.post(
                    f"{llm_base_url}/v1/chat/completions",
                    headers={"Authorization": f"Bearer {llm_api_key}"},
                    json=body,
                )
                if resp.status_code != 200:
                    logger.error(f"LLM API error {resp.status_code}: {resp.text[:300]}")
                    raise RuntimeError(f"LLM API error {resp.status_code}")
                data = resp.json()
                return data["choices"][0]["message"]["content"]

        # Local embedding via sentence-transformers (DeepSeek has no embedding API)
        embed_model = _get_embedding_model()
        dim = embed_model.get_sentence_embedding_dimension() if hasattr(embed_model, "get_sentence_embedding_dimension") else embed_model.get_embedding_dimension()

        async def embed_func(texts):
            import asyncio
            return await asyncio.to_thread(embed_model.encode, texts, convert_to_numpy=True)

        embedding_func = EmbeddingFunc(
            embedding_dim=dim,
            max_token_size=512,
            func=embed_func,
        )

        self._rag = LightRAG(
            working_dir=self._working_dir,
            llm_model_func=llm_func,
            embedding_func=embedding_func,
            chunk_token_size=settings.KB_CHUNK_SIZE,
            chunk_overlap_token_size=settings.KB_CHUNK_OVERLAP,
        )
        await self._rag.initialize_storages()
        self._initialized = True
        self.QueryParam = QueryParam

    async def insert(self, text: str, doc_id: str, file_path: str) -> str:
        await self._ensure_initialized()
        return await self._rag.ainsert(
            text,
            ids=doc_id,
            file_paths=file_path,
        )

    async def query(self, query: str, top_k: int = 5) -> str:
        await self._ensure_initialized()
        param = self.QueryParam(
            mode="mix",
            only_need_context=True,
            top_k=top_k,
        )
        result = await self._rag.aquery(query, param=param)
        return result if isinstance(result, str) else ""

    async def delete_doc(self, doc_id: str) -> None:
        await self._ensure_initialized()
        try:
            await self._rag.adelete_by_doc_id(doc_id)
        except Exception as e:
            logger.warning(f"LightRAG delete failed for {doc_id}: {e}")


class KnowledgeBaseService:

    def __init__(self, db: AsyncSession):
        self._db = db
        self._upload_dir = settings.KB_UPLOAD_DIR
        self._lightrag_base = settings.KB_LIGHTRAG_DIR
        os.makedirs(self._upload_dir, exist_ok=True)

    def _get_rag_adapter(self, workshop_id: int) -> LightRAGAdapter:
        ws_dir = os.path.join(self._lightrag_base, f"workshop_{workshop_id}")
        return LightRAGAdapter(ws_dir)

    async def upload(self, filename: str, content: bytes, content_type: str, workshop_id: int) -> KnowledgeDocument:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"不支持的文件格式: .{ext}，仅支持 {', '.join(sorted(ALLOWED_EXTENSIONS))}")

        stored_name = f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{hashlib.md5(content).hexdigest()[:8]}.{ext}"
        file_path = os.path.join(self._upload_dir, stored_name)
        with open(file_path, "wb") as f:
            f.write(content)

        text = self._extract_text(file_path, ext)
        if not text.strip():
            raise ValueError(f"文件内容为空或无法解析: {filename}")

        doc_id = hashlib.md5(f"{workshop_id}:{stored_name}".encode()).hexdigest()
        chunk_count = self._count_chunks(text)

        rag = self._get_rag_adapter(workshop_id)
        await rag.insert(text, doc_id=doc_id, file_path=file_path)

        doc = KnowledgeDocument(
            workshop_id=workshop_id,
            original_filename=filename,
            stored_filename=stored_name,
            file_size=len(content),
            content_type=content_type or ALLOWED_TYPES.get(ext, "application/octet-stream"),
            chunk_count=chunk_count,
            embedding_model=settings.EMBEDDING_MODEL,
            upload_params=json.dumps({
                "storage": "lightrag",
                "working_dir": os.path.join(self._lightrag_base, f"workshop_{workshop_id}"),
            }),
        )
        self._db.add(doc)
        await self._db.commit()
        await self._db.refresh(doc)

        logger.info(f"Uploaded {filename} via LightRAG: ~{chunk_count} chunks, {len(content)} bytes")
        return doc

    async def delete(self, doc_id: int) -> bool:
        result = await self._db.execute(select(KnowledgeDocument).where(KnowledgeDocument.id == doc_id))
        doc = result.scalar_one_or_none()
        if not doc:
            return False

        doc.is_deleted = True
        await self._db.commit()

        file_path = os.path.join(self._upload_dir, doc.stored_filename)
        if os.path.exists(file_path):
            os.remove(file_path)

        lr_doc_id = hashlib.md5(f"{doc.workshop_id}:{doc.stored_filename}".encode()).hexdigest()
        try:
            rag = self._get_rag_adapter(doc.workshop_id)
            await rag.delete_doc(lr_doc_id)
        except Exception as e:
            logger.warning(f"LightRAG delete error for doc {doc_id}: {e}")
        return True

    async def list_docs(self, workshop_id: int) -> list[KnowledgeDocument]:
        result = await self._db.execute(
            select(KnowledgeDocument).where(
                KnowledgeDocument.workshop_id == workshop_id,
                KnowledgeDocument.is_deleted == False,
            ).order_by(KnowledgeDocument.uploaded_at.desc())
        )
        return list(result.scalars().all())

    async def search(self, query: str, workshop_id: int, top_k: int = 5) -> list[str]:
        try:
            rag = self._get_rag_adapter(workshop_id)
            context = await rag.query(query, top_k=top_k)
            if context and context.strip():
                return [context.strip()]
            return []
        except Exception as e:
            logger.warning(f"LightRAG search failed: {e}")
            return []

    def _count_chunks(self, text: str) -> int:
        paragraphs = re.split(r'\n\s*\n', text)
        count = 0
        current_len = 0
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            if current_len + len(para) + 2 > settings.KB_CHUNK_SIZE and current_len > 0:
                count += 1
                current_len = len(para)
            else:
                current_len += len(para) + 2 if current_len else len(para)
        if current_len > 0:
            count += 1
        return count

    def _extract_text(self, file_path: str, ext: str) -> str:
        if ext == "txt":
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        if ext == "md":
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        if ext == "docx":
            return self._read_docx(file_path)
        if ext == "xlsx":
            return self._read_xlsx(file_path)
        if ext == "pptx":
            return self._read_pptx(file_path)
        return ""

    def _read_docx(self, path: str) -> str:
        try:
            import zipfile
            from xml.etree import ElementTree
            with zipfile.ZipFile(path, 'r') as z:
                xml_content = z.read('word/document.xml')
            tree = ElementTree.fromstring(xml_content)
            paragraphs = []
            for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                texts = [t.text for t in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text]
                if texts:
                    paragraphs.append(''.join(texts))
            return '\n\n'.join(paragraphs)
        except Exception as e:
            logger.error(f"Failed to read docx: {e}")
            return ""

    def _read_xlsx(self, path: str) -> str:
        try:
            import zipfile
            from xml.etree import ElementTree
            with zipfile.ZipFile(path, 'r') as z:
                sst = ""
                if 'xl/sharedStrings.xml' in z.namelist():
                    sst_tree = ElementTree.fromstring(z.read('xl/sharedStrings.xml'))
                    ns_s = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
                    sst = [''.join(t.text or '' for t in si.iter(f'{{{ns_s}}}t')) for si in sst_tree.iter(f'{{{ns_s}}}si')]
                sheet = z.read('xl/worksheets/sheet1.xml')
            tree = ElementTree.fromstring(sheet)
            ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
            rows = []
            for row in tree.iter(f'{{{ns}}}row'):
                cells = []
                for c in row.iter(f'{{{ns}}}c'):
                    v = c.find(f'{{{ns}}}v')
                    if v is not None and v.text:
                        t = c.get('t', '')
                        cells.append(sst[int(v.text)] if t == 's' and sst else v.text)
                    else:
                        cells.append('')
                if cells:
                    rows.append('\t'.join(cells))
            return '\n'.join(rows)
        except Exception as e:
            logger.error(f"Failed to read xlsx: {e}")
            return ""

    def _read_pptx(self, path: str) -> str:
        try:
            import zipfile
            from xml.etree import ElementTree
            with zipfile.ZipFile(path, 'r') as z:
                slides = [n for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')]
                texts = []
                for slide in sorted(slides):
                    tree = ElementTree.fromstring(z.read(slide))
                    for t in tree.iter('{http://schemas.openxmlformats.org/drawingml/2006/main}t'):
                        if t.text:
                            texts.append(t.text)
                return '\n\n'.join(texts)
        except Exception as e:
            logger.error(f"Failed to read pptx: {e}")
            return ""


_kb_service: Optional[KnowledgeBaseService] = None
