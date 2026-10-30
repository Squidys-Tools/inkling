import { Component, type ReactNode, type RefObject } from "react";

type Box = { left: number; top: number; width: number; height: number };
type Frame = { box: Box; opacity: string };
type Before = { frames: Map<string, Frame>; exits: (Frame & { copy: HTMLElement })[] };

const EASE = "cubic-bezier(.2,.8,.2,1)";
const LIVE_LIMIT = 32;
const EXIT_LIMIT = 16;
const EXIT_MS = 170;
const ENTER_MS = 260;
const SETTLE_MS = 500;
const COMMIT_SETTLE_MS = 300;
const COMMITTED = "inkling:result-card-committed";

const revisions = new WeakMap<HTMLElement, string>();

export function markResultCard(node: HTMLElement, revision: string) {
  revisions.set(node, revision);
  node.closest(".library-scroll")?.dispatchEvent(new CustomEvent(COMMITTED, { detail: revision }));
  return () => {
    revisions.delete(node);
  };
}

const overlaps = (box: Box, area: Box) =>
  box.width > 0 &&
  box.height > 0 &&
  box.top + box.height > area.top &&
  box.top < area.top + area.height &&
  box.left + box.width > area.left &&
  box.left < area.left + area.width;

const sameBox = (a: Box, b: Box) =>
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.top - b.top) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

// Cards of one result set that are painted inside the scroll host. The revision
// check skips cards from a set that is still mounting or already unmounting.
function paintedCards(root: HTMLElement, revision: string) {
  const area = root.getBoundingClientRect();
  const found: { node: HTMLElement; box: Box }[] = [];
  for (const node of root.querySelectorAll<HTMLElement>(
    ".library-grid .library-card[data-library-item-id]",
  )) {
    const wrapper = node.closest<HTMLElement>("[data-result-card]");
    if (!wrapper || revisions.get(wrapper) !== revision) continue;
    const box = node.getBoundingClientRect();
    if (!overlaps(box, area)) continue;
    found.push({ node, box });
    if (found.length === LIVE_LIMIT) break;
  }
  return found;
}

function captureResults(root: HTMLElement, revision: string, keep: ReadonlySet<string>): Before {
  const frames = new Map<string, Frame>();
  const exits: Before["exits"] = [];
  for (const { node, box } of paintedCards(root, revision)) {
    const id = node.dataset.libraryItemId!;
    const frame = { box, opacity: getComputedStyle(node).opacity };
    frames.set(id, frame);
    if (!keep.has(id) && exits.length < EXIT_LIMIT)
      exits.push({ ...frame, copy: node.cloneNode(true) as HTMLElement });
  }
  return { frames, exits };
}

// Surviving cards glide from where they were painted, new cards rise in, and
// removed cards fade out as inert copies. It watches the grid only until the
// new set has settled, so an idle or scrolling library pays nothing.
function playResults(root: HTMLElement, revision: string, before: Before) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const animations = new Map<HTMLElement, Animation>();
  const seen = new Map<HTMLElement, Box>();
  let layer: HTMLDivElement | undefined;
  let frame = 0;
  let timer = 0;
  let committed = false;
  let stopped = false;

  if (before.exits.length) {
    const area = root.getBoundingClientRect();
    layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1";
    for (const exit of before.exits) {
      const ghost = exit.copy;
      ghost.removeAttribute("id");
      ghost.removeAttribute("data-library-item-id");
      for (const node of ghost.querySelectorAll("[id]")) node.removeAttribute("id");
      const { box } = exit;
      ghost.style.cssText += `;position:absolute;left:${box.left - area.left}px;top:${box.top - area.top}px;width:${box.width}px;height:${box.height}px;margin:0;transform-origin:center;pointer-events:none`;
      layer.append(ghost);
      animations.set(
        ghost,
        ghost.animate(
          [
            { opacity: exit.opacity, transform: "scale(1)" },
            { opacity: 0, transform: "scale(.96)" },
          ],
          { duration: EXIT_MS, easing: EASE, fill: "both" },
        ),
      );
    }
    root.append(layer);
  }

  const place = () => {
    const plans = [];
    for (const { node, box } of paintedCards(root, revision)) {
      const parent = node.parentElement!.getBoundingClientRect();
      const target = {
        left: parent.left,
        top: parent.top,
        width: node.offsetWidth,
        height: node.offsetHeight,
      };
      const prior = seen.get(node);
      if (prior && sameBox(prior, target)) continue;
      const from = prior
        ? { box, opacity: getComputedStyle(node).opacity }
        : before.frames.get(node.dataset.libraryItemId!);
      plans.push({ node, target, from });
    }
    for (const { node, target, from } of plans) {
      animations.get(node)?.cancel();
      seen.set(node, target);
      node.style.transformOrigin = "top left";
      const start = from
        ? `translate(${from.box.left - target.left}px,${from.box.top - target.top}px) scale(${from.box.width / target.width},${from.box.height / target.height})`
        : "translateY(8px) scale(.97)";
      animations.set(
        node,
        node.animate(
          [
            { transform: start, opacity: from?.opacity ?? 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: ENTER_MS, easing: EASE, fill: "both" },
        ),
      );
    }
  };
  const schedule = () => {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    mutations.disconnect();
    resize.disconnect();
    root.removeEventListener(COMMITTED, onCommit);
    for (const [node, animation] of animations) {
      animation.cancel();
      node.style.removeProperty("transform-origin");
    }
    layer?.remove();
  };
  const onCommit = (event: Event) => {
    if ((event as CustomEvent<string>).detail !== revision) return;
    if (!committed) {
      committed = true;
      clearTimeout(timer);
      timer = window.setTimeout(stop, COMMIT_SETTLE_MS);
    }
    schedule();
  };
  const mutations = new MutationObserver(schedule);
  const resize = new ResizeObserver(schedule);
  mutations.observe(root, { childList: true, subtree: true });
  resize.observe(root);
  root.addEventListener(COMMITTED, onCommit);
  timer = window.setTimeout(stop, SETTLE_MS);
  schedule();
  return stop;
}

type Props = {
  rootRef: RefObject<HTMLElement | null>;
  revision: string;
  ids: string[];
  listMode: boolean;
  children: ReactNode;
};

// getSnapshotBeforeUpdate is the one point where the old result set is still
// painted and the new one is not: a hook cannot read the DOM that early.
export class ResultMotion extends Component<Props> {
  private stop = () => {};

  getSnapshotBeforeUpdate(previous: Props) {
    const { rootRef, revision, ids, listMode } = this.props;
    const root = rootRef.current;
    if (!root || previous.revision === revision || previous.listMode !== listMode) return null;
    return captureResults(root, previous.revision, new Set(ids));
  }

  componentDidUpdate(_previous: Props, _state: unknown, before: Before | null) {
    if (!before) return;
    this.stop();
    const root = this.props.rootRef.current;
    this.stop = root ? playResults(root, this.props.revision, before) : () => {};
  }

  componentWillUnmount() {
    this.stop();
  }

  render() {
    return this.props.children;
  }
}
