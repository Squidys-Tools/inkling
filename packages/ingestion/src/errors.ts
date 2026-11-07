export type UrlIngestionErrorCode =
  | "content-too-large"
  | "extraction-failed"
  | "invalid-url"
  | "network-error"
  | "parse-failed"
  | "unsupported-content-type"
  | "http-error"
  | "redirect-error"
  | "timeout";

export interface UrlIngestionErrorDetails {
  cause?: unknown;
  status?: number;
  url?: string;
}

const permanentCodes: ReadonlySet<UrlIngestionErrorCode> = new Set([
  "content-too-large",
  "invalid-url",
  "unsupported-content-type",
]);

export class UrlIngestionError extends Error {
  readonly name = "UrlIngestionError";

  constructor(
    readonly code: UrlIngestionErrorCode,
    message: string,
    readonly details: UrlIngestionErrorDetails = {},
  ) {
    super(message);
  }

  // A page that refuses or no longer exists answers the same way a minute later.
  get permanent() {
    const { status } = this.details;
    return (
      permanentCodes.has(this.code) ||
      (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429)
    );
  }
}

export function isUrlIngestionError(error: unknown): error is UrlIngestionError {
  return error instanceof UrlIngestionError;
}
