import { app, MessageChannelMain } from "electron";
import { join } from "node:path";
import { startLibraryProcess } from "./library-process.ts";
import { startWorkerProcess } from "./worker-process.ts";

/**
 * Starts the library and worker processes and keeps them connected: whenever
 * either one starts again, the library gets a fresh port to the worker.
 */
export function startProcesses({
  bundleDirectory,
  libraryDirectory,
  onCannotOpen,
}: {
  bundleDirectory: string;
  libraryDirectory: string;
  onCannotOpen: (reason: string) => void;
}) {
  const link = () => {
    const { port1, port2 } = new MessageChannelMain();
    worker.connect(port1);
    library.connectWorker(port2);
  };
  const library = startLibraryProcess({
    entry: join(bundleDirectory, "library.mjs"),
    args: ["--library-directory", libraryDirectory, "--app-version", app.getVersion()],
    onRestart: () => link(),
    onCannotOpen,
  });
  // The packaged app ships the pinned models; a development build downloads them
  // once into the library's own folder.
  const bundledModels = app.isPackaged
    ? ["--bundled-model-directory", join(process.resourcesPath, "models")]
    : [];
  const worker = startWorkerProcess({
    entry: join(bundleDirectory, "worker.mjs"),
    args: ["--model-cache-directory", join(libraryDirectory, "models"), ...bundledModels],
    onRestart: () => link(),
  });
  link();

  return {
    attach: library.attach,
    attachMain: library.attachMain,
    /** The library goes first: it hands its running jobs back while the worker can still answer. */
    async stop() {
      await library.stop();
      await worker.stop();
    },
  };
}
