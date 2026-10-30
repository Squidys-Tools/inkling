export type { DeepLinkCapture } from "./deepLink.ts";
export function parseHttpUrlCore(value: string): URL | null;
export function parseDeepLinkCaptureCore(
  value: string,
): import("./deepLink.ts").DeepLinkCapture | null;
