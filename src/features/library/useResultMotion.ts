import { useLayoutEffect, useRef, type RefObject } from "react";
import type { LibraryItem } from "../../lib/types";

type Snapshot = { rect: DOMRect; opacity: string; copy: HTMLElement; expires?: number };
const EASE = "cubic-bezier(.2,.8,.2,1)";
const LIVE_LIMIT = 32;
const EXIT_LIMIT = 16;
const EXIT_MS = 170;
const revisions = new WeakMap<HTMLElement, string>();
const COMMITTED = "inkling:result-card-committed";
const LEAVING = "inkling:result-card-leaving";
export function markResultCard(node: HTMLElement, revision: string) {
  revisions.set(node, revision);
  node.closest(".library-scroll")?.dispatchEvent(new CustomEvent(COMMITTED, { detail: revision }));
  return () => {
    // The keyed Realm is about to detach; read the painted position before it disappears.
    node.closest(".library-scroll")?.dispatchEvent(new CustomEvent(LEAVING, { detail: node }));
    revisions.delete(node);
  };
}

export function useResultMotion(
  rootRef: RefObject<HTMLDivElement | null>,
  items: LibraryItem[],
  listMode: boolean,
) {
  const previous = useRef(new Map<string, Snapshot>());
  const identity = useRef("");
  const layout = useRef(listMode);
  const signature = JSON.stringify(items.map((item) => String(item.id)));

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const intersects = (rect: DOMRect, box: DOMRect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > box.top &&
      rect.top < box.bottom &&
      rect.right > box.left &&
      rect.left < box.right;
    const cards = () => {
      const box = root.getBoundingClientRect();
      return [
        ...root.querySelectorAll<HTMLElement>(".library-grid .library-card[data-library-item-id]"),
      ]
        .filter(
          (node) => revisions.get(node.closest<HTMLElement>("[data-result-card]")!) === signature,
        )
        .map((node) => ({ node, rect: node.getBoundingClientRect() }))
        .filter(({ rect }) => intersects(rect, box))
        .slice(0, LIVE_LIMIT);
    };
    const copies = new Map<string, HTMLElement>();
    const read = (node: HTMLElement, rect: DOMRect, expires?: number): Snapshot => {
      const id = node.dataset.libraryItemId!;
      let copy = copies.get(id);
      if (!copy) {
        copy = node.cloneNode(true) as HTMLElement;
        copies.set(id, copy);
      }
      return { rect, opacity: getComputedStyle(node).opacity, copy, expires };
    };
    // Expired exits are not surviving cards when a cleared query brings them back.
    const before = new Map(
      [...previous.current].filter(
        ([, frame]) => !frame.expires || frame.expires > performance.now(),
      ),
    );
    const changed =
      identity.current !== "" && identity.current !== signature && layout.current === listMode;
    identity.current = signature;
    layout.current = listMode;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Map<HTMLElement, Animation>();
    const ghosts = new Map<string, { node: HTMLElement; expires: number; copy: HTMLElement }>();
    let layer: HTMLDivElement | null = null;
    let frame = 0;
    let timer = 0;
    let moving = changed && !reduced.matches;
    let disposed = false;
    let dirty = true;
    const seen = new Map<HTMLElement, DOMRect>();
    const snapshot = () => {
      const next = new Map<string, Snapshot>();
      for (const { node, rect } of cards()) next.set(node.dataset.libraryItemId!, read(node, rect));
      const box = root.getBoundingClientRect(),
        now = performance.now();
      for (const [id, ghost] of ghosts) {
        const rect = ghost.node.getBoundingClientRect();
        if (ghost.expires <= now || !intersects(rect, box)) {
          animations.get(ghost.node)?.cancel();
          animations.delete(ghost.node);
          ghost.node.remove();
          ghosts.delete(id);
          continue;
        }
        next.set(id, {
          rect,
          opacity: getComputedStyle(ghost.node).opacity,
          copy: ghost.copy,
          expires: ghost.expires,
        });
      }
      previous.current = next;
      for (const id of copies.keys()) if (!next.has(id)) copies.delete(id);
    };
    const animateCards = () => {
      const visible = cards(),
        nodes = new Set(visible.map(({ node }) => node));
      for (const [node, animation] of animations) {
        if (!nodes.has(node) && node.parentElement !== layer) {
          animation.cancel();
          node.style.removeProperty("transform-origin");
          animations.delete(node);
        }
      }
      const plans = visible.map(({ node, rect }) => {
        const parent = node.parentElement!.getBoundingClientRect();
        const target = new DOMRect(parent.left, parent.top, node.offsetWidth, node.offsetHeight);
        const prior = seen.get(node);
        if (
          prior &&
          Math.abs(prior.left - target.left) < 0.5 &&
          Math.abs(prior.top - target.top) < 0.5 &&
          Math.abs(prior.width - target.width) < 0.5 &&
          Math.abs(prior.height - target.height) < 0.5
        )
          return null;
        const old = prior
          ? { rect, opacity: getComputedStyle(node).opacity }
          : before.get(node.dataset.libraryItemId!);
        return { node, target, old };
      });
      for (const plan of plans) {
        if (!plan) continue;
        const { node, target, old } = plan;
        animations.get(node)?.cancel();
        seen.set(node, target);
        node.style.transformOrigin = "top left";
        const transform = old
          ? `translate(${old.rect.left - target.left}px,${old.rect.top - target.top}px) scale(${old.rect.width / target.width},${old.rect.height / target.height})`
          : "translateY(8px) scale(.97)";
        animations.set(
          node,
          node.animate(
            [
              { transform, opacity: old?.opacity ?? 0 },
              { transform: "none", opacity: 1 },
            ],
            { duration: 260, easing: EASE, fill: "both" },
          ),
        );
      }
    };
    const cancelAnimations = () => {
      animations.forEach((animation, node) => {
        animation.cancel();
        node.style.removeProperty("transform-origin");
      });
      animations.clear();
      ghosts.clear();
      layer?.remove();
      layer = null;
    };
    const settle = () => {
      moving = false;
      window.clearTimeout(timer);
      cancelAnimations();
      snapshot();
    };
    if (moving) {
      const ids = new Set(JSON.parse(signature) as string[]),
        box = root.getBoundingClientRect(),
        now = performance.now();
      layer = document.createElement("div");
      layer.dataset.resultExits = "";
      layer.setAttribute("aria-hidden", "true");
      layer.inert = true;
      layer.style.cssText =
        "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1";
      root.append(layer);
      for (const [id, old] of before) {
        const expires = old.expires ?? now + EXIT_MS;
        if (
          ids.has(id) ||
          expires <= now ||
          !intersects(old.rect, box) ||
          ghosts.size >= EXIT_LIMIT
        )
          continue;
        const ghost = old.copy.cloneNode(true) as HTMLElement;
        ghost.removeAttribute("id");
        ghost.removeAttribute("data-library-item-id");
        ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
        ghost.style.cssText += `;position:absolute;left:${old.rect.left - box.left}px;top:${old.rect.top - box.top}px;width:${old.rect.width}px;height:${old.rect.height}px;margin:0;transform-origin:center;pointer-events:none`;
        layer.append(ghost);
        ghosts.set(id, { node: ghost, expires, copy: old.copy });
        animations.set(
          ghost,
          ghost.animate(
            [
              { opacity: old.opacity, transform: "scale(1)" },
              { opacity: 0, transform: "scale(.96)" },
            ],
            { duration: expires - now, easing: EASE, fill: "both" },
          ),
        );
      }
      timer = window.setTimeout(settle, 500);
    }
    // The same observers survive settling: the next filter starts at the latest scrolled/resized viewport.
    const tick = () => {
      frame = 0;
      if (disposed) return;
      if (moving && dirty) animateCards();
      dirty = false;
      if (!moving || cards().length || signature === "[]") snapshot();
    };
    const schedule = () => {
      dirty = true;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    let committed = false;
    const onCommit = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== signature) return;
      if (moving && !committed) {
        committed = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(settle, 300);
      }
      schedule();
    };
    const onLeaving = (event: Event) => {
      const wrapper = (event as CustomEvent<HTMLElement>).detail;
      if (revisions.get(wrapper) !== signature) return;
      const node = wrapper.querySelector<HTMLElement>(".library-card[data-library-item-id]");
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (intersects(rect, root.getBoundingClientRect()))
        previous.current.set(node.dataset.libraryItemId!, read(node, rect));
    };
    const observer = new MutationObserver(schedule);
    // The inner virtualizer is replaceable; observe its stable host instead.
    observer.observe(root, {
      childList: true,
      subtree: true,
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    root.addEventListener(COMMITTED, onCommit);
    root.addEventListener(LEAVING, onLeaving);
    root.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", settle);
    schedule();
    return () => {
      // Keyed card cleanups already captured detached cards. Keep those painted frames.
      if (cards().length || signature === "[]") snapshot();
      const now = performance.now();
      for (const [id, ghost] of ghosts) {
        if (ghost.expires <= now) previous.current.delete(id);
        else
          previous.current.set(id, {
            rect: ghost.node.getBoundingClientRect(),
            opacity: getComputedStyle(ghost.node).opacity,
            copy: ghost.copy,
            expires: ghost.expires,
          });
      }
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
      resize.disconnect();
      root.removeEventListener(COMMITTED, onCommit);
      root.removeEventListener(LEAVING, onLeaving);
      root.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", settle);
      cancelAnimations();
    };
  }, [rootRef, signature, listMode]);
}
