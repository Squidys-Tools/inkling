import { setAppearance, useAppearance } from "../settings/appearance.ts";
import { appearanceOptions } from "../settings/appearanceModel.ts";

export const viewToggleStyles = appearanceOptions.viewToggle;
export type ViewToggleStyle = (typeof viewToggleStyles)[number]["value"];

export const useViewToggleStyle = () => useAppearance().viewToggle;
export const setViewToggleStyle = (style: ViewToggleStyle) => setAppearance("viewToggle", style);
