import type { ShellThumbnailReply, ShellThumbnailRequest } from "@inkling/contracts/jobs";
import { type MessagePortMain, nativeImage } from "electron";
import { superviseUtilityProcess } from "./utility-process.ts";

const isShellThumbnailRequest = (message: unknown): message is ShellThumbnailRequest =>
  (message as { type?: unknown } | null)?.type === "shell-thumbnail";

async function shellThumbnail({ path, edge }: ShellThumbnailRequest) {
  try {
    const image = await nativeImage.createThumbnailFromPath(path, { width: edge, height: edge });
    return image.isEmpty() ? null : image.toPNG();
  } catch {
    return null;
  }
}

/**
 * Runs the worker process (OCR, embeddings, thumbnails, PDF, URL extraction).
 * It keeps no state, so a crash costs only the jobs it was running, which retry.
 */
export function startWorkerProcess({
  entry,
  args,
  onRestart,
}: {
  entry: string;
  args: string[];
  onRestart: () => void;
}) {
  const child = superviseUtilityProcess({
    entry,
    args,
    serviceName: "inkling worker",
    onRestart,
    onGiveUp: (code) =>
      console.error(
        `the worker process keeps stopping (exit code ${code}); background jobs wait until inkling starts again`,
      ),
  });
  // Utility processes cannot reach nativeImage, so Windows and macOS posters come through here.
  child.onMessage((message, reply) => {
    if (!isShellThumbnailRequest(message)) return;
    void shellThumbnail(message).then((png) => {
      const answer: ShellThumbnailReply = { type: "shell-thumbnail", id: message.id, png };
      reply(answer);
    });
  });

  return {
    /** Hands the worker one end of a channel; the library process holds the other. */
    connect(port: MessagePortMain) {
      child.postMessage({ type: "connect" }, [port]);
    },
    stop: () => child.stop(),
  };
}
