import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import { color } from "@inkling/ui/tokens.stylex";
import { animateUncapped } from "../cards/cardFx.ts";
import { paintGooAlpha } from "./gooCpu.ts";
import { gooHeight, inkRgb } from "./gooField.ts";
import { paintGooGl } from "./gooGl.ts";

// Underdamped, so the front overshoots each new progress a little and settles.
const stiffness = 60;
const damping = 9;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Paints on the shared WebGL context, and on the CPU for any frame WebGL cannot draw. */
function createGoo(canvas: HTMLCanvasElement) {
  const width = Math.max(1, canvas.clientWidth);
  canvas.width = width;
  canvas.height = gooHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const ink = inkRgb(getComputedStyle(canvas).color);
  let image: ImageData | null = null;
  return {
    width,
    draw(seconds: number, front: number) {
      if (paintGooGl(context, width, seconds, front, ink)) return;
      if (!image) {
        image = context.createImageData(width, gooHeight);
        for (let index = 0; index < image.data.length; index += 4) image.data.set(ink, index);
      }
      paintGooAlpha(image.data, width, seconds, front);
      context.putImageData(image, 0, 0);
    },
  };
}

/** A download's progress as the card's gooey ink, filling the row from the left. */
export function GooLiquid({ progress }: { progress: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef(progress);
  // Only set when no frame loop runs (reduced motion), so each progress redraws.
  const redraw = useRef<() => void>(() => {});
  useEffect(() => {
    target.current = progress;
    redraw.current();
  }, [progress]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createGoo(canvas);
    if (!renderer) return;
    const width = renderer.width;
    const toPixels = (percent: number) => clamp(percent / 100) * width;
    const spring = { front: toPixels(target.current), speed: 0, last: null as number | null };
    const run = animateUncapped((now) => {
      const step = spring.last === null ? 0 : Math.min(1 / 30, now - spring.last);
      spring.last = now;
      spring.speed +=
        ((toPixels(target.current) - spring.front) * stiffness - spring.speed * damping) * step;
      spring.front = Math.min(width, Math.max(0, spring.front + spring.speed * step));
      renderer.draw(now, spring.front);
    });
    if (!run.animated) {
      redraw.current = () => {
        spring.front = toPixels(target.current);
        renderer.draw(performance.now() / 1000, spring.front);
      };
    }
    return () => {
      redraw.current = () => {};
      run.stop();
    };
  }, []);
  return <canvas ref={canvasRef} aria-hidden="true" {...stylex.props(styles.liquid)} />;
}

const styles = stylex.create({
  liquid: {
    display: "block",
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    color: color.ink,
    // Difference inverts the label and icon where the ink lies beneath them, keeping them legible.
    mixBlendMode: "difference",
    pointerEvents: "none",
  },
});
