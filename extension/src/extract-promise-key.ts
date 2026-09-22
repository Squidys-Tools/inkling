// Shared handoff key for the inject-on-invoke extractor. The content script
// parks its payload Promise here; background awaits it via a func injection
// (func is stringified into the page, so it must inline this string — keep
// both sites on the same constant value).
export const EXTRACT_PAYLOAD_PROMISE_KEY = "__inklingExtractPayloadPromise";
