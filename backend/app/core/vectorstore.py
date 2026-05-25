import logging
from typing import Any, Dict, List

from sqlalchemy import text

logger = logging.getLogger(__name__)


class VectorStore:
    def _session(self):
        from app.db.database import SessionLocal
        return SessionLocal()

    def query(
        self,
        workspace_id: str,
        query_embedding: List[float],
        n_results: int = 5,
    ) -> List[Dict[str, Any]]:
        db = self._session()
        try:
            rows = db.execute(
                text("""
                    SELECT c.content, c.page_number, d.filename, d.id AS document_id,
                           (c.embedding <=> CAST(:emb AS vector)) AS distance
                    FROM chunks c
                    JOIN documents d ON c.document_id = d.id
                    WHERE d.workspace_id = :workspace_id
                      AND c.embedding IS NOT NULL
                    ORDER BY c.embedding <=> CAST(:emb AS vector)
                    LIMIT :n
                """),
                {"emb": str(query_embedding), "workspace_id": workspace_id, "n": n_results},
            ).fetchall()
            return [
                {
                    "content": row.content,
                    "metadata": {
                        "page_number": row.page_number,
                        "filename": row.filename,
                        "document_id": row.document_id,
                    },
                    "distance": float(row.distance),
                }
                for row in rows
            ]
        finally:
            db.close()

    def get_chunks_by_page(self, workspace_id: str, page_number: int) -> List[Dict[str, Any]]:
        db = self._session()
        try:
            from app.db.models import Chunk, Document
            results = (
                db.query(Chunk, Document)
                .join(Document, Chunk.document_id == Document.id)
                .filter(Document.workspace_id == workspace_id, Chunk.page_number == page_number)
                .all()
            )
            return [
                {
                    "content": chunk.content,
                    "metadata": {
                        "page_number": chunk.page_number,
                        "document_id": chunk.document_id,
                        "filename": doc.filename,
                    },
                    "distance": 0.0,
                }
                for chunk, doc in results
            ]
        finally:
            db.close()

    def delete_document(self, workspace_id: str, document_id: str) -> None:
        db = self._session()
        try:
            from app.db.models import Chunk
            deleted = db.query(Chunk).filter(Chunk.document_id == document_id).delete()
            db.commit()
            logger.info("Deleted %d chunks for document %s", deleted, document_id)
        finally:
            db.close()


vector_store = VectorStore()
