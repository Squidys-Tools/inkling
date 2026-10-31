import { FRAME_ORIGINS } from "@inkling/ingestion/frame-origins";

// X posts render in X's own sandboxed frame, so no third-party script runs here.
export const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  // StyleX injects no runtime styles in production; inline style attributes
  // still carry per-card values such as aspect ratios.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  `frame-src ${Object.values(FRAME_ORIGINS).join(" ")}`,
].join("; ");
