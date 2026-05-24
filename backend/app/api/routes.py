import logging
import os
import re
import shutil
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
from app.core.ingestion import ingestion_pipeline
from app.core.llm import llm_client
from app.core.rag import rag_engine
from app.core.vectorstore import vector_store
from app.db.database import SessionLocal, get_db
from app.db.models import Chat, Document, Message, Workspace

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

router = APIRouter()
logger = logging.getLogger(__name__)

UPLOAD_PATH = Path(os.getenv("UPLOAD_PATH", "../storage/workspaces"))
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "")

# ── Clerk JWT auth ───────────────────────────────────────────────────────────

_jwks_cache: dict = {"keys": [], "fetched_at": 0.0}
_JWKS_TTL = 3600  # refresh public keys every hour


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

# Per-file locks so concurrent requests don't render the same PDF page simultaneously
_render_locks: dict[str, threading.Lock] = {}
_render_locks_mutex = threading.Lock()


def _render_lock_for(file_path: Path) -> threading.Lock:
    key = str(file_path)
    with _render_locks_mutex:
        if key not in _render_locks:
            _render_locks[key] = threading.Lock()
        return _render_locks[key]


def _safe_filename(name: str) -> str:
    """Strip characters that are unsafe in file-system paths."""
    return re.sub(r"[^\w\-.]", "_", name)


