import { expect, test } from "bun:test";
import { type MascotMood, moodFor, poseFor } from "./mood.ts";

const calm = { busy: false, searchFocused: false, query: "", captureFailed: false };

test.each([
  [{}, { busy: false, face: "calm" }],
  [{ searchFocused: true }, { busy: false, face: "attentive" }],
  [
    { searchFocused: true, query: "red" },
    { busy: false, face: "curious" },
  ],
  [
    { searchFocused: true, query: "red", captureFailed: true, busy: true },
    { busy: true, face: "sad" },
  ],
])("moodFor %o", (input, mood) => {
  expect(moodFor({ ...calm, ...input })).toEqual(mood as MascotMood);
});

test.each([
  [{ busy: false, face: "calm" }, false, "inkling-drift", "neutre"],
  [{ busy: false, face: "calm" }, true, "inkling-sway", "neutre"],
  [{ busy: true, face: "attentive" }, false, "notify", "attentif"],
  // A failed capture outranks running jobs, or the notify face would hide it.
  [{ busy: true, face: "sad" }, false, "idle", "triste"],
] as const)("poseFor %o, reduced motion %p", (mood, reduced, state, expression) => {
  expect(poseFor(mood, reduced)).toEqual({ state, expression });
});
