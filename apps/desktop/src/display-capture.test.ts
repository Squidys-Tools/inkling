import { expect, test } from "bun:test";
import type { DesktopCapturerSource, DisplayMediaRequestHandlerHandlerRequest } from "electron";
import { createDisplayCaptureHandler } from "./display-capture.ts";

const frame = {} as NonNullable<DisplayMediaRequestHandlerHandlerRequest["frame"]>;
const request = { frame, userGesture: true, videoRequested: true, audioRequested: false };
const source = { id: "screen:0:0", name: "Display 1" } as DesktopCapturerSource;

test("Linux portal selection is used only for an explicit main-frame screenshot", async () => {
  let choices = 0;
  const handler = createDisplayCaptureHandler({
    isMainFrame: (candidate) => candidate === frame,
    getSources: async () => [source],
    chooseSource: async () => {
      choices++;
      return 0;
    },
    usesPortal: true,
  });
  const replies: unknown[] = [];
  await handler(request, (value) => replies.push(value));
  expect(replies).toEqual([{ video: source }]);
  expect(choices).toBe(0);
  for (const patch of [
    { frame: null },
    { userGesture: false },
    { videoRequested: false },
    { audioRequested: true },
  ]) {
    await handler({ ...request, ...patch }, (value) => replies.push(value));
  }
  expect(replies.slice(1)).toEqual([null, null, null, null]);
});

test("X11 requires a screen choice even for a single source, and cancel denies", async () => {
  const names: string[][] = [];
  const handler = createDisplayCaptureHandler({
    isMainFrame: () => true,
    getSources: async () => [source],
    chooseSource: async (value) => {
      names.push(value);
      return -1;
    },
    usesPortal: false,
  });
  let result: unknown;
  await handler(request, (value) => {
    result = value;
  });
  expect(names).toEqual([["Display 1"]]);
  expect(result).toBeNull();
});

test("capture requests are single-flight and recheck the requesting frame after selection", async () => {
  let finish!: (sources: DesktopCapturerSource[]) => void;
  let live = true;
  const handler = createDisplayCaptureHandler({
    isMainFrame: () => live,
    getSources: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    chooseSource: async () => 0,
    usesPortal: true,
  });
  const replies: unknown[] = [];
  const first = handler(request, (value) => replies.push(value));
  await handler(request, (value) => replies.push(value));
  expect(replies).toEqual([null]);
  live = false;
  finish([source]);
  await first;
  expect(replies).toEqual([null, null]);
});

test("portal failure denies capture and a later request can succeed", async () => {
  let attempts = 0;
  const handler = createDisplayCaptureHandler({
    isMainFrame: () => true,
    getSources: async () => {
      if (attempts++ === 0) throw new Error("portal canceled");
      return [source];
    },
    chooseSource: async () => 0,
    usesPortal: true,
  });
  const replies: unknown[] = [];
  await handler(request, (value) => replies.push(value));
  await handler(request, (value) => replies.push(value));
  expect(replies).toEqual([null, { video: source }]);
});
