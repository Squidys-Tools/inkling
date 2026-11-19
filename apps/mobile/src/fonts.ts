import { DMMono_400Regular, DMMono_500Medium } from "@expo-google-fonts/dm-mono";
import { DMSans_400Regular, DMSans_600SemiBold } from "@expo-google-fonts/dm-sans";
import { LibreBaskerville_400Regular } from "@expo-google-fonts/libre-baskerville";

// Desktop bundles DM Sans for display, DM Mono for labels and Libre Baskerville for quotes;
// body text stays the system face on both.
export const fontFiles = {
  DMSans_400Regular,
  DMSans_600SemiBold,
  DMMono_400Regular,
  DMMono_500Medium,
  LibreBaskerville_400Regular,
};

export const font = {
  display: "DMSans_600SemiBold",
  displayRegular: "DMSans_400Regular",
  mono: "DMMono_400Regular",
  monoMedium: "DMMono_500Medium",
  quote: "LibreBaskerville_400Regular",
} as const;
