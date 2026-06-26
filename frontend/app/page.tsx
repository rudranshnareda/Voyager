"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspaces,
  type Workspace,
} from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";

// Build a detailed, human-readable error string from any thrown value.
function describeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const url = `${err.config?.baseURL ?? ""}${err.config?.url ?? ""}`;
    if (err.response) {
      const body =
        typeof err.response.data === "string"
          ? err.response.data
          : JSON.stringify(err.response.data);
      return `HTTP ${err.response.status} from ${url} — ${body}`;
    }
    if (err.request) {
      return `No response from ${url} (network/CORS blocked). ${err.message}`;
    }
    return `Request setup failed: ${err.message}`;
  }
  return String(err);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-pulse"
        >
          <div className="h-4 bg-zinc-800 rounded w-2/3 mb-3" />
          <div className="h-3 bg-zinc-800 rounded w-1/3" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
          />
        </svg>
      </div>
      <h2 className="text-white font-medium mb-1">No workspaces yet</h2>
      <p className="text-zinc-500 text-sm mb-6">
        Create a workspace to start uploading documents.
      </p>
      <button
        onClick={onNew}
        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Create first workspace
      </button>
    </div>
  );
}

interface WorkspaceCardProps {
  workspace: Workspace;
  onDelete: (id: string, name: string) => void;
}

function WorkspaceCard({ workspace, onDelete }: WorkspaceCardProps) {
  const router = useRouter();

  return (
    <div
      className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 cursor-pointer transition-all hover:bg-zinc-900/80"
      onClick={() => router.push(`/workspace/${workspace.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl shrink-0">{workspace.emoji}</span>
          <h3 className="text-white font-medium leading-tight break-all">
            {workspace.name}
          </h3>
        </div>
        {/* Delete button — stops propagation so card click doesn't fire */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(workspace.id, workspace.name);
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
          aria-label="Delete workspace"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Created {formatDate(workspace.created_at)}
      </p>
      <div className="mt-4 flex items-center text-indigo-400 text-xs font-medium gap-1">
        <span>Open workspace</span>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

const EMOJI_OPTIONS = [
  "📚","📖","🎓","🔬","🧬","📊","💡","🌍",
  "📝","📋","🗂️","🧪","⚗️","🔭","🧮","💊",
  "⚖️","🎯","🧩","💻","🎵","🏛️","🌿","🔐",
];

interface NewWorkspaceModalProps {
  onClose: () => void;
  onCreate: (name: string, emoji: string) => Promise<void>;
  creating: boolean;
}

function NewWorkspaceModal({ onClose, onCreate, creating }: NewWorkspaceModalProps) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📚");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim(), emoji);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-white font-semibold text-lg mb-5">New Workspace</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Icon</label>
            <div className="grid grid-cols-8 gap-1">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`text-xl p-1.5 rounded-lg transition-colors ${
                    emoji === e
                      ? "bg-indigo-500/20 ring-1 ring-indigo-500"
                      : "hover:bg-zinc-800"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          {/* Name */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5" htmlFor="ws-name">
              Workspace name
            </label>
            <input
              ref={inputRef}
              id="ws-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research Papers"
              maxLength={100}
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none transition-colors"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || creating}
              className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  async function fetchWorkspaces() {
    setError(null);
    try {
      const data = await getWorkspaces();
      setWorkspaces(data);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(name: string, emoji: string) {
    setCreating(true);
    try {
      const ws = await createWorkspace(name, emoji);
      setWorkspaces((prev) => [ws, ...prev]);
      setShowModal(false);
    } catch {
      setError("Failed to create workspace.");
    } finally {
      setCreating(false);
    }
  }

  function handleDelete(id: string, name: string) {
    setPendingDelete({ id, name });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    try {
      await deleteWorkspace(id);
    } catch {
      setError("Failed to delete workspace.");
      fetchWorkspaces();
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Your Workspaces</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Each workspace holds its own documents and chats.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Workspace
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-red-400/60 hover:text-red-400">✕</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : workspaces.length === 0 ? (
        <EmptyState onNew={() => setShowModal(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <NewWorkspaceModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
          creating={creating}
        />
      )}

      {/* Delete confirmation */}
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.name}"?`}
          body="This permanently removes all documents and chats in this workspace."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
