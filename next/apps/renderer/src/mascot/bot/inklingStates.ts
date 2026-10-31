/* oxlint-disable inkling/no-low-value-comments -- vendored from bloub (LICENSE.md); its comments stay as upstream wrote them. */
import { EYE_H, EYE_W, REST_GAZE } from "./face";
import { TAU } from "./math";
import { base, pair, type Pose } from "./pose";
import { PROFILE_SAMPLES } from "./profiles";
import { circle } from "./shape";
import type { StateDef } from "./states";

/**
 * The body of `inkling-drift`, shared verbatim with `inkling-drift-faced`.
 *
 * One copy, on purpose. The two states differ by one flag, and a second copy of
 * this arithmetic is a second thing to forget: the README would end up showing a
 * mascot that no longer moves like the sidebar one, which is the exact thing it
 * exists to avoid. The reasoning behind the share is on `inkling-drift-faced`,
 * where the loop that never needed closing is described.
 */
function driftBody(t: number): Pose {
  const wave = (base: number, depth: number, period: number, phase: number) =>
    base + depth * Math.sin((t * TAU) / period + phase);
  // Amplitudes : chacune s'eteint presque puis revient, a son heure.
  // INKLING EXTENSION: scaled to 0.6 of the original, which pulled lobes deep
  // enough to read as dents and to crowd the eyes.
  const a5 = wave(0.033, 0.019, 14, 0);
  const a3 = wave(0.024, 0.013, 10, 2.1);
  const a2 = wave(0.018, 0.0096, 21, 4.2);
  const a7 = wave(0.0072, 0.0036, 6, 1.3);
  // Phases : les lobes 5 et 3 circulent en sens inverse, les autres
  // glissent lentement — la figure ne repasse jamais deux fois pareille.
  const p5 = 0.8 + (t * TAU) / 26;
  const p3 = 2.0 - (t * TAU) / 17;
  const p2 = 2.0 + 0.3 * Math.sin((t * TAU) / 15);
  const p7 = (t * TAU) / 8;
  const raw = Array.from({ length: PROFILE_SAMPLES }, (_, i) => {
    const a = (i / PROFILE_SAMPLES) * TAU;
    return (
      1 +
      a5 * Math.cos(5 * a + p5) +
      a3 * Math.cos(3 * a + p3) +
      a2 * Math.cos(2 * a + p2) +
      a7 * Math.cos(7 * a + p7)
    );
  });
  // Poids visuel constant : seule la forme change, jamais la taille.
  const peak = Math.max(...raw);
  const radii = raw.map((r) => (r * 1.06) / peak);
  // Visage propre a la derive (comme wink/wide portent le leur) : meme
  // regard et memes gelules que le repos, mais resserre (split 10.5 contre
  // 15.46) et recentre (yaw 15 contre 28.49) pour rendre aux yeux la marge
  // que la rotation leur reprendrait au bord droit.
  return base({
    sil: { radii, rot: (t * TAU) / 24, cx: 0, cy: 0, sx: 1, sy: 1 },
    gaze: { ...REST_GAZE, yaw: 15 },
    split: 10.5,
    eyes: pair(EYE_W, EYE_H),
  });
}

export const INKLING_STATES: StateDef[] = [
  // INKLING EXTENSION: looping body-motion states for the sidebar mascot. Sway and jelly loop like `idle`,
  // keep the chosen shape (baseBody) and the rest expression (baseFace) so
  // error/attention faces keep working on top of the motion.
  {
    // Slow rotation + breath. Visible only on non-circular skins, which is
    // exactly what the inkling splash is: ±6deg over 6s, ±1.5% vertical breath.
    id: "inkling-sway",
    duration: 6,
    morph: 0.6,
    blinkIn: false,
    baseFace: true,
    baseBody: true,
    pose: (t) =>
      base({
        sil: circle(1, {
          rot: 0.1 * Math.sin((t * TAU) / 6),
          sy: 1 + 0.015 * Math.sin((t * TAU) / 3),
        }),
      }),
  },

  {
    // Jelly squash & stretch, peaking every 2.4s. Volume-preserving-ish:
    // what the height loses the width gains.
    id: "inkling-jelly",
    duration: 2.4,
    morph: 0.45,
    blinkIn: false,
    baseFace: true,
    baseBody: true,
    pose: (t) => {
      const k = Math.max(0, Math.sin((t * TAU) / 2.4)) ** 2;
      return base({
        sil: circle(1, { sx: 1 + 0.05 * k, sy: 1 - 0.05 * k }),
      });
    },
  },

  {
    // The sidebar default: ink stirring, one turn every 24s. `baseFace: false`
    // because drift carries its OWN tightened face — a steady face under a
    // turning body — so an expression cannot replace it. That is why the README
    // needs `inkling-drift-faced` below rather than this state.
    id: "inkling-drift",
    duration: 24,
    morph: 0.8,
    blinkIn: false,
    baseFace: false,
    baseBody: false,
    steadyFace: true,
    pose: driftBody,
  },

  {
    // INKLING EXTENSION. Not a sidebar state: `inkling-drift` with
    // `baseFace: true`, so a caller can put an expression on it. The README
    // loop and the welcome screens do.
    //
    // The pose below is the sidebar's, shared, not a re-timed copy. The state does
    // NOT close on itself: `inkling-drift`'s nine periods (24, 26, 21, 17, 15, 14,
    // 10, 8, 6) have a least common multiple of days, and snapping them to divisors
    // of a loop is what left the README mascot looking unlike the sidebar one —
    // every lobe beat against the turn on 12s, so the silhouette recurred while
    // the body took twice as long to come round.
    //
    // It does not have to close here. The README's `d` track pastes the opening
    // outline at 100%, so the browser interpolates its last keyframe to the start
    // across the final second — a straight line covering that second's 15deg turn
    // either way, with ~2.3px of lobe drift folded into it. Unmeasurable next to
    // the 13px the outline already travels in that second.
    //
    // `baseFace: true` also makes the pose's own face a FALLBACK: the tightened
    // placement, not the round one `neutre` asks for, which walks the eyes into a
    // lobe as the blob rotates. A caller that passes an expression gets its gaze,
    // split and eyes; the README does, and pins the gaze back down itself for the
    // same reason.
    id: "inkling-drift-faced",
    duration: 24,
    morph: 0.8,
    blinkIn: false,
    baseFace: true,
    baseBody: false,
    steadyFace: true,
    pose: driftBody,
  },
];
