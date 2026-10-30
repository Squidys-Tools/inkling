export type DeepLinkCapture =
  | { kind: "url"; url: string; title?: string }
  | { kind: "quote"; url: string; selection: string; attribution: string }
  | { kind: "image"; pageUrl: string; imageUrl: string; alt: string };

export const DEEP_LINK_SELECTION_MAX_LENGTH: number;
export const DEEP_LINK_ATTRIBUTION_MAX_LENGTH: number;
export function withHttpsScheme(value: string): string;
export function parseHttpUrlCore(value: string): URL | null;
export function parseDeepLinkCaptureCore(value: string): DeepLinkCapture | null;
