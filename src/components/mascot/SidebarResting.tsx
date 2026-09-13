import { useMemo } from "react";
import { BotEngine } from "./bot/engine";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { SHAPE_BY_ID } from "./bot/skins";
import { RAYON } from "./bot/repere";
import { MascotFigure } from "./MascotFigure";

/**
 * Resting splash that holds the sidebar slot while the live mascot works the
 * search field — sleepy half-closed eyes, one frozen frame, gentle CSS breath.
 * No loop, no clock: the slot is never empty and never competes with the live one.
 */
export function SidebarResting({ size = 30 }: { size?: number }) {
  const frame = useMemo(
    () =>
      new BotEngine(
        RAYON,
        "idle",
        SHAPE_BY_ID.get("inkling-splash")?.radii ?? null,
        EXPRESSION_BY_ID.get("somnolent") ?? null,
      ).sample(1.0),
    [],
  );
  return <MascotFigure frame={frame} size={size} ink="#e5ddd2" paper="transparent" className="is-resting" />;
}
