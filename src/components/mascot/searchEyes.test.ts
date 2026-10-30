import { expect, test } from "bun:test";
import { BotEngine } from "./bot/engine";
import { RAYON } from "./bot/repere";
import { searchEyesViewBox } from "./MascotFigure";

test("search crop centers both eyes through notify, blinks, interruption and recovery", () => {
  const engine = new BotEngine(RAYON, "inkling-drift");
  for (const [state, start] of [
    ["notify", 1],
    ["inkling-drift", 1.2],
    ["notify", 1.3],
    ["inkling-drift", 4],
  ] as const) {
    engine.setState(state, start);
    for (let step = 0; step < 90; step++) {
      const frame = engine.sample(start + step / 60);
      const [x, y, width, height] = searchEyesViewBox(frame).split(" ").map(Number);
      for (const eye of frame.eyes) {
        const b = eye.bounds!;
        expect(b.left).toBeGreaterThanOrEqual(x);
        expect(b.right).toBeLessThanOrEqual(x + width);
        expect(b.top).toBeGreaterThanOrEqual(y);
        expect(b.bottom).toBeLessThanOrEqual(y + height);
      }
      expect(width / height).toBeCloseTo(78 / 80);
      // The search slot centers the painted pair, not the body's old drift origin.
      const bounds = frame.eyes.map((eye) => eye.bounds!);
      const centerX =
        (Math.min(...bounds.map((b) => b.left)) + Math.max(...bounds.map((b) => b.right))) / 2;
      const centerY =
        (Math.min(...bounds.map((b) => b.top)) + Math.max(...bounds.map((b) => b.bottom))) / 2;
      expect((centerX - x) / width).toBeCloseTo(0.5);
      expect((centerY - y) / height).toBeCloseTo(0.5);
    }
  }
});
