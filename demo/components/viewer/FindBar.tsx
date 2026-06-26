"use client";

import { X, ChevronUp, ChevronDown } from "lucide-react";
import { useVoyagerStore } from "@/lib/store";

interface FindBarProps {
  docId: string;
}

export function FindBar({ docId }: FindBarProps) {
  const { viewerState, setFindQuery, setShowFind } = useVoyagerStore();
  const query = viewerState[docId]?.findQuery ?? "";

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border-b border-border flex-shrink-0">
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setFindQuery(docId, e.target.value)}
        placeholder="Find in document…"
        className="flex-1 text-xs bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none"
      />
      <div className="flex items-center gap-1 text-text-muted">
        <button className="p-1 rounded hover:bg-bg-hover hover:text-text-primary transition-colors">
          <ChevronUp className="w-3 h-3" />
        </button>
        <button className="p-1 rounded hover:bg-bg-hover hover:text-text-primary transition-colors">
          <ChevronDown className="w-3 h-3" />
        </button>
        <button
          onClick={() => { setFindQuery(docId, ""); setShowFind(docId, false); }}
          className="p-1 rounded hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
