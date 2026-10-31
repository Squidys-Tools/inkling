/* oxlint-disable unicorn/no-array-fill-with-reference-type -- every fill here is CanvasRenderingContext2D.fill, not Array.fill. */
import type { BotFrame } from "./bot/engine";
import { DEMI_VIEWBOX, RAYON } from "./bot/repere";
import { mixHex } from "./bot/skins";

/** The part of the engine's coordinate space a canvas shows. */
export type View = { x: number; y: number; width: number; height: number };

/** Room for every state's motion, the orbit rings included. */
const FIGURE_VIEW: View = {
  x: -DEMI_VIEWBOX,
  y: -DEMI_VIEWBOX,
  width: DEMI_VIEWBOX * 2,
  height: DEMI_VIEWBOX * 2,
};

/** A tight crop around the drift gaze, so the eyes sit centred in the search field. */
export const EYES_VIEW: View = { x: -14, y: -88, width: 78, height: 80 };

/** Hex colors: dots fade toward the paper by mixing channels. `paper: null` leaves the eyes see-through. */
export type MascotPaint = { ink: string; paper: string | null; notification: string };

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function viewTransform(ctx: Context, view: View) {
  const scale = ctx.canvas.width / view.width;
  ctx.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);
}

function fillEyes(ctx: Context, frame: BotFrame) {
  for (const eye of frame.eyes) {
    // The engine writes `matrix(a,b,c,d,e,f)`, the SVG transform it was built for.
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = eye.matrix
      .slice(7, -1)
      .split(",")
      .map(Number);
    ctx.save();
    ctx.globalAlpha = eye.alpha;
    ctx.transform(a, b, c, d, e, f);
    ctx.fill(new Path2D(eye.d));
    ctx.restore();
  }
}

/**
 * The bloub recipe on a canvas: the eyes and the notification notch are holes
 * cut through the body on `layer`, with the paper filled in behind them, so
 * decor drawn behind the body never shows through the eyes.
 */
function drawBody(
  ctx: CanvasRenderingContext2D,
  layer: OffscreenCanvas,
  frame: BotFrame,
  paint: MascotPaint,
) {
  const body = new Path2D(frame.bodyPath);
  const lctx = layer.getContext("2d");
  if (!lctx) return;
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.clearRect(0, 0, layer.width, layer.height);
  lctx.setTransform(ctx.getTransform());
  lctx.globalCompositeOperation = "source-over";
  lctx.globalAlpha = 1;
  lctx.fillStyle = paint.ink;
  lctx.fill(body);
  lctx.globalCompositeOperation = "destination-out";
  fillEyes(lctx, frame);
  if (frame.notch) {
    lctx.beginPath();
    lctx.arc(frame.notch.x, frame.notch.y, frame.notch.r, 0, Math.PI * 2);
    lctx.fill();
  }
  if (paint.paper) {
    lctx.globalCompositeOperation = "destination-over";
    lctx.fillStyle = paint.paper;
    lctx.fill(body);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = frame.bodyAlpha;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function drawDots(ctx: CanvasRenderingContext2D, frame: BotFrame, paint: MascotPaint) {
  for (const dot of frame.dots) {
    ctx.globalAlpha = dot.opacity;
    ctx.fillStyle =
      dot.color ??
      (dot.depth === undefined
        ? paint.ink
        : mixHex(paint.paper ?? paint.ink, paint.ink, dot.depth));
    if (dot.d) {
      ctx.save();
      ctx.translate(dot.x, dot.y);
      ctx.rotate(((dot.rot ?? 0) * Math.PI) / 180);
      ctx.scale(RAYON, RAYON);
      ctx.fill(new Path2D(dot.d));
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function strokeArcs(ctx: CanvasRenderingContext2D, frame: BotFrame, side: "back" | "front") {
  ctx.lineCap = "round";
  for (const arc of frame.arcs) {
    const { x1, y1, x2, y2, stops } = arc.grad;
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    for (const [i, stop] of stops.entries())
      gradient.addColorStop(i / Math.max(1, stops.length - 1), stop);
    ctx.globalAlpha = arc.opacity;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = arc.width;
    ctx.stroke(new Path2D(arc[side]));
  }
  ctx.globalAlpha = 1;
}

/** Draws a whole frame. `layer` must match the canvas's size. */
export function drawFigure(
  ctx: CanvasRenderingContext2D,
  layer: OffscreenCanvas,
  frame: BotFrame,
  paint: MascotPaint,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  viewTransform(ctx, FIGURE_VIEW);
  strokeArcs(ctx, frame, "back");
  if (frame.dotsBehind) drawDots(ctx, frame, paint);
  drawBody(ctx, layer, frame, paint);
  if (!frame.dotsBehind) drawDots(ctx, frame, paint);
  if (frame.notif) {
    ctx.fillStyle = paint.notification;
    ctx.beginPath();
    ctx.arc(frame.notif.x, frame.notif.y, frame.notif.r, 0, Math.PI * 2);
    ctx.fill();
  }
  strokeArcs(ctx, frame, "front");
}

/** Draws the eyes alone, filled with `ink`, for the search field. */
export function drawEyes(ctx: CanvasRenderingContext2D, frame: BotFrame, ink: string) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  viewTransform(ctx, EYES_VIEW);
  ctx.fillStyle = ink;
  fillEyes(ctx, frame);
}
