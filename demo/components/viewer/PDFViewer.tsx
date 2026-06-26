"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { useVoyagerStore } from "@/lib/store";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { CircleToAsk } from "./CircleToAsk";
import { PageNavigator } from "./PageNavigator";
import { ThumbnailStrip } from "./ThumbnailStrip";
import { FindBar } from "./FindBar";
import { ProcessingBanner } from "@/components/ui/ProcessingBanner";

// Set worker source once
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

interface PDFViewerProps {
  docId: string;
  filePath: string;
  workspaceId: string;
}

export function PDFViewer({ docId, filePath, workspaceId }: PDFViewerProps) {
  const store = useVoyagerStore();
  const viewerState = store.viewerState[docId];
  const currentPage = viewerState?.currentPage ?? 1;
  const zoom = viewerState?.zoom ?? 1.0;
  const showThumbnails = viewerState?.showThumbnails ?? true;
  const showFind = viewerState?.showFind ?? false;
  const pendingFlash = store.pendingFlash;

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderTasks = useRef<Map<number, ReturnType<PDFPageProxy["render"]>>>(new Map());
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flashPage, setFlashPage] = useState<number | null>(null);
  const [pageDims, setPageDims] = useState<Map<number, { w: number; h: number }>>(new Map());
  const [circleToAsk, setCircleToAsk] = useState<{ region: { x: number; y: number; w: number; h: number }; pageNum: number } | null>(null);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const loadingTask = pdfjsLib.getDocument({ url: filePath });
    loadingTask.promise.then((pdfDoc) => {
      if (cancelled) return;
      setPdf(pdfDoc);
      setNumPages(pdfDoc.numPages);
      setLoading(false);
      if (!store.viewerState[docId]) {
        store.setCurrentPage(docId, 1);
        store.setZoom(docId, 1.0);
      }
    }).catch((err) => {
      if (cancelled) return;
      console.error("PDF load error", err);
      setError("Failed to load PDF.");
      setLoading(false);
    });
    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, docId]);

  // Render a single page (canvas + text layer)
  const renderPage = useCallback(async (pageNum: number, targetZoom: number) => {
    if (!pdf) return;
    const canvas = canvasRefs.current.get(pageNum);
    if (!canvas) return;

    renderTasks.current.get(pageNum)?.cancel();

    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: targetZoom });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const task = page.render({ canvas, viewport });
      renderTasks.current.set(pageNum, task);
      await task.promise;

      // Track page dimensions for AnnotationCanvas sizing
      setPageDims((prev) => new Map(prev).set(pageNum, { w: viewport.width, h: viewport.height }));

      // Render text layer using pdfjs v6 TextLayer class
      const textContainer = textLayerRefs.current.get(pageNum);
      if (textContainer) {
        textContainer.innerHTML = "";
        const TextLayer = (pdfjsLib as unknown as { TextLayer: new (opts: object) => { render: () => Promise<void> } }).TextLayer;
        if (TextLayer) {
          const textLayer = new TextLayer({
            textContentSource: page.streamTextContent(),
            container: textContainer,
            viewport,
          });
          await textLayer.render();
        }
      }
    } catch {
      // cancelled — ignore
    }
  }, [pdf]);

  // Render visible pages when pdf/zoom/currentPage changes
  useEffect(() => {
    if (!pdf) return;
    const start = Math.max(1, currentPage - 1);
    const end = Math.min(numPages, currentPage + 2);
    for (let p = start; p <= end; p++) renderPage(p, zoom);
  }, [pdf, currentPage, zoom, numPages, renderPage]);

  // Scroll to current page when it changes
  useEffect(() => {
    const el = pageRefs.current.get(currentPage);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentPage]);

  // Handle citation flash
  useEffect(() => {
    if (pendingFlash && pendingFlash.docId === docId) {
      setFlashPage(pendingFlash.page);
      store.setCurrentPage(docId, pendingFlash.page);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        setFlashPage(null);
        store.clearFlash();
      }, 900);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFlash]);

  const workspace = store.workspaces.find((w) => w.id === workspaceId);
  const doc = workspace?.documents.find((d) => d.id === docId);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-base">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-base text-status-error text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-bg-base">
      <AnnotationToolbar docId={docId} />
      {doc && (doc.status === "processing" || doc.status === "partial") && (
        <ProcessingBanner doc={doc} />
      )}
      {showFind && <FindBar docId={docId} />}

      <div className="flex flex-1 overflow-hidden min-h-0">
        {showThumbnails && (
          <ThumbnailStrip
            pdf={pdf}
            numPages={numPages}
            currentPage={currentPage}
            onPageClick={(p) => store.setCurrentPage(docId, p)}
          />
        )}

        {/* Page scroll area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto flex flex-col items-center gap-4 py-4 px-2 bg-[#2a2a2a] min-h-0"
        >
          {Array.from({ length: numPages }).map((_, i) => {
            const pageNum = i + 1;
            const isNearby = Math.abs(pageNum - currentPage) <= 2;
            const dims = pageDims.get(pageNum);
            const activeTool = viewerState?.activeTool ?? "select";
            return (
              <div
                key={pageNum}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNum, el);
                  else pageRefs.current.delete(pageNum);
                }}
                className="relative shadow-2xl flex-shrink-0"
              >
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(pageNum, el);
                    else canvasRefs.current.delete(pageNum);
                  }}
                  className="block"
                  style={{ display: isNearby ? "block" : "none" }}
                />
                {!isNearby && (
                  <div
                    className="bg-white"
                    style={{
                      width: `${(dims?.w ?? 794 * zoom)}px`,
                      height: `${(dims?.h ?? 1123 * zoom)}px`,
                    }}
                  />
                )}

                {/* Text selection layer */}
                {isNearby && (
                  <div
                    ref={(el) => {
                      if (el) textLayerRefs.current.set(pageNum, el);
                      else textLayerRefs.current.delete(pageNum);
                    }}
                    className="textLayer"
                    style={{ pointerEvents: activeTool === "select" ? "auto" : "none" }}
                  />
                )}

                {/* Fabric.js annotation overlay */}
                {isNearby && dims && (
                  <AnnotationCanvas
                    docId={docId}
                    pageNum={pageNum}
                    width={dims.w}
                    height={dims.h}
                    onRegionDrawn={(region) => setCircleToAsk({ region, pageNum })}
                  />
                )}

                {/* Circle-to-Ask popup */}
                {circleToAsk?.pageNum === pageNum && containerRef.current && (
                  <CircleToAsk
                    region={{ ...circleToAsk.region, pageNum }}
                    containerRect={containerRef.current.getBoundingClientRect()}
                    onClose={() => setCircleToAsk(null)}
                  />
                )}

                {/* Gold flash overlay for citation jumps */}
                {flashPage === pageNum && (
                  <div
                    className="absolute inset-0 bg-yellow-400/20 pointer-events-none animate-pulse"
                    style={{ animationDuration: "0.9s", animationIterationCount: 1 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <PageNavigator docId={docId} numPages={numPages} />
    </div>
  );
}
