import { describe, expect, test } from "bun:test";
import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { liveliness } from "./bot/face";
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

  // regression: the always-visible 44px sidebar figure repainted every display
  // frame while idle and kept the GPU process near full load.
  test("an idle figure rests after a while and wakes on a change or a pointer", () => {
    const motion = fakeMotion();
    const player = new MascotPlayer(motion.env, rest);
    let paints = 0;
    player.attach(() => paints++).setVisible(true);
    const run = (ms: number) => {
      for (let t = 0; t <= ms && motion.frames.size; t += 16) {
        const [handle, tick] = [...motion.frames][0]!;
        motion.frames.delete(handle);
        tick((now += 16));
      }
    };
    let now = 1000;
    run(5000);
    expect(motion.frames.size).toBe(0);
    const rested = paints;
    run(1000);
    expect(paints).toBe(rested);

    player.wake();
    expect(motion.frames.size).toBe(1);
    run(5000);
    expect(motion.frames.size).toBe(0);
    player.setPose({ state: "notify", expression: "attentif" });
    expect(motion.frames.size).toBe(1);
  });

  test("resting during a blink waits for open eyes before stopping", () => {
    const motion = fakeMotion();
    const player = new MascotPlayer(motion.env, rest);
    const eyes = player.attach(() => {}, { live: true });
    const figure = player.attach(() => {});
    figure.setVisible(true);
    eyes.setVisible(true);
    let now = 1000;
    const step = () => {
      const [handle, tick] = [...motion.frames][0]!;
      motion.frames.delete(handle);
      tick((now += 16));
    };
    for (let i = 0; i < 501; i++) step();
    // Expire the wake budget, then seek a later blink at its current clock.
    let atBlink = false;
    for (let i = 0; i < 400 && !atBlink; i++) {
      step();
      atBlink = liveliness((now - 1016) / 1000).lid < 0.8;
    }
    expect(atBlink).toBe(true);
    eyes.setVisible(false);
    expect(motion.frames.size).toBe(1);
    for (let i = 0; i < 20 && motion.frames.size; i++) step();
    expect(motion.frames.size).toBe(0);
    expect(liveliness((now - 1016) / 1000).lid).toBe(1);
  });

  test("a live canvas keeps the figure moving while it is shown", () => {
    const motion = fakeMotion();
    const player = new MascotPlayer(motion.env, rest);
    player.attach(() => {}).setVisible(true);
    const eyes = player.attach(() => {}, { live: true });
    eyes.setVisible(true);
    let now = 1000;
    for (let i = 0; i < 400; i++) {
      const [handle, tick] = [...motion.frames][0]!;
      motion.frames.delete(handle);
      tick((now += 16));
    }
    expect(motion.frames.size).toBe(1);
    // Long past the wake window, hiding the eyes lets the figure rest at once.
    eyes.setVisible(false);
    expect(motion.frames.size).toBe(0);
  });
});
