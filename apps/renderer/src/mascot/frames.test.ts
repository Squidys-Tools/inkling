import { describe, expect, test } from "bun:test";
import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { RAYON } from "./bot/repere";
import { SHAPE_BY_ID } from "./bot/skins";
import type { StateId } from "./bot/states";

// The mascot's motion is measured, not designed here: these frames pin it, so a
// refactor of the engine or the states must reproduce them to the pixel.

const nums = (text: string) => (text.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
const splash = SHAPE_BY_ID.get("inkling-splash")!.radii;
const neutre = EXPRESSION_BY_ID.get("neutre")!;

/** The outline's first point, then each eye's centre, then the notification dot's. */
const points = (frame: BotFrame) => [
  ...nums(frame.bodyPath).slice(0, 2),
  ...frame.eyes.flatMap((eye) => nums(eye.matrix).slice(4, 6)),
  ...(frame.notif ? [frame.notif.x, frame.notif.y] : []),
];

function expectFrame(frame: BotFrame, expected: number[], dots: number, arcs: number) {
  const actual = points(frame);
  expect(actual).toHaveLength(expected.length);
  for (const [i, value] of expected.entries()) expect(actual[i]!).toBeCloseTo(value, 1);
  expect(frame.dots).toHaveLength(dots);
  expect(frame.arcs).toHaveLength(arcs);
}

const AT_1_3: Array<[StateId, number[], number, number]> = [
  ["idle", [97.32, 0.27, 14.06, -30.91, 49.66, -36.61], 0, 0],
  ["thinking", [15.25, 0.27], 2, 0],
  ["wink", [97.32, 0.27, -32.75, -12.54, 21.47, -6.88], 0, 0],
  ["wide", [97.32, 0.27, -17.46, 28.03, 37.79, 33.97], 0, 0],
  ["alert", [85.39, -28.63], 1, 0],
  ["notify", [97.32, 0.27, -24.2, -4.48, 26.21, -16.5, 66.77, -59.81], 0, 0],
  ["exclaim", [10.44, -18.48], 1, 0],
  ["sleep", [15.9, 27.72], 0, 0],
  ["egg", [83.74, 0.27, 15.54, -39.02, 42.34, -44.25], 0, 0],
  ["hexagon", [92.15, 0.27, 16.05, -34.99, 55.84, -47.13], 0, 0],
  ["play", [78.24, 21.57, -1.77, 10.04, 40.91, 7.12], 0, 4],
  ["orbit", [-70.3, 40.68, 65.98, 7.56], 0, 6],
  ["swirl", [97.32, 0.27, 14.06, -30.91, 49.66, -36.61], 0, 0],
  ["burst", [16.65, 0.27], 1, 0],
  ["comet", [12.95, 2.62], 0, 4],
  ["inkling-sway", [96.85, 9.85, 14.78, -32.39, 49.55, -36.51], 0, 0],
  ["inkling-drift", [95.63, 34.22, 7.92, -45.52, 40.69, -52.8], 0, 0],
  ["inkling-drift-faced", [95.63, 34.22, 18.12, -40.47, 59.9, -51.12], 0, 0],
];

describe("mascot frames", () => {
  test.each(AT_1_3)("%s on the splash body", (state, expected, dots, arcs) => {
    expectFrame(new BotEngine(RAYON, state, splash, neutre).sample(1.3), expected, dots, arcs);
  });

  test("a change mid-morph blends from the frame on screen", () => {
    const engine = new BotEngine(RAYON, "idle", splash, neutre);
    engine.setState("wide", 0.5);
    engine.setState("idle", 0.6);
    engine.setShape(SHAPE_BY_ID.get("cercle")!.radii, 0.6);
    engine.setExpression(EXPRESSION_BY_ID.get("colere")!, 0.6);
    expectFrame(engine.sample(0.75), [99.47, 0.25, -12.3, -14.97, 44.26, -16.9], 0, 0);
  });
});
