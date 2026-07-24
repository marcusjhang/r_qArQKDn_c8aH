'use client';

// Native HTML5 drag-and-drop wiring for the board. A dragged card carries its candidate id as `text/plain`; a column dispatches the stage move on drop.

import type { DragEvent } from 'react';

const DND_MIME = 'text/plain';
const DRAGOVER_CLASS = 'dragover';

export interface BoardDnd {
  /** Props for a draggable candidate card. */
  cardProps: (candidateId: number) => {
    draggable: true;
    onDragStart: (e: DragEvent<HTMLElement>) => void;
  };
  /** Props for a column that accepts dropped cards into `stage`. */
  columnProps: (stage: string) => {
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDragLeave: (e: DragEvent<HTMLElement>) => void;
    onDrop: (e: DragEvent<HTMLElement>) => void;
  };
}

export function useBoardDnd(
  onMove: (candidateId: number, stage: string) => void
): BoardDnd {
  const cardProps: BoardDnd['cardProps'] = (candidateId) => ({
    draggable: true,
    onDragStart: (e) => e.dataTransfer.setData(DND_MIME, String(candidateId))
  });

  const columnProps: BoardDnd['columnProps'] = (stage) => ({
    onDragOver: (e) => {
      e.preventDefault();
      e.currentTarget.classList.add(DRAGOVER_CLASS);
    },
    onDragLeave: (e) => e.currentTarget.classList.remove(DRAGOVER_CLASS),
    onDrop: (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove(DRAGOVER_CLASS);
      const id = Number(e.dataTransfer.getData(DND_MIME));
      if (id) onMove(id, stage);
    }
  });

  return { cardProps, columnProps };
}
