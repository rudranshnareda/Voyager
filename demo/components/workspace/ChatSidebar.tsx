"use client";

import { useEffect } from "react";
import { useVoyagerStore } from "@/lib/store";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ScopeSelector } from "@/components/chat/ScopeSelector";

interface ChatSidebarProps {
  workspaceId: string;
}

export function ChatSidebar({ workspaceId }: ChatSidebarProps) {
  const { loadWorkspaceMessages } = useVoyagerStore();

  useEffect(() => {
    loadWorkspaceMessages(workspaceId);
  }, [workspaceId, loadWorkspaceMessages]);

  return (
    <aside className="w-80 flex-shrink-0 bg-bg-panel border-l border-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-widest">
            Chat
          </span>
        </div>
        <ScopeSelector workspaceId={workspaceId} />
      </div>

      {/* Messages */}
      <MessageList />

      {/* Input */}
      <ChatInput />
    </aside>
  );
}
