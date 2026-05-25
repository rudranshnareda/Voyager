import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.api.schemas import (
    ChatCreate, ChatDetailOut, ChatOut,
    DocumentOut, ExtractRegionRequest, MessageCreate, MessageOut,
    SendMessageResponse, WorkspaceCreate, WorkspaceDetailOut, WorkspaceOut,
)
from app.core import storage as file_storage
from app.core.ingestion import ingestion_pipeline
from app.core.llm import llm_client
from app.core.rag import rag_engine
from app.core.vectorstore import vector_store
from app.db.database import SessionLocal, get_db
from app.db.models import Chat, Document, Message, Workspace

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

router = APIRouter()
logger = logging.getLogger(__name__)

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "")

# ── Clerk JWT auth ───────────────────────────────────────────────────────────

_jwks_cache: dict = {"keys": [], "fetched_at": 0.0}
_JWKS_TTL = 3600


def _get_jwks() -> list:
    now = time.time()
    if not _jwks_cache["keys"] or now - _jwks_cache["fetched_at"] > _JWKS_TTL:
        if not CLERK_JWKS_URL:
            raise HTTPException(status_code=500, detail="CLERK_JWKS_URL not configured")
        resp = httpx.get(CLERK_JWKS_URL, timeout=10)
        resp.raise_for_status()
        _jwks_cache["keys"] = resp.json()["keys"]
        _jwks_cache["fetched_at"] = now
    return _jwks_cache["keys"]


