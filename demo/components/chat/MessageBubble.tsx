"use client";

import { CitationChip } from "./CitationChip";
import type { MockMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: MockMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-accent-dim rounded-xl px-3 py-2 text-sm text-text-primary">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
        {message.content}
      </div>
      {message.citations && message.citations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.citations.map((citation, i) => (
            <CitationChip key={i} citation={citation} />
          ))}
        </div>
      )}
    </div>
  );
}
