import io
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple
from uuid import uuid4

import fitz  # pymupdf
from sqlalchemy.orm import Session

from app.core import storage as file_storage
from app.core.embeddings import embeddings_manager
from app.db.models import Chunk, Document

logger = logging.getLogger(__name__)

CHUNK_SIZE = 2000
OVERLAP = 200
OCR_MIN_CHARS = 50
EMBED_BATCH = 100


class IngestionPipeline:
    def ingest_document(
        self,
        document_id: str,
        storage_key: str,
        workspace_id: str,
        db: Session,
    ) -> Dict[str, Any]:
        start_time = time.time()

        doc_record: Document | None = db.get(Document, document_id)
        if doc_record is None:
            raise ValueError(f"Document {document_id} not found in database")

        try:
            self._set_progress(doc_record, db, 0, "processing")

            # Download from Supabase Storage to local temp path
            file_path = file_storage.get_local_path(storage_key, document_id)

            pages = self._extract_pages(file_path)
            doc_record.page_count = len(pages)
            self._set_progress(doc_record, db, 15)

            raw_chunks = self._split_into_chunks(pages)
            if not raw_chunks:
                raise ValueError("No text could be extracted from this document")
            self._set_progress(doc_record, db, 25)

            logger.info("'%s' — %d pages → %d chunks", file_path.name, len(pages), len(raw_chunks))

            texts = [c["content"] for c in raw_chunks]
            embeddings = self._embed_batched(texts, doc_record, db)

            # Store Chunk rows with embeddings directly in Postgres
            BATCH_SIZE = 200
            for i in range(0, len(raw_chunks), BATCH_SIZE):
                for chunk, embedding in zip(raw_chunks[i:i + BATCH_SIZE], embeddings[i:i + BATCH_SIZE]):
                    db.add(Chunk(
                        id=str(uuid4()),
                        document_id=document_id,
                        content=chunk["content"],
                        page_number=chunk["page_number"],
                        chunk_index=chunk["chunk_index"],
                        embedding=embedding,
                    ))
                db.flush()

            doc_record.status = "ready"
            doc_record.progress = 100
            db.commit()

            elapsed = round(time.time() - start_time, 2)
            logger.info("Ingestion complete: '%s' — %d chunks in %.2fs", file_path.name, len(raw_chunks), elapsed)
            return {"chunks_created": len(raw_chunks), "pages_processed": len(pages), "time_taken": elapsed}

        except Exception as exc:
            doc_record.status = "failed"
            db.commit()
            logger.error("Ingestion failed for document %s: %s", document_id, exc)
            raise

    def _set_progress(self, doc_record: Document, db: Session, progress: int, status: str | None = None) -> None:
        doc_record.progress = progress
        if status:
            doc_record.status = status
        db.commit()

    def _embed_batched(self, texts: List[str], doc_record: Document, db: Session) -> List[List[float]]:
        all_embeddings: List[List[float]] = []
        total = len(texts)
        for start in range(0, total, EMBED_BATCH):
            batch = texts[start:start + EMBED_BATCH]
            all_embeddings.extend(embeddings_manager.generate_embeddings_batch(batch))
            done = min(start + EMBED_BATCH, total)
            self._set_progress(doc_record, db, 25 + int(65 * done / total))
        return all_embeddings

    def _extract_pages(self, file_path: Path) -> List[Tuple[int, str]]:
        pages: List[Tuple[int, str]] = []
        with fitz.open(str(file_path)) as pdf:
            for i in range(len(pdf)):
                page = pdf[i]
                text = page.get_text().strip()
                if len(text) < OCR_MIN_CHARS:
                    text = self._ocr_page(page)
                if text:
                    pages.append((i + 1, text))
                else:
                    logger.warning("Page %d yielded no text — skipping", i + 1)
        return pages

    def _ocr_page(self, page: fitz.Page) -> str:
        try:
            import pytesseract
            from PIL import Image
            pix = page.get_pixmap(dpi=200)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            return pytesseract.image_to_string(img).strip()
        except Exception as exc:
            logger.debug("OCR skipped: %s", exc)
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
            chunk_text = full_text[start:start + CHUNK_SIZE].strip()
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
