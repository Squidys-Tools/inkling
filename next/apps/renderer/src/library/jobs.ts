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

const activeJobs = createStore(0);
let countRequests = 0;

// Counts the library's queued and running jobs, those from before launch too.
// Reads overlap during bursts of job changes, so only the newest answer lands.
export async function refreshActiveJobCount() {
  const request = ++countRequests;
  try {
    const count = await (await libraryClient()).activeJobs({});
    if (request === countRequests) activeJobs.set(count);
  } catch {
    // The dot keeps its last count until the next job change reads it again.
  }
}

/** How many jobs are queued or running, for the mascot's notification dot. */
export const useActiveJobCount = () => useStore(activeJobs, (count) => count);
