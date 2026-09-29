// Shared handoff key for the inject-on-invoke extractor. The content script
// parks its payload Promise on the isolated world's globalThis; background
// reads it back via a func injection (func is stringified into the page, so it
// must inline this string — keep both sites on the same constant value).
export const EXTRACT_PAYLOAD_PROMISE_KEY = "__inklingExtractPayloadPromise";
