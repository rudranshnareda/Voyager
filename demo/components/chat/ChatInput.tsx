"use client";

import { useState, useRef } from "react";
import { Send, Paperclip } from "lucide-react";
import { useVoyagerStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ChatInput() {
  const [value, setValue] = useState("");
  const { sendMessage, chatLoading, chatScope, workspaces, activeWorkspaceId } =
    useVoyagerStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const scopeDoc = workspace?.documents.find((d) => d.id === chatScope);
  const placeholder =
    chatScope === "workspace"
      ? "Ask across all documents…"
      : `Ask about ${scopeDoc?.name ?? "document"}…`;

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || chatLoading) return;
    sendMessage(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className="px-3 py-3 border-t border-border flex-shrink-0">
      <div className="flex items-end gap-2 bg-bg-card border border-border rounded-xl p-2 focus-within:border-accent transition-colors">
        {/* Attachment button (disabled) */}
        <button
          disabled
          title="Visual Q&A via annotation tools"
          className="p-1.5 text-text-muted opacity-40 cursor-not-allowed flex-shrink-0 mb-0.5"
        >
          <Paperclip className="w-4 h-4" />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          rows={1}
          disabled={chatLoading}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-muted",
            "focus:outline-none min-h-[24px] leading-6 py-0.5",
            chatLoading && "opacity-50"
          )}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!value.trim() || chatLoading}
          className={cn(
            "p-1.5 rounded-lg transition-colors flex-shrink-0 mb-0.5",
            value.trim() && !chatLoading
              ? "bg-accent text-white hover:bg-accent-glow"
              : "text-text-muted opacity-40 cursor-not-allowed"
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
