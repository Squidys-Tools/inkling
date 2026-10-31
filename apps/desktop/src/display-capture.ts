import type { DesktopCapturerSource, DisplayMediaRequestHandlerHandlerRequest } from "electron";

type CaptureRequest = Pick<
  DisplayMediaRequestHandlerHandlerRequest,
  "frame" | "userGesture" | "videoRequested" | "audioRequested"
>;

export function createDisplayCaptureHandler({
  isMainFrame,
  getSources,
  chooseSource,
  usesPortal,
}: {
  isMainFrame: (frame: CaptureRequest["frame"]) => boolean;
  getSources: () => Promise<DesktopCapturerSource[]>;
  chooseSource: (names: string[]) => Promise<number>;
  usesPortal: boolean;
}) {
  let pending = false;
  return async (
    request: CaptureRequest,
    callback: (streams: { video: DesktopCapturerSource } | null) => void,
  ) => {
    if (
      pending ||
      !isMainFrame(request.frame) ||
      !request.userGesture ||
      !request.videoRequested ||
      request.audioRequested
    ) {
      callback(null);
      return;
    }
    pending = true;
    let video: DesktopCapturerSource | undefined;
    try {
      const sources = await getSources();
      // PipeWire already asks the user which screen to share in the system portal.
      const index =
        usesPortal && sources.length === 1
          ? 0
          : await chooseSource(sources.map((source) => source.name));
      if (isMainFrame(request.frame)) video = sources[index];
    } catch {
      // A canceled portal or unavailable capture backend denies the request.
    } finally {
      pending = false;
    }
    callback(video ? { video } : null);
  };
}
