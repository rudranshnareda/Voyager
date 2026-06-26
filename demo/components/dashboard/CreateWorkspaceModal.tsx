"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useVoyagerStore } from "@/lib/store";

interface CreateWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateWorkspaceModal({ open, onClose }: CreateWorkspaceModalProps) {
  const [name, setName] = useState("");
  const createWorkspace = useVoyagerStore((s) => s.createWorkspace);
  const router = useRouter();

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const ws = createWorkspace(trimmed);
    onClose();
    setName("");
    router.push(`/workspace/${ws.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-bg-card border-border text-text-primary max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-text-primary font-semibold">New Workspace</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <input
            autoFocus
            type="text"
            placeholder="Workspace name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="
              w-full px-3 py-2 rounded-lg bg-bg-base border border-border
              text-text-primary placeholder:text-text-muted text-sm
              focus:outline-none focus:ring-1 focus:ring-accent
            "
          />
        </div>

        <DialogFooter className="gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="
              px-4 py-2 rounded-lg text-sm font-medium
              bg-accent text-white hover:bg-accent-glow
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors
            "
          >
            Create
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
