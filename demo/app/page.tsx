"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useVoyagerStore } from "@/lib/store";
import { WorkspaceCard } from "@/components/dashboard/WorkspaceCard";
import { CreateWorkspaceModal } from "@/components/dashboard/CreateWorkspaceModal";

export default function DashboardPage() {
  const workspaces = useVoyagerStore((s) => s.workspaces);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Top bar */}
      <header className="border-b border-border px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-accent">V</span>
            <span className="text-text-primary">oyager</span>
          </span>
        </div>
        <div className="w-8 h-8 rounded-full bg-accent-dim flex items-center justify-center text-xs font-semibold text-accent-glow">
          RK
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Your Workspaces</h1>
          <p className="text-text-secondary">Select a workspace or create a new one</p>
        </div>

        {workspaces.length === 0 ? (
          <div className="text-center py-24">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-bg-card border border-border mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <p className="text-text-secondary mb-6">No workspaces yet</p>
            <button
              onClick={() => setCreateOpen(true)}
              className="px-6 py-3 rounded-lg bg-accent text-white font-medium hover:bg-accent-glow transition-colors text-sm"
            >
              Create your first workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((ws, i) => (
              <motion.div
                key={ws.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.3 }}
              >
                <WorkspaceCard workspace={ws} />
              </motion.div>
            ))}

            {/* Create new card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: workspaces.length * 0.07, duration: 0.3 }}
            >
              <button
                onClick={() => setCreateOpen(true)}
                className="
                  w-full min-h-[160px] rounded-xl border border-dashed border-border
                  flex flex-col items-center justify-center gap-2
                  text-text-muted hover:text-text-secondary hover:border-border-strong
                  transition-colors duration-200 cursor-pointer bg-transparent
                "
              >
                <Plus className="w-5 h-5" />
                <span className="text-sm">Create workspace</span>
              </button>
            </motion.div>
          </div>
        )}
      </main>

      <CreateWorkspaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
