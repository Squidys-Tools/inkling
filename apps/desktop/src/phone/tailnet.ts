import { networkInterfaces } from "node:os";

// Tailscale assigns from 100.64.0.0/10 (CGNAT) and its own ULA prefix fd7a:115c:a1e0::/48.
export function isTailnetAddress(address: string) {
  const v4 = /^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/u.exec(address);
  if (v4) return Number(v4[1]) >= 64 && Number(v4[1]) <= 127;
  return address.toLowerCase().startsWith("fd7a:115c:a1e0:");
}

export const tailnetAddresses = (interfaces = networkInterfaces()) =>
  Object.values(interfaces)
    .flatMap((entries) => entries ?? [])
    .filter((entry) => !entry.internal && isTailnetAddress(entry.address))
    .map((entry) => entry.address);
