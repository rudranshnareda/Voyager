import json
import logging
import os
import shutil
import tempfile
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
CACHE_DIR = Path(tempfile.gettempdir()) / "voyager_cache"

_local_storage_root = os.getenv("LOCAL_STORAGE_PATH", "")
LOCAL_STORAGE: Path | None = Path(_local_storage_root) if _local_storage_root else None

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
    if LOCAL_STORAGE:
        LOCAL_STORAGE.mkdir(parents=True, exist_ok=True)
        logger.info("Local storage at %s", LOCAL_STORAGE)
        return
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
    if LOCAL_STORAGE:
        dest = LOCAL_STORAGE / object_key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        logger.info("Saved %s locally (%d bytes)", object_key, len(data))
        return
    resp = httpx.post(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{object_key}",
        content=data,
        headers={**_headers(), "Content-Type": "application/pdf"},
        timeout=120.0,
    )
    resp.raise_for_status()
    logger.info("Uploaded %s (%d bytes)", object_key, len(data))


def get_local_path(object_key: str, document_id: str) -> Path:
    if LOCAL_STORAGE:
        path = LOCAL_STORAGE / object_key
        if not path.exists():
            raise FileNotFoundError(f"Local file not found: {path}")
        return path

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
    if LOCAL_STORAGE:
        for key in object_keys:
            path = LOCAL_STORAGE / key
            if path.exists():
                path.unlink()
            parent = path.parent
            if parent.exists() and not any(parent.iterdir()):
                shutil.rmtree(parent, ignore_errors=True)
        logger.info("Deleted %d local file(s)", len(object_keys))
        return
    resp = httpx.request(
        "DELETE",
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}",
        content=json.dumps({"prefixes": object_keys}),
        headers={**_headers(), "Content-Type": "application/json"},
        timeout=30.0,
    )
    resp.raise_for_status()
    logger.info("Deleted %d file(s) from Supabase Storage", len(object_keys))


def list_prefix(prefix: str) -> List[str]:
    if LOCAL_STORAGE:
        base = LOCAL_STORAGE / prefix
        if not base.exists():
            return []
        return [str(p.relative_to(LOCAL_STORAGE)).replace("\\", "/") for p in base.rglob("*") if p.is_file()]
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
