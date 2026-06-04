import hashlib
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional

import httpx
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


class KnowledgeBaseService:

    def __init__(self, db: AsyncSession):
        self._db = db
        self._upload_dir = settings.KB_UPLOAD_DIR
        self._chunk_size = settings.KB_CHUNK_SIZE
        self._chunk_overlap = settings.KB_CHUNK_OVERLAP
        self._embedding_model = settings.EMBEDDING_MODEL
        self._embedding_api_key = settings.EMBEDDING_API_KEY or settings.DEEPSEEK_API_KEY
        self._embedding_base_url = settings.EMBEDDING_BASE_URL.rstrip("/")
        os.makedirs(self._upload_dir, exist_ok=True)

    async def upload(self, filename: str, content: bytes, content_type: str, workshop_id: int) -> KnowledgeDocument:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"不支持的文件格式: .{ext}，仅支持 {', '.join(sorted(ALLOWED_EXTENSIONS))}")

        stored_name = f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{hashlib.md5(content).hexdigest()[:8]}.{ext}"
        file_path = os.path.join(self._upload_dir, stored_name)
        with open(file_path, "wb") as f:
            f.write(content)

        text = self._extract_text(file_path, ext)
        chunks = self._chunk_text(text)

        doc = KnowledgeDocument(
            workshop_id=workshop_id,
            original_filename=filename,
            stored_filename=stored_name,
            file_size=len(content),
            content_type=content_type or ALLOWED_TYPES.get(ext, "application/octet-stream"),
            chunk_count=len(chunks),
            embedding_model=self._embedding_model,
            upload_params=json.dumps({
                "chunk_size": self._chunk_size,
                "chunk_overlap": self._chunk_overlap,
            }),
        )
        self._db.add(doc)
        await self._db.commit()
        await self._db.refresh(doc)

        # Store chunks alongside doc
        chunks_path = file_path + ".chunks.json"
        with open(chunks_path, "w", encoding="utf-8") as f:
            json.dump(chunks, f, ensure_ascii=False)

        logger.info(f"Uploaded {filename}: {len(chunks)} chunks, {len(content)} bytes")
        return doc

    async def delete(self, doc_id: int) -> bool:
        result = await self._db.execute(select(KnowledgeDocument).where(KnowledgeDocument.id == doc_id))
        doc = result.scalar_one_or_none()
        if not doc:
            return False

        doc.is_deleted = True
        await self._db.commit()

        file_path = os.path.join(self._upload_dir, doc.stored_filename)
        chunks_path = file_path + ".chunks.json"
        for p in [file_path, chunks_path]:
            if os.path.exists(p):
                os.remove(p)
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
        docs = await self.list_docs(workshop_id)
        if not docs:
            return []

        all_chunks = []
        for doc in docs:
            chunks_path = os.path.join(self._upload_dir, doc.stored_filename + ".chunks.json")
            if os.path.exists(chunks_path):
                with open(chunks_path, "r", encoding="utf-8") as f:
                    chunks = json.load(f)
                for c in chunks:
                    c["doc_name"] = doc.original_filename
                all_chunks.extend(chunks)

        if not all_chunks:
            return []

        # Embed query via API
        query_vec = await self._embed(query)
        if not query_vec:
            return [c["text"] for c in all_chunks[:top_k]]

        # Cosine similarity search in-process (simple, no external vector DB needed)
        for chunk in all_chunks:
            emb = chunk.get("embedding")
            if emb and len(emb) == len(query_vec):
                chunk["_score"] = self._cosine_sim(query_vec, emb)
            else:
                chunk["_score"] = 0.0

        all_chunks.sort(key=lambda x: x.get("_score", 0), reverse=True)
        return [f"[{c['doc_name']}] {c['text']}" for c in all_chunks[:top_k] if c.get("_score", 0) > 0.3]

    async def _embed(self, text: str) -> Optional[list[float]]:
        if not self._embedding_api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{self._embedding_base_url}/v1/embeddings",
                    headers={"Authorization": f"Bearer {self._embedding_api_key}", "Content-Type": "application/json"},
                    json={"model": self._embedding_model, "input": text},
                )
                if resp.status_code != 200:
                    logger.warning(f"Embedding API error: {resp.status_code}")
                    return None
                return resp.json()["data"][0]["embedding"]
        except Exception as e:
            logger.warning(f"Embedding failed: {e}")
            return None

    @staticmethod
    def _cosine_sim(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    def _chunk_text(self, text: str) -> list[dict]:
        paragraphs = re.split(r'\n\s*\n', text)
        chunks = []
        current = ""
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            if len(current) + len(para) + 2 > self._chunk_size and current:
                chunks.append({"text": current.strip(), "embedding": None})
                current = para
            else:
                current = f"{current}\n\n{para}" if current else para
        if current.strip():
            chunks.append({"text": current.strip(), "embedding": None})
        return chunks

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
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
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
                # Read shared strings
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
