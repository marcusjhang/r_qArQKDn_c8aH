'use client';

// Drag-and-drop orchestration for the board. Cards carry their candidate id in
// the drag payload; columns accept a drop and report the target stage. The
// caller decides what a drop means (typically actions.moveTo).

import type { DragEvent } from 'react';

/** MIME type for the dragged candidate id — one place so drag/drop agree. */
const DRAG_MIME = 'text/plain';

export interface BoardDrag {
  /** Props for a draggable candidate card carrying `candidateId`. */
  cardDragProps: (candidateId: number) => {
    draggable: true;
    onDragStart: (e: DragEvent<HTMLElement>) => void;
  };
  /** Props for a column that accepts drops into `stage`. */
  columnDropProps: (stage: string) => {
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDragLeave: (e: DragEvent<HTMLElement>) => void;
    onDrop: (e: DragEvent<HTMLElement>) => void;
  };
}

export function useBoardDrag(
  onMoveCandidate: (candidateId: number, stage: string) => void
): BoardDrag {
  const cardDragProps = (candidateId: number) => ({
    draggable: true as const,
    onDragStart: (e: DragEvent<HTMLElement>) =>
      e.dataTransfer.setData(DRAG_MIME, String(candidateId))
  });

  const columnDropProps = (stage: string) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.classList.add('dragover');
    },
    onDragLeave: (e: DragEvent<HTMLElement>) =>
      e.currentTarget.classList.remove('dragover'),
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.classList.remove('dragover');
      const id = Number(e.dataTransfer.getData(DRAG_MIME));
      if (id) onMoveCandidate(id, stage);
    }
  });

  return { cardDragProps, columnDropProps };
}
