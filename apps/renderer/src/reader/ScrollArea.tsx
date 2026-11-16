import * as stylex from "@stylexjs/stylex";
import { color, motion, radius } from "@inkling/ui/tokens.stylex";
import {
  type PointerEvent,
  type ReactNode,
  type Ref,
  type UIEvent,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { scrollAreaMarker, scrollTrackMarker } from "../markers.stylex.ts";

const FADE = 28;
const MIN_THUMB = 28;
const LINGER = 900;

/**
 * Native vertical scrolling with a thin overlay scrollbar that shows while
 * scrolling or under the pointer, and edges that fade only where more is hidden.
 * Thumb and fades are written to the DOM, so scrolling never re-renders.
 */
export function ScrollArea({
  children,
  viewportRef,
  onScroll,
  viewportStyle,
  trackStyle,
}: {
  children: ReactNode;
  viewportRef?: Ref<HTMLDivElement>;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  viewportStyle?: stylex.StyleXStyles;
  trackStyle?: stylex.StyleXStyles;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const linger = useRef<number | undefined>(undefined);
  const drag = useRef<{ startY: number; startTop: number; ratio: number } | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [dragging, setDragging] = useState(false);
  useImperativeHandle(viewportRef, () => viewport.current as HTMLDivElement);

  const sync = () => {
    const node = viewport.current;
    if (!node) return;
    const { scrollTop, scrollHeight, clientHeight } = node;
    const max = Math.max(0, scrollHeight - clientHeight);
    const top = Math.min(FADE, scrollTop);
    const bottom = Math.min(FADE, max - scrollTop);
    node.style.maskImage = `linear-gradient(to bottom, transparent, black ${top}px, black calc(100% - ${bottom}px), transparent)`;
    setOverflowing(max > 0.5);
    const bar = track.current;
    const pill = thumb.current;
    if (!bar || !pill || max <= 0.5) return;
    const length = bar.clientHeight;
    const size = Math.max(MIN_THUMB, (length * clientHeight) / scrollHeight);
    pill.style.height = `${size}px`;
    pill.style.transform = `translate3d(0, ${(length - size) * (scrollTop / max)}px, 0)`;
  };

  useLayoutEffect(() => {
    sync();
    const observer = new ResizeObserver(() => sync());
    if (viewport.current) observer.observe(viewport.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
    // Once: sync reads only refs, and the observer covers every later size change.
  }, []);

  useEffect(() => () => window.clearTimeout(linger.current), []);

  const wake = () => {
    setScrolling(true);
    window.clearTimeout(linger.current);
    linger.current = window.setTimeout(() => setScrolling(false), LINGER);
  };

  const onThumbDown = (event: PointerEvent<HTMLDivElement>) => {
    const node = viewport.current;
    const bar = track.current;
    const pill = thumb.current;
    if (!node || !bar || !pill || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const travel = Math.max(1, bar.clientHeight - pill.offsetHeight);
    drag.current = {
      startY: event.clientY,
      startTop: node.scrollTop,
      ratio: (node.scrollHeight - node.clientHeight) / travel,
    };
    setDragging(true);
  };
  const onThumbMove = (event: PointerEvent<HTMLDivElement>) => {
    const node = viewport.current;
    if (!drag.current || !node) return;
    node.scrollTop =
      drag.current.startTop + (event.clientY - drag.current.startY) * drag.current.ratio;
  };
  const onThumbUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    wake();
  };
  // Pressing the track beside the thumb pages toward the pointer.
  const onTrackDown = (event: PointerEvent<HTMLDivElement>) => {
    const node = viewport.current;
    const pill = thumb.current;
    if (!node || !pill || event.button !== 0 || event.target !== event.currentTarget) return;
    const above = event.clientY < pill.getBoundingClientRect().top;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollBy({
      top: node.clientHeight * 0.9 * (above ? -1 : 1),
      behavior: reduce ? "auto" : "smooth",
    });
  };

  const awake = scrolling || dragging;
  return (
    <div {...stylex.props(styles.root, scrollAreaMarker)}>
      <div
        ref={viewport}
        onScroll={(event) => {
          sync();
          wake();
          onScroll?.(event);
        }}
        {...stylex.props(styles.viewport, viewportStyle)}
      >
        <div ref={content}>{children}</div>
      </div>
      <div
        ref={track}
        aria-hidden="true"
        onPointerDown={onTrackDown}
        {...stylex.props(
          styles.track,
          scrollTrackMarker,
          awake && styles.trackAwake,
          !overflowing && styles.trackUnused,
          trackStyle,
        )}
      >
        <div
          ref={thumb}
          onPointerDown={onThumbDown}
          onPointerMove={onThumbMove}
          onPointerUp={onThumbUp}
          onPointerCancel={onThumbUp}
          {...stylex.props(styles.thumb)}
        >
          <span {...stylex.props(styles.pill, dragging && styles.pillHot)} />
        </div>
      </div>
    </div>
  );
}

const styles = stylex.create({
  root: {
    position: "relative",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  viewport: {
    height: "100%",
    overflowX: "hidden",
    overflowY: "auto",
    scrollbarWidth: "none",
    "::-webkit-scrollbar": { display: "none" },
  },
  // A generous, invisible hit area around the thin pill.
  track: {
    position: "absolute",
    top: "3px",
    right: "1px",
    bottom: "3px",
    zIndex: 1,
    width: "11px",
    touchAction: "none",
    opacity: { default: 0, [stylex.when.ancestor(":hover", scrollAreaMarker)]: 1 },
    pointerEvents: { default: "none", [stylex.when.ancestor(":hover", scrollAreaMarker)]: "auto" },
    // Appears quickly, lingers on the way out.
    transitionProperty: "opacity",
    transitionDuration: {
      default: `calc(${motion.micro} * 3.2)`,
      [stylex.when.ancestor(":hover", scrollAreaMarker)]: motion.micro,
    },
    transitionTimingFunction: motion.standard,
  },
  trackAwake: { opacity: 1, pointerEvents: "auto", transitionDuration: motion.micro },
  trackUnused: { visibility: "hidden" },
  thumb: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    willChange: "transform",
  },
  pill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: { default: "3px", [stylex.when.ancestor(":hover", scrollTrackMarker)]: "2px" },
    width: { default: "5px", [stylex.when.ancestor(":hover", scrollTrackMarker)]: "7px" },
    borderRadius: radius.round,
    backgroundColor: {
      default: color.scrollThumb,
      [stylex.when.ancestor(":hover", scrollTrackMarker)]: color.scrollThumbHot,
    },
    transitionProperty: "width, right, background-color",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.standard,
  },
  pillHot: {
    right: "2px",
    width: "7px",
    backgroundColor: color.scrollThumbHot,
  },
});
