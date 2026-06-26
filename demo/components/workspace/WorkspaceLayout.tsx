"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LayoutTemplate, Columns, Grid2x2, ChevronLeft, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useVoyagerStore } from "@/lib/store";
import { DocumentSidebar } from "./DocumentSidebar";
import { TabBar } from "./TabBar";
import { ViewerArea } from "./ViewerArea";
import { ChatSidebar } from "./ChatSidebar";
import type { LayoutMode } from "@/lib/types";

interface WorkspaceLayoutProps {
  workspaceId: string;
}

const LAYOUT_OPTIONS: { mode: LayoutMode; icon: React.ReactNode; label: string }[] = [
  { mode: "single", icon: <LayoutDashboard className="w-4 h-4" />, label: "Single" },
  { mode: "split-v", icon: <Columns className="w-4 h-4" />, label: "Split vertical" },
  { mode: "split-h", icon: <LayoutTemplate className="w-4 h-4" />, label: "Split horizontal" },
  { mode: "grid", icon: <Grid2x2 className="w-4 h-4" />, label: "2×2 Grid" },
];

export function WorkspaceLayout({ workspaceId }: WorkspaceLayoutProps) {
  const router = useRouter();
  const { workspaces, setActiveWorkspace, layoutMode, setLayout } = useVoyagerStore();
  const workspace = workspaces.find((w) => w.id === workspaceId);

  const [workspaceName, setWorkspaceName] = useState(workspace?.name ?? "");
  const [editingName, setEditingName] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    setChatOpen(window.innerWidth >= 1024);
  }, []);

  useEffect(() => {
    if (workspaceId) setActiveWorkspace(workspaceId);
  }, [workspaceId, setActiveWorkspace]);

  if (!workspace) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-base text-text-secondary">
        Workspace not found.
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg-base overflow-hidden">
      {/* Top bar */}
      <header className="h-12 flex-shrink-0 border-b border-border flex items-center justify-between px-3 bg-bg-panel z-10">
        {/* Left */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-text-muted hover:text-text-secondary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-bold">
              <span className="text-accent">V</span>
            </span>
          </button>

          <div className="w-px h-4 bg-border" />

          {editingName ? (
            <input
              autoFocus
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") setEditingName(false);
              }}
              className="text-sm font-semibold text-text-primary bg-bg-card border border-accent rounded px-2 py-0.5 focus:outline-none w-48"
            />
          ) : (
            <span
              className="text-sm font-semibold text-text-primary cursor-pointer hover:text-text-primary/80"
              onDoubleClick={() => setEditingName(true)}
            >
              {workspaceName}
            </span>
          )}
        </div>

        {/* Right — layout toggles + avatar */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-bg-card border border-border rounded-lg p-0.5">
            {LAYOUT_OPTIONS.map(({ mode, icon, label }) => (
              <button
                key={mode}
                title={label}
                onClick={() => setLayout(mode)}
                className={`p-1.5 rounded-md transition-colors ${
                  layoutMode === mode
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
          <button
            title={chatOpen ? "Hide chat" : "Show chat"}
            onClick={() => setChatOpen((o) => !o)}
            className={`p-1.5 rounded-lg transition-colors border ${
              chatOpen
                ? "bg-accent/20 border-accent text-accent"
                : "border-border text-text-muted hover:text-text-secondary hover:bg-bg-hover"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <div className="w-7 h-7 rounded-full bg-accent-dim flex items-center justify-center text-xs font-semibold text-accent-glow">
            RK
          </div>
        </div>
      </header>

      {/* Body: sidebar + center + chat */}
      <div className="flex flex-1 overflow-hidden">
        <DocumentSidebar workspaceId={workspaceId} />

        {/* Center column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TabBar workspaceId={workspaceId} />
          <ViewerArea workspaceId={workspaceId} />
        </div>

        <AnimatePresence initial={false}>
          {chatOpen && (
            <motion.div
              key="chat"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden flex-shrink-0"
            >
              <ChatSidebar workspaceId={workspaceId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
