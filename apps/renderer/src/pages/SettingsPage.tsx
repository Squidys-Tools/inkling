import { useParams } from "@tanstack/react-router";
import { Settings } from "../settings/Settings.tsx";
import { sectionFrom } from "../settings/sections.ts";

export function SettingsPage() {
  const { section } = useParams({ from: "/settings/$section" });
  return <Settings section={sectionFrom(section)} />;
}