def _run_ingestion(document_id: str, file_path: Path, workspace_id: str) -> None:
    """Background task — opens its own DB session since the request session is gone."""
    db = SessionLocal()
    try:
        ingestion_pipeline.ingest_document(document_id, file_path, workspace_id, db)
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

    # Remove all vectors for this workspace in one shot
    try:
        vector_store._client.delete_collection(f"workspace_{workspace_id}")
    except Exception:
        pass  # Collection may not exist if no documents were ever ingested

    # Remove uploaded files
    ws_storage = UPLOAD_PATH / workspace_id
    if ws_storage.exists():
        shutil.rmtree(ws_storage)

    db.delete(ws)  # cascades → Document → Chunk
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

    # Persist the file
    save_dir = UPLOAD_PATH / workspace_id
    save_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_filename(file.filename)
    file_path = save_dir / safe_name

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Create Document record (status: pending)
    doc = Document(
        workspace_id=workspace_id,
        filename=safe_name,
        file_path=str(file_path),
        status="pending",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Ingestion runs after the response is returned
    background_tasks.add_task(_run_ingestion, doc.id, file_path, workspace_id)

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


def _render_page_to_cache(file_path: Path, page_number: int, dpi: int) -> Path:
    """Render one PDF page to a cached WebP image.

    Tries pypdfium2 first (PDFium — fast, low RAM), falls back to PyMuPDF on
    any failure. Both paths are guarded by a per-file lock so concurrent
    requests for the same document don't race on the same page slot.
    """
    cache_dir = file_path.parent / f".page_cache_{dpi}dpi"
    cache_dir.mkdir(exist_ok=True)
    cache_path = cache_dir / f"page_{page_number:04d}.webp"

    # Fast path: valid cached file already exists
    if cache_path.exists() and cache_path.stat().st_size > 0:
        return cache_path

    lock = _render_lock_for(file_path)
    with lock:
        # Re-check inside lock — another thread may have just written it
        if cache_path.exists() and cache_path.stat().st_size > 0:
            return cache_path

        # Remove any zero-byte leftover from a previous failed attempt
        if cache_path.exists():
            cache_path.unlink(missing_ok=True)

        # ── Try pypdfium2 (PDFium) ────────────────────────────────────────────
        try:
            import pypdfium2 as pdfium
            from PIL import Image as PilImage  # noqa: F401 — verify PIL has WebP
            doc = pdfium.PdfDocument(str(file_path))
            try:
                page = doc[page_number - 1]
                bitmap = page.render(scale=dpi / 72, rotation=0)
                pil_img = bitmap.to_pil()
                pil_img.save(str(cache_path), "WEBP", quality=88, method=4)
            finally:
                doc.close()
            return cache_path
        except Exception as exc:
            logger.warning(
                "pypdfium2 render failed for %s page %d dpi=%d: %s",
                file_path.name, page_number, dpi, exc,
            )
            if cache_path.exists():
                cache_path.unlink(missing_ok=True)

        # ── Fallback: PyMuPDF (fitz) ──────────────────────────────────────────
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


@router.get("/documents/{document_id}/pages/{page_number}")
def get_document_page(
    document_id: str,
    page_number: int,
    dpi: int = 150,
    db: Session = Depends(get_db),
):
    """Render a PDF page via PDFium and return a cached WebP image."""
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    dpi = max(72, min(dpi, 300))
    page_count = doc.page_count or 1
    if page_number < 1 or page_number > page_count:
        raise HTTPException(status_code=404, detail=f"Page {page_number} out of range")

    try:
        cache_path = _render_page_to_cache(file_path, page_number, dpi)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Render failed: {exc}")

    return FileResponse(
        path=str(cache_path),
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=604800"},  # 1 week
    )


@router.get("/documents/{document_id}/pages/{page_number}/text")
def get_page_text_layer(
    document_id: str,
    page_number: int,
    db: Session = Depends(get_db),
):
    """Return word-level bounding boxes for the text layer overlay.
    Coordinates are normalised 0–1 relative to page dimensions."""
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    try:
        import fitz
        pdf = fitz.open(str(file_path))
        page = pdf[page_number - 1]
        pw, ph = page.rect.width, page.rect.height
        words = [
            {
                "text": w[4],
                "x": w[0] / pw,
                "y": w[1] / ph,
                "w": (w[2] - w[0]) / pw,
                "h": (w[3] - w[1]) / ph,
            }
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
    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
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
    """Extract text or vision description from a bbox region of a PDF page."""
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status != "ready":
        raise HTTPException(status_code=400, detail=f"Document not ready (status: {doc.status})")
    if not Path(doc.file_path).exists():
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    from app.core.ocr import extract_region_smart

    bbox = {"x": body.x, "y": body.y, "width": body.width, "height": body.height}

    try:
        result = extract_region_smart(doc.file_path, body.page_number, bbox)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return result


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
    if not Path(doc.file_path).exists():
        raise HTTPException(status_code=404, detail="Original file no longer on disk — re-upload instead")

    doc.status = "pending"
    doc.progress = 0
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(_run_ingestion, doc.id, Path(doc.file_path), doc.workspace_id)
    return doc


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove vectors from ChromaDB first
    vector_store.delete_document(doc.workspace_id, document_id)

    # Remove physical file
    file_path = Path(doc.file_path)
    if file_path.exists():
        file_path.unlink()

    db.delete(doc)  # cascades → Chunk rows
    db.commit()


# ── Chats ────────────────────────────────────────────────────────────────────

@router.post("/workspaces/{workspace_id}/chats", response_model=ChatOut, status_code=201)
def create_chat(
    workspace_id: str,
    body: ChatCreate,
    db: Session = Depends(get_db),
):
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
    db.delete(chat)  # cascades → Message rows
    db.commit()


# ── Messages ─────────────────────────────────────────────────────────────────

@router.post("/chats/{chat_id}/messages", response_model=SendMessageResponse)
def send_message(
    chat_id: str,
    body: MessageCreate,
    db: Session = Depends(get_db),
):
    chat = db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Load history BEFORE saving the new user message so it isn't included
    recent = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.desc())
        .limit(6)
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in reversed(recent)]

    # Save user message
    user_msg = Message(chat_id=chat_id, role="user", content=body.content)
    db.add(user_msg)
    db.commit()

    # Convert highlighted_context Pydantic model → plain dict for core modules
    highlighted: dict | None = None
    if body.highlighted_context:
        highlighted = {
            "text": body.highlighted_context.text,
            "page_number": body.highlighted_context.page_number,
            "image_data": body.highlighted_context.image_data,
        }

    # RAG retrieval
    rag_result = rag_engine.retrieve(
        body.content, chat.workspace_id, highlighted_context=highlighted
    )

    # Web search (optional)
    web_chunks: list = []
    if body.use_web_search:
        from app.core.web_search import search_web
        try:
            web_results = search_web(body.content)
            web_chunks = [
                {
                    "content":     r["content"],
                    "filename":    r["title"],
                    "page_number": 0,
                    "url":         r["url"],
                    "distance":    0.0,
                }
                for r in web_results
            ]
        except Exception as exc:
            logger.warning("Web search failed: %s", exc)

    # LLM generation
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

    # Save assistant message with citations
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
