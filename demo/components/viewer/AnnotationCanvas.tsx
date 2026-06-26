"use client";

import { useEffect, useRef } from "react";
import { useVoyagerStore } from "@/lib/store";
import type { AnnotationTool } from "@/lib/types";

interface AnnotationCanvasProps {
  docId: string;
  pageNum: number;
  width: number;
  height: number;
  onRegionDrawn?: (region: { x: number; y: number; w: number; h: number }) => void;
}

const DRAW_TOOLS: AnnotationTool[] = ["pen", "rect", "circle", "highlight", "select", "eraser", "arrow", "circle-to-ask"];

export function AnnotationCanvas({ docId, pageNum, width, height, onRegionDrawn }: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);
  const store = useVoyagerStore();
  const activeTool = store.viewerState[docId]?.activeTool ?? "select";

  // Initialize Fabric.js canvas on mount / dimension change
  useEffect(() => {
    if (!containerRef.current || width === 0 || height === 0) return;
    let disposed = false;

    const container = containerRef.current;
    const canvasEl = document.createElement("canvas");
    container.appendChild(canvasEl);

    import("fabric").then(({ Canvas }) => {
      if (disposed || !canvasEl.parentNode) return;

      const fc = new Canvas(canvasEl, {
        width,
        height,
        selection: true,
        backgroundColor: "rgba(0,0,0,0)",
        preserveObjectStacking: true,
      });
      fabricRef.current = fc;

      // Restore saved annotations
      const saved = store.annotations[docId]?.[pageNum];
      if (saved) {
        fc.loadFromJSON(JSON.parse(saved)).then(() => fc.renderAll());
      }

      const save = () => store.saveAnnotations(docId, pageNum, JSON.stringify(fc.toJSON()));
      fc.on("object:added", save);
      fc.on("object:modified", save);
      fc.on("object:removed", save);
    });

    return () => {
      disposed = true;
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
      // Remove canvas el if still in container
      if (canvasEl.parentNode === container) container.removeChild(canvasEl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, docId, pageNum]);

  // Handle tool switching
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;

    fc.isDrawingMode = false;
    fc.selection = activeTool === "select";
    fc.getObjects().forEach((o) => (o.selectable = activeTool === "select"));

    import("fabric").then(({ PencilBrush }) => {
      const fc = fabricRef.current;
      if (!fc) return;

      if (activeTool === "pen") {
        fc.isDrawingMode = true;
        const brush = new PencilBrush(fc);
        brush.color = "#6366F1";
        brush.width = 2;
        brush.decimate = 4;
        fc.freeDrawingBrush = brush;
      } else if (activeTool === "eraser") {
        // Delete selected objects — user selects then presses Delete key
        fc.selection = true;
        fc.getObjects().forEach((o) => (o.selectable = true));
      }
      fc.renderAll();
    });
  }, [activeTool]);

  // Manual shape drawing (rect, circle, highlight, circle-to-ask)
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc || !["rect", "circle", "highlight", "circle-to-ask"].includes(activeTool)) return;

    let isDown = false;
    let startX = 0, startY = 0;
    let shape: import("fabric").FabricObject | null = null;

    const onDown = (e: { pointer?: { x: number; y: number } }) => {
      if (!e.pointer) return;
      isDown = true;
      ({ x: startX, y: startY } = e.pointer);

      import("fabric").then(({ Rect, Circle }) => {
        const fc = fabricRef.current;
        if (!fc) return;

        if (activeTool === "rect") {
          shape = new Rect({
            left: startX, top: startY, width: 1, height: 1,
            fill: "transparent", stroke: "#6366F1", strokeWidth: 2,
            selectable: false,
          });
        } else if (activeTool === "highlight") {
          shape = new Rect({
            left: startX, top: startY, width: 1, height: 1,
            fill: "rgba(255, 218, 0, 0.35)", stroke: "transparent",
            strokeWidth: 0, selectable: false,
          });
        } else if (activeTool === "circle") {
          shape = new Circle({
            left: startX, top: startY, radius: 1,
            fill: "transparent", stroke: "#6366F1", strokeWidth: 2,
            selectable: false,
          });
        } else if (activeTool === "circle-to-ask") {
          shape = new Rect({
            left: startX, top: startY, width: 1, height: 1,
            fill: "rgba(99, 102, 241, 0.08)", stroke: "#6366F1", strokeWidth: 2,
            strokeDashArray: [6, 4], selectable: false,
          });
        }
        if (shape) fc.add(shape);
      });
    };

    const onMove = (e: { pointer?: { x: number; y: number } }) => {
      if (!isDown || !shape || !e.pointer) return;
      const dx = e.pointer.x - startX;
      const dy = e.pointer.y - startY;

      import("fabric").then(({ Rect, Circle }) => {
        if (!shape || !fabricRef.current) return;
        if (shape instanceof Rect) {
          shape.set({
            width: Math.max(1, Math.abs(dx)),
            height: Math.max(1, Math.abs(dy)),
            left: Math.min(e.pointer!.x, startX),
            top: Math.min(e.pointer!.y, startY),
          });
        } else if (shape instanceof Circle) {
          const r = Math.max(1, Math.hypot(dx, dy) / 2);
          shape.set({ radius: r });
        }
        fabricRef.current.renderAll();
      });
    };

    const onUp = () => {
      isDown = false;
      if (shape && fabricRef.current) {
        shape.selectable = activeTool !== "circle-to-ask";
        fabricRef.current.renderAll();
        if (activeTool === "circle-to-ask" && onRegionDrawn) {
          const { left = 0, top = 0, width: w = 0, height: h = 0 } = shape as import("fabric").Rect;
          onRegionDrawn({ x: left, y: top, w: Math.max(w, 10), h: Math.max(h, 10) });
        } else {
          store.saveAnnotations(docId, pageNum, JSON.stringify(fabricRef.current.toJSON()));
        }
      }
      shape = null;
    };

    fc.on("mouse:down", onDown as never);
    fc.on("mouse:move", onMove as never);
    fc.on("mouse:up", onUp);
    fc.defaultCursor = "crosshair";

    return () => {
      fc.off("mouse:down", onDown as never);
      fc.off("mouse:move", onMove as never);
      fc.off("mouse:up", onUp);
      fc.defaultCursor = "default";
    };
  }, [activeTool, docId, pageNum]);

  const isInteractive = DRAW_TOOLS.includes(activeTool);

  return (
    <div
      ref={containerRef}
      className="absolute top-0 left-0"
      style={{ width, height, pointerEvents: isInteractive ? "auto" : "none" }}
    />
  );
}
