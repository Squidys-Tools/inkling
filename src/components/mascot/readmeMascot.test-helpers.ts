import { buildReadmeMascot } from "./readmeMascot";

export const svg = buildReadmeMascot();

/** Every `@keyframes` block, keyed by name, as `[offset, declaration]` pairs. */
function keyframes(css: string): Map<string, Array<[string, string]>> {
  const out = new Map<string, Array<[string, string]>>();
  for (const [, name, body] of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([^@]*)\}/g)) {
    out.set(
      name,
      [...body.matchAll(/([\d.]+)%\s*\{([^}]*)\}/g)].map(([, at, decl]) => [at!, decl!.trim()]),
    );
  }
  return out;
}

export const style = () => svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
export const blocks = () => keyframes(style());

/** The loop length the keyframe offsets are percentages of. Kept in step with
 *  `LOOP_SECONDS` in the generator; a mismatch here would silently rescale every
 *  threshold expressed in seconds. */
export const LOOP_SECONDS = 24;
