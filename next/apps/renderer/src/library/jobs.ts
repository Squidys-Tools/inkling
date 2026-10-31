import { libraryClient } from "./connection.ts";
import { type Processing, withJobs } from "./processing.ts";
import { createStore, useStore } from "./store.ts";

export type { Processing } from "./processing.ts";

export const jobsStore = createStore<ReadonlyMap<string, Processing>>(new Map());

export async function refreshJobs(itemIds: readonly string[]) {
  if (itemIds.length === 0) return;
  try {
    const client = await libraryClient();
    const jobs = await client.jobsFor({ itemIds: [...itemIds] });
    jobsStore.set((current) => withJobs(current, itemIds, jobs));
  } catch {
    // A card without its job state still works; the next change event retries.
  }
}

export function forgetJobs(itemIds: readonly string[]) {
  jobsStore.set((current) => withJobs(current, itemIds, []));
}

export async function retryJob(jobId: string) {
  const client = await libraryClient();
  return client.retryJob({ jobId });
}

export const useProcessing = (id: string) => useStore(jobsStore, (jobs) => jobs.get(id));

/** How many items have work running, for the mascot's notification dot. */
export const useActiveJobCount = () =>
  useStore(jobsStore, (jobs) => {
    let count = 0;
    for (const processing of jobs.values()) if (processing.active) count += 1;
    return count;
  });
