import type { ItemDetail } from "@inkling/contracts";
import { showNewCards } from "../library/cards.ts";
import { cardFromDetail } from "../library/cardModel.ts";
import { type LibraryClient, libraryClient } from "../library/connection.ts";
import { errorMessage } from "../library/errors.ts";
import { refreshJobs } from "../library/jobs.ts";
import { selectCard } from "../library/selection.ts";
import { createStore, useStore } from "../library/store.ts";

type CaptureState = {
  /** Saves in flight, so the Add button can say it is busy. */
  saving: number;
  /** The last failure, shown under the search bar until the next capture. */
  error: string | null;
};

export const captureState = createStore<CaptureState>({ saving: 0, error: null });

export const useCaptureState = <Selected>(select: (state: CaptureState) => Selected) =>
  useStore(captureState, select);

export const dismissCaptureError = () => captureState.set((state) => ({ ...state, error: null }));
export const reportCaptureError = (message: string) =>
  captureState.set((state) => ({ ...state, error: message }));

/**
 * Puts a freshly written item at the top of the library and marks it, without
 * waiting for the library's change event. The Add pages call this too.
 */
export function showNewItem(detail: ItemDetail) {
  showNewCards([cardFromDetail(detail)]);
  selectCard(detail.id);
  void refreshJobs([detail.id]);
}

async function save(write: (client: LibraryClient) => Promise<ItemDetail>) {
  captureState.set((state) => ({ saving: state.saving + 1, error: null }));
  try {
    showNewItem(await write(await libraryClient()));
    return true;
  } catch (error) {
    reportCaptureError(errorMessage(error));
    return false;
  } finally {
    captureState.set((state) => ({ ...state, saving: state.saving - 1 }));
  }
}

const bareDomain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:\/\S*)?$/iu;

export function looksLikeUrl(value: string) {
  return /^https?:\/\/\S+$/iu.test(value) || bareDomain.test(value);
}

export const withScheme = (value: string) =>
  /^https?:\/\//iu.test(value) ? value : `https://${value}`;

/** Pasted or dropped text: a link becomes a saved page, anything else a note. */
export function captureText(text: string, captureSource: string) {
  const value = text.trim();
  if (!value) return Promise.resolve(false);
  if (looksLikeUrl(value))
    return save((client) => client.captureUrl({ sourceUrl: withScheme(value), captureSource }));
  return save((client) => client.createNote({ body: value, metadata: { captureSource } }));
}

const maxFileBytes = 50 * 1024 * 1024;

// Files save one at a time, holding File handles rather than their bytes, so a
// large drop never reads every file into memory at once.
const fileQueue: File[] = [];
let draining = false;

async function drainFiles() {
  if (draining) return;
  draining = true;
  try {
    for (let file = fileQueue.shift(); file; file = fileQueue.shift()) {
      if (file.size > maxFileBytes) {
        reportCaptureError(`${file.name} is larger than the 50 MB limit.`);
        continue;
      }
      await save(async (client) =>
        client.saveFile({
          fileName: file.name || "Untitled file",
          mimeType: file.type || null,
          kind: null,
          bytes: new Uint8Array(await file.arrayBuffer()),
        }),
      );
    }
  } finally {
    draining = false;
  }
}

export function captureFiles(files: readonly File[]) {
  fileQueue.push(...files);
  void drainFiles();
}

async function grabScreenshot() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    const { videoWidth: width, videoHeight: height } = video;
    if (width === 0 || height === 0)
      throw new Error("The selected display has no capturable frame.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The screenshot could not be encoded.");
    return new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" });
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

export async function captureScreenshot() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    reportCaptureError(
      "Screen capture is unavailable. Take a screenshot with your system tool, then paste it here or add it with File.",
    );
    return;
  }
  try {
    captureFiles([await grabScreenshot()]);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    reportCaptureError(
      error instanceof DOMException
        ? "Screen capture was canceled or unavailable. You can paste a screenshot from your system tool, or add it with File."
        : errorMessage(error),
    );
  }
}
