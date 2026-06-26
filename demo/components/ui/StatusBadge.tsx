import { cn } from "@/lib/utils";
import type { DocumentStatus } from "@/lib/types";

interface StatusBadgeProps {
  status: DocumentStatus;
  readyPages?: number;
  pageCount?: number;
  className?: string;
}

export function StatusBadge({ status, readyPages, pageCount, className }: StatusBadgeProps) {
  if (status === "uploading") {
    return (
      <span className={cn("text-xs font-mono text-status-processing", className)}>
        Uploading…
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className={cn("flex items-center gap-1.5 text-xs text-status-processing", className)}>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-processing animate-pulse" />
        Indexing…
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className={cn("flex items-center gap-1.5 text-xs text-status-processing", className)}>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-processing" />
        {readyPages}/{pageCount} pg
      </span>
    );
  }
  if (status === "ready") {
    return (
      <span className={cn("inline-block w-2 h-2 rounded-full bg-status-ready", className)} />
    );
  }
  if (status === "error") {
    return (
      <span className={cn("flex items-center gap-1.5 text-xs text-status-error", className)}>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-error" />
        Failed
      </span>
    );
  }
  return null;
}
