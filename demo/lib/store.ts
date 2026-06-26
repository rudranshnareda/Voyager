import { create } from "zustand";
import type {
  MockWorkspace,
  MockDocument,
  MockMessage,
  AnnotationTool,
  LayoutMode,
  ViewerState,
  PendingFlash,
} from "./types";
import { mockWorkspaces, mockResponsePool } from "./mockData";

const uid = (): string => Math.random().toString(36).slice(2, 11);

const defaultViewerState = (): ViewerState => ({
  currentPage: 1,
  zoom: 1.0,
  activeTool: "select",
  showThumbnails: true,
  showFind: false,
  findQuery: "",
});

export interface VoyagerStore {
  // ---- Workspaces ----
  workspaces: MockWorkspace[];
  activeWorkspaceId: string | null;
  sidebarCollapsed: boolean;

  // ---- Tabs ----
  openTabs: string[]; // document IDs in order
  activeTabId: string | null;

  // ---- Layout ----
  layoutMode: LayoutMode;
  panelAssignments: Record<number, string>; // panelIndex → docId

  // ---- Viewer state per document ----
  viewerState: Record<string, ViewerState>;

  // ---- Annotations per document per page ----
  annotations: Record<string, Record<number, string>>; // docId → page → fabric JSON

  // ---- Chat ----
  chatScope: "workspace" | string; // 'workspace' or docId
  messages: MockMessage[];
  chatLoading: boolean;

  // ---- Upload progress ----
  uploadProgress: Record<string, number>; // docId → 0-100

  // ---- Page jump flash ----
  pendingFlash: PendingFlash | null;

  // ---- Actions: workspaces ----
  setActiveWorkspace: (id: string) => void;
  createWorkspace: (name: string) => MockWorkspace;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // ---- Actions: tabs ----
  openDocument: (docId: string) => void;
  closeTab: (docId: string) => void;
  setActiveTab: (docId: string) => void;
  reorderTabs: (newOrder: string[]) => void;

  // ---- Actions: layout ----
  setLayout: (mode: LayoutMode) => void;
  setPanelAssignment: (panelIndex: number, docId: string) => void;

  // ---- Actions: viewer ----
  setCurrentPage: (docId: string, page: number) => void;
  setZoom: (docId: string, zoom: number) => void;
  setActiveTool: (docId: string, tool: AnnotationTool) => void;
  setShowThumbnails: (docId: string, show: boolean) => void;
  setShowFind: (docId: string, show: boolean) => void;
  setFindQuery: (docId: string, query: string) => void;
  jumpToPage: (docId: string, page: number) => void;
  clearFlash: () => void;

  // ---- Actions: annotations ----
  saveAnnotations: (docId: string, page: number, json: string) => void;

  // ---- Actions: chat ----
  sendMessage: (content: string) => void;
  setChatScope: (scope: string) => void;
  loadWorkspaceMessages: (workspaceId: string) => void;

  // ---- Actions: upload ----
  mockUpload: (workspaceId: string, fileName: string) => void;
  updateDocumentStatus: (workspaceId: string, docId: string, updates: Partial<MockDocument>) => void;
}

