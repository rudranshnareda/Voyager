"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { useVoyagerStore } from "@/lib/store";
import { MessageBubble } from "./MessageBubble";

export function MessageList() {
  const { messages, chatLoading } = useVoyagerStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  if (messages.length === 0 && !chatLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted px-4">
        <div className="relative">
          <MessageSquare className="w-8 h-8 opacity-30" />
          <span className="absolute -top-1 -right-1 text-sm">✦</span>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-text-secondary">Ask anything about your documents</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0 flex flex-col gap-4">
      <AnimatePresence initial={false}>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <MessageBubble message={msg} />
          </motion.div>
        ))}
      </AnimatePresence>

      {chatLoading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full bg-text-muted"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, delay: i * 0.2, duration: 0.8 }}
        />
      ))}
    </div>
  );
}
