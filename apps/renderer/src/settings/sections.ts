import Camera01Icon from "@hugeicons/core-free-icons/Camera01Icon";
import Database02Icon from "@hugeicons/core-free-icons/Database02Icon";
import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import PaintBoardIcon from "@hugeicons/core-free-icons/PaintBoardIcon";
import RotateCwIcon from "@hugeicons/core-free-icons/RotateCwIcon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";

/** The rail, in order. Licenses opens from General and keeps General selected. */
export const railSections = [
  { id: "general", label: "General", icon: Settings01Icon },
  { id: "appearance", label: "Appearance", icon: PaintBoardIcon },
  { id: "library", label: "Library", icon: Database02Icon },
  { id: "extension", label: "Browser extension", icon: Link01Icon },
  { id: "screenshots", label: "Screenshots", icon: Camera01Icon },
  { id: "updates", label: "Updates", icon: RotateCwIcon },
] as const;

export type SettingsSection = (typeof railSections)[number]["id"] | "licenses";

const sections = new Set<unknown>([...railSections.map(({ id }) => id), "licenses"]);
export const isSettingsSection = (value: unknown): value is SettingsSection => sections.has(value);
