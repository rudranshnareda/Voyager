import logging
import os
from pathlib import Path
from typing import List

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

NOMIC_API_KEY = os.getenv("NOMIC_API_KEY", "")
NOMIC_URL = "https://api-atlas.nomic.ai/v1/embedding/text"
MODEL_NAME = "nomic-embed-text-v1.5"
BATCH_SIZE = 32


class EmbeddingsManager:
    def generate_embedding(self, text: str) -> List[float]:
        # Single text → use search_query task type (better for retrieval queries)
        return self._call_api([text], task_type="search_query")[0]

    def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        # Batch (ingestion) → use search_document task type
        results: List[List[float]] = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            results.extend(self._call_api(batch, task_type="search_document"))
        return results

    def _call_api(self, texts: List[str], task_type: str) -> List[List[float]]:
        if not NOMIC_API_KEY:
            raise RuntimeError("NOMIC_API_KEY is not set — add it to your .env file")
        response = httpx.post(
            NOMIC_URL,
            headers={"Authorization": f"Bearer {NOMIC_API_KEY}"},
            json={"texts": texts, "model": MODEL_NAME, "task_type": task_type},
            timeout=60.0,
        )
        response.raise_for_status()
        return response.json()["embeddings"]


embeddings_manager = EmbeddingsManager()
