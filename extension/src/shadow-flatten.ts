// Side-effect-free constants for the MAIN/isolated shadow-flatten handshake.
// Kept separate from content-main.ts so the isolated-world bundle does not
// pull in the MAIN world's listener registration.
export const SHADOW_STAMP_ATTR = "data-defuddle-shadow";
export const FLATTEN_REQUEST_EVENT = "inkling:flatten-shadow-request";
export const FLATTEN_DONE_EVENT = "inkling:flatten-shadow-done";
export const FLATTEN_REQUEST_FLAG = "inklingFlattenRequested";
