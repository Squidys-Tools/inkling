import { useLayoutEffect, useRef } from "react";

const reorder = "reorder";
const relayout = "relayout";

/** Slides a node from `dy`, `dx` px away back into its slot; the selection pill uses the same curve. */
export function glide(node: HTMLElement, dy: number, dx = 0, duration = 200, id = reorder) {
  if ((!dx && !dy) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
    id,
    duration,
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

const key = (node: HTMLElement) => node.dataset.glide ?? `hold ${node.dataset.glideHold}`;

const painted = (area: HTMLElement | null) =>
  new Map(
    [...(area?.querySelectorAll<HTMLElement>("[data-glide], [data-glide-hold]") ?? [])].map(
      (node) => {
        const box = node.getBoundingClientRect();
        return [key(node), { x: box.left, y: box.top, height: box.height }] as const;
      },
    ),
  );

/**
 * When `layout` changes, each `[data-glide]` node slides from where it was painted to its new
 * spot over `duration` ms. Nodes match by their id, so one swapped for another component travels too.
 * A `[data-glide-hold]` box that shrinks keeps its old height and lets it go on the same curve,
 * so it does not clip the nodes still gliding up inside it.
 */
export function useLayoutGlide<Area extends HTMLElement>(layout: string, duration: number) {
  const area = useRef<Area>(null);
  const shown = useRef(layout);
  const before = useRef<ReturnType<typeof painted>>(null);
  /* oxlint-disable react/refs -- Render is the one moment the DOM still shows the old layout,
     and a retried render finds the same snapshot waiting. */
  if (shown.current !== layout) {
    shown.current = layout;
    before.current = duration ? painted(area.current) : null;
  }
  /* oxlint-enable react/refs */

  useLayoutEffect(() => {
    const from = before.current;
    before.current = null;
    if (!from) return;
    const nodes = area.current?.querySelectorAll<HTMLElement>("[data-glide], [data-glide-hold]");
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const node of nodes ?? []) {
      const was = from.get(key(node));
      if (!was || node.dataset.lifted !== undefined) continue;
      for (const animation of node.getAnimations())
        if (animation.id === relayout) animation.cancel();
      const box = node.getBoundingClientRect();
      if (node.dataset.glide !== undefined)
        glide(node, was.y - box.top, was.x - box.left, duration, relayout);
      else if (was.height > box.height && !still)
        node.animate([{ minHeight: `${was.height}px` }, { minHeight: "0px" }], {
          id: relayout,
          duration,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        });
    }
  });

  return area;
}
