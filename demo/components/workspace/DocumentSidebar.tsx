"use client";

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Upload, FileText, Settings } from "lucide-react";
import { useVoyagerStore } from "@/lib/store";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import type { MockDocument } from "@/lib/types";

interface DocumentSidebarProps {
  workspaceId: string;
}

export function DocumentSidebar({ workspaceId }: DocumentSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    workspaces,
    openTabs,
    activeTabId,
    sidebarCollapsed,
    setSidebarCollapsed,
    openDocument,
    mockUpload,
    uploadProgress,
  } = useVoyagerStore();

  const workspace = workspaces.find((w) => w.id === workspaceId);
  const docs = workspace?.documents ?? [];

  const totalStorage = docs.reduce((acc) => acc + 1.8, 0).toFixed(1);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    mockUpload(workspaceId, file.name);
    e.target.value = "";
  };

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 48 : 260 }}
      transition={{ duration: 0.2 }}
      className="flex-shrink-0 bg-bg-panel border-r border-border flex flex-col overflow-hidden"
    >
      {sidebarCollapsed ? (
        // Icon rail
        <div className="flex flex-col items-center pt-3 gap-1">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-2 text-text-muted hover:text-text-secondary rounded-md hover:bg-bg-hover transition-colors"
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {docs.map((doc) => (
            <button
              key={doc.id}
              onClick={() => openDocument(doc.id)}
              title={doc.name}
              className={cn(
                "p-2 rounded-md transition-colors",
                openTabs.includes(doc.id) ? "text-accent" : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
              )}
            >
              <FileText className="w-4 h-4" />
            </button>
          ))}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload PDF"
            className="p-2 text-text-muted hover:text-accent rounded-md hover:bg-bg-hover transition-colors mt-1"
          >
            <Upload className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-widest">
              Documents
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
                title="Upload PDF"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-1 rounded-md text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors"
                title="Collapse"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Document list */}
          <div className="flex-1 overflow-y-auto px-2 py-1 min-h-0">
            <AnimatePresence initial={false}>
              {docs.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  isActive={activeTabId === doc.id}
                  isOpen={openTabs.includes(doc.id)}
                  uploadProgress={uploadProgress[doc.id]}
                  onOpen={() => openDocument(doc.id)}
                />
              ))}
            </AnimatePresence>

            {docs.length === 0 && (
              <div className="text-center py-8 text-text-muted text-xs">
                Upload a PDF to get started
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-border flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-text-muted">{totalStorage} MB used</span>
            <button className="p-1 text-text-muted hover:text-text-secondary transition-colors rounded-md hover:bg-bg-hover">
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleUpload}
      />
    </motion.aside>
  );
}

function DocumentRow({
  doc,
  isActive,
  isOpen,
  uploadProgress,
  onOpen,
}: {
  doc: MockDocument;
  isActive: boolean;
  isOpen: boolean;
  uploadProgress?: number;
  onOpen: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      onClick={onOpen}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm transition-colors",
        isActive
          ? "bg-bg-hover text-text-primary"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      )}
    >
      <FileText
        className={cn("w-4 h-4 flex-shrink-0", {
          "text-accent": isOpen,
          "text-status-processing": doc.status === "processing" || doc.status === "partial" || doc.status === "uploading",
          "text-status-error": doc.status === "error",
          "text-text-muted": doc.status === "ready" && !isOpen,
        })}
      />

      <span className="flex-1 truncate text-xs">{doc.name}</span>

      <div className="flex-shrink-0">
        {doc.status === "uploading" && uploadProgress !== undefined ? (
          <div className="w-12 h-1 bg-bg-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-200 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        ) : (
          <StatusBadge
            status={doc.status}
            readyPages={doc.readyPages}
            pageCount={doc.pageCount}
          />
        )}
      </div>
    </motion.button>
  );
}
