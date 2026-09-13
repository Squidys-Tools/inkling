import { BotEngine, type BotFrame } from "../src/components/mascot/bot/engine";
import { EXPRESSION_BY_ID } from "../src/components/mascot/bot/expressions";
import { COLOR_BY_ID, SHAPE_BY_ID, mixHex } from "../src/components/mascot/bot/skins";
import { DEMI_VIEWBOX, RAYON } from "../src/components/mascot/bot/repere";
import type { StateId } from "../src/components/mascot/bot/states";

const r2 = (n: number) => String(Math.round(n * 100) / 100);

/** Standalone frozen-frame SVG string. Mirrors InklingMascot.tsx output. */
export function frameToSvgString(frame: BotFrame, ink: string, paper: string): string {
  const VB = DEMI_VIEWBOX;
  const dots = frame.dots
    .map((dot, i) => {
      const fill = dot.color ?? (dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth));
      const attrs = `fill="${fill}" opacity="${r2(dot.opacity)}"`;
      return dot.d
        ? `<path d="${dot.d}" transform="translate(${r2(dot.x)} ${r2(dot.y)}) rotate(${r2(dot.rot ?? 0)}) scale(${RAYON})" ${attrs}/>`
        : `<circle cx="${r2(dot.x)}" cy="${r2(dot.y)}" r="${r2(dot.r)}" ${attrs}/>`;
    })
    .join("");
  const eyes = frame.eyes
    .map((e) => `<path d="${e.d}" transform="${e.matrix}" opacity="${r2(e.alpha)}" fill="#000"/>`)
    .join("");
  const notch = frame.notch
    ? `<circle cx="${r2(frame.notch.x)}" cy="${r2(frame.notch.y)}" r="${r2(frame.notch.r)}" fill="#000"/>`
    : "";
  const notif = frame.notif
    ? `<circle cx="${r2(frame.notif.x)}" cy="${r2(frame.notif.y)}" r="${r2(frame.notif.r)}" fill="#3b93f0"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-VB} ${-VB} ${VB * 2} ${VB * 2}" width="320" height="320">` +
    `<defs><mask id="m" maskUnits="userSpaceOnUse" x="${-VB}" y="${-VB}" width="${VB * 2}" height="${VB * 2}">` +
    `<path d="${frame.bodyPath}" fill="#fff"/>${eyes}${notch}</mask></defs>` +
    (frame.dotsBehind ? `<g>${dots}</g>` : "") +
    `<g opacity="${r2(frame.bodyAlpha)}">` +
    `<path d="${frame.bodyPath}" fill="${paper}"/>` +
    `<g mask="url(#m)"><rect x="${-VB}" y="${-VB}" width="${VB * 2}" height="${VB * 2}" fill="${ink}"/></g></g>` +
    (!frame.dotsBehind ? `<g>${dots}</g>` : "") +
    notif +
    `</svg>`
  );
}

const SHAPES = ["inkling-splash"];
const STATES: Array<{ state: StateId; at: number }> = [
  { state: "idle", at: 1.0 },
  { state: "wink", at: 0.8 },
  { state: "wide", at: 1.0 },
  { state: "notify", at: 1.2 },
];
const INK = COLOR_BY_ID.get("inkling")?.hex ?? "#1a1a1a";
const PAPER = "#faf9f6";

const outDir = "docs/assets/mascots";
await Bun.$`mkdir -p ${outDir}`.quiet();

for (const shape of SHAPES) {
  const radii = SHAPE_BY_ID.get(shape)?.radii ?? null;
  for (const { state, at } of STATES) {
    const engine = new BotEngine(RAYON, state, radii, EXPRESSION_BY_ID.get("neutre") ?? null);
    const frame = engine.sample(at);
    const svg = frameToSvgString(frame, INK, PAPER);
    const path = `${outDir}/${shape}-${state}.svg`;
    await Bun.write(path, svg);
    console.log(`wrote ${path}`);
  }
}
