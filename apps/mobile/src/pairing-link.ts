import type { Pairing } from "./pairing";

/** Reads `inkling-mobile://pair?address=…&token=…`, the link a desktop hands the phone to pair. */
const decode = (value: string) => {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return "";
  }
};

export function parsePairingLink(link: string): Pairing | null {
  const query = /^inkling-mobile:\/\/pair\/?\?(.+)$/u.exec(link)?.[1];
  if (!query) return null;
  const fields = new Map(
    query.split("&").map((part) => {
      const [key, value = ""] = part.split("=");
      return [key, decode(value)] as const;
    }),
  );
  const address = fields.get("address");
  const token = fields.get("token");
  return address && token ? { address, token } : null;
}
