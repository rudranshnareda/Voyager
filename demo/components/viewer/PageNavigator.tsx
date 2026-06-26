"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Minimize2, Sidebar } from "lucide-react";
import { useVoyagerStore } from "@/lib/store";

interface PageNavigatorProps {
  docId: string;
  numPages: number;
}

export function PageNavigator({ docId, numPages }: PageNavigatorProps) {
  const { viewerState, setCurrentPage, setZoom, setShowThumbnails } = useVoyagerStore();
  const state = viewerState[docId];
  const currentPage = state?.currentPage ?? 1;
  const zoom = state?.zoom ?? 1.0;
  const showThumbnails = state?.showThumbnails ?? true;

  const [inputVal, setInputVal] = useState(String(currentPage));

  useEffect(() => {
    setInputVal(String(currentPage));
  }, [currentPage]);

  const goTo = (page: number) => {
    const p = Math.max(1, Math.min(numPages, page));
    setCurrentPage(docId, p);
    setInputVal(String(p));
  };

  return (
    <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-bg-panel border-t border-border text-text-muted text-xs">
      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1 rounded hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1">
          <input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={() => goTo(Number(inputVal) || currentPage)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goTo(Number(inputVal) || currentPage);
            }}
            className="w-10 text-center text-xs bg-bg-card border border-border rounded px-1 py-0.5 text-text-primary focus:outline-none focus:border-accent"
          />
          <span>/ {numPages}</span>
        </div>

        <button
          onClick={() => goTo(currentPage + 1)}
          disabled={currentPage >= numPages}
          className="p-1 rounded hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setZoom(docId, zoom - 0.25)}
          className="p-1 rounded hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(docId, zoom + 0.25)}
          className="p-1 rounded hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(docId, 1.0)}
          className="p-1 rounded hover:bg-bg-hover hover:text-text-primary transition-colors ml-1"
          title="Fit page"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Thumbnail toggle */}
      <button
        onClick={() => setShowThumbnails(docId, !showThumbnails)}
        className={`p-1 rounded transition-colors ${showThumbnails ? "text-accent" : "hover:bg-bg-hover hover:text-text-primary"}`}
        title="Toggle thumbnails"
      >
        <Sidebar className="w-4 h-4" />
      </button>
    </div>
  );
}
