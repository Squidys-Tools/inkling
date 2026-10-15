export type DeepLinkCapture =
  | { kind: "url"; url: string }
  | { kind: "quote"; url: string; selection: string; attribution: string }
  | { kind: "image"; pageUrl: string; imageUrl: string; alt: string };

export const DEEP_LINK_SELECTION_MAX_LENGTH: number;
export const DEEP_LINK_ATTRIBUTION_MAX_LENGTH: number;
export function parseDeepLinkCaptureCore(value: string): DeepLinkCapture | null;
