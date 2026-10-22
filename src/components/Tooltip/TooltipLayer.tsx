import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./Tooltip.css";

// One tooltip for the whole app. Controls opt in with `data-tooltip="…"` (in
// place of `title`, whose native tooltip is slow and ignores the theme), and
// this layer shows it on hover after a beat, or at once on keyboard focus.
// Moving straight from one control to the next skips the wait.

const SHOW_DELAY_MS = 500;
// Within this long of one tooltip closing, the next opens without the delay.
const SKIP_DELAY_MS = 400;
const GAP = 8;
const EDGE = 6;
// Anchors in this chrome sit over the library stage, where liquid glass can
// draw the tooltip (LiquidGlass.tsx). Anywhere else the stage is not behind
// it, so it keeps the CSS glass.
const LIQUID_ANCHORS = ".capture-bar, .view-dock";

type Tip = { anchor: HTMLElement; text: string };

export function TooltipLayer({ ref }: { ref: RefObject<HTMLDivElement | null> }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    let timer = 0;
    let closedAt = 0;
    let current: HTMLElement | null = null;
    const show = (anchor: HTMLElement, immediate: boolean) => {
      const text = anchor.dataset.tooltip;
      if (!text) return;
      current = anchor;
      window.clearTimeout(timer);
      const open = () => setTip({ anchor, text });
      if (immediate || performance.now() - closedAt < SKIP_DELAY_MS) open();
      else timer = window.setTimeout(open, SHOW_DELAY_MS);
    };
    const hide = () => {
      window.clearTimeout(timer);
      if (current) closedAt = performance.now();
      current = null;
      setTip(null);
    };
    const anchorOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>("[data-tooltip]") : null;

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const anchor = anchorOf(event.target);
      if (anchor === current) return;
      if (current) hide();
      if (anchor) show(anchor, false);
    };
    const onOut = (event: PointerEvent) => {
      if (!current) return;
      const next = event.relatedTarget;
      if (next instanceof Node && current.contains(next)) return;
      hide();
    };
    const onFocus = (event: FocusEvent) => {
      const anchor = anchorOf(event.target);
      if (anchor && anchor === event.target && anchor.matches(":focus-visible")) show(anchor, true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", hide, { capture: true, passive: true });
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // A control whose label changes while hovered (Star → Unstar) updates in place.
  useEffect(() => {
    if (!tip) return;
    const observer = new MutationObserver(() => {
      const text = tip.anchor.dataset.tooltip;
      if (!text || !tip.anchor.isConnected) setTip(null);
      else if (text !== tip.text) setTip({ ...tip, text });
    });
    observer.observe(tip.anchor, { attributes: true, attributeFilter: ["data-tooltip"] });
    return () => observer.disconnect();
  }, [tip]);

  // Below the control, or above it when there is no room (the view dock).
  useLayoutEffect(() => {
    const element = tipRef.current;
    if (!tip || !element) {
      setPlacement(null);
      return;
    }
    const anchor = tip.anchor.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    const below = anchor.bottom + GAP;
    const top = below + height > window.innerHeight - EDGE ? anchor.top - GAP - height : below;
    const left = Math.min(
      Math.max(EDGE, anchor.left + anchor.width / 2 - width / 2),
      window.innerWidth - EDGE - width,
    );
    setPlacement({ left, top });
  }, [tip]);

  const liquid = tip?.anchor.closest(LIQUID_ANCHORS) != null;
  return (
    <div ref={ref} className="tooltip-layer" aria-hidden="true">
      {tip && (
        <div
          ref={tipRef}
          className={`tooltip ${liquid ? "glass" : "css-glass"}`}
          style={placement ?? { visibility: "hidden" }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
