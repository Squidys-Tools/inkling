import CameraIcon from "@inkling/ui/icons/Camera";
import LibraryIcon from "@inkling/ui/icons/Library";
import LinkIcon from "@inkling/ui/icons/Link";
import PaletteIcon from "@inkling/ui/icons/Palette";
import RotateCwIcon from "@inkling/ui/icons/RotateCw";
import SettingsIcon from "@inkling/ui/icons/Settings";

/** The rail, in order. Licenses opens from General and keeps General selected. */
export const railSections = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
  { id: "library", label: "Library", icon: LibraryIcon },
  { id: "extension", label: "Browser extension", icon: LinkIcon },
  { id: "screenshots", label: "Screenshots", icon: CameraIcon },
  { id: "updates", label: "Updates", icon: RotateCwIcon },
] as const;

export type SettingsSection = (typeof railSections)[number]["id"] | "licenses";

const sections = new Set<unknown>([...railSections.map(({ id }) => id), "licenses"]);
export const isSettingsSection = (value: unknown): value is SettingsSection => sections.has(value);
