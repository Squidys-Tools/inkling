import type { MascotPose } from "./player.ts";

/** What the sidebar mascot shows. It is never the only sign of any of these. */
export type MascotMood = {
  /** Background jobs are running: a notification dot. */
  busy: boolean;
  face: "calm" | "attentive" | "curious" | "sad";
};

const expressions = {
  calm: "neutre",
  attentive: "attentif",
  curious: "curieux",
  sad: "triste",
} as const;

/**
 * Drift and notify carry faces of their own (`baseFace: false`), so the face
 * shows only on `idle` and on sway, the reduced-motion rest state. A sad mood
 * drops to `idle` so it always shows; attentive and curious show while swaying.
 */
export function poseFor(mood: MascotMood, reducedMotion: boolean): MascotPose {
  return {
    state:
      mood.face === "sad"
        ? "idle"
        : mood.busy
          ? "notify"
          : reducedMotion
            ? "inkling-sway"
            : "inkling-drift",
    expression: expressions[mood.face],
  };
}

export function moodFor({
  busy,
  searchFocused,
  query,
  captureFailed,
}: {
  busy: boolean;
  searchFocused: boolean;
  query: string;
  captureFailed: boolean;
}): MascotMood {
  return {
    busy,
    face: captureFailed ? "sad" : searchFocused ? (query ? "curious" : "attentive") : "calm",
  };
}
