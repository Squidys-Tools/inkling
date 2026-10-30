export const BASE_URL_KEY = "inkling.base-url";
export const TOKEN_KEY = "inkling.token";

export function normalizeCaptureServerAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "http:" ||
      parsed.hostname !== "127.0.0.1" ||
      !parsed.port ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isPairingToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-z\d]{32,128}$/iu.test(value);
}
