/** The desktop's Tailscale Serve address, such as https://studio.tail1234.ts.net:8443, and its token. */
export type Pairing = { url: string; token: string };

export const isPairing = (value: unknown): value is Pairing => {
  const pairing = value as Pairing | null;
  return (
    typeof pairing?.url === "string" &&
    /^https:\/\/[^/?#\s]+\/?$/u.test(pairing.url) &&
    typeof pairing.token === "string" &&
    pairing.token.length > 0
  );
};

const decode = (value: string) => {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return "";
  }
};

/** Reads `inkling-mobile://pair?url=…&token=…`, the link a desktop hands the phone to pair. */
export function parsePairingLink(link: string): Pairing | null {
  const query = /^inkling-mobile:\/\/pair\/?\?(.+)$/u.exec(link)?.[1];
  if (!query) return null;
  const fields = new Map(
    query.split("&").map((part) => {
      const [key, value = ""] = part.split("=");
      return [key, decode(value)] as const;
    }),
  );
  const pairing = { url: fields.get("url") ?? "", token: fields.get("token") ?? "" };
  return isPairing(pairing) ? pairing : null;
}
