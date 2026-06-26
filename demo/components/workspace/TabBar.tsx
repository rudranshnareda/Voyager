"use client";

import { X, Plus, FileText } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVoyagerStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface TabBarProps {
  workspaceId: string;
}

export function TabBar({ workspaceId }: TabBarProps) {
  const { workspaces, openTabs, activeTabId, setActiveTab, closeTab, openDocument, reorderTabs } =
    useVoyagerStore();

  const workspace = workspaces.find((w) => w.id === workspaceId);
  const allDocs = workspace?.documents ?? [];
  const closedDocs = allDocs.filter((d) => !openTabs.includes(d.id));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = openTabs.indexOf(String(active.id));
      const newIdx = openTabs.indexOf(String(over.id));
      reorderTabs(arrayMove(openTabs, oldIdx, newIdx));
    }
  };

  return (
    <div className="flex items-center bg-bg-panel border-b border-border min-h-[40px] flex-shrink-0 overflow-x-auto">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={openTabs} strategy={horizontalListSortingStrategy}>
          {openTabs.map((docId) => {
            const doc = allDocs.find((d) => d.id === docId);
            if (!doc) return null;
            return (
              <SortableTab
                key={docId}
                docId={docId}
                name={doc.name}
                isActive={activeTabId === docId}
                onActivate={() => setActiveTab(docId)}
                onClose={() => closeTab(docId)}
              />
            );
          })}
        </SortableContext>
      </DndContext>

      {/* Add tab dropdown */}
      {closedDocs.length > 0 && (
        <div className="relative group">
          <button className="p-2 text-text-muted hover:text-text-secondary transition-colors flex-shrink-0">
            <Plus className="w-4 h-4" />
          </button>
          <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block bg-bg-card border border-border rounded-lg shadow-xl py-1 min-w-[200px]">
            {closedDocs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => openDocument(doc.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors text-left"
              >
                <FileText className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                <span className="truncate">{doc.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SortableTab({
  docId,
  name,
  isActive,
  onActivate,
  onClose,
}: {
  docId: string;
  name: string;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: docId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing flex-shrink-0 border-r border-border transition-colors min-w-0",
        isActive
          ? "bg-bg-base text-text-primary border-t-2 border-t-accent"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary border-t-2 border-t-transparent"
      )}
      onClick={onActivate}
    >
      <FileText className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
      <span className="text-xs font-medium max-w-[120px] truncate">{name}</span>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-all flex-shrink-0 ml-1"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
