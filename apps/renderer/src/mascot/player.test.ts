import { describe, expect, test } from "bun:test";
import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { RAYON } from "./bot/repere";
import { SHAPE_BY_ID } from "./bot/skins";
import type { MotionEnvironment } from "./motion.ts";
import { MascotPlayer } from "./player.ts";

function fakeMotion() {
  const frames = new Map<number, (ms: number) => void>();
  const listeners = new Set<() => void>();
  let handles = 0;
  const state = { reduced: false, hidden: false };
  const env: MotionEnvironment = {
    reducedMotion: () => state.reduced,
    hidden: () => state.hidden,
    requestFrame: (callback) => {
      frames.set(++handles, callback);
      return handles;
    },
    cancelFrame: (handle) => void frames.delete(handle),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  const change = (next: Partial<typeof state>) => {
    Object.assign(state, next);
    for (const listener of listeners) listener();
  };
  return { env, change, frames, listeners };
}

const rest = { state: "inkling-drift", expression: "neutre" } as const;

describe("MascotPlayer", () => {
  // regression: under reduced motion the clock stood still, so a mood change
  // painted the first frame of its morph, the old pose, and never the sad face.
  // Moving the clock instead could stop it inside a blink, eyes shut.
  test("a change under reduced motion paints its final pose, eyes open", () => {
    const motion = fakeMotion();
    motion.change({ reduced: true });
    const player = new MascotPlayer(motion.env, rest);
    const painted: BotFrame[] = [];
    player.attach((frame) => painted.push(frame)).setVisible(true);

    for (let change = 0; change < 13; change++) {
      player.setPose({ state: "notify", expression: change % 2 ? "attentif" : "neutre" });
      player.setPose({ state: "idle", expression: "triste" });
    }

    const sad = new BotEngine(
      RAYON,
      "idle",
      SHAPE_BY_ID.get("inkling-splash")!.radii,
      EXPRESSION_BY_ID.get("triste")!,
    ).sample(0);
    expect(painted.at(-1)?.bodyPath).toBe(sad.bodyPath);
    expect(painted.at(-1)?.eyes).toEqual(sad.eyes);
    expect(motion.frames.size).toBe(0);
  });

  test("runs its frame loop only while a canvas is visible, the page shown and motion allowed", () => {
    const motion = fakeMotion();
    const player = new MascotPlayer(motion.env, rest);
    const canvas = player.attach(() => {});
    expect(motion.frames.size).toBe(0);

    canvas.setVisible(true);
    expect(motion.frames.size).toBe(1);
    motion.change({ hidden: true });
    expect(motion.frames.size).toBe(0);
    motion.change({ hidden: false });
    expect(motion.frames.size).toBe(1);
    motion.change({ reduced: true });
    expect(motion.frames.size).toBe(0);
    motion.change({ reduced: false });
    canvas.setVisible(false);
    expect(motion.frames.size).toBe(0);

    canvas.detach();
    expect(motion.listeners.size).toBe(0);
  });
});
