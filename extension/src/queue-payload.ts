import { isPageCapturePayload } from "@inkling/ingestion-shared";
import { isExtensionCapturePayload } from "./payload";

/**
 * The pending queue holds both capture shapes. A page save and a media save
 * flush through the same loopback POST, so both must survive a round trip
 * through storage — otherwise a selection, image, or video captured while the
 * app is closed is silently dropped.
 */
export function isQueuedCapturePayload(value: unknown): boolean {
  return isPageCapturePayload(value) || isExtensionCapturePayload(value);
}
