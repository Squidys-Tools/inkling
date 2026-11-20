import * as SecureStore from "expo-secure-store";
import { isPairing, type Pairing } from "./pairing-link";

export type { Pairing };

const key = "inkling.desktop";

/** A pairing saved before the phone used Tailscale Serve has no URL, and reads as unpaired. */
export async function loadPairing(): Promise<Pairing | null> {
  const saved = await SecureStore.getItemAsync(key);
  if (!saved) return null;
  const pairing: unknown = JSON.parse(saved);
  return isPairing(pairing) ? pairing : null;
}

export const savePairing = (pairing: Pairing) =>
  SecureStore.setItemAsync(key, JSON.stringify(pairing));
export const forgetPairing = () => SecureStore.deleteItemAsync(key);
