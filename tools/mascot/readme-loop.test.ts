import { describe, expect, it } from "bun:test";
import { readmeLoopSvg, readmeStillSvg } from "./readme-loop.ts";

const committedLoop = () =>
  Bun.file(new URL("../../docs/assets/mascots/inkling-splash-loop.svg", import.meta.url)).text();

describe("README mascot loop", () => {
  // regression: Safari ignores path() in CSS `d`, so the outline froze on iPhone
  it("moves outlines with SMIL d tracks, not CSS d: path() keyframes", async () => {
    const svg = await committedLoop();
    expect(svg).not.toContain("d:path(");
    expect(svg).toContain('<animate attributeName="d"');
  });

  it("gives every SMIL track one value per key time, from 0 to 1 and strictly increasing", () => {
    const tracks = [...readmeLoopSvg().matchAll(/keyTimes="([^"]+)" values="([^"]+)"/g)];
    expect(tracks.length).toBeGreaterThan(0);
    for (const [, keyTimes = "", values = ""] of tracks) {
      const keys = keyTimes.split(";").map(Number);
      expect(values.split(";")).toHaveLength(keys.length);
      expect(keys[0]).toBe(0);
      expect(keys.at(-1)).toBe(1);
      for (let i = 1; i < keys.length; i++) expect(keys[i]!).toBeGreaterThan(keys[i - 1]!);
    }
  });

  it("has a still with nothing animated, for readers who ask for reduced motion", () => {
    const still = readmeStillSvg();
    expect(still).not.toContain("<animate");
    expect(still).not.toContain("<style");
  });
});
