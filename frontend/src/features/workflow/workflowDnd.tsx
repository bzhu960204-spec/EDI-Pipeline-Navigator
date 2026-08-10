import type { ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

// Row rendered inside group tables; whole row is a pointer-drag source (no cursor change).
export function DraggableBodyRow(props: Readonly<Record<string, unknown>>) {
  const rowKey = props['data-row-key'] as number | undefined;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `wf-${rowKey}`,
    data: { workflowId: rowKey },
    disabled: rowKey == null,
  });
  const style = { ...(props.style as object), opacity: isDragging ? 0.4 : 1, touchAction: 'none' };
  return <tr {...props} {...attributes} {...listeners} ref={setNodeRef} style={style} />;
}

export const dragRowComponents = { body: { row: DraggableBodyRow } };

// A folder (or Ungrouped) drop target; highlights while a row hovers over it.
export function DropZone({
  id,
  folderId,
  children,
}: Readonly<{ id: string; folderId: number | null; children: ReactNode }>) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { folderId } });
  return (
    <div
      ref={setNodeRef}
      style={{
        borderRadius: 6,
        outline: isOver ? '2px dashed #1677ff' : '2px dashed transparent',
        background: isOver ? 'rgba(22,119,255,0.06)' : undefined,
        transition: 'outline-color 0.15s, background 0.15s',
      }}
    >
      {children}
    </div>
  );
}
