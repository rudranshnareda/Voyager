"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { extractAndDescribeRegion, getDocumentPageUrl, getPageTextLayer } from "@/lib/api";
import InteractionCanvas from "@/components/InteractionCanvas";
import type { RegionData } from "@/components/InteractionCanvas";

export interface HighlightedText {
  text: string;
  page: number;
  method?: "ocr" | "vision" | "ocr_and_vision" | "text";
  image_data?: string | null;
}

interface PDFViewerProps {
  documentId: string | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  highlightedText?: HighlightedText | null;
  onHighlightChange?: (h: HighlightedText | null) => void;
  pageCount?: number | null;
}

// ── constants ─────────────────────────────────────────────────────────────────
const DPI_LO = 72;
const DPI_HI = 150;
const RENDER_BUFFER = 3;
const PRELOAD_AHEAD = 5;
const PAGE_GAP = 12;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

// ── helpers ───────────────────────────────────────────────────────────────────
function Spinner({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={`${className} text-zinc-600 animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function methodIcon(method?: string) {
  if (method === "vision" || method === "ocr_and_vision") return "👁";
  if (method === "ocr") return "📄";
  return "📌";
}

function swPrefetch(urls: string[]) {
  navigator.serviceWorker?.controller?.postMessage({ type: "PREFETCH", urls });
}

// ── PageImage ─────────────────────────────────────────────────────────────────
// Pure image component — progressive blur-up from 72 DPI to 150 DPI.
// All interaction (select, draw, find highlights) is handled by InteractionCanvas.
function PageImage({
  documentId,
  pageNum,
  onSizeKnown,
}: {
  documentId: string;
  pageNum: number;
  onSizeKnown: (w: number, h: number) => void;
}) {
  const [hiReady, setHiReady] = useState(false);
  const [loError, setLoError] = useState(false);
  const hiRef = useRef<HTMLImageElement>(null);

  const loUrl = getDocumentPageUrl(documentId, pageNum, DPI_LO);
  const hiUrl = getDocumentPageUrl(documentId, pageNum, DPI_HI);

  const onLoLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    onSizeKnown(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
    const img = new Image();
    img.onload = () => setHiReady(true);
    img.src = hiUrl;
  };

  if (loError) {
    return (
      <div
        className="w-full bg-zinc-800/60 rounded flex items-center justify-center text-zinc-600 text-xs"
        style={{ aspectRatio: "816/1056" }}
      >
        Page {pageNum} unavailable
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ aspectRatio: hiRef.current ? undefined : "816/1056" }}>
      <img
        src={loUrl}
        alt={`Page ${pageNum}`}
        onLoad={onLoLoad}
        onError={() => setLoError(true)}
        className="w-full h-auto rounded shadow-2xl block"
        style={{ opacity: hiReady ? 0 : 1, position: hiReady ? "absolute" : "static", inset: 0 }}
        draggable={false}
      />
      {hiReady && (
        <img
          ref={hiRef}
          src={hiUrl}
          alt=""
          aria-hidden
          className="w-full h-auto rounded shadow-2xl block"
          draggable={false}
        />
      )}
    </div>
  );
}

// ── PDFViewer ─────────────────────────────────────────────────────────────────
export default function PDFViewer({
  documentId, currentPage, onPageChange, highlightedText, onHighlightChange, pageCount,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState(pageCount ?? 0);
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [drawMode, setDrawMode] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [textLayerOn, setTextLayerOn] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findMatches, setFindMatches] = useState<{ page: number; wordIdx: number }[]>([]);
  const [findCursor, setFindCursor] = useState(0);

  // Word bbox data fetched from the server, keyed by page number
  const [textLayers, setTextLayers] = useState<Record<number, { text: string; x: number; y: number; w: number; h: number }[]>>({});
  const textLayerFetchedRef = useRef<Set<number>>(new Set());

  const pageSizesRef = useRef<Record<number, { w: number; h: number }>>({});
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: RENDER_BUFFER * 2 });
  const visibleRangeRef = useRef({ start: 0, end: RENDER_BUFFER * 2 });

  // Track scroll container width so zoom can size pages relative to it
  const [containerWidth, setContainerWidth] = useState(800);
  const containerWidthRef = useRef(800);

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const programScrollRef = useRef(false);
  const scrolledPageRef = useRef(1);
  const onHighlightChangeRef = useRef(onHighlightChange);
  const currentPageRef = useRef(currentPage);
  const numPagesRef = useRef(numPages);
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { onHighlightChangeRef.current = onHighlightChange; }, [onHighlightChange]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { numPagesRef.current = numPages; }, [numPages]);
  useEffect(() => { setPageInput(String(currentPage)); }, [currentPage]);
  useEffect(() => { setPreviewExpanded(false); }, [highlightedText]);
  useEffect(() => { if (pageCount && pageCount > 0) setNumPages(pageCount); }, [pageCount]);

  // Reset on document change
  useEffect(() => {
    setPageInput("1");
    setDrawMode(false);
    setIsExtracting(false);
    setPreviewExpanded(false);
    setTextLayers({});
    setFindQuery("");
    setFindOpen(false);
    setFindMatches([]);
    setFindCursor(0);
    textLayerFetchedRef.current = new Set();
    pageSizesRef.current = {};
    pageRefs.current = [];
    scrolledPageRef.current = 1;
    const init = { start: 0, end: RENDER_BUFFER * 2 };
    setVisibleRange(init);
    visibleRangeRef.current = init;
    onHighlightChangeRef.current?.(null);
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, [documentId]);

  // Fetch word bboxes for pages in the render window (needed by InteractionCanvas)
  useEffect(() => {
    if ((!textLayerOn && !findQuery) || !documentId) return;
    for (let i = visibleRange.start; i <= visibleRange.end; i++) {
      const pageNum = i + 1;
      if (textLayerFetchedRef.current.has(pageNum)) continue;
      textLayerFetchedRef.current.add(pageNum);
      getPageTextLayer(documentId, pageNum)
        .then(({ words }) => setTextLayers((prev) => ({ ...prev, [pageNum]: words })))
        .catch(() => {});
    }
  }, [visibleRange, textLayerOn, findQuery, documentId]);

  // Track scroll-container width so pages can be sized to baseWidth * zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const w = container.clientWidth;
      containerWidthRef.current = w;
      setContainerWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Prefetch ahead into service worker cache
  const prefetchAhead = useCallback((end: number) => {
    if (!documentId) return;
    const n = numPagesRef.current;
    const urls: string[] = [];
    for (let i = end + 1; i <= Math.min(n - 1, end + PRELOAD_AHEAD); i++) {
      urls.push(getDocumentPageUrl(documentId, i + 1, DPI_HI));
    }
    if (urls.length > 0) swPrefetch(urls);
  }, [documentId]);

  const computeVisibleRange = useCallback(() => {
    const container = containerRef.current;
    const n = numPagesRef.current;
    if (!container || n === 0) return null;
    const { scrollTop, clientHeight } = container;
    const visBottom = scrollTop + clientHeight;
    // Estimate each page's displayed height from its aspect ratio × zoomed width
    const baseW = Math.min(containerWidthRef.current, 896) * zoomRef.current - 16;
    let y = 0, firstVis = 0, lastVis = 0, foundFirst = false;
    for (let i = 0; i < n; i++) {
      const size = pageSizesRef.current[i + 1];
      const h = size && size.w > 0 ? Math.round(baseW * (size.h / size.w)) : 1056;
      if (!foundFirst && y + h > scrollTop) { firstVis = i; foundFirst = true; }
      if (foundFirst && y > visBottom) { lastVis = Math.max(firstVis, i - 1); break; }
      if (i === n - 1) lastVis = i;
      y += h + PAGE_GAP;
    }
    return {
      start: Math.max(0, firstVis - RENDER_BUFFER),
      end: Math.min(n - 1, lastVis + RENDER_BUFFER),
    };
  }, []);

  const applyRange = useCallback((range: { start: number; end: number } | null) => {
    if (!range) return;
    const prev = visibleRangeRef.current;
    if (range.start !== prev.start || range.end !== prev.end) {
      visibleRangeRef.current = range;
      setVisibleRange(range);
      prefetchAhead(range.end);
    }
  }, [prefetchAhead]);

  // ── Zoom ─────────────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const prevZoomRef = useRef(1);
  // Element-anchor approach: we pin a specific page element to stay at the same
  // viewport position before and after zoom, rather than computing a scrollHeight ratio
  // (which is unreliable when placeholder heights don't track zoom).
  const zoomAnchorElRef = useRef<HTMLDivElement | null>(null);
  const zoomAnchorElSavedOffsetRef = useRef(0); // element's top in viewport before zoom
  const zoomAnchorYRef = useRef(0);             // cursor Y in viewport (0 = top for button-zoom)
  const zoomAnchorXRef = useRef(0);             // cursor X in viewport (0 = left for button-zoom)
  const preZoomScrollLeftRef = useRef(0);       // scrollLeft snapshot for horizontal adjustment

  const applyZoom = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    if (clamped === zoomRef.current) return;

    const container = containerRef.current;
    if (container) {
      const anchorY = anchor?.y ?? 0;
      const anchorX = anchor?.x ?? 0;
      const containerRect = container.getBoundingClientRect();
      const targetScreenY = containerRect.top + anchorY;
      const { start, end } = visibleRangeRef.current;

      let foundEl: HTMLDivElement | null = null;
      for (let i = start; i <= end; i++) {
        const el = pageRefs.current[i] as HTMLDivElement | null;
        if (!el) continue;
        if (el.getBoundingClientRect().bottom >= targetScreenY) { foundEl = el; break; }
      }
      if (!foundEl && start < pageRefs.current.length) {
        foundEl = pageRefs.current[start] as HTMLDivElement | null;
      }

      if (foundEl) {
        zoomAnchorElRef.current = foundEl;
        zoomAnchorElSavedOffsetRef.current = foundEl.getBoundingClientRect().top - containerRect.top;
      }
      zoomAnchorYRef.current = anchorY;
      zoomAnchorXRef.current = anchorX;
      preZoomScrollLeftRef.current = container.scrollLeft;
    }

    zoomRef.current = clamped;
    setZoom(clamped);
  }, []);

  // After React commits new page widths, useLayoutEffect runs synchronously before paint.
  // Vertical: element-anchor — read the page element's new DOM position and adjust scrollTop
  //   so the anchor point (cursor or viewport top) stays fixed.
  // Horizontal: ratio-based — page widths scale uniformly so (scrollLeft + anchorX) * s - anchorX
  //   keeps the cursor column fixed. Without this, zooming always anchors to the left edge.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || prevZoomRef.current === zoom) { prevZoomRef.current = zoom; return; }
    const prevZoom = prevZoomRef.current;
    prevZoomRef.current = zoom;
    const s = zoom / prevZoom;

    // ── Vertical ─────────────────────────────────────────────────────────────
    const anchorEl = zoomAnchorElRef.current;
    zoomAnchorElRef.current = null;
    if (anchorEl) {
      const containerRect = container.getBoundingClientRect();
      const newOffset = anchorEl.getBoundingClientRect().top - containerRect.top;
      const savedOffset = zoomAnchorElSavedOffsetRef.current;
      const anchorY = zoomAnchorYRef.current;
      const targetOffset = anchorY - (anchorY - savedOffset) * s;
      const delta = newOffset - targetOffset;
      if (Math.abs(delta) >= 1) container.scrollTop += delta;
    }

    // ── Horizontal ───────────────────────────────────────────────────────────
    const anchorX = zoomAnchorXRef.current;
    const oldLeft = preZoomScrollLeftRef.current;
    const newLeft = (oldLeft + anchorX) * s - anchorX;
    if (Math.abs(newLeft - container.scrollLeft) >= 1) container.scrollLeft = newLeft;

    programScrollRef.current = true;
    setTimeout(() => { programScrollRef.current = false; }, 150);
  }, [zoom]);

  const zoomIn  = useCallback(() => applyZoom(Math.round((zoomRef.current + ZOOM_STEP) * 100) / 100), [applyZoom]);
  const zoomOut = useCallback(() => applyZoom(Math.round((zoomRef.current - ZOOM_STEP) * 100) / 100), [applyZoom]);

  // Scroll-based current-page detection — runs every RAF tick alongside virtual-window update.
  // getBoundingClientRect() accounts for CSS zoom, so this is always accurate.
  const computeCurrentPage = useCallback(() => {
    const container = containerRef.current;
    if (!container) return scrolledPageRef.current;
    const containerTop = container.getBoundingClientRect().top;
    const threshold = containerTop + 20; // 20 px into the viewport = "current"
    const { start, end } = visibleRangeRef.current;
    for (let i = start; i <= end; i++) {
      const el = pageRefs.current[i];
      if (!el) continue;
      if (el.getBoundingClientRect().bottom > threshold) return i + 1;
    }
    return scrolledPageRef.current;
  }, []);

  // RAF-throttled scroll → virtual window + page indicator
  // Also attaches ctrl+wheel here (not in a separate effect) so the container is guaranteed to exist.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || numPages === 0) return;

    const onScroll = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyRange(computeVisibleRange());
        if (!programScrollRef.current) {
          const page = computeCurrentPage();
          if (page !== scrolledPageRef.current) {
            scrolledPageRef.current = page;
            setPageInput(String(page));
            onPageChange(page);
          }
        }
      });
    };

    // Trackpad pinch fires as ctrl+wheel — intercept here so the container exists
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      applyZoom(zoomRef.current * Math.pow(1.001, -e.deltaY), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    applyRange(computeVisibleRange());
    container.addEventListener("scroll", onScroll, { passive: true });
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("scroll", onScroll);
      container.removeEventListener("wheel", onWheel);
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [numPages, computeVisibleRange, applyRange, computeCurrentPage, onPageChange, applyZoom]);

  // Programmatic scroll (citation clicks)
  useEffect(() => {
    if (numPages === 0 || currentPage === scrolledPageRef.current) return;
    programScrollRef.current = true;
    scrolledPageRef.current = currentPage;
    pageRefs.current[currentPage - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => { programScrollRef.current = false; }, 1200);
    return () => clearTimeout(t);
  }, [currentPage, numPages]);

  // Touch pinch — track two-pointer distance on the scroll container
  const pinchStartDistRef = useRef(0);
  const pinchStartZoomRef = useRef(1);
  const pointersRef = useRef<Map<number, React.PointerEvent>>(new Map());

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, e);
    if (pointersRef.current.size !== 2) return;
    const [a, b] = Array.from(pointersRef.current.values());
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pinchStartDistRef.current === 0) {
      pinchStartDistRef.current = dist;
      pinchStartZoomRef.current = zoomRef.current;
      return;
    }
    const midX = (a.clientX + b.clientX) / 2;
    const midY = (a.clientY + b.clientY) / 2;
    const rect = containerRef.current?.getBoundingClientRect();
    const anchor = rect ? { x: midX - rect.left, y: midY - rect.top } : undefined;
    applyZoom(pinchStartZoomRef.current * (dist / pinchStartDistRef.current), anchor);
  }, [applyZoom]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) pinchStartDistRef.current = 0;
  }, []);

  // ── Interaction callbacks ────────────────────────────────────────────────────

  const handleRegionDrawn = useCallback(async (data: RegionData) => {
    setDrawMode(false);
    setIsExtracting(true);
    try {
      const result = await extractAndDescribeRegion(data.documentId, data.pageNumber, {
        x: data.x, y: data.y, width: data.width, height: data.height,
      });
      const finalText = result.final_text || result.text || result.description;
      if (finalText || result.image_data) {
        onHighlightChangeRef.current?.({
          text: finalText || "(selected region)",
          page: data.pageNumber,
          method: result.method as HighlightedText["method"],
          image_data: result.image_data,
        });
      }
    } catch (err) {
      console.error("Region extraction failed:", err);
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handleTextSelected = useCallback((text: string, page: number) => {
    onHighlightChangeRef.current?.({ text, page, method: "text" });
  }, []);

  // ── Find / search ────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setFindOpen(true);
        if (!textLayerOn) setTextLayerOn(true);
        setTimeout(() => findInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") { setFindOpen(false); setFindQuery(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [textLayerOn]);

  useEffect(() => {
    if (!findQuery.trim()) { setFindMatches([]); setFindCursor(0); return; }
    const q = findQuery.toLowerCase();
    const hits: { page: number; wordIdx: number }[] = [];
    for (const page of Object.keys(textLayers).map(Number).sort((a, b) => a - b)) {
      textLayers[page].forEach((w, idx) => {
        if (w.text.toLowerCase().includes(q)) hits.push({ page, wordIdx: idx });
      });
    }
    setFindMatches(hits);
    setFindCursor(0);
    if (hits.length > 0) goTo(hits[0].page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findQuery, textLayers]);

  const findNext = () => {
    if (!findMatches.length) return;
    const next = (findCursor + 1) % findMatches.length;
    setFindCursor(next);
    goTo(findMatches[next].page);
  };

  const findPrev = () => {
    if (!findMatches.length) return;
    const prev = (findCursor - 1 + findMatches.length) % findMatches.length;
    setFindCursor(prev);
    goTo(findMatches[prev].page);
  };

  // ── Navigation ───────────────────────────────────────────────────────────────

  const onSizeKnown = useCallback((pageNum: number, w: number, h: number) => {
    if (!pageSizesRef.current[pageNum]) pageSizesRef.current[pageNum] = { w, h };
  }, []);

  const goTo = (page: number) => {
    const clamped = Math.max(1, Math.min(page, numPages || 1));
    onPageChange(clamped);
    setPageInput(String(clamped));
  };

  const commitPageInput = () => {
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed)) goTo(parsed);
    else setPageInput(String(currentPage));
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!documentId) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 text-center px-6 gap-3">
        <svg className="w-10 h-10 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm text-zinc-500">Select a document to view it here.</p>
      </div>
    );
  }

  if (numPages === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900 gap-3">
        <Spinner className="w-6 h-6" />
        <p className="text-xs text-zinc-500">Loading document…</p>
      </div>
    );
  }

  const interactionMode = drawMode ? "draw" : textLayerOn ? "select" : "none";

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800 shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}
            className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">← Prev</button>
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <span>p.</span>
            <input type="text" value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={commitPageInput}
              onKeyDown={(e) => e.key === "Enter" && commitPageInput()}
              className="w-9 text-center bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-white outline-none focus:border-indigo-500 transition-colors text-xs" />
            <span>/ {numPages}</span>
          </div>
          <button onClick={() => goTo(currentPage + 1)} disabled={currentPage >= numPages}
            className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next →</button>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded px-1">
            <button onClick={zoomOut} disabled={zoom <= ZOOM_MIN}
              className="px-1.5 py-0.5 text-sm text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">−</button>
            <button onClick={() => applyZoom(1)}
              className="w-11 text-center text-xs text-zinc-400 hover:text-white transition-colors">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={zoomIn} disabled={zoom >= ZOOM_MAX}
              className="px-1.5 py-0.5 text-sm text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">+</button>
          </div>
          <button
            onClick={() => { setTextLayerOn((v) => !v); setDrawMode(false); }}
            title="Drag to select text and use as chat context"
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${textLayerOn ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
            📌 Select
          </button>
          <button
            onClick={() => { setDrawMode((v) => !v); setTextLayerOn(false); }}
            disabled={isExtracting}
            title="Draw a rectangle to extract or describe a region"
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${drawMode ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"} disabled:opacity-50 disabled:cursor-not-allowed`}>
            {isExtracting ? "⏳…" : "✏ Draw"}
          </button>
          <button
            onClick={() => {
              setFindOpen((v) => !v);
              if (!textLayerOn) setTextLayerOn(true);
              setTimeout(() => findInputRef.current?.focus(), 50);
            }}
            title="Find in document (Ctrl+F)"
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${findOpen ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
            🔍 Find
          </button>
        </div>
      </div>

      {/* ── Find bar ────────────────────────────────────────────────────────── */}
      {findOpen && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/60 border-b border-zinc-700 shrink-0">
          <input
            ref={findInputRef}
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.shiftKey ? findPrev() : findNext(); }
              if (e.key === "Escape") { setFindOpen(false); setFindQuery(""); }
            }}
            placeholder="Find in document…"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500 transition-colors"
          />
          <span className="text-xs text-zinc-500 shrink-0 w-16 text-right">
            {findMatches.length > 0 ? `${findCursor + 1} / ${findMatches.length}` : findQuery ? "no match" : ""}
          </span>
          <button onClick={findPrev} disabled={findMatches.length === 0}
            className="px-1.5 py-0.5 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 transition-colors">↑</button>
          <button onClick={findNext} disabled={findMatches.length === 0}
            className="px-1.5 py-0.5 rounded text-xs text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 transition-colors">↓</button>
          <button onClick={() => { setFindOpen(false); setFindQuery(""); }}
            className="px-1.5 py-0.5 rounded text-xs text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors">✕</button>
        </div>
      )}

      {/* ── Highlight badge ──────────────────────────────────────────────────── */}
      {highlightedText && (
        <div className="px-3 py-1.5 bg-indigo-500/10 border-b border-indigo-500/20 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-indigo-400 shrink-0 font-medium">
              {methodIcon(highlightedText.method)} p.{highlightedText.page}:
            </span>
            {highlightedText.image_data ? (
              <button onClick={() => setPreviewExpanded((e) => !e)}
                className="text-xs text-indigo-300/60 hover:text-indigo-300 transition-colors flex-1 text-left">
                {previewExpanded ? "▲ collapse" : "▼ expand"}
              </button>
            ) : (
              <span className="text-xs text-indigo-200/70 flex-1 truncate">
                {highlightedText.text.length > 80 ? highlightedText.text.slice(0, 80) + "…" : highlightedText.text}
              </span>
            )}
            <button onClick={() => onHighlightChange?.(null)}
              className="text-xs text-indigo-400/50 hover:text-indigo-300 transition-colors shrink-0">Clear</button>
          </div>
          {highlightedText.image_data && previewExpanded && (
            <div className="mt-1.5">
              <img src={`data:image/png;base64,${highlightedText.image_data}`} alt="Selected region"
                onClick={() => setPreviewExpanded((e) => !e)}
                className="rounded border border-indigo-500/30 object-contain cursor-pointer max-h-48" />
            </div>
          )}
        </div>
      )}

      {/* ── Pages ───────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        style={{ overscrollBehavior: "contain", overflowAnchor: "none" }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {isExtracting && (
          <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 shadow-xl">
              <Spinner className="w-4 h-4" />
              <span className="text-xs text-zinc-300">Extracting region…</span>
            </div>
          </div>
        )}

        <div className="flex flex-col py-4 gap-3" style={{ alignItems: "flex-start", minWidth: "100%" }}>
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
              const idx = pageNum - 1;
              const inWindow = idx >= visibleRange.start && idx <= visibleRange.end;
              const size = pageSizesRef.current[pageNum];
              const pageContentW = Math.round(Math.min(containerWidth, 896) * zoom) - 16;
              const placeholderH = size && size.w > 0
                ? Math.round(pageContentW * (size.h / size.w))
                : Math.round(pageContentW * 1.414);
              const pageMatchIndices = new Set(
                findMatches.filter((m) => m.page === pageNum).map((m) => m.wordIdx)
              );

              return (
                <div
                  key={pageNum}
                  ref={(el) => { pageRefs.current[idx] = el; }}
                  data-page={pageNum}
                  style={{ width: Math.round(Math.min(containerWidth, 896) * zoom), flexShrink: 0, padding: "0 8px", marginLeft: "auto", marginRight: "auto" }}
                >
                  {inWindow ? (
                    // Wrap image + canvas in a shared relative container
                    <div className="relative w-full">
                      <PageImage
                        documentId={documentId}
                        pageNum={pageNum}
                        onSizeKnown={(w, h) => onSizeKnown(pageNum, w, h)}
                      />
                      <InteractionCanvas
                        pageNum={pageNum}
                        documentId={documentId}
                        words={textLayers[pageNum] ?? null}
                        mode={interactionMode}
                        findMatchIndices={pageMatchIndices}
                        onTextSelected={handleTextSelected}
                        onRegionDrawn={handleRegionDrawn}
                      />
                    </div>
                  ) : (
                    <div style={{ height: placeholderH }} className="w-full bg-zinc-800/40 rounded" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
  );
}
