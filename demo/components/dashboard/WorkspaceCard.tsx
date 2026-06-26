"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { MockWorkspace, DocumentStatus } from "@/lib/types";

interface WorkspaceCardProps {
  workspace: MockWorkspace;
}

const STATUS_COLORS: Record<DocumentStatus, string> = {
  ready: "bg-status-ready",
  processing: "bg-status-processing",
  partial: "bg-status-processing",
  uploading: "bg-status-processing",
  error: "bg-status-error",
};

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const router = useRouter();

  const statusCounts = workspace.documents.reduce<Record<DocumentStatus, number>>(
    (acc, doc) => {
      acc[doc.status] = (acc[doc.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<DocumentStatus, number>
  );

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 8px 30px rgba(0,0,0,0.4)" }}
      onClick={() => router.push(`/workspace/${workspace.id}`)}
      className="
        group relative bg-bg-card border border-border rounded-xl p-5 cursor-pointer
        transition-colors duration-200 hover:border-border-strong
      "
    >
      {/* Icon + name */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-accent-dim flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-accent-glow" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-text-primary truncate">{workspace.name}</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {workspace.documents.length} document{workspace.documents.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Status dots row */}
      <div className="flex items-center gap-1.5 mb-4">
        {(Object.entries(statusCounts) as [DocumentStatus, number][]).map(([status, count]) => (
          <div key={status} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
            <span className="text-xs text-text-muted">{count}</span>
          </div>
        ))}
      </div>

      {/* Last active */}
      <p className="text-xs text-text-muted">{formatDate(workspace.lastActive)}</p>
    </motion.div>
  );
}
