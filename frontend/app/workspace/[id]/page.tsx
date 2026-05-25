"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { HighlightedText } from "@/components/PDFViewer";
import {
  createChat,
  deleteChat,
  deleteDocument,
  retryDocument,
  getChat,
  getChats,
  getWorkspace,
  sendMessage,
  uploadDocument,
  type Chat,
  type Document,
  type Message,
  type MessageAttachment,
  type WorkspaceDetail,
} from "@/lib/api";

// Loaded client-only — pdf.js uses browser APIs and a web worker.
const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-zinc-900">
      <svg
        className="w-5 h-5 text-zinc-600 animate-spin"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
  ),
});

// ── Status badge ──────────────────────────────────────────────────────────────

// ── Progress ring ─────────────────────────────────────────────────────────────

function ProgressRing({ progress }: { progress: number }) {
  const r = 9;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, progress)) / 100);
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0">
      <circle cx="14" cy="14" r={r} stroke="#3f3f46" strokeWidth="2.5" fill="none" />
      <circle
        cx="14" cy="14" r={r}
        stroke="#f59e0b"
        strokeWidth="2.5"
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
        className="transition-all duration-500"
      />
      <text x="14" y="14.5" textAnchor="middle" dominantBaseline="middle" fill="#a1a1aa" fontSize="6" fontFamily="monospace">
        {progress}%
      </text>
    </svg>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocumentRow({
  doc,
  isSelected,
  onSelect,
  onDelete,
  onRetry,
}: {
  doc: Document;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const clickable = doc.status !== "failed";
  return (
    <div
      onClick={() => clickable && onSelect(doc.id)}
      className={`group flex items-center gap-2 px-3 py-2.5 transition-colors ${
        clickable ? "cursor-pointer" : "cursor-default"
      } ${
        isSelected
          ? "bg-indigo-500/10 border-l-2 border-l-indigo-500"
          : "border-l-2 border-l-transparent hover:bg-zinc-800/50"
      }`}
    >
      <div className="shrink-0 w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center">
        <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${isSelected ? "text-indigo-300" : "text-white"}`}>
          {doc.filename}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {doc.page_count != null ? `${doc.page_count} pp.` : "—"}
        </p>
      </div>

      {/* Status indicator */}
      {(doc.status === "pending" || doc.status === "processing") ? (
        <ProgressRing progress={doc.progress} />
      ) : doc.status === "ready" ? (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0 bg-emerald-500/15 text-emerald-400">Ready</span>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">Failed</span>
          <button
            onClick={(e) => { e.stopPropagation(); onRetry(doc.id); }}
            title="Retry ingestion"
            className="p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
        className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
        aria-label="Delete document"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({
  onUpload,
  uploading,
}: {
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`mx-3 mb-3 border-2 border-dashed rounded-lg p-3 flex flex-col items-center gap-1.5 transition-colors ${
        dragging
          ? "border-indigo-500 bg-indigo-500/10 cursor-copy"
          : uploading
          ? "border-zinc-700 bg-zinc-800/30 cursor-not-allowed"
          : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/30 cursor-pointer"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
      {uploading ? (
        <svg
          className="w-4 h-4 text-indigo-400 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
      )}
      <p className="text-xs text-zinc-500 text-center">
        {uploading ? "Uploading…" : "Drop PDF or click"}
      </p>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function AttachmentBubble({ attachment }: { attachment: MessageAttachment }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-1.5 flex justify-end">
      <div className="max-w-[80%] bg-indigo-500/10 border border-indigo-500/20 rounded-xl rounded-tr-sm px-3 py-2 text-xs text-indigo-300">
        {attachment.image_data ? (
          <div>
            <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-200 transition-colors mb-1.5">
              <span>👁</span>
              <span className="font-medium">p.{attachment.page_number} — drawn region</span>
              <span className="text-indigo-500">{expanded ? "▲" : "▼"}</span>
            </button>
            {expanded && (
              <img
                src={`data:image/png;base64,${attachment.image_data}`}
                alt="Selected region"
                className="rounded border border-indigo-500/30 object-contain max-h-48 max-w-full"
              />
            )}
          </div>
        ) : (
          <div>
            <span className="text-indigo-400 font-medium">📌 p.{attachment.page_number}: </span>
            <span className="text-indigo-200/70">
              {attachment.text.length > 120 ? attachment.text.slice(0, 120) + "…" : attachment.text}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onCitationClick,
}: {
  message: Message;
  onCitationClick?: (filename: string, page: number) => void;
}) {
  const isUser = message.role === "user";
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const hasCitations = !isUser && message.citations && message.citations.length > 0;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold mt-1 ${
          isUser ? "bg-indigo-500 text-white" : "bg-zinc-800 text-zinc-300"
        }`}
      >
        {isUser ? "U" : "AI"}
      </div>
      <div
        className={`max-w-[80%] flex flex-col gap-1.5 ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? "bg-indigo-500 text-white rounded-tr-sm whitespace-pre-wrap"
              : "bg-zinc-800 text-zinc-100 rounded-tl-sm prose prose-sm prose-invert max-w-none"
          }`}
        >
          {isUser ? message.content : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1 first:mt-0">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1 first:mt-0">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-0.5 first:mt-0">{children}</h3>,
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li className="text-sm">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
                code: ({ children }) => <code className="bg-zinc-700 text-amber-300 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                pre: ({ children }) => <pre className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 overflow-x-auto text-xs mb-2">{children}</pre>,
                blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-600 pl-3 italic text-zinc-400 mb-2">{children}</blockquote>,
                hr: () => <hr className="border-zinc-700 my-2" />,
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {hasCitations && (
          <div className="w-full">
            {/* ── Sources toggle ──────────────────────────────────────── */}
            <button
              onClick={() => { setSourcesOpen((v) => !v); setExpandedIdx(null); }}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-0.5"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Sources ({message.citations!.length})
              <span className="text-zinc-600">{sourcesOpen ? "▲" : "▼"}</span>
            </button>

            {/* ── Individual source cards (only when open) ─────────────── */}
            {sourcesOpen && (
              <div className="flex flex-col gap-1.5 mt-1.5">
                {message.citations!.map((c, i) => {
                  const isExpanded = expandedIdx === i;
                  const isWeb = !!c.url;
                  return (
                    <div
                      key={i}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg text-xs overflow-hidden hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-center gap-1 px-3 py-2">
                        {isWeb ? (
                          <a
                            href={c.url!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium min-w-0 flex-1 transition-colors"
                          >
                            {/* Globe icon */}
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <circle cx="12" cy="12" r="10" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                            </svg>
                            <span className="truncate">{c.filename}</span>
                            <span className="text-zinc-600 shrink-0">↗</span>
                          </a>
                        ) : (
                          <button
                            onClick={() => onCitationClick?.(c.filename, c.page_number)}
                            className={`flex items-center gap-1 text-indigo-400 font-medium min-w-0 flex-1 text-left ${
                              onCitationClick ? "hover:text-indigo-300 transition-colors" : "cursor-default"
                            }`}
                          >
                            <span className="truncate">{c.filename}</span>
                            <span className="shrink-0">· p.&nbsp;{c.page_number}</span>
                            {onCitationClick && <span className="text-zinc-600 shrink-0">↗</span>}
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedIdx(isExpanded ? null : i)}
                          className="shrink-0 ml-2 px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                        >
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-0.5 border-t border-zinc-800/60">
                          <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {c.excerpt}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-zinc-800 shrink-0 flex items-center justify-center text-xs font-semibold mt-1 text-zinc-300">
        AI
      </div>
      <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-1.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// Phrases that automatically trigger web search for a single message
const WEB_SEARCH_RE = /\b(search(\s+for)?|look\s+up|google|find\s+recent|recent\s+updates?|latest\s+(news|updates?|research|info|information)|current\s+news|what('s|\s+is)\s+(new|happening)|news\s+about)\b/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Chat history view ─────────────────────────────────────────────────────────

function ChatHistoryView({
  chats,
  loadingChats,
  workspaceName,
  workspaceEmoji,
  onSelectChat,
  onNewChat,
  onDeleteChat,
}: {
  chats: Chat[];
  loadingChats: boolean;
  workspaceName: string;
  workspaceEmoji: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-4 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xl leading-none">{workspaceEmoji}</span>
          <h2 className="text-sm font-semibold text-white truncate">{workspaceName}</h2>
        </div>
        <p className="text-xs text-zinc-500 mt-1">{chats.length} chat{chats.length !== 1 ? "s" : ""}</p>
      </div>

      {/* New Chat button */}
      <div className="px-4 py-3 shrink-0">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loadingChats ? (
          <div className="flex justify-center py-8">
            <svg className="w-5 h-5 text-zinc-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="text-sm text-zinc-500">No chats yet</p>
            <p className="text-xs text-zinc-600 mt-1">Start a new chat above</p>
          </div>
        ) : (
          chats.map((chat) => (
            <div key={chat.id} className="group relative">
              <button
                onClick={() => onSelectChat(chat.id)}
                className="w-full text-left px-3 py-3 rounded-xl hover:bg-zinc-800 transition-colors mb-0.5"
              >
                <p className="text-sm text-white font-medium truncate pr-8">
                  {chat.title ?? "New Chat"}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{relativeDate(chat.created_at)}</p>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
                aria-label="Delete chat"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Chat panel ────────────────────────────────────────────────────────────────

function ChatPanel({
  workspaceId,
  chats,
  setChats,
  activeChatId,
  setActiveChatId,
  onShowHistory,
  indexingDocs,
  onCitationClick,
  highlightedContext,
  onClearHighlight,
}: {
  workspaceId: string;
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  activeChatId: string | null;
  setActiveChatId: React.Dispatch<React.SetStateAction<string | null>>;
  onShowHistory: () => void;
  indexingDocs: Document[];
  onCitationClick?: (filename: string, page: number) => void;
  highlightedContext?: HighlightedText | null;
  onClearHighlight?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFullHighlight, setShowFullHighlight] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!activeChatId) { setMessages([]); return; }
    setLoadingMessages(true);
    getChat(activeChatId)
      .then((data) => setMessages(data.messages))
      .catch(() => setError("Could not load messages."))
      .finally(() => setLoadingMessages(false));
  }, [activeChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => { setShowFullHighlight(false); }, [highlightedContext]);

  const doSend = async (chatId: string, text: string) => {
    const useWeb = webSearch || WEB_SEARCH_RE.test(text);
    const attachment = highlightedContext
      ? { text: highlightedContext.text, page_number: highlightedContext.page, image_data: highlightedContext.image_data ?? null }
      : null;
    const currentChat = chats.find(c => c.id === chatId);
    if (!currentChat?.title || currentChat.title === "New Chat") {
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: text.slice(0, 50) } : c));
    }
    const optimistic: Message = {
      id: crypto.randomUUID(),
      chat_id: chatId,
      role: "user",
      content: text,
      citations: null,
      attachment,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    onClearHighlight?.();
    setSending(true);
    setError(null);
    try {
      const res = await sendMessage(chatId, text, highlightedContext ?? undefined, useWeb);
      setMessages((prev) => [...prev, res.message]);
    } catch {
      setError("Failed to send message. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!activeChatId) {
      try {
        const chat = await createChat(workspaceId);
        setChats((prev) => [chat, ...prev]);
        setActiveChatId(chat.id);
        await doSend(chat.id, text);
      } catch {
        setError("Failed to start chat.");
      }
      return;
    }
    await doSend(activeChatId, text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeTitle = chats.find(c => c.id === activeChatId)?.title ?? "New Chat";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-zinc-800 flex items-center gap-2 shrink-0 min-w-0">
        <button
          onClick={onShowHistory}
          className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs font-medium transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          History
        </button>
        <span className="text-zinc-700 select-none">|</span>
        <p className="text-sm text-white font-medium truncate flex-1">{activeTitle}</p>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center justify-between shrink-0">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-3 text-red-400/60 hover:text-red-400">✕</button>
        </div>
      )}

      {/* Indexing banner */}
      {indexingDocs.length > 0 && (
        <div className="mx-4 mt-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-xs text-amber-400">
              Indexing {indexingDocs.length === 1 ? `"${indexingDocs[0].filename}"` : `${indexingDocs.length} documents`}
              {indexingDocs[0].progress > 0 && ` — ${indexingDocs[0].progress}% done`}
              {" · "}answers use world knowledge + highlights for now
            </p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loadingMessages ? (
          <div className="flex items-center justify-center py-8">
            <svg className="w-5 h-5 text-zinc-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="text-sm text-zinc-500">Ask anything — about the document, a highlight, or the web.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" && msg.attachment && (
                <AttachmentBubble attachment={msg.attachment} />
              )}
              <MessageBubble message={msg} onCitationClick={onCitationClick} />
            </div>
          ))
        )}
        {sending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-3 border-t border-zinc-800 shrink-0">
        {/* Highlight indicator */}
        {highlightedContext && (
          <div className="mb-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-xs text-indigo-400 shrink-0 font-medium">
                {highlightedContext.method === "vision" || highlightedContext.method === "ocr_and_vision"
                  ? "👁"
                  : highlightedContext.method === "ocr"
                  ? "📄"
                  : "📌"}{" "}
                p.{highlightedContext.page}:
              </span>
              {highlightedContext.image_data ? (
                <button
                  onClick={() => setShowFullHighlight((v) => !v)}
                  className="text-xs text-indigo-300/60 hover:text-indigo-300 transition-colors flex-1 text-left"
                >
                  {showFullHighlight ? "▲ collapse" : "▼ expand"}
                </button>
              ) : (
                <span className="text-xs text-indigo-200/60 flex-1 truncate">
                  {highlightedContext.text.length > 60
                    ? highlightedContext.text.slice(0, 60) + "…"
                    : highlightedContext.text}
                </span>
              )}
              <button
                onClick={onClearHighlight}
                className="text-xs text-indigo-400/50 hover:text-indigo-300 transition-colors shrink-0"
              >
                Clear
              </button>
            </div>

            {/* Thumbnail (drawn regions only) */}
            {highlightedContext.image_data && (
              <div className="mt-1.5">
                <img
                  src={`data:image/png;base64,${highlightedContext.image_data}`}
                  alt="Selected region"
                  onClick={() => setShowFullHighlight((v) => !v)}
                  className={`rounded border border-indigo-500/30 object-contain cursor-pointer transition-all duration-200 ${
                    showFullHighlight ? "max-h-48" : "max-h-12"
                  }`}
                />
              </div>
            )}

            {/* Expanded full text (text highlights only) */}
            {!highlightedContext.image_data && showFullHighlight && (
              <div className="mt-1 px-3 py-2.5 bg-zinc-900 border border-indigo-500/20 rounded-lg max-h-40 overflow-y-auto">
                <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {highlightedContext.text}
                </p>
              </div>
            )}
          </div>
        )}
        <div className={`flex items-end gap-3 bg-zinc-900 border rounded-xl px-4 py-3 transition-colors ${webSearch || WEB_SEARCH_RE.test(input) ? "border-sky-500/60 focus-within:border-sky-400" : "border-zinc-700 focus-within:border-indigo-500"}`}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about the document, a highlight, or the web…"
            disabled={sending}
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 outline-none resize-none max-h-32 disabled:cursor-not-allowed"
            style={{ scrollbarWidth: "none" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="shrink-0 w-8 h-8 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            aria-label="Send message"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-zinc-600">Enter to send · Shift+Enter for new line</p>
          <button
            onClick={() => setWebSearch((v) => !v)}
            title={webSearch ? "Web search on — click to disable" : "Enable web search"}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all ${
              webSearch
                ? "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/40"
                : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
            </svg>
            {webSearch ? "Web on" : "Search web"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<string | null>(null);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [highlightedContext, setHighlightedContext] = useState<HighlightedText | null>(null);
  const [docPanelCollapsed, setDocPanelCollapsed] = useState(false);
  const [chatPanelView, setChatPanelView] = useState<"history" | "active">("history");
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [pendingDeleteChat, setPendingDeleteChat] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    try {
      const data = await getWorkspace(id);
      setWorkspace(data);
    } catch {
      setError("Could not load workspace.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  // Poll while any document is still ingesting
  useEffect(() => {
    const needsPoll = workspace?.documents.some(
      (d) => d.status === "pending" || d.status === "processing"
    );
    if (!needsPoll) return;
    const t = setInterval(fetchWorkspace, 3000);
    return () => clearInterval(t);
  }, [workspace, fetchWorkspace]);

  useEffect(() => {
    getChats(id)
      .then(setChats)
      .catch(() => {})
      .finally(() => setLoadingChats(false));
  }, [id]);

  // Deselect only if the selected doc was deleted or failed
  useEffect(() => {
    if (!workspace) return;
    const openable = workspace.documents.filter((d) => d.status !== "failed");
    if (currentDocumentId && !openable.some((d) => d.id === currentDocumentId)) {
      setCurrentDocumentId(null);
      setCurrentPage(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.documents]);

  // Click the active doc to close it; click another to switch
  const handleSelectDocument = (docId: string) => {
    setCurrentDocumentId((prev) => (prev === docId ? null : docId));
    setCurrentPage(1);
  };

  // Jump to the page referenced by a citation
  const handleCitationClick = useCallback(
    (filename: string, page: number) => {
      const doc = workspace?.documents.find(
        (d) => d.filename === filename && d.status === "ready"
      );
      if (doc) {
        setCurrentDocumentId(doc.id);
        setCurrentPage(page);
        setChatPanelView("active");
      }
    },
    [workspace?.documents]
  );

  const handleDeleteChat = async (chatId: string) => {
    if (activeChatId === chatId) {
      const next = chats.find(c => c.id !== chatId);
      setActiveChatId(next?.id ?? null);
      if (!next) setChatPanelView("history");
    }
    setChats(prev => prev.filter(c => c.id !== chatId));
    try {
      await deleteChat(chatId);
    } catch {
      setError("Failed to delete chat.");
    }
  };

  const handleUpload = async (file: File) => {
    if (!workspace) return;
    setUploading(true);
    setError(null);
    try {
      const doc = await uploadDocument(workspace.id, file);
      setWorkspace((prev) =>
        prev ? { ...prev, documents: [doc, ...prev.documents] } : prev
      );
    } catch {
      setError("Failed to upload document.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = (docId: string) => {
    setPendingDeleteDoc(docId);
  };

  const handleRetryDoc = async (docId: string) => {
    try {
      const updated = await retryDocument(docId);
      setWorkspace((prev) =>
        prev ? { ...prev, documents: prev.documents.map((d) => d.id === docId ? updated : d) } : prev
      );
    } catch {
      setError("Failed to retry ingestion.");
    }
  };

  const confirmDeleteDoc = async () => {
    if (!pendingDeleteDoc) return;
    const docId = pendingDeleteDoc;
    setPendingDeleteDoc(null);
    if (currentDocumentId === docId) {
      setCurrentDocumentId(null);
      setCurrentPage(1);
    }
    setWorkspace((prev) =>
      prev
        ? { ...prev, documents: prev.documents.filter((d) => d.id !== docId) }
        : prev
    );
    try {
      await deleteDocument(docId);
    } catch {
      setError("Failed to delete document.");
      fetchWorkspace();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <svg className="w-6 h-6 text-zinc-600 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-red-400 text-sm">{error}</p>
        <Link href="/" className="text-indigo-400 text-sm hover:underline">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const readyCount = workspace?.documents.filter((d) => d.status === "ready").length ?? 0;
  const indexingDocs = workspace?.documents.filter(
    (d) => d.status === "pending" || d.status === "processing"
  ) ?? [];

  return (
    <div className="flex h-full">

      {/* ── Mini sidebar (fixed w-12, shown when doc panel is collapsed) ─────── */}
      {docPanelCollapsed && (
        <aside className="w-12 shrink-0 flex flex-col items-center border-r border-zinc-800 bg-zinc-900 py-3 gap-3 overflow-y-auto">
          {/* Workspace emoji — click to expand */}
          <button
            onClick={() => setDocPanelCollapsed(false)}
            title={`${workspace?.emoji} ${workspace?.name} — expand`}
            className="text-2xl leading-none hover:scale-110 transition-transform"
          >
            {workspace?.emoji ?? "📁"}
          </button>

          <div className="w-6 border-t border-zinc-700" />

          {/* Mini doc tiles */}
          <div className="flex flex-col gap-2 flex-1 w-full items-center px-1.5">
            {workspace?.documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => doc.status === "ready" && handleSelectDocument(doc.id)}
                title={doc.filename}
                disabled={doc.status !== "ready"}
                className={`w-full aspect-[3/4] rounded-md flex flex-col items-center justify-center text-[9px] font-bold transition-all shrink-0 ${
                  doc.id === currentDocumentId
                    ? "bg-indigo-500/20 ring-1 ring-indigo-500 text-indigo-300"
                    : doc.status === "ready"
                    ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                    : "bg-zinc-800/50 text-zinc-600 cursor-default"
                }`}
              >
                <svg className="w-4 h-4 mb-0.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {doc.filename.slice(0, 3).toUpperCase()}
              </button>
            ))}
          </div>

          <div className="w-6 border-t border-zinc-700" />

          {/* Upload button */}
          <label title="Upload PDF" className="w-8 h-8 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center cursor-pointer transition-colors text-zinc-400 hover:text-white shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <input type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
          </label>
        </aside>
      )}

    <PanelGroup className="flex-1">

      {/* ── Panel 1: Document list (unmounted when collapsed) ────────────────── */}
      {!docPanelCollapsed && (
        <>
          <Panel
            defaultSize={22}
            minSize={14}
            className="flex flex-col border-r border-zinc-800 overflow-hidden"
          >
            {/* Header */}
            <div className="px-3 py-3 border-b border-zinc-800 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <Link
                  href="/"
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Workspaces
                </Link>
                <button
                  onClick={() => setDocPanelCollapsed(true)}
                  className="p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  title="Collapse document list"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>
              </div>
              <h1 className="text-sm text-white font-semibold truncate">{workspace?.name}</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                {workspace?.documents.length ?? 0} doc{workspace?.documents.length !== 1 ? "s" : ""}
                {readyCount > 0 && readyCount < (workspace?.documents.length ?? 0) && (
                  <span className="text-amber-400"> · {workspace!.documents.length - readyCount} ingesting</span>
                )}
              </p>
            </div>

            {/* Upload zone */}
            <div className="pt-3 shrink-0">
              <UploadZone onUpload={handleUpload} uploading={uploading} />
            </div>

            {/* Error banner */}
            {error && (
              <div className="mx-3 mb-2 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center justify-between shrink-0">
                <span className="truncate">{error}</span>
                <button onClick={() => setError(null)} className="ml-1 shrink-0 text-red-400/60 hover:text-red-400">✕</button>
              </div>
            )}

            {/* Document list */}
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
              {workspace?.documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-3 text-center">
                  <p className="text-zinc-600 text-xs">No documents yet.</p>
                  <p className="text-zinc-700 text-xs mt-0.5">Upload a PDF above.</p>
                </div>
              ) : (
                workspace?.documents.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    isSelected={doc.id === currentDocumentId}
                    onSelect={handleSelectDocument}
                    onDelete={handleDeleteDoc}
                    onRetry={handleRetryDoc}
                  />
                ))
              )}
            </div>
          </Panel>

          {/* Handle between Panel 1 and whatever comes next */}
          <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-indigo-500/50 data-[resize-handle-state=drag]:bg-indigo-500 cursor-col-resize transition-colors" />
        </>
      )}

      {/* ── Panel 2: PDF viewer — only when a document is open ────────────── */}
      {currentDocumentId && (
        <>
          <Panel defaultSize={43} minSize={20} className="overflow-hidden">
            <PDFViewer
              documentId={currentDocumentId}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              highlightedText={highlightedContext}
              onHighlightChange={setHighlightedContext}
              pageCount={workspace?.documents.find(d => d.id === currentDocumentId)?.page_count ?? null}
            />
          </Panel>
          <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-indigo-500/50 data-[resize-handle-state=drag]:bg-indigo-500 cursor-col-resize transition-colors" />
        </>
      )}

      {/* ── Panel 3: History or Chat ───────────────────────────────────── */}
      <Panel defaultSize={35} minSize={20} className="flex flex-col overflow-hidden">
        {chatPanelView === "history" ? (
          <ChatHistoryView
            chats={chats}
            loadingChats={loadingChats}
            workspaceName={workspace?.name ?? ""}
            workspaceEmoji={workspace?.emoji ?? "📁"}
            onSelectChat={(chatId) => { setActiveChatId(chatId); setChatPanelView("active"); }}
            onNewChat={() => { setActiveChatId(null); setChatPanelView("active"); }}
            onDeleteChat={(chatId) => setPendingDeleteChat(chatId)}
          />
        ) : (
          <ChatPanel
            workspaceId={id}
            chats={chats}
            setChats={setChats}
            activeChatId={activeChatId}
            setActiveChatId={setActiveChatId}
            onShowHistory={() => setChatPanelView("history")}
            indexingDocs={indexingDocs}
            onCitationClick={handleCitationClick}
            highlightedContext={highlightedContext}
            onClearHighlight={() => setHighlightedContext(null)}
          />
        )}
      </Panel>

    </PanelGroup>

      {pendingDeleteDoc && (
        <ConfirmDialog
          title="Delete document?"
          body="This removes all its chunks from the search index and cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteDoc}
          onCancel={() => setPendingDeleteDoc(null)}
        />
      )}
      {pendingDeleteChat && (
        <ConfirmDialog
          title="Delete chat?"
          body="All messages in this chat will be permanently deleted."
          confirmLabel="Delete"
          danger
          onConfirm={() => { handleDeleteChat(pendingDeleteChat); setPendingDeleteChat(null); }}
          onCancel={() => setPendingDeleteChat(null)}
        />
      )}
    </div>
  );
}