def get_current_user(authorization: Optional[str] = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token")
    token = authorization.removeprefix("Bearer ").strip()
    keys = _get_jwks()
    for key in keys:
        try:
            payload = jwt.decode(token, key, algorithms=["RS256"])
            user_id: str = payload.get("sub", "")
            if user_id:
                return user_id
        except JWTError:
            continue
    raise HTTPException(status_code=401, detail="Invalid or expired token")


_render_locks: dict[str, threading.Lock] = {}
_render_locks_mutex = threading.Lock()


def _render_lock_for(key: str) -> threading.Lock:
    with _render_locks_mutex:
        if key not in _render_locks:
            _render_locks[key] = threading.Lock()
        return _render_locks[key]


def _safe_filename(name: str) -> str:
    return re.sub(r"[^\w\-.]", "_", name)


def _run_ingestion(document_id: str, storage_key: str, workspace_id: str) -> None:
    db = SessionLocal()
    try:
        ingestion_pipeline.ingest_document(document_id, storage_key, workspace_id, db)
    except Exception as exc:
        logger.error("Background ingestion failed for document %s: %s", document_id, exc)
    finally:
        db.close()


# ── Workspaces ──────────────────────────────────────────────────────────────

@router.post("/workspaces", response_model=WorkspaceOut, status_code=201)
def create_workspace(
    body: WorkspaceCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    if db.query(Workspace).filter(Workspace.name == body.name, Workspace.owner_id == user_id).first():
        raise HTTPException(status_code=409, detail=f"Workspace '{body.name}' already exists")
    ws = Workspace(name=body.name, emoji=body.emoji if hasattr(body, "emoji") else "📁", owner_id=user_id)
    db.add(ws)
    db.commit()
    db.refresh(ws)
    return ws


@router.get("/workspaces", response_model=list[WorkspaceOut])
def list_workspaces(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    return (
        db.query(Workspace)
        .filter(Workspace.owner_id == user_id)
        .order_by(Workspace.created_at.desc())
        .all()
    )


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceDetailOut)
def get_workspace(
    workspace_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if ws.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return ws


@router.delete("/workspaces/{workspace_id}", status_code=204)
def delete_workspace(
    workspace_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if ws.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        keys = file_storage.list_prefix(workspace_id)
        file_storage.delete_files(keys)
    except Exception as exc:
        logger.warning("Could not delete Supabase Storage files for workspace %s: %s", workspace_id, exc)

    db.delete(ws)
    db.commit()


# ── Documents ───────────────────────────────────────────────────────────────

@router.post("/workspaces/{workspace_id}/documents", response_model=DocumentOut, status_code=202)
async def upload_document(
    workspace_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    import shutil
    safe_name = _safe_filename(file.filename)

    # Create Document record first to get the ID
    doc = Document(
        workspace_id=workspace_id,
        filename=safe_name,
        file_path="pending",  # updated after upload
        status="pending",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    storage_key = f"{workspace_id}/{doc.id}/{safe_name}"

    # Save to local temp dir for immediate ingestion access
    local_path = file_storage.CACHE_DIR / doc.id / safe_name
    local_path.parent.mkdir(parents=True, exist_ok=True)
    with open(local_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Upload to Supabase Storage
    try:
        file_data = local_path.read_bytes()
        file_storage.upload_file(storage_key, file_data)
    except Exception as exc:
        logger.error("Supabase Storage upload failed: %s", exc)
        doc.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail=f"File upload failed: {exc}")

    doc.file_path = storage_key
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(_run_ingestion, doc.id, storage_key, workspace_id)
    return doc


@router.get("/workspaces/{workspace_id}/documents", response_model=list[DocumentOut])
def list_documents(workspace_id: str, db: Session = Depends(get_db)):
    if not db.get(Workspace, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    return (
        db.query(Document)
        .filter(Document.workspace_id == workspace_id)
        .order_by(Document.created_at.desc())
        .all()
    )


@router.get("/documents/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def _render_page_to_cache(file_path: Path, document_id: str, page_number: int, dpi: int) -> Path:
    cache_dir = file_storage.CACHE_DIR / document_id / f".page_cache_{dpi}dpi"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"page_{page_number:04d}.webp"

    if cache_path.exists() and cache_path.stat().st_size > 0:
        return cache_path

    lock = _render_lock_for(f"{document_id}:{page_number}:{dpi}")
    with lock:
        if cache_path.exists() and cache_path.stat().st_size > 0:
            return cache_path
        if cache_path.exists():
            cache_path.unlink(missing_ok=True)

        import fitz
        from PIL import Image as PilImage
        pdf = fitz.open(str(file_path))
        try:
            page = pdf[page_number - 1]
            pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False)
            pil_img = PilImage.frombytes("RGB", (pix.width, pix.height), pix.samples)
            pil_img.save(str(cache_path), "WEBP", quality=88, method=4)
        finally:
            pdf.close()

    return cache_path


def _get_local_pdf(doc: Document) -> Path:
    """Download PDF from Supabase Storage to local temp cache if needed."""
    if doc.file_path == "pending":
        raise HTTPException(status_code=404, detail="File not yet uploaded")
    try:
        return file_storage.get_local_path(doc.file_path, doc.id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Could not retrieve file: {exc}")


@router.get("/documents/{document_id}/pages/{page_number}")
def get_document_page(
    document_id: str,
    page_number: int,
    dpi: int = 150,
    db: Session = Depends(get_db),
):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    dpi = max(72, min(dpi, 300))
    page_count = doc.page_count or 1
    if page_number < 1 or page_number > page_count:
        raise HTTPException(status_code=404, detail=f"Page {page_number} out of range")

    file_path = _get_local_pdf(doc)
    try:
        cache_path = _render_page_to_cache(file_path, document_id, page_number, dpi)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Render failed: {exc}")

    return FileResponse(
        path=str(cache_path),
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=604800"},
    )


@router.get("/documents/{document_id}/pages/{page_number}/text")
def get_page_text_layer(
    document_id: str,
    page_number: int,
    db: Session = Depends(get_db),
):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = _get_local_pdf(doc)
    try:
        import fitz
        pdf = fitz.open(str(file_path))
        page = pdf[page_number - 1]
        pw, ph = page.rect.width, page.rect.height
        words = [
            {"text": w[4], "x": w[0] / pw, "y": w[1] / ph, "w": (w[2] - w[0]) / pw, "h": (w[3] - w[1]) / ph}
            for w in page.get_text("words")
            if w[4].strip()
        ]
        pdf.close()
        return {"words": words, "page_width": pw, "page_height": ph}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/documents/{document_id}/file")
def get_document_file(document_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    file_path = _get_local_pdf(doc)
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc.filename}"'},
    )


@router.post("/documents/{document_id}/extract-region")
async def extract_document_region(
    document_id: str,
    body: ExtractRegionRequest,
    db: Session = Depends(get_db),
):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status != "ready":
        raise HTTPException(status_code=400, detail=f"Document not ready (status: {doc.status})")

    file_path = _get_local_pdf(doc)
    from app.core.ocr import extract_region_smart
    try:
        return extract_region_smart(str(file_path), body.page_number, {"x": body.x, "y": body.y, "width": body.width, "height": body.height})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/documents/{document_id}/retry", response_model=DocumentOut)
def retry_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status not in ("failed", "processing"):
        raise HTTPException(status_code=400, detail=f"Document is '{doc.status}', not retryable")

    doc.status = "pending"
    doc.progress = 0
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(_run_ingestion, doc.id, doc.file_path, doc.workspace_id)
    return doc


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    vector_store.delete_document(doc.workspace_id, document_id)

    try:
        file_storage.delete_files([doc.file_path])
    except Exception as exc:
        logger.warning("Could not delete Supabase Storage file %s: %s", doc.file_path, exc)

    db.delete(doc)
    db.commit()


# ── Chats ────────────────────────────────────────────────────────────────────

@router.post("/workspaces/{workspace_id}/chats", response_model=ChatOut, status_code=201)
def create_chat(workspace_id: str, body: ChatCreate, db: Session = Depends(get_db)):
    if not db.get(Workspace, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    chat = Chat(workspace_id=workspace_id, title=body.title)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


@router.get("/workspaces/{workspace_id}/chats", response_model=list[ChatOut])
def list_chats(workspace_id: str, db: Session = Depends(get_db)):
    if not db.get(Workspace, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    return (
        db.query(Chat)
        .filter(Chat.workspace_id == workspace_id)
        .order_by(Chat.created_at.desc())
        .all()
    )


@router.get("/chats/{chat_id}", response_model=ChatDetailOut)
def get_chat(chat_id: str, db: Session = Depends(get_db)):
    chat = db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.delete("/chats/{chat_id}", status_code=204)
def delete_chat(chat_id: str, db: Session = Depends(get_db)):
    chat = db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    db.delete(chat)
    db.commit()


# ── Messages ─────────────────────────────────────────────────────────────────

@router.post("/chats/{chat_id}/messages", response_model=SendMessageResponse)
def send_message(chat_id: str, body: MessageCreate, db: Session = Depends(get_db)):
    chat = db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    recent = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.desc())
        .limit(6)
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in reversed(recent)]

    highlighted: dict | None = None
    if body.highlighted_context:
        highlighted = {
            "text": body.highlighted_context.text,
            "page_number": body.highlighted_context.page_number,
            "image_data": body.highlighted_context.image_data,
        }

    user_msg = Message(chat_id=chat_id, role="user", content=body.content, attachment=highlighted)
    db.add(user_msg)
    db.commit()

    rag_result = rag_engine.retrieve(body.content, chat.workspace_id, highlighted_context=highlighted)

    web_chunks: list = []
    if body.use_web_search:
        from app.core.web_search import search_web
        try:
            web_results = search_web(body.content)
            web_chunks = [
                {"content": r["content"], "filename": r["title"], "page_number": 0, "url": r["url"], "distance": 0.0}
                for r in web_results
            ]
        except Exception as exc:
            logger.warning("Web search failed: %s", exc)

    try:
        llm_result = llm_client.generate_answer(
            query=body.content,
            context_chunks=rag_result["chunks"],
            chat_history=history,
            highlighted_context=highlighted,
            web_chunks=web_chunks,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    assistant_msg = Message(
        chat_id=chat_id,
        role="assistant",
        content=llm_result["answer"],
        citations=llm_result["citations"],
    )
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    return SendMessageResponse(
        message=MessageOut.model_validate(assistant_msg),
        sources_found=rag_result["found"],
    )


@router.get("/chats/{chat_id}/messages", response_model=list[MessageOut])
def get_messages(chat_id: str, db: Session = Depends(get_db)):
    if not db.get(Chat, chat_id):
        raise HTTPException(status_code=404, detail="Chat not found")
    return (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.asc())
        .all()
    )
