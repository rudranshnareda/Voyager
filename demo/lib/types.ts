export type DocumentStatus = "uploading" | "processing" | "partial" | "ready" | "error";

export type DocumentType = "text" | "scanned" | "mixed";

export interface MockDocument {
  id: string;
  name: string;
  pageCount: number;
  size: string;
  status: DocumentStatus;
  readyPages: number;
  uploadedAt: string;
  type: DocumentType;
  /** Path within /public, e.g. /sample-pdfs/sample-a.pdf */
  filePath: string;
}

export interface Citation {
  documentId: string;
  filename: string;
  pageNumber: number;
  excerpt: string;
}

export interface MockMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: string;
}

export interface MockWorkspace {
  id: string;
  name: string;
  documents: MockDocument[];
  messages: MockMessage[];
  lastActive: string;
}

export type AnnotationTool =
  | "select"
  | "highlight"
  | "underline"
  | "strikethrough"
  | "pen"
  | "rect"
  | "circle"
  | "arrow"
  | "line"
  | "text"
  | "sticky"
  | "eraser"
  | "circle-to-ask"
  | "find";

export type LayoutMode = "single" | "split-v" | "split-h" | "grid";

export interface ViewerState {
  currentPage: number;
  zoom: number;
  activeTool: AnnotationTool;
  showThumbnails: boolean;
  showFind: boolean;
  findQuery: string;
}

export interface PendingFlash {
  docId: string;
  page: number;
}
