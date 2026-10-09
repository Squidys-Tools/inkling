// Name of the extractor the isolated-world bundle installs on its own
// globalThis for background.ts to invoke. It crosses that boundary through a
// `func` injection, and func is stringified into the page — so background passes
// this name in as an argument instead of repeating the literal in injected code.
// One constant, both sides: a rename that missed either one would break every
// page capture with "extractor returned no result", and nothing else would fail.
export const EXTRACTOR_FN_KEY = "__inklingExtractPage";