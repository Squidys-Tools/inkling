// Local diagnostics only: never include a request, image bytes or full stack.
export function searchDiagnostic(value: unknown) {
  const raw = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  return raw
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/((?:token|password|secret|api[_-]?key)\s*[:=]\s*)[^\s&]+/gi, "$1[redacted]")
    .replace(/https?:\/\/[^\s]+/gi, "[remote URL]")
    .slice(-2048);
}
