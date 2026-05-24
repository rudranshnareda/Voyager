"use client";

import { useEffect, useRef } from "react";

export interface WordBlock {
  text: string;
  x: number; // normalized 0–1 relative to page dimensions
  y: number;
  w: number;
  h: number;
}

export interface RegionData {
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
  documentId: string;
}

interface Props {
  pageNum: number;
  documentId: string;
  words: WordBlock[] | null;
  mode: "none" | "select" | "draw";
  findMatchIndices: Set<number>;
  onTextSelected: (text: string, page: number) => void;
  onRegionDrawn: (data: RegionData) => void;
}

/**
 * Unified canvas overlay that handles all page interactions:
 *   "select" — drag to highlight word bboxes, capture text → context
 *   "draw"   — drag to draw extraction rectangle → send to region API
 *   find     — render amber highlights for matched word indices
 *
 * Uses pointer events + setPointerCapture on the canvas itself so the
 * scroll container never needs to capture, eliminating the "blue mess"
 * caused by the old setPointerCapture + transparent-span approach.
 */
export default function InteractionCanvas({
  pageNum,
  documentId,
  words,
  mode,
  findMatchIndices,
  onTextSelected,
  onRegionDrawn,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const drag = useRef({ active: false, sx: 0, sy: 0, cx: 0, cy: 0 });

  // All props mirrored to refs so the stable event handlers always see current values
  const modeRef = useRef(mode);
  const wordsRef = useRef(words);
  const matchRef = useRef(findMatchIndices);
  const pageRef = useRef(pageNum);
  const docRef = useRef(documentId);
  const onTextRef = useRef(onTextSelected);
  const onDrawRef = useRef(onRegionDrawn);

  // Sync refs synchronously during render (safe because refs don't trigger re-renders)
  modeRef.current = mode;
  wordsRef.current = words;
  matchRef.current = findMatchIndices;
  pageRef.current = pageNum;
  docRef.current = documentId;
  onTextRef.current = onTextSelected;
  onDrawRef.current = onRegionDrawn;

  // ── Drawing helpers ─────────────────────────────────────────────────────────

  const schedule = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      paint();
    });
  };

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const ws = wordsRef.current;
    const matches = matchRef.current;
    const d = drag.current;
    const m = modeRef.current;

    // Amber highlights for Find results
    if (matches.size > 0 && ws) {
      ctx.fillStyle = "rgba(251, 191, 36, 0.45)";
      matches.forEach((i) => {
        const w = ws[i];
        if (w) ctx.fillRect(w.x * W, w.y * H, w.w * W, w.h * H);
      });
    }

    if (!d.active) return;

    const x = Math.min(d.sx, d.cx);
    const y = Math.min(d.sy, d.cy);
    const rw = Math.abs(d.cx - d.sx);
    const rh = Math.abs(d.cy - d.sy);

    if (m === "select") {
      // Highlight each word whose bbox overlaps the drag rect
      if (ws) {
        ctx.fillStyle = "rgba(99, 102, 241, 0.28)";
        ws.forEach((word) => {
          if (overlaps(word, x, y, x + rw, y + rh, W, H)) {
            ctx.fillRect(word.x * W, word.y * H, word.w * W, word.h * H);
          }
        });
      }
      ctx.fillStyle = "rgba(99, 102, 241, 0.07)";
      ctx.fillRect(x, y, rw, rh);
      ctx.strokeStyle = "rgba(99, 102, 241, 0.75)";
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, rw, rh);
    } else if (m === "draw") {
      ctx.fillStyle = "rgba(99, 102, 241, 0.07)";
      ctx.fillRect(x, y, rw, rh);
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, rw, rh);
      ctx.setLineDash([]);
    }
  };

  const overlaps = (
    word: WordBlock,
    x1: number, y1: number, x2: number, y2: number,
    W: number, H: number,
  ): boolean => {
    const l = word.x * W, t = word.y * H;
    const r = l + word.w * W, b = t + word.h * H;
    return !(r < x1 || l > x2 || b < y1 || t > y2);
  };

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Repaint after every render (mode / findMatchIndices / words change → schedule a frame)
  useEffect(() => { schedule(); });

  // Keep canvas pixel size in sync with its CSS size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        paint();
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Pointer event handlers — imperative and mounted once; refs supply current values
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      // Scale from CSS pixels to canvas pixels
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height),
      };
    };

    const onDown = (e: PointerEvent) => {
      if (modeRef.current === "none") return;
      e.stopPropagation();
      e.preventDefault();
      // Capture this pointer to the canvas so dragging outside the page still works
      canvas.setPointerCapture(e.pointerId);
      const { x, y } = pos(e);
      drag.current = { active: true, sx: x, sy: y, cx: x, cy: y };
      schedule();
    };

    const onMove = (e: PointerEvent) => {
      if (!drag.current.active) return;
      const { x, y } = pos(e);
      drag.current.cx = x;
      drag.current.cy = y;
      schedule();
    };

    const onUp = (e: PointerEvent) => {
      if (!drag.current.active) return;
      drag.current.active = false;

      const { x, y } = pos(e);
      const { sx, sy } = drag.current;
      const W = canvas.width;
      const H = canvas.height;
      const rx = Math.min(sx, x), ry = Math.min(sy, y);
      const rw = Math.abs(x - sx), rh = Math.abs(y - sy);
      const m = modeRef.current;
      const ws = wordsRef.current;

      if (m === "select" && rw > 5 && rh > 5 && ws) {
        const selected = ws.filter((w) => overlaps(w, rx, ry, rx + rw, ry + rh, W, H));
        if (selected.length > 0) {
          onTextRef.current(
            selected.map((w) => w.text).join(" "),
            pageRef.current,
          );
        }
      } else if (m === "draw" && rw > 10 && rh > 10) {
        onDrawRef.current({
          x: rx / W,
          y: ry / H,
          width: rw / W,
          height: rh / H,
          pageNumber: pageRef.current,
          documentId: docRef.current,
        });
      }

      schedule();
    };

    const onCancel = () => {
      drag.current.active = false;
      schedule();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full z-20"
      style={{
        cursor: mode === "draw" ? "crosshair" : mode === "select" ? "default" : "default",
        // Only intercept pointer events when actually interactive — lets pinch zoom
        // work normally when mode is "none" (no overlay active)
        pointerEvents: mode !== "none" ? "auto" : "none",
        touchAction: "none",
      }}
    />
  );
}
