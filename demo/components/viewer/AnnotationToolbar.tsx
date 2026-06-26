"use client";

import {
  MousePointer2, Highlighter, Underline, Strikethrough,
  Pen, Square, Circle, ArrowRight,
  Type, StickyNote, Eraser, Search, Eye,
} from "lucide-react";
import { useVoyagerStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { AnnotationTool } from "@/lib/types";

const TOOL_GROUPS: { tools: { id: AnnotationTool; icon: React.ReactNode; label: string }[] }[] = [
  {
    tools: [{ id: "select", icon: <MousePointer2 className="w-4 h-4" />, label: "Select" }],
  },
  {
    tools: [
      { id: "highlight", icon: <Highlighter className="w-4 h-4" />, label: "Highlight" },
      { id: "underline", icon: <Underline className="w-4 h-4" />, label: "Underline" },
      { id: "strikethrough", icon: <Strikethrough className="w-4 h-4" />, label: "Strikethrough" },
    ],
  },
  {
    tools: [
      { id: "pen", icon: <Pen className="w-4 h-4" />, label: "Pen" },
      { id: "rect", icon: <Square className="w-4 h-4" />, label: "Rectangle" },
      { id: "circle", icon: <Circle className="w-4 h-4" />, label: "Circle" },
      { id: "arrow", icon: <ArrowRight className="w-4 h-4" />, label: "Arrow" },
    ],
  },
  {
    tools: [
      { id: "text", icon: <Type className="w-4 h-4" />, label: "Text" },
      { id: "sticky", icon: <StickyNote className="w-4 h-4" />, label: "Sticky note" },
      { id: "eraser", icon: <Eraser className="w-4 h-4" />, label: "Eraser" },
    ],
  },
  {
    tools: [
      { id: "circle-to-ask", icon: <Eye className="w-4 h-4" />, label: "Circle-to-Ask" },
      { id: "find", icon: <Search className="w-4 h-4" />, label: "Find" },
    ],
  },
];

interface AnnotationToolbarProps {
  docId: string;
}

export function AnnotationToolbar({ docId }: AnnotationToolbarProps) {
  const { viewerState, setActiveTool, setShowFind } = useVoyagerStore();
  const activeTool = viewerState[docId]?.activeTool ?? "select";

  const handleToolClick = (tool: AnnotationTool) => {
    setActiveTool(docId, tool);
    if (tool === "find") setShowFind(docId, true);
  };

  return (
    <div className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-bg-panel border-b border-border overflow-x-auto">
      {TOOL_GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center gap-0.5">
          {gi > 0 && <div className="w-px h-4 bg-border mx-1" />}
          {group.tools.map(({ id, icon, label }) => (
            <button
              key={id}
              title={label}
              onClick={() => handleToolClick(id)}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                activeTool === id
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
              )}
            >
              {icon}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
