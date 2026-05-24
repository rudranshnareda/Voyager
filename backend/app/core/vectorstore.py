import logging
import os
from pathlib import Path
from typing import Any, Dict, List

import chromadb
from chromadb.config import Settings
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

CHROMA_PATH = Path(os.getenv("CHROMA_PATH", "../storage/chroma"))


class VectorStore:
    def __init__(self) -> None:
        CHROMA_PATH.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(
            path=str(CHROMA_PATH),
            settings=Settings(anonymized_telemetry=False),
        )
        logger.info("ChromaDB initialised at %s", CHROMA_PATH.resolve())

    def get_or_create_collection(self, workspace_id: str) -> chromadb.Collection:
        name = f"workspace_{workspace_id}"
        collection = self._client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )
        return collection

    def add_chunks(self, workspace_id: str, chunks: List[Dict[str, Any]], batch_size: int = 500) -> None:
        """
        Each chunk dict must have:
          id         - unique chroma_id (str)
          content    - raw text (str)
          embedding  - list[float]
          metadata   - dict with at least document_id, page_number, filename

        Inserts in batches to avoid ChromaDB HNSW memory spikes on large documents.
        """
        if not chunks:
            return

        collection = self.get_or_create_collection(workspace_id)
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            collection.add(
                ids=[c["id"] for c in batch],
                documents=[c["content"] for c in batch],
                embeddings=[c["embedding"] for c in batch],
                metadatas=[c["metadata"] for c in batch],
            )
        logger.info("Added %d chunks to collection workspace_%s", len(chunks), workspace_id)

    def query(
        self,
        workspace_id: str,
        query_embedding: List[float],
        n_results: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Returns up to n_results matches, each as:
          {content, metadata, distance}
        Sorted ascending by distance (most similar first).
        """
        collection = self.get_or_create_collection(workspace_id)
        count = collection.count()
        if count == 0:
            return []

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(n_results, count),
            include=["documents", "metadatas", "distances"],
        )

        output: List[Dict[str, Any]] = []
        for content, metadata, distance in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            output.append({"content": content, "metadata": metadata, "distance": distance})
        return output

    def get_chunks_by_page(self, workspace_id: str, page_number: int) -> List[Dict[str, Any]]:
        """Fetch all chunks that belong to a specific page, regardless of query similarity."""
        collection = self.get_or_create_collection(workspace_id)
        if collection.count() == 0:
            return []
        results = collection.get(
            where={"page_number": page_number},
            include=["documents", "metadatas"],
        )
        output: List[Dict[str, Any]] = []
        for content, metadata in zip(results["documents"], results["metadatas"]):
            output.append({"content": content, "metadata": metadata, "distance": 0.0})
        return output

    def delete_document(self, workspace_id: str, document_id: str) -> None:
        """Remove all chunks that belong to document_id from the workspace collection."""
        collection = self.get_or_create_collection(workspace_id)
        results = collection.get(where={"document_id": document_id})
        ids_to_delete = results.get("ids", [])
        if ids_to_delete:
            collection.delete(ids=ids_to_delete)
            logger.info(
                "Deleted %d chunks for document %s from workspace_%s",
                len(ids_to_delete),
                document_id,
                workspace_id,
            )


vector_store = VectorStore()
