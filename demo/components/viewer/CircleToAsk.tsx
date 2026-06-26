"use client";

import { useState, useRef } from "react";
import { X, Send } from "lucide-react";
import { useVoyagerStore } from "@/lib/store";

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  pageNum: number;
}

interface CircleToAskProps {
  region: Region;
  containerRect: DOMRect;
  onClose: () => void;
}

const MOCK_RESPONSES = [
  "Based on the circled region, this section discusses key performance metrics for the algorithm being analyzed. The highlighted text indicates a significant improvement over baseline approaches.",
  "The circled area contains a figure or table that presents comparative data. The results shown suggest statistically significant findings relevant to the research question.",
  "This region appears to contain a critical definition or theorem. The formulation here is central to the paper's methodology and is referenced throughout subsequent sections.",
  "The highlighted section presents empirical evidence supporting the paper's main hypothesis. Note the confidence intervals and p-values which validate the statistical significance.",
];

export function CircleToAsk({ region, containerRect, onClose }: CircleToAskProps) {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const store = useVoyagerStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const popupY = region.y + region.h + 8;
  const popupX = Math.max(8, Math.min(region.x, containerRect.width - 280));

  const handleSend = () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setTimeout(() => {
      const resp = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
      setResponse(resp);
      setLoading(false);
    }, 1200);
  };

  const handleAddToChat = () => {
    if (response) {
      store.sendMessage(`[Region on page ${region.pageNum}]: ${question}`);
    }
    onClose();
  };

  return (
    <div
      className="absolute z-50 w-[272px] bg-bg-card border border-border rounded-lg shadow-2xl p-3 flex flex-col gap-2"
      style={{ top: popupY, left: popupX }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Ask about this region</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-bg-hover text-text-muted">
          <X className="w-3 h-3" />
        </button>
      </div>

      {!response ? (
        <>
          <textarea
            ref={textareaRef}
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="What do you want to know about this region?"
            className="w-full h-16 text-xs bg-bg-panel border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!question.trim() || loading}
            className="self-end flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent rounded-md text-white disabled:opacity-40 transition-opacity hover:bg-accent-glow"
          >
            {loading ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-3 h-3" />}
            {loading ? "Thinking…" : "Ask"}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-text-secondary leading-relaxed">{response}</p>
          <button
            onClick={handleAddToChat}
            className="self-start text-xs text-accent hover:text-accent-glow underline"
          >
            Add to chat
          </button>
        </>
      )}
    </div>
  );
}
