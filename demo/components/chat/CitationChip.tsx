"use client";

import { useVoyagerStore } from "@/lib/store";
import type { Citation } from "@/lib/types";

interface CitationChipProps {
  citation: Citation;
}

export function CitationChip({ citation }: CitationChipProps) {
  const jumpToPage = useVoyagerStore((s) => s.jumpToPage);

  return (
    <button
      onClick={() => jumpToPage(citation.documentId, citation.pageNumber)}
      title={citation.excerpt}
      className="
        inline-flex items-center gap-1.5 font-mono text-xs
        bg-accent-dim border-l-2 border-accent
        rounded-full px-3 py-1
        text-text-secondary hover:text-text-primary
        hover:brightness-125 cursor-pointer
        transition-all duration-150
      "
    >
      <span className="text-accent opacity-70">⬝</span>
      <span>{citation.filename}</span>
      <span className="text-text-muted">·</span>
      <span className="text-text-muted">pg. {citation.pageNumber}</span>
    </button>
  );
}
