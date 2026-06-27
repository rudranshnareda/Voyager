import axios from "axios";

// ── Base URL helpers ──────────────────────────────────────────────────────────

// In production (Vercel), no env var is set and calls go through the /proxy
// rewrite in next.config.ts, which forwards to Railway server-side.
// In local dev, set NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 in .env.local.
export const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "/proxy";

const STORAGE_KEY = "voyager_api_url";

// Railway domains — if a user saved one of these directly, migrate them to the
// proxy so their requests go through Vercel (bypasses ISP DNS blocks).
const RAILWAY_DOMAINS = [
  "voyager-production-58d9.up.railway.app",
  "voyager-production-4dc3.up.railway.app",
];

export function getApiUrl(): string {
  if (typeof window === "undefined") return DEFAULT_API_URL;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return DEFAULT_API_URL;
  if (RAILWAY_DOMAINS.some((d) => saved.includes(d))) {
    localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_API_URL;
  }
  return saved;
}

export function saveApiUrl(url: string): void {
  if (!url || url === DEFAULT_API_URL) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, url.replace(/\/$/, ""));
  }
}

// ── Axios instance ────────────────────────────────────────────────────────────

const api = axios.create({
  headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
});

// Resolve base URL on every request so settings changes take effect immediately
api.interceptors.request.use((config) => {
  config.baseURL = getApiUrl();
  return config;
});

// ── Auth token injection ──────────────────────────────────────────────────────

let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>): void {
  _getToken = fn;
}

api.interceptors.request.use(async (config) => {
  if (_getToken) {
    const token = await _getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Types (mirror backend Pydantic schemas) ───────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  emoji: string;
  created_at: string;
}

export interface WorkspaceDetail extends Workspace {
  documents: Document[];
}

export interface Document {
  id: string;
  workspace_id: string;
  filename: string;
  page_count: number | null;
  status: "pending" | "processing" | "ready" | "failed";
  progress: number;
  created_at: string;
}

export interface Citation {
  filename: string;
  page_number: number;
  excerpt: string;
  url?: string | null;
}

export interface MessageAttachment {
  text: string;
  page_number: number;
  image_data?: string | null;
}

export interface Message {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  attachment?: MessageAttachment | null;
  created_at: string;
}

export interface Chat {
  id: string;
  workspace_id: string;
  title: string | null;
  created_at: string;
}

export interface ChatDetail extends Chat {
  messages: Message[];
}

export interface SendMessageResponse {
  message: Message;
  sources_found: number;
}

// ── Workspace endpoints ───────────────────────────────────────────────────────

export async function getWorkspaces(): Promise<Workspace[]> {
  const res = await api.get<Workspace[]>("/api/workspaces");
  return res.data;
}

export async function createWorkspace(name: string, emoji = "📁"): Promise<Workspace> {
  const res = await api.post<Workspace>("/api/workspaces", { name, emoji });
  return res.data;
}

export async function getWorkspace(id: string): Promise<WorkspaceDetail> {
  const res = await api.get<WorkspaceDetail>(`/api/workspaces/${id}`);
  return res.data;
}

export async function deleteWorkspace(id: string): Promise<void> {
  await api.delete(`/api/workspaces/${id}`);
}

// ── Document endpoints ────────────────────────────────────────────────────────

export async function uploadDocument(
  workspaceId: string,
  file: File
): Promise<Document> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<Document>(
    `/api/workspaces/${workspaceId}/documents`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return res.data;
}

export async function getDocuments(workspaceId: string): Promise<Document[]> {
  const res = await api.get<Document[]>(
    `/api/workspaces/${workspaceId}/documents`
  );
  return res.data;
}

export async function getDocument(id: string): Promise<Document> {
  const res = await api.get<Document>(`/api/documents/${id}`);
  return res.data;
}

export async function deleteDocument(id: string): Promise<void> {
  await api.delete(`/api/documents/${id}`);
}

export async function retryDocument(id: string): Promise<Document> {
  const res = await api.post<Document>(`/api/documents/${id}/retry`);
  return res.data;
}

// ── Chat endpoints ────────────────────────────────────────────────────────────

export async function getChats(workspaceId: string): Promise<Chat[]> {
  const res = await api.get<Chat[]>(`/api/workspaces/${workspaceId}/chats`);
  return res.data;
}

export async function createChat(
  workspaceId: string,
  title?: string
): Promise<Chat> {
  const res = await api.post<Chat>(`/api/workspaces/${workspaceId}/chats`, {
    title: title ?? "New Chat",
  });
  return res.data;
}

export async function getChat(id: string): Promise<ChatDetail> {
  const res = await api.get<ChatDetail>(`/api/chats/${id}`);
  return res.data;
}

export async function deleteChat(id: string): Promise<void> {
  await api.delete(`/api/chats/${id}`);
}

// ── Message endpoints ─────────────────────────────────────────────────────────

export async function sendMessage(
  chatId: string,
  content: string,
  highlightedContext?: { text: string; page: number; image_data?: string | null },
  useWebSearch?: boolean
): Promise<SendMessageResponse> {
  const res = await api.post<SendMessageResponse>(
    `/api/chats/${chatId}/messages`,
    {
      content,
      highlighted_context: highlightedContext
        ? {
            text: highlightedContext.text,
            page_number: highlightedContext.page,
            image_data: highlightedContext.image_data ?? null,
          }
        : null,
      use_web_search: useWebSearch ?? false,
    }
  );
  return res.data;
}

export async function getMessages(chatId: string): Promise<Message[]> {
  const res = await api.get<Message[]>(`/api/chats/${chatId}/messages`);
  return res.data;
}

// ── Region extraction ─────────────────────────────────────────────────────────

export async function extractAndDescribeRegion(
  documentId: string,
  pageNumber: number,
  bbox: { x: number; y: number; width: number; height: number }
): Promise<{
  text: string;
  description: string;
  method: "ocr" | "vision" | "ocr_and_vision" | "error";
  final_text: string;
  image_data: string | null;
}> {
  const res = await api.post(`/api/documents/${documentId}/extract-region`, {
    page_number: pageNumber,
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
  });
  return res.data;
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function getDocumentFileUrl(documentId: string): string {
  return `${getApiUrl()}/api/documents/${documentId}/file`;
}

export function getDocumentPageUrl(documentId: string, page: number, dpi = 150): string {
  return `${getApiUrl()}/api/documents/${documentId}/pages/${page}?dpi=${dpi}`;
}

export function getDocumentPageTextUrl(documentId: string, page: number): string {
  return `${getApiUrl()}/api/documents/${documentId}/pages/${page}/text`;
}

export async function getPageTextLayer(
  documentId: string,
  page: number
): Promise<{ words: { text: string; x: number; y: number; w: number; h: number }[] }> {
  const res = await api.get(getDocumentPageTextUrl(documentId, page));
  return res.data;
}

export async function testConnection(): Promise<boolean> {
  try {
    await axios.get(`${getApiUrl()}/health`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
