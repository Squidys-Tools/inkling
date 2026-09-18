export {
  buildPageCapturePayload,
  INGESTION_PAYLOAD_VERSION,
  isPageCapturePayload,
  MAX_DEFUDDLED_HTML_BYTES,
  parsePageCapturePayload,
  PayloadValidationError,
} from "./payload";
export type { BuildPagePayloadInput, IngestionPayloadKind, PageCapturePayloadV1 } from "./payload";
export { DEFUDDLE_VERSION_PIN, INKLING_DEFUDDLE_OPTIONS } from "./defuddle-config";
