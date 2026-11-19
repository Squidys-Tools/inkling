import * as SecureStore from "expo-secure-store";

export type Pairing = { address: string; token: string };
const key = "inkling.desktop";

export async function loadPairing(): Promise<Pairing | null> {
  const saved = await SecureStore.getItemAsync(key);
  return saved ? (JSON.parse(saved) as Pairing) : null;
}

export const savePairing = (pairing: Pairing) =>
  SecureStore.setItemAsync(key, JSON.stringify(pairing));
export const forgetPairing = () => SecureStore.deleteItemAsync(key);
