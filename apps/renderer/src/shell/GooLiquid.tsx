import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import { color } from "@inkling/ui/tokens.stylex";
import { animateUncapped } from "../cards/cardFx.ts";

const height = 34;
// Body blobs this close merge into one solid body, as the card ring's do.
const spacing = 6;
const bodyRadius = 12;
// Underdamped, so the front overshoots each new progress a little and settles.
const stiffness = 60;
const damping = 9;

type Blob = { x: number; y: number; r: number };

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (low: number, high: number, value: number) => {
  const amount = clamp((value - low) / (high - low));
  return amount * amount * (3 - 2 * amount);
};

/** The body stops 10px short of the front; lobes and a droplet beyond it make the edge slosh. */
function blobsFor(seconds: number, front: number, width: number): Blob[] {
  const blobs: Blob[] = [];
  for (let x = spacing / 2; x < Math.min(width, front - 10); x += spacing) {
    blobs.push({ x, y: height / 2 + 2.5 * Math.sin(seconds * 1.4 + x * 0.3), r: bodyRadius });
  }
  const grow = smooth(0, 6, front);
  if (grow > 0) {
    blobs.push({
      x: front - 4 + 3 * Math.sin(seconds * 1.9 + 0.5),
      y: height / 2 - 7 + 2 * Math.sin(seconds * 1.3),
      r: 6 * grow,
    });
    blobs.push({
      x: front - 3 + 3 * Math.sin(seconds * 2.3 + 2.1),
      y: height / 2 + 7 + 2 * Math.sin(seconds * 1.7 + 1),
      r: 6 * grow,
    });
    blobs.push({
      x: front + 1 + 4 * Math.sin(seconds * 2.6),
      y: height / 2 + 2 * Math.sin(seconds * 3.1),
      r: 5 * grow,
    });
    blobs.push({
      x: front + 8 + 3 * Math.sin(seconds * 3.4),
      y: height / 2 - 3 + 2 * Math.sin(seconds * 2.2),
      r: 3.2 * smooth(4, 14, front),
    });
  }
  return blobs;
}

function drawBar(context: CanvasRenderingContext2D, image: ImageData, blobs: Blob[], ink: string) {
  const [red = 0, green = 0, blue = 0] = ink.match(/[\d.]+/g)?.map(Number) ?? [];
  const { width, height: rows, data } = image;
  for (let row = 0; row < rows; row++) {
    const y = row + 0.5;
    for (let column = 0; column < width; column++) {
      const x = column + 0.5;
      let field = 0;
      for (const blob of blobs) {
        const dx = x - blob.x;
        const dy = y - blob.y;
        field += (blob.r * blob.r) / (dx * dx + dy * dy + 1e-4);
      }
      const offset = (row * width + column) * 4;
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = smooth(0.9, 1.3, field) * 255;
    }
  }
  context.putImageData(image, 0, 0);
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
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const width = Math.max(1, canvas.clientWidth);
    canvas.width = width;
    canvas.height = height;
    const image = context.createImageData(width, height);
    const ink = getComputedStyle(canvas).color;
    const toPixels = (percent: number) => clamp(percent / 100) * width;
    const draw = (seconds: number, front: number) =>
      drawBar(context, image, blobsFor(seconds, front, width), ink);
    const spring = { front: toPixels(target.current), speed: 0, last: null as number | null };
    const run = animateUncapped((now) => {
      const step = spring.last === null ? 0 : Math.min(1 / 30, now - spring.last);
      spring.last = now;
      spring.speed +=
        ((toPixels(target.current) - spring.front) * stiffness - spring.speed * damping) * step;
      spring.front = Math.min(width, Math.max(0, spring.front + spring.speed * step));
      draw(now, spring.front);
    });
    if (!run.animated) {
      redraw.current = () => {
        spring.front = toPixels(target.current);
        draw(performance.now() / 1000, spring.front);
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
