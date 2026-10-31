import { useSyncExternalStore } from "react";
import type { BotFrame } from "./bot/engine";
import type { MascotPlayer } from "./player.ts";

// A resolution query matches one ratio only, so each change re-arms it for the new one.
function subscribePixelRatio(listener: () => void) {
  let query: MediaQueryList | undefined;
  const onChange = () => {
    watch();
    listener();
  };
  const watch = () => {
    query?.removeEventListener("change", onChange);
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener("change", onChange);
  };
  watch();
  return () => query?.removeEventListener("change", onChange);
}

/**
 * A ref for a canvas that `player` paints while it is on screen and `visible`.
 * Sizes are CSS pixels; the backing store follows the display's pixel ratio.
 * An IntersectionObserver reports when it is on screen, so the frame loop never
 * reads layout.
 */
export function useMascotCanvas(
  player: MascotPlayer,
  width: number,
  height: number,
  visible: boolean,
  paint: (ctx: CanvasRenderingContext2D, layer: OffscreenCanvas, frame: BotFrame) => void,
) {
  const ratio = useSyncExternalStore(
    subscribePixelRatio,
    () => window.devicePixelRatio,
    () => 1,
  );
  return (canvas: HTMLCanvasElement | null) => {
    if (!canvas || !visible) return;
    // Assigning a size clears the canvas, even an unchanged one.
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const layer = new OffscreenCanvas(canvas.width, canvas.height);
    const attachment = player.attach((frame) => paint(ctx, layer, frame));
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) attachment.setVisible(entry.isIntersecting);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      attachment.detach();
    };
  };
}
