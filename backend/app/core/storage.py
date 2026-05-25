import logging
import os
import threading
from pathlib import Path
from typing import List

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET = "documents"
CACHE_DIR = Path("/tmp/voyager_cache")

_download_locks: dict = {}
_download_locks_mutex = threading.Lock()


def _download_lock(key: str) -> threading.Lock:
    with _download_locks_mutex:
        if key not in _download_locks:
            _download_locks[key] = threading.Lock()
        return _download_locks[key]


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "apikey": SUPABASE_SERVICE_KEY,
    }


def ensure_bucket() -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.warning("Supabase not configured — skipping bucket creation")
        return
    try:
        resp = httpx.post(
            f"{SUPABASE_URL}/storage/v1/bucket",
            json={"id": BUCKET, "name": BUCKET, "public": True},
            headers=_headers(),
            timeout=10.0,
        )
        if resp.status_code not in (200, 201, 409):
            logger.warning("Bucket creation response: %s %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.warning("Could not ensure Supabase bucket: %s", exc)


def upload_file(object_key: str, data: bytes) -> None:
    resp = httpx.post(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{object_key}",
        content=data,
        headers={**_headers(), "Content-Type": "application/pdf"},
        timeout=120.0,
    )
    resp.raise_for_status()
    logger.info("Uploaded %s (%d bytes)", object_key, len(data))


def get_local_path(object_key: str, document_id: str) -> Path:
    """Return a local path for the PDF, downloading from Supabase Storage if not cached.

    Uses a per-key lock + atomic rename so concurrent page requests don't corrupt
    the file by writing to the same path simultaneously.
    """
    filename = object_key.split("/")[-1]
    local_path = CACHE_DIR / document_id / filename
    if local_path.exists() and local_path.stat().st_size > 0:
        return local_path

    with _download_lock(object_key):
        if local_path.exists() and local_path.stat().st_size > 0:
            return local_path

        local_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = local_path.with_suffix(".tmp")
        try:
            with httpx.stream(
                "GET",
                f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{object_key}",
                headers=_headers(),
                timeout=120.0,
            ) as resp:
                resp.raise_for_status()
                with open(tmp_path, "wb") as f:
                    for chunk in resp.iter_bytes(chunk_size=65536):
                        f.write(chunk)
            tmp_path.rename(local_path)
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise

    logger.info("Downloaded %s → %s", object_key, local_path)
    return local_path


def public_url(object_key: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{object_key}"


def delete_files(object_keys: List[str]) -> None:
    if not object_keys:
        return
    resp = httpx.delete(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}",
        json={"prefixes": object_keys},
        headers=_headers(),
        timeout=30.0,
    )
    resp.raise_for_status()
    logger.info("Deleted %d file(s) from Supabase Storage", len(object_keys))


def list_prefix(prefix: str) -> List[str]:
    resp = httpx.post(
        f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}",
        json={"prefix": prefix, "limit": 1000},
        headers=_headers(),
        timeout=30.0,
    )
    resp.raise_for_status()
    objects = resp.json()
    if not isinstance(objects, list):
        return []
    return [f"{prefix}/{obj['name']}" for obj in objects if "name" in obj]
