import { describe, expect, test } from "bun:test";
import { BotEngine, type BotFrame } from "./bot/engine";
import type { RenderedEye } from "./bot/eyes";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { RAYON } from "./bot/repere";
import { SHAPE_BY_ID } from "./bot/skins";
import type { StateId } from "./bot/states";
import { eyesView } from "./draw";

const nums = (text: string) => (text.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

/** The rendered body outline, sampled along its Bezier segments. */
function outline(frame: BotFrame) {
  const n = nums(frame.bodyPath);
  const pts: [number, number][] = [];
  let x0 = n[0]!;
  let y0 = n[1]!;
  for (let i = 2; i + 5 < n.length; i += 6) {
    const [c1x, c1y, c2x, c2y, x3, y3] = n.slice(i, i + 6) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let s = 0; s < 8; s++) {
      const t = s / 8;
      const u = 1 - t;
      pts.push([
        u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y3,
      ]);
    }
    x0 = x3;
    y0 = y3;
  }
  return pts;
}

/** Distance from the body's centre to its outline along `angle` (the drift body sits at the origin). */
function edgeAt(pts: [number, number][], angle: number) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    const ex = x2 - x1;
    const ey = y2 - y1;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (x1 * ey - y1 * ex) / den;
    const u = (x1 * dy - y1 * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

/** Points along an eye's painted outline, blink included. */
function eyeOutline(eye: RenderedEye) {
  const [a, b, c, d, e, f] = nums(eye.matrix) as [number, number, number, number, number, number];
  const path = nums(eye.d);
  const hw = Math.abs(path[0]!);
  const r = path[2]!;
  const hh = r - path[1]!;
  const pts: [number, number][] = [];
  for (let k = 0; k < 32; k++) {
    const angle = (k / 32) * Math.PI * 2;
    const px = Math.sign(Math.cos(angle)) * (hw - r) + r * Math.cos(angle);
    const py = Math.sign(Math.sin(angle)) * (hh - r) + r * Math.sin(angle);
    pts.push([a * px + c * py + e, b * px + d * py + f]);
  }
  return pts;
}

/** Smallest gap, in ball radii, between any eye's outline and the body's edge. */
function eyeGap(frame: BotFrame) {
  const body = outline(frame);
  let gap = Number.POSITIVE_INFINITY;
  for (const [x, y] of frame.eyes.flatMap(eyeOutline))
    gap = Math.min(gap, (edgeAt(body, Math.atan2(y, x)) - Math.hypot(x, y)) / RAYON);
  return gap;
}

function smallestGap(state: StateId, faces: string[], look: { yaw: number; pitch: number } | null) {
  const engine = new BotEngine(
    RAYON,
    state,
    SHAPE_BY_ID.get("inkling-splash")?.radii ?? null,
    null,
  );
  if (look) engine.setLook({ ...look, mix: 1, wander: 0.35 }, -10);
  let face = -1;
  let gap = Number.POSITIVE_INFINITY;
  for (let t = 0; t < 120; t += 0.1) {
    const next = Math.floor(t / 3.4) % faces.length;
    if (next !== face) {
      face = next;
      engine.setExpression(EXPRESSION_BY_ID.get(faces[face]!) ?? null, t);
    }
    gap = Math.min(gap, eyeGap(engine.sample(t)));
  }
  return gap;
}

// The drifting body walks lobes under a face that holds still. Whatever the
// face or where it looks, the eyes should never crowd or cross the edge.
describe("drift face margin", () => {
  test("the sidebar mascot keeps its eyes inside the body", () => {
    expect(smallestGap("inkling-drift", ["neutre"], null)).toBeGreaterThan(0.08);
  });

  test("the welcome mascots keep their eyes inside through every face", () => {
    expect(
      smallestGap("inkling-drift-faced", ["neutre", "curieux", "heureux", "attentif"], {
        yaw: -15,
        pitch: 24,
      }),
    ).toBeGreaterThan(0.08);
    expect(
      smallestGap("inkling-drift-faced", ["heureux", "neutre", "fier", "timide"], {
        yaw: 30,
        pitch: 12,
      }),
    ).toBeGreaterThan(0.08);
  });
});

// The search field draws only the eyes, cropped from wherever the pose puts the
// face. Busy, a failed capture and reduced motion each move it out of drift's spot.
describe("search field eyes", () => {
  test("every pose shown while search has focus keeps both eyes inside the crop", () => {
    const engine = new BotEngine(
      RAYON,
      "inkling-drift",
      SHAPE_BY_ID.get("inkling-splash")?.radii ?? null,
      EXPRESSION_BY_ID.get("attentif") ?? null,
    );
    const poses: Array<[StateId, string]> = [
      ["notify", "attentif"],
      ["idle", "triste"],
      ["inkling-sway", "attentif"],
      ["inkling-sway", "curieux"],
      ["inkling-drift", "curieux"],
      ["notify", "curieux"],
    ];
    let margin = Number.POSITIVE_INFINITY;
    let offCentre = 0;
    for (const [i, [state, face]] of poses.entries()) {
      engine.setState(state, i * 3);
      engine.setExpression(EXPRESSION_BY_ID.get(face) ?? null, i * 3);
      for (let t = i * 3; t < i * 3 + 3; t += 1 / 30) {
        const frame = engine.sample(t);
        const view = eyesView(frame);
        const pts = frame.eyes.flatMap(eyeOutline);
        const xs = pts.map(([x]) => x);
        const ys = pts.map(([, y]) => y);
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        margin = Math.min(
          margin,
          left - view.x,
          view.x + view.width - right,
          Math.min(...ys) - view.y,
          view.y + view.height - Math.max(...ys),
        );
        // A blink squashes each eye about its own centre, so the pair stays centred across.
        offCentre = Math.max(offCentre, Math.abs((left + right) / 2 - (view.x + view.width / 2)));
      }
    }
    // The crop pads the eyes' box by 4 on its tightest side, so less means the box is off.
    expect(margin).toBeGreaterThan(3.5);
    expect(offCentre).toBeLessThan(1);
  });
});
