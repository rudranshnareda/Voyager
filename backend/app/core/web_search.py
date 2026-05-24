import logging
import os
from pathlib import Path
from typing import Any, Dict, List

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

TAVILY_URL = "https://api.tavily.com/search"


def search_web(query: str, max_results: int = 5) -> List[Dict[str, Any]]:
    """Search the web via Tavily and return a list of {title, url, content} dicts."""
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        raise ValueError("TAVILY_API_KEY is not set in backend/.env")

    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "max_results": max_results,
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(TAVILY_URL, json=payload)
            r.raise_for_status()
    except httpx.TimeoutException as exc:
        raise RuntimeError("Web search timed out") from exc
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(
            f"Tavily error {exc.response.status_code}: {exc.response.text[:200]}"
        ) from exc

    results = r.json().get("results", [])
    logger.info("Web search: query='%s'  results=%d", query[:60], len(results))
    return [
        {
            "title":   res.get("title", "Untitled"),
            "url":     res.get("url", ""),
            "content": res.get("content", ""),
        }
        for res in results
    ]
