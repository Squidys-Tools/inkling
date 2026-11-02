import type { ItemDetail } from "@inkling/contracts";
import { loadScope, reevaluateShownSpace, shownScope, showNewCards } from "../library/cards.ts";
import { cardFromDetail } from "../library/cardModel.ts";
import { type LibraryClient, libraryClient } from "../library/connection.ts";
import { errorMessage } from "../library/errors.ts";
import { refreshJobs } from "../library/jobs.ts";
import { spacesStore } from "../library/spaces.ts";
import { createStore, useStore } from "../library/store.ts";
import { type CaptureSpace, finishSpaceCapture } from "./captureSpace.ts";

type CaptureState = { saving: number; error: string | null };
const captureState = createStore<CaptureState>({ saving: 0, error: null });
export const useCaptureState = <Selected>(select: (state: CaptureState) => Selected) =>
  useStore(captureState, select);
export const dismissCaptureError = () => captureState.set((state) => ({ ...state, error: null }));
export const reportCaptureError = (message: string) =>
  captureState.set((state) => ({ ...state, error: message }));

export function captureDestination(): CaptureSpace {
  const scope = shownScope.get();
  const space =
    scope._tag === "Space" && spacesStore.get().spaces.find((s) => s.id === scope.spaceId);
  return space ? { id: space.id, kind: space.kind } : null;
}

/** Show the committed item even when filing fails, so retrying never duplicates the capture. */
function showNewItem(detail: ItemDetail) {
  showNewCards([cardFromDetail(detail)]);
  reevaluateShownSpace();
  void refreshJobs([detail.id]);
}

export async function saveCaptured(
  write: (client: LibraryClient) => Promise<ItemDetail>,
  destination: CaptureSpace,
) {
  const client = await libraryClient();
  const detail = await write(client);
  showNewItem(detail);
  const warning = await finishSpaceCapture(detail.id, destination, {
    add: (spaceId, itemId) => client.addToSpace({ spaceId, itemId }),
    reload: (spaceId) => {
      const shown = shownScope.get();
      if (shown._tag === "Space" && shown.spaceId === spaceId) void loadScope(shown);
    },
  });
  if (warning) reportCaptureError(warning);
}

async function save(
  write: (client: LibraryClient) => Promise<ItemDetail>,
  destination = captureDestination(),
) {
  captureState.set((state) => ({ saving: state.saving + 1, error: null }));
  try {
    await saveCaptured(write, destination);
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
export function captureText(text: string, captureSource: string) {
  const value = text.trim();
  if (!value) return Promise.resolve(false);
  if (looksLikeUrl(value))
    return save((client) => client.captureUrl({ sourceUrl: withScheme(value), captureSource }));
  return save((client) => client.createNote({ body: value, metadata: { captureSource } }));
}

const maxFileBytes = 50 * 1024 * 1024;
// Bind each queued file to the Space where its drop began, not wherever the user navigates next.
const fileQueue: { file: File; destination: CaptureSpace }[] = [];
let draining = false;
async function drainFiles() {
  if (draining) return;
  draining = true;
  try {
    for (let next = fileQueue.shift(); next; next = fileQueue.shift()) {
      const { file, destination } = next;
      if (file.size > maxFileBytes) {
        reportCaptureError(`${file.name} is larger than the 50 MB limit.`);
        continue;
      }
      await save(
        async (client) =>
          client.saveFile({
            fileName: file.name || "Untitled file",
            mimeType: file.type || null,
            kind: null,
            bytes: new Uint8Array(await file.arrayBuffer()),
          }),
        destination,
      );
    }
  } finally {
    draining = false;
  }
}
export function captureFiles(files: readonly File[], destination = captureDestination()) {
  fileQueue.push(...files.map((file) => ({ file, destination })));
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
  const destination = captureDestination();
  if (!navigator.mediaDevices?.getDisplayMedia) {
    reportCaptureError(
      "Screen capture is unavailable. Take a screenshot with your system tool, then paste it here or add it with File.",
    );
    return;
  }
  try {
    captureFiles([await grabScreenshot()], destination);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    reportCaptureError(
      error instanceof DOMException
        ? "Screen capture was canceled or unavailable. You can paste a screenshot from your system tool, or add it with File."
        : errorMessage(error),
    );
  }
}