export const useVoyagerStore = create<VoyagerStore>((set, get) => ({
  workspaces: mockWorkspaces,
  activeWorkspaceId: null,
  sidebarCollapsed: false,

  openTabs: [],
  activeTabId: null,

  layoutMode: "single",
  panelAssignments: {},

  viewerState: {},
  annotations: {},

  chatScope: "workspace",
  messages: [],
  chatLoading: false,

  uploadProgress: {},
  pendingFlash: null,

  // ---- Workspace actions ----

  setActiveWorkspace: (id) => {
    const ws = get().workspaces.find((w) => w.id === id);
    if (!ws) return;
    set({
      activeWorkspaceId: id,
      openTabs: [],
      activeTabId: null,
      messages: ws.messages,
      chatScope: "workspace",
      pendingFlash: null,
    });
  },

  createWorkspace: (name) => {
    const ws: MockWorkspace = {
      id: `ws-${uid()}`,
      name,
      documents: [],
      messages: [],
      lastActive: new Date().toISOString(),
    };
    set((state) => ({ workspaces: [...state.workspaces, ws] }));
    return ws;
  },

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  // ---- Tab actions ----

  openDocument: (docId) => {
    set((state) => {
      const alreadyOpen = state.openTabs.includes(docId);
      const newTabs = alreadyOpen ? state.openTabs : [...state.openTabs, docId];
      const viewerState = state.viewerState[docId]
        ? state.viewerState
        : { ...state.viewerState, [docId]: defaultViewerState() };
      // Assign to panel 0 if no assignments yet
      const panelAssignments =
        Object.keys(state.panelAssignments).length === 0
          ? { 0: docId }
          : state.panelAssignments;
      return {
        openTabs: newTabs,
        activeTabId: docId,
        viewerState,
        panelAssignments,
      };
    });
  },

  closeTab: (docId) => {
    set((state) => {
      const newTabs = state.openTabs.filter((id) => id !== docId);
      let newActive = state.activeTabId;
      if (state.activeTabId === docId) {
        const idx = state.openTabs.indexOf(docId);
        newActive = newTabs[idx] ?? newTabs[idx - 1] ?? null;
      }
      const newAssignments = { ...state.panelAssignments };
      for (const [key, val] of Object.entries(newAssignments)) {
        if (val === docId) {
          const fallback = newTabs[0] ?? "";
          newAssignments[Number(key)] = fallback;
        }
      }
      return { openTabs: newTabs, activeTabId: newActive, panelAssignments: newAssignments };
    });
  },

  setActiveTab: (docId) => {
    set((state) => {
      if (!state.openTabs.includes(docId)) return {};
      return { activeTabId: docId };
    });
  },

  reorderTabs: (newOrder) => set({ openTabs: newOrder }),

  // ---- Layout actions ----

  setLayout: (mode) => {
    set((state) => {
      const assignments: Record<number, string> = {};
      const tabs = state.openTabs;
      if (mode === "single") {
        assignments[0] = state.activeTabId ?? tabs[0] ?? "";
      } else if (mode === "split-v" || mode === "split-h") {
        assignments[0] = state.activeTabId ?? tabs[0] ?? "";
        assignments[1] = tabs[1] ?? tabs[0] ?? "";
      } else if (mode === "grid") {
        for (let i = 0; i < 4; i++) {
          assignments[i] = tabs[i % tabs.length] ?? "";
        }
      }
      return { layoutMode: mode, panelAssignments: assignments };
    });
  },

  setPanelAssignment: (panelIndex, docId) => {
    set((state) => ({
      panelAssignments: { ...state.panelAssignments, [panelIndex]: docId },
    }));
  },

  // ---- Viewer actions ----

  setCurrentPage: (docId, page) => {
    set((state) => ({
      viewerState: {
        ...state.viewerState,
        [docId]: { ...state.viewerState[docId], currentPage: page },
      },
    }));
  },

  setZoom: (docId, zoom) => {
    const clamped = Math.min(Math.max(zoom, 0.25), 4);
    set((state) => ({
      viewerState: {
        ...state.viewerState,
        [docId]: { ...state.viewerState[docId], zoom: clamped },
      },
    }));
  },

  setActiveTool: (docId, tool) => {
    set((state) => ({
      viewerState: {
        ...state.viewerState,
        [docId]: { ...state.viewerState[docId], activeTool: tool },
      },
    }));
  },

  setShowThumbnails: (docId, show) => {
    set((state) => ({
      viewerState: {
        ...state.viewerState,
        [docId]: { ...state.viewerState[docId], showThumbnails: show },
      },
    }));
  },

  setShowFind: (docId, show) => {
    set((state) => ({
      viewerState: {
        ...state.viewerState,
        [docId]: { ...state.viewerState[docId], showFind: show },
      },
    }));
  },

  setFindQuery: (docId, query) => {
    set((state) => ({
      viewerState: {
        ...state.viewerState,
        [docId]: { ...state.viewerState[docId], findQuery: query },
      },
    }));
  },

  jumpToPage: (docId, page) => {
    get().openDocument(docId);
    get().setCurrentPage(docId, page);
    set({ pendingFlash: { docId, page } });
  },

  clearFlash: () => set({ pendingFlash: null }),

  // ---- Annotation actions ----

  saveAnnotations: (docId, page, json) => {
    set((state) => ({
      annotations: {
        ...state.annotations,
        [docId]: { ...(state.annotations[docId] ?? {}), [page]: json },
      },
    }));
  },

  // ---- Chat actions ----

  sendMessage: (content) => {
    const userMsg: MockMessage = {
      id: uid(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({
      messages: [...state.messages, userMsg],
      chatLoading: true,
    }));

    const delay = 1200 + Math.random() * 600;
    setTimeout(() => {
      const state = get();
      const activeWorkspace = state.workspaces.find(
        (w) => w.id === state.activeWorkspaceId
      );
      const docs = activeWorkspace?.documents ?? [];

      // Build a response with citations from ready documents
      const readyDocs = docs.filter((d) => d.status === "ready" || d.status === "partial");
      const includeCitations = Math.random() > 0.3 && readyDocs.length > 0;

      const template =
        mockResponsePool[Math.floor(Math.random() * mockResponsePool.length)];

      const citations = includeCitations
        ? readyDocs.slice(0, 2).map((doc) => ({
            documentId: doc.id,
            filename: doc.name,
            pageNumber: Math.max(1, Math.floor(Math.random() * doc.readyPages) + 1),
            excerpt: `Relevant content from ${doc.name} addressing your query about the subject matter in this document.`,
          }))
        : undefined;

      const assistantMsg: MockMessage = {
        id: uid(),
        role: "assistant",
        content: template.content,
        citations,
        timestamp: new Date().toISOString(),
      };

      set((s) => ({
        messages: [...s.messages, assistantMsg],
        chatLoading: false,
      }));
    }, delay);
  },

  setChatScope: (scope) => set({ chatScope: scope }),

  loadWorkspaceMessages: (workspaceId) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    if (ws) set({ messages: ws.messages });
  },

  // ---- Upload actions ----

  mockUpload: (workspaceId, fileName) => {
    const docId = `doc-upload-${uid()}`;
    const newDoc: MockDocument = {
      id: docId,
      name: fileName,
      pageCount: 0,
      size: "—",
      status: "uploading",
      readyPages: 0,
      uploadedAt: new Date().toISOString(),
      type: "text",
      filePath: "/sample-pdfs/sample-a.pdf",
    };

    set((state) => ({
      workspaces: state.workspaces.map((ws) =>
        ws.id === workspaceId
          ? { ...ws, documents: [...ws.documents, newDoc] }
          : ws
      ),
      uploadProgress: { ...state.uploadProgress, [docId]: 0 },
    }));

    // Animate upload progress 0→100 over ~2s
    let progress = 0;
    const tick = setInterval(() => {
      progress += 10 + Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(tick);
        get().updateDocumentStatus(workspaceId, docId, {
          status: "processing",
          pageCount: 24,
          size: "1.8 MB",
        });
        set((state) => ({
          uploadProgress: { ...state.uploadProgress, [docId]: 100 },
        }));
        // processing → partial after 4s
        setTimeout(() => {
          get().updateDocumentStatus(workspaceId, docId, {
            status: "partial",
            readyPages: 8,
          });
          // partial → ready after another 4s
          setTimeout(() => {
            get().updateDocumentStatus(workspaceId, docId, {
              status: "ready",
              readyPages: 24,
            });
          }, 4000);
        }, 4000);
      } else {
        set((state) => ({
          uploadProgress: { ...state.uploadProgress, [docId]: Math.round(progress) },
        }));
      }
    }, 200);
  },

  updateDocumentStatus: (workspaceId, docId, updates) => {
    set((state) => ({
      workspaces: state.workspaces.map((ws) =>
        ws.id === workspaceId
          ? {
              ...ws,
              documents: ws.documents.map((d) =>
                d.id === docId ? { ...d, ...updates } : d
              ),
            }
          : ws
      ),
    }));
  },
}));
