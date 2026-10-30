export type FileImportProgress = {
  active: boolean;
  total: number;
  completed: number;
  saved: number;
  failed: number;
};

// Keep File handles queued, not their bytes. Only one read/save/projection runs
// at a time, including when another drop or paste arrives before this one ends.
export function createFileImportQueue<T>(
  onProgress: (progress: FileImportProgress) => void,
  onError: (file: T, error: unknown) => void,
) {
  const pending: Array<{ file: T; save: (file: T) => Promise<void> }> = [];
  let progress: FileImportProgress = {
    active: false,
    total: 0,
    completed: 0,
    saved: 0,
    failed: 0,
  };
  const publish = () => onProgress({ ...progress });
  async function drain() {
    while (pending.length) {
      const entry = pending.shift()!;
      try {
        await entry.save(entry.file);
        progress.saved++;
      } catch (error) {
        progress.failed++;
        onError(entry.file, error);
      }
      progress.completed++;
      publish();
      // Let progress paint and input run even for very fast local saves.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    progress.active = false;
    publish();
  }
  return {
    enqueue(files: readonly T[], save: (file: T) => Promise<void>) {
      if (!files.length) return;
      const running = progress.active;
      if (!running) progress = { active: true, total: 0, completed: 0, saved: 0, failed: 0 };
      for (const file of files) pending.push({ file, save });
      progress.total += files.length;
      publish();
      if (!running) void drain();
    },
  };
}
