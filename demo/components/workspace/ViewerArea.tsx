"use client";

import dynamic from "next/dynamic";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { useVoyagerStore } from "@/lib/store";

// PDFViewer loaded client-side only (uses browser canvas APIs)
const PDFViewer = dynamic(() => import("@/components/viewer/PDFViewer").then((m) => m.PDFViewer), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

interface ViewerAreaProps {
  workspaceId: string;
}

export function ViewerArea({ workspaceId }: ViewerAreaProps) {
  const { openTabs, activeTabId, workspaces, layoutMode, panelAssignments } = useVoyagerStore();

  const workspace = workspaces.find((w) => w.id === workspaceId);
  const allDocs = workspace?.documents ?? [];

  if (openTabs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-text-muted">
        {/* Stack of documents SVG */}
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="opacity-30">
          <rect x="12" y="20" width="36" height="36" rx="3" fill="currentColor" opacity="0.4" />
          <rect x="8" y="14" width="36" height="36" rx="3" fill="currentColor" opacity="0.6" />
          <rect x="4" y="8" width="36" height="36" rx="3" fill="currentColor" opacity="0.8" />
          <path d="M12 20 L16 20 M12 27 L32 27 M12 34 L28 34" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-medium text-text-secondary">No document open</p>
          <p className="text-xs text-text-muted mt-1">Open a document from the sidebar to get started</p>
        </div>
      </div>
    );
  }

  // Single mode: show activeTabId
  if (layoutMode === "single") {
    const docId = panelAssignments[0] || activeTabId || openTabs[0];
    const doc = allDocs.find((d) => d.id === docId);
    if (!doc) return null;
    return (
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <PDFViewer docId={doc.id} filePath={doc.filePath} workspaceId={workspaceId} />
      </div>
    );
  }

  const getPanel = (i: number) => {
    const docId = panelAssignments[i] || openTabs[i % openTabs.length] || openTabs[0];
    const doc = allDocs.find((d) => d.id === docId);
    return { docId, doc };
  };

  const resizeHandleClass = "bg-border hover:bg-accent/50 transition-colors flex-shrink-0";

  // 2×2 Grid mode
  if (layoutMode === "grid") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <PanelGroup orientation="vertical" className="flex-1">
          <Panel minSize={20}>
            <PanelGroup orientation="horizontal">
              <Panel minSize={20}>
                <SplitPanel panelIndex={0} doc={getPanel(0).doc} workspaceId={workspaceId} />
              </Panel>
              <PanelResizeHandle className={`w-1 ${resizeHandleClass}`} />
              <Panel minSize={20}>
                <SplitPanel panelIndex={1} doc={getPanel(1).doc} workspaceId={workspaceId} />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className={`h-1 ${resizeHandleClass}`} />
          <Panel minSize={20}>
            <PanelGroup orientation="horizontal">
              <Panel minSize={20}>
                <SplitPanel panelIndex={2} doc={getPanel(2).doc} workspaceId={workspaceId} />
              </Panel>
              <PanelResizeHandle className={`w-1 ${resizeHandleClass}`} />
              <Panel minSize={20}>
                <SplitPanel panelIndex={3} doc={getPanel(3).doc} workspaceId={workspaceId} />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    );
  }

  // Split-v (side by side) or split-h (top/bottom)
  const orientation = layoutMode === "split-h" ? "vertical" : "horizontal";
  return (
    <PanelGroup orientation={orientation} className="flex-1">
      <Panel minSize={20}>
        <SplitPanel panelIndex={0} doc={getPanel(0).doc} workspaceId={workspaceId} />
      </Panel>
      <PanelResizeHandle className={layoutMode === "split-h" ? `h-1 ${resizeHandleClass}` : `w-1 ${resizeHandleClass}`} />
      <Panel minSize={20}>
        <SplitPanel panelIndex={1} doc={getPanel(1).doc} workspaceId={workspaceId} />
      </Panel>
    </PanelGroup>
  );
}

function SplitPanel({
  panelIndex,
  doc,
  workspaceId,
}: {
  panelIndex: number;
  doc: ReturnType<typeof useVoyagerStore.getState>["workspaces"][0]["documents"][0] | undefined;
  workspaceId: string;
}) {
  const { openTabs, workspaces, setPanelAssignment } = useVoyagerStore();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const allDocs = workspace?.documents ?? [];

  return (
    <div className="relative flex flex-col overflow-hidden min-w-0 min-h-0 h-full">
      {/* Panel doc selector */}
      {openTabs.length > 1 && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1 bg-bg-panel border-b border-border">
          <select
            value={doc?.id ?? ""}
            onChange={(e) => setPanelAssignment(panelIndex, e.target.value)}
            className="text-xs bg-bg-card border border-border rounded px-2 py-0.5 text-text-secondary focus:outline-none focus:border-accent"
          >
            {allDocs.filter((d) => openTabs.includes(d.id)).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      {doc ? (
        <PDFViewer docId={doc.id} filePath={doc.filePath} workspaceId={workspaceId} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-muted text-xs">
          No document
        </div>
      )}
    </div>
  );
}
