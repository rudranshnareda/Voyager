import io
import logging
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Tuple

import fitz  # pymupdf
from sqlalchemy.orm import Session

from app.core.embeddings import embeddings_manager
from app.core.vectorstore import vector_store
from app.db.models import Chunk, Document

logger = logging.getLogger(__name__)

CHUNK_SIZE = 2000   # ~500 tokens
OVERLAP = 200       # ~50 tokens
OCR_MIN_CHARS = 50  # pages with fewer chars trigger OCR
EMBED_BATCH = 100   # chunks per embedding batch (controls progress granularity)


class IngestionPipeline:
    def ingest_document(
        self,
        document_id: str,
        file_path: str | Path,
        workspace_id: str,
        db: Session,
    ) -> Dict[str, Any]:
        start_time = time.time()
        file_path = Path(file_path)

        doc_record: Document | None = db.get(Document, document_id)
        if doc_record is None:
            raise ValueError(f"Document {document_id} not found in database")

        try:
            self._set_progress(doc_record, db, 0, "processing")

            # Step 1: extract text (OCR fallback for scanned pages)
            pages = self._extract_pages(file_path)
            doc_record.page_count = len(pages)
            self._set_progress(doc_record, db, 15)

            # Step 2: chunk
            raw_chunks = self._split_into_chunks(pages)
            if not raw_chunks:
                raise ValueError("No text could be extracted from this document")
            self._set_progress(doc_record, db, 25)

            logger.info(
                "'%s' — %d pages → %d chunks",
                file_path.name, len(pages), len(raw_chunks),
            )

            # Step 3: embed in batches, updating progress as we go (25 → 90 %)
            texts = [c["content"] for c in raw_chunks]
            embeddings = self._embed_batched(texts, doc_record, db)

            # Step 4: store in ChromaDB
            chroma_chunks: List[Dict[str, Any]] = []
            for chunk, embedding in zip(raw_chunks, embeddings):
                chroma_id = str(uuid.uuid4())
                chunk["chroma_id"] = chroma_id
                chroma_chunks.append({
                    "id": chroma_id,
                    "content": chunk["content"],
                    "embedding": embedding,
                    "metadata": {
                        "document_id": document_id,
                        "page_number": chunk["page_number"],
                        "filename": file_path.name,
                    },
                })
            vector_store.add_chunks(workspace_id, chroma_chunks)
            self._set_progress(doc_record, db, 95)

            # Step 5: persist Chunk rows to SQLite in batches to avoid memory spikes
            SQLITE_BATCH = 500
            for i in range(0, len(raw_chunks), SQLITE_BATCH):
                for chunk in raw_chunks[i : i + SQLITE_BATCH]:
                    db.add(Chunk(
                        document_id=document_id,
                        content=chunk["content"],
                        page_number=chunk["page_number"],
                        chunk_index=chunk["chunk_index"],
                        chroma_id=chunk["chroma_id"],
                    ))
                db.flush()  # write batch to DB without committing the transaction

            doc_record.status = "ready"
            doc_record.progress = 100
            db.commit()

            elapsed = round(time.time() - start_time, 2)
            logger.info(
                "Ingestion complete: '%s' — %d chunks in %.2fs",
                file_path.name, len(raw_chunks), elapsed,
            )
            return {"chunks_created": len(raw_chunks), "pages_processed": len(pages), "time_taken": elapsed}

        except Exception as exc:
            doc_record.status = "failed"
            db.commit()
            logger.error("Ingestion failed for document %s: %s", document_id, exc)
            raise

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _set_progress(
        self,
        doc_record: Document,
        db: Session,
        progress: int,
        status: str | None = None,
    ) -> None:
        doc_record.progress = progress
        if status:
            doc_record.status = status
        db.commit()

    def _embed_batched(
        self,
        texts: List[str],
        doc_record: Document,
        db: Session,
    ) -> List[List[float]]:
        """Embed in batches of EMBED_BATCH, writing progress 25→90% as we go."""
        all_embeddings: List[List[float]] = []
        total = len(texts)
        for start in range(0, total, EMBED_BATCH):
            batch = texts[start : start + EMBED_BATCH]
            all_embeddings.extend(embeddings_manager.generate_embeddings_batch(batch))
            done = min(start + EMBED_BATCH, total)
            progress = 25 + int(65 * done / total)  # 25 % → 90 %
            self._set_progress(doc_record, db, min(progress, 90))
        return all_embeddings

    def _extract_pages(self, file_path: Path) -> List[Tuple[int, str]]:
        pages: List[Tuple[int, str]] = []
        with fitz.open(str(file_path)) as pdf:
            for i in range(len(pdf)):
                page = pdf[i]
                page_num = i + 1
                text = page.get_text().strip()
                if len(text) < OCR_MIN_CHARS:
                    text = self._ocr_page(page)
                if text:
                    pages.append((page_num, text))
                else:
                    logger.warning("Page %d of '%s' yielded no text — skipping", page_num, file_path.name)
        return pages

    def _ocr_page(self, page: fitz.Page) -> str:
        try:
            import pytesseract
            from PIL import Image
            pix = page.get_pixmap(dpi=200)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            return pytesseract.image_to_string(img).strip()
        except Exception as exc:
            logger.debug("OCR skipped for page: %s", exc)
            return ""

    def _split_into_chunks(self, pages: List[Tuple[int, str]]) -> List[Dict[str, Any]]:
        if not pages:
            return []

        full_text = ""
        page_offsets: List[Tuple[int, int]] = []
        for page_num, text in pages:
            page_offsets.append((len(full_text), page_num))
            full_text += text.strip() + "\n\n"

        def page_for_offset(offset: int) -> int:
            result = page_offsets[0][1]
            for char_off, pg in page_offsets:
                if char_off <= offset:
                    result = pg
                else:
                    break
            return result

        chunks: List[Dict[str, Any]] = []
        chunk_index = 0
        start = 0
        while start < len(full_text):
            chunk_text = full_text[start : start + CHUNK_SIZE].strip()
            if chunk_text:
                chunks.append({
                    "content": chunk_text,
                    "page_number": page_for_offset(start),
                    "chunk_index": chunk_index,
                })
                chunk_index += 1
            start += CHUNK_SIZE - OVERLAP
        return chunks


ingestion_pipeline = IngestionPipeline()
