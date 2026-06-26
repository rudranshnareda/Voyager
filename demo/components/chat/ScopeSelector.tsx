"use client";

import { Globe, FileText } from "lucide-react";
import { useVoyagerStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface ScopeSelectorProps {
  workspaceId: string;
}

export function ScopeSelector({ workspaceId }: ScopeSelectorProps) {
  const { chatScope, setChatScope, openTabs, workspaces } = useVoyagerStore();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const openDocs = workspace?.documents.filter((d) => openTabs.includes(d.id)) ?? [];

  return (
    <div className="relative group">
      <button className="w-full flex items-center gap-2 px-2 py-1.5 bg-bg-card border border-border rounded-lg text-xs text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors text-left">
        {chatScope === "workspace" ? (
          <>
            <Globe className="w-3.5 h-3.5 text-accent flex-shrink-0" />
            <span className="flex-1 truncate">Entire Workspace</span>
          </>
        ) : (
          <>
            <FileText className="w-3.5 h-3.5 text-accent flex-shrink-0" />
            <span className="flex-1 truncate">
              {workspace?.documents.find((d) => d.id === chatScope)?.name ?? "Document"}
            </span>
          </>
        )}
        <span className="text-text-muted">▾</span>
      </button>

      {/* Dropdown */}
      <div className="absolute left-0 right-0 top-full mt-1 z-50 hidden group-hover:block bg-bg-card border border-border rounded-lg shadow-xl py-1">
        <button
          onClick={() => setChatScope("workspace")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors",
            chatScope === "workspace"
              ? "text-text-primary bg-bg-hover"
              : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          )}
        >
          <Globe className="w-3.5 h-3.5 text-accent" />
          Entire Workspace
        </button>
        {openDocs.map((doc) => (
          <button
            key={doc.id}
            onClick={() => setChatScope(doc.id)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors",
              chatScope === doc.id
                ? "text-text-primary bg-bg-hover"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            )}
          >
            <FileText className="w-3.5 h-3.5 text-text-muted" />
            <span className="truncate">{doc.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
