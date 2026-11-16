import type { Platform } from "@inkling/contracts/shortcuts";
import {
  type Appearance,
  appearanceOptions,
  parseAppearance,
} from "../settings/appearanceModel.ts";

type Columns = Appearance["gridColumns"];
export type ZoomStep = "fewer" | "more" | "reset";

const choices: readonly Columns[] = appearanceOptions.gridColumns.map((option) => option.value);

/** Zooming steps through the Appearance choices, so Settings always shows the grid's real count. */
export function nextColumns(current: Columns, step: ZoomStep): Columns {
  if (step === "reset") return parseAppearance(null).gridColumns;
  const index = choices.indexOf(current) + (step === "more" ? 1 : -1);
  return choices[Math.min(choices.length - 1, Math.max(0, index))] ?? current;
}

/** Cmd or Ctrl with =, + or -, as browsers zoom; 0 goes back to the default. */
export function zoomKey(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">,
  platform: Platform,
): ZoomStep | null {
  const mod = platform === "darwin" ? event.metaKey && !event.ctrlKey : event.ctrlKey;
  if (!mod || event.altKey) return null;
  if (event.key === "=" || event.key === "+") return "fewer";
  if (event.key === "-") return "more";
  if (event.key === "0") return "reset";
  return null;
}

// A mouse notch is about 100px and a trackpad pinch many small deltas: each is one column.
const travelPerStep = 50;
const lineHeight = 40;
const pageHeight = 800;

/** Adds one wheel event to the travel so far; a step spends it all, and turning back starts over. */
export function accumulateWheel(
  travel: number,
  event: Pick<WheelEvent, "deltaY" | "deltaMode">,
): { travel: number; step: ZoomStep | null } {
  const pixels =
    event.deltaY * (event.deltaMode === 1 ? lineHeight : event.deltaMode === 2 ? pageHeight : 1);
  if (pixels === 0) return { travel, step: null };
  const total = Math.sign(pixels) === Math.sign(travel) ? travel + pixels : pixels;
  if (Math.abs(total) < travelPerStep) return { travel: total, step: null };
  return { travel: 0, step: total > 0 ? "more" : "fewer" };
}
