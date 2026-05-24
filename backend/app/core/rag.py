import logging
import re
from typing import Any, Dict, List, Optional

from app.core.embeddings import embeddings_manager
from app.core.vectorstore import vector_store

logger = logging.getLogger(__name__)

_PAGE_RE = re.compile(r"\b(?:page|pg|p\.?)\s*(\d+)\b", re.IGNORECASE)

# Cosine distance ceiling for a chunk to be considered relevant.
# all-MiniLM-L6-v2 + ChromaDB cosine space returns distances in [0, 2]:
#   < 0.5  → highly relevant
#   0.5–0.85 → moderately relevant (still useful)
#   > 0.85 → too dissimilar to be helpful
RELEVANCE_THRESHOLD = 0.85


class RAGEngine:
    def retrieve(
        self,
        query: str,
        workspace_id: str,
        n_results: int = 5,
        highlighted_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Embed the query, search ChromaDB, filter by relevance threshold.
        When highlighted_context is provided, chunks from the same page or with
        significant word overlap are boosted (distance multiplied down).

        Returns:
            {
              "chunks":   list of chunk dicts (content, filename, page_number, distance),
              "context":  formatted string ready to paste into the LLM prompt,
              "found":    number of chunks that passed the threshold,
            }
        """
        query_embedding = embeddings_manager.generate_embedding(query)

        # ── Page-number injection ─────────────────────────────────────────────
        # If the user explicitly references a page ("explain page 6", "read p.3"),
        # fetch all chunks from those pages directly — similarity search won't find
        # them because the query semantically matches nothing in the document.
        mentioned_pages = [int(m) for m in _PAGE_RE.findall(query)]
        page_chunks: List[Dict[str, Any]] = []
        seen_content: set = set()
        for pg in dict.fromkeys(mentioned_pages):  # deduplicate, preserve order
            for r in vector_store.get_chunks_by_page(workspace_id, pg):
                key = r["content"][:80]
                if key not in seen_content:
                    seen_content.add(key)
                    page_chunks.append({
                        "content":     r["content"],
                        "filename":    r["metadata"].get("filename", "unknown"),
                        "page_number": r["metadata"].get("page_number", 0),
                        "document_id": r["metadata"].get("document_id", ""),
                        "distance":    0.0,
                    })
        if mentioned_pages:
            logger.info("RAG page-injection: pages=%s, chunks=%d", mentioned_pages, len(page_chunks))

        # ── Semantic search ───────────────────────────────────────────────────
        fetch_n = 10 if highlighted_context else n_results
        raw_results = vector_store.query(
            workspace_id=workspace_id,
            query_embedding=query_embedding,
            n_results=fetch_n,
        )

        if highlighted_context:
            h_page = highlighted_context["page_number"]
            h_words = set(highlighted_context["text"].lower().split())
            for r in raw_results:
                chunk_page = r["metadata"].get("page_number", -1)
                if chunk_page == h_page:
                    r["distance"] *= 0.7
                chunk_words = set(r["content"].lower().split())
                if len(h_words & chunk_words) >= 3:
                    r["distance"] *= 0.8
            raw_results.sort(key=lambda x: x["distance"])
            logger.info(
                "RAG boost applied: page=%d, h_words=%d",
                h_page, len(h_words),
            )

        # Filter semantic results by relevance threshold, skip already-injected content
        chunks: List[Dict[str, Any]] = list(page_chunks)
        for r in raw_results[:n_results]:
            if r["distance"] > RELEVANCE_THRESHOLD:
                continue
            key = r["content"][:80]
            if key in seen_content:
                continue  # already included via page injection
            seen_content.add(key)
            chunks.append({
                "content":     r["content"],
                "filename":    r["metadata"].get("filename", "unknown"),
                "page_number": r["metadata"].get("page_number", 0),
                "document_id": r["metadata"].get("document_id", ""),
                "distance":    r["distance"],
            })

        # Cap total so the LLM prompt doesn't blow up
        chunks = chunks[:n_results + len(page_chunks)]

        logger.info(
            "RAG: query='%s'  workspace=%s  raw=%d  passed_threshold=%d  page_injected=%d",
            query[:60], workspace_id, len(raw_results), len(chunks), len(page_chunks),
        )

        context = self._build_context(chunks)

        return {
            "chunks":  chunks,
            "context": context,
            "found":   len(chunks),
        }

    def _build_context(self, chunks: List[Dict[str, Any]]) -> str:
        """
        Format retrieved chunks into a clearly attributed context string.
        Each block starts with a source header so the LLM can cite accurately.
        """
        if not chunks:
            return ""

        parts: List[str] = []
        for chunk in chunks:
            header = f"[Source: {chunk['filename']}, Page {chunk['page_number']}]"
            parts.append(f"{header}\n{chunk['content']}")

        return "\n\n---\n\n".join(parts)


rag_engine = RAGEngine()
