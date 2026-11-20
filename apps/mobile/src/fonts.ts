import { DMMono_400Regular } from "@expo-google-fonts/dm-mono";
import { DMSans_400Regular, DMSans_600SemiBold } from "@expo-google-fonts/dm-sans";

// Desktop's own faces: DM Sans for display and DM Mono for labels. Body text stays the system face.
export const fontFiles = { DMSans_400Regular, DMSans_600SemiBold, DMMono_400Regular };

export const font = {
  display: "DMSans_600SemiBold",
  displayRegular: "DMSans_400Regular",
  mono: "DMMono_400Regular",
} as const;
