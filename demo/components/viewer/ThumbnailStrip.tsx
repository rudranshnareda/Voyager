"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { cn } from "@/lib/utils";

interface ThumbnailStripProps {
  pdf: PDFDocumentProxy | null;
  numPages: number;
  currentPage: number;
  onPageClick: (page: number) => void;
}

export function ThumbnailStrip({ pdf, numPages, currentPage, onPageClick }: ThumbnailStripProps) {
  return (
    <div className="w-[70px] flex-shrink-0 overflow-y-auto bg-bg-panel border-r border-border flex flex-col items-center gap-2 py-2">
      {Array.from({ length: numPages }).map((_, i) => (
        <ThumbnailPage
          key={i + 1}
          pdf={pdf}
          pageNum={i + 1}
          isActive={currentPage === i + 1}
          onClick={() => onPageClick(i + 1)}
        />
      ))}
    </div>
  );
}

function ThumbnailPage({
  pdf,
  pageNum,
  isActive,
  onClick,
}: {
  pdf: PDFDocumentProxy | null;
  pageNum: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLButtonElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!pdf || rendered) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          renderThumb();
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();

    async function renderThumb() {
      if (!pdf || !canvasRef.current) return;
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.15 });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvas: canvasRef.current!, viewport }).promise;
        setRendered(true);
      } catch { /* cancelled */ }
    }
  }, [pdf, pageNum, rendered]);

  return (
    <button
      ref={containerRef}
      onClick={onClick}
      className={cn(
        "relative flex-shrink-0 rounded overflow-hidden transition-all",
        isActive ? "ring-2 ring-accent" : "opacity-60 hover:opacity-100"
      )}
    >
      <canvas ref={canvasRef} className="block" style={{ maxWidth: "54px" }} />
      <span className="absolute bottom-0 left-0 right-0 text-center text-[8px] text-white bg-black/40 py-0.5">
        {pageNum}
      </span>
    </button>
  );
}
