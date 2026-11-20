import { colors } from "../colors";
import type { Connection } from "../state/library";

export const tones: Record<Connection, { label: string; color: string }> = {
  loading: { label: "Connecting", color: colors.warning },
  unpaired: { label: "Not paired", color: colors.muted },
  connected: { label: "Connected", color: colors.success },
  connecting: { label: "Connecting", color: colors.warning },
  offline: { label: "Desktop offline", color: colors.muted },
  repair: { label: "Pair again", color: colors.danger },
};
