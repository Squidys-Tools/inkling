import { useLayoutEffect, useRef } from "react";

const reorder = "reorder";

/** Slides a row from `offset` px away back into its slot; the selection pill uses the same curve. */
export function glide(row: HTMLElement, offset: number) {
  if (!offset || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  row.animate([{ transform: `translateY(${offset}px)` }, { transform: "none" }], {
    id: reorder,
    duration: 200,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
  });
}

/**
 * When the order of `[data-space-id]` rows changes, each moved row glides from where it was
 * painted to its new slot. The dragged row follows the pointer instead, so it is skipped.
 */
export function useReorderGlide(order: string) {
  const list = useRef<HTMLDivElement>(null);
  const tops = useRef(new Map<string, number>());
  const lastOrder = useRef(order);

  // Every render re-measures, so a resize or a style switch never leaves stale slots behind.
  useLayoutEffect(() => {
    const rows = list.current?.querySelectorAll<HTMLElement>(":scope > [data-space-id]") ?? [];
    const moved = lastOrder.current !== order;
    lastOrder.current = order;
    const next = new Map<string, number>();
    for (const row of rows) {
      const id = row.dataset.spaceId ?? "";
      const before = tops.current.get(id);
      next.set(id, row.offsetTop);
      if (!moved || before === undefined || before === row.offsetTop) continue;
      if (row.dataset.lifted !== undefined) continue;
      // A row still gliding from an earlier swap starts from where it is painted now.
      const painted = new DOMMatrixReadOnly(getComputedStyle(row).transform).m42;
      for (const animation of row.getAnimations()) if (animation.id === reorder) animation.cancel();
      glide(row, before + painted - row.offsetTop);
    }
    tops.current = next;
  });

  return list;
}
