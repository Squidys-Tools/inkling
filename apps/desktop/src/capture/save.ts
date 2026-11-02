import type { CaptureUrlInput, CreateQuoteInput, SaveFileInput } from "@inkling/contracts";
import type { FailedCapture } from "@inkling/contracts/desktop";
import { type DeepLinkCapture, parseDeepLink } from "./deep-link.ts";

type Saved = Promise<{ id: string }>;
type Library = {
  captureUrl: (input: CaptureUrlInput) => Saved;
  createQuote: (input: CreateQuoteInput) => Saved;
  saveFile: (input: SaveFileInput) => Saved;
};
type DownloadImage = (url: string) => Promise<Omit<SaveFileInput, "kind">>;

const captureSource = "browser extension";

/** Saves one capture from outside the app, an `inkling://` link or the extension receiver. */
export async function saveCapture(
  capture: DeepLinkCapture,
  library: Library,
  downloadImage: DownloadImage,
) {
  if (capture.kind === "quote") {
    return library.createQuote({
      body: capture.selection,
      attribution: capture.attribution || undefined,
      sourceUrl: capture.url,
      metadata: { captureSource },
    });
  }
  if (capture.kind === "url") {
    return library.captureUrl({ sourceUrl: capture.url, title: capture.title, captureSource });
  }
  try {
    return await library.saveFile({ ...(await downloadImage(capture.imageUrl)), kind: "image" });
  } catch {
    // Hotlink protection or a non-image answer: the page itself is still worth keeping.
    return library.captureUrl({ sourceUrl: capture.pageUrl, captureSource });
  }
}

/**
 * Saves each `inkling://` link through the library in the order they arrived.
 * A link that is not a capture is ignored; one the library could not save goes
 * to `onFailure`, so the window can say so.
 */
export function deepLinkInbox({
  library,
  downloadImage,
  onFailure,
}: {
  library: () => Promise<Library>;
  downloadImage: DownloadImage;
  onFailure: (failure: FailedCapture) => void;
}) {
  let queue = Promise.resolve();
  return (link: string) => {
    const capture = parseDeepLink(link);
    if (!capture) return queue;
    const url = capture.kind === "image" ? capture.pageUrl : capture.url;
    queue = queue
      .then(async () => {
        await saveCapture(capture, await library(), downloadImage);
      })
      .catch((error: unknown) =>
        onFailure({
          url,
          message: error instanceof Error ? error.message : "The capture could not be saved.",
        }),
      );
    return queue;
  };
}
