from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


# ── Workspaces ───────────────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name: str
    emoji: str = "📁"


class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    emoji: str = "📁"
    created_at: datetime


class WorkspaceDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    emoji: str = "📁"
    created_at: datetime
    documents: List["DocumentOut"] = []


# ── Documents ────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    filename: str
    page_count: Optional[int] = None
    status: str
    progress: int = 0
    created_at: datetime


# ── Citations & Messages ─────────────────────────────────────────────────────

class Citation(BaseModel):
    filename: str
    page_number: int
    excerpt: str
    url: Optional[str] = None  # set for web-search results; absent for document citations


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chat_id: str
    role: str
    content: str
    citations: Optional[List[Citation]] = None
    created_at: datetime


# ── Chats ────────────────────────────────────────────────────────────────────

class ChatCreate(BaseModel):
    title: str = "New Chat"


class ChatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    title: Optional[str] = None
    created_at: datetime


class ChatDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    title: Optional[str] = None
    created_at: datetime
    messages: List[MessageOut] = []


# ── Request / composite response bodies ─────────────────────────────────────

class HighlightedContext(BaseModel):
    text: str
    page_number: int
    image_data: Optional[str] = None  # base64 PNG of the drawn region; absent for text highlights


class ExtractRegionRequest(BaseModel):
    page_number: int
    x: float
    y: float
    width: float
    height: float


class MessageCreate(BaseModel):
    content: str
    highlighted_context: Optional[HighlightedContext] = None
    use_web_search: bool = False


class SendMessageResponse(BaseModel):
    message: MessageOut
    sources_found: int
