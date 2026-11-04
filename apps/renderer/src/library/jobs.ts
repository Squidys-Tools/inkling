import { libraryClient } from "./connection.ts";
import { type Processing, withJobs } from "./processing.ts";
import { useQuery } from "@tanstack/react-query";
import { createAtom, useSelector } from "@tanstack/react-store";
import { libraryQuery, reread } from "../queryClient.ts";

export type { Processing } from "./processing.ts";

const jobsStore = createAtom<ReadonlyMap<string, Processing>>(new Map());

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

export const useProcessing = (id: string) => useSelector(jobsStore, (jobs) => jobs.get(id));

// Counts the library's queued and running jobs, those from before launch too.
// A failed read keeps the last count until the next job change reads it again.
export const activeJobsQuery = libraryQuery(["activeJobs"], (client) => client.activeJobs({}));

export const refreshActiveJobCount = () => reread({ queryKey: activeJobsQuery.queryKey });

/** How many jobs are queued or running, for the mascot's notification dot. */
export const useActiveJobCount = () => useQuery(activeJobsQuery).data ?? 0;
