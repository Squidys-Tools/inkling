import {
  Database02Icon,
  Link01Icon,
  RotateCwIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";

/** The rail, in order. Licenses opens from General and keeps General selected. */
export const railSections = [
  { id: "general", label: "General", icon: Settings01Icon },
  { id: "library", label: "Library", icon: Database02Icon },
  { id: "extension", label: "Browser extension", icon: Link01Icon },
  { id: "updates", label: "Updates", icon: RotateCwIcon },
] as const;

export type SettingsSection = (typeof railSections)[number]["id"] | "licenses";
