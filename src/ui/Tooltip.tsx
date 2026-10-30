import { Tooltip } from "@base-ui/react/tooltip";
import { type RefObject, useEffect, useState } from "react";
import { glassClass } from "./Surface";

// One tooltip for the whole app. Controls opt in with `data-tooltip="…"` (in
// place of `title`, whose native tooltip is slow and ignores the theme), and
// this layer shows it on hover after a beat, or at once on keyboard focus.
// Moving straight from one control to the next skips the wait.

const SHOW_DELAY_MS = 500;
const SKIP_DELAY_MS = 400;
// Anchors in this chrome sit over the library stage, where liquid glass can
// draw the tooltip (LiquidGlass.tsx). Anywhere else the stage is not behind
// it, so it keeps the CSS glass.
const LIQUID_ANCHORS = ".capture-bar, .view-dock";

type Tip = { anchor: HTMLElement; text: string };

export function TooltipLayer({ ref }: { ref: RefObject<HTMLDivElement | null> }) {
  const [tip, setTip] = useState<Tip | null>(null);

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

  const liquid = tip?.anchor.closest(LIQUID_ANCHORS) != null;
  return (
    <div ref={ref} className="pointer-events-none fixed inset-0 z-2000" aria-hidden="true">
      <Tooltip.Root open={tip != null} onOpenChange={(open) => open || setTip(null)}>
        {/* Never leave an empty painted popup while an anchor moves/unmounts. */}
        {tip && (
          <Tooltip.Portal container={ref}>
            <Tooltip.Positioner
              anchor={tip?.anchor}
              side="bottom"
              sideOffset={8}
              collisionPadding={6}
              collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
              positionMethod="fixed"
            >
              <Tooltip.Popup
                className={`${glassClass(liquid)} max-w-[280px] rounded-[9px] px-2.5 py-1.5 font-body text-[12px] leading-4 font-medium text-ink transition-opacity duration-120 ease-out data-starting-style:opacity-0 motion-reduce:transition-none`}
              >
                {tip?.text}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        )}
      </Tooltip.Root>
    </div>
  );
}
