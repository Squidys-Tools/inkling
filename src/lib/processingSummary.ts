import type { ProcessingJob, ProcessingJobKind } from "@inkling/contracts";

export type ProcessingSummary = {
  active: boolean;
  hasOcrJob: boolean;
  completed: number;
  total: number;
  progressCurrent: number;
  progressTotal: number | null;
  message: string | null;
  failedJob: ProcessingJob | null;
};

function latestJobsByKind(jobs: ProcessingJob[]) {
  const latest = new Map<ProcessingJobKind, ProcessingJob>();
  for (const job of jobs) {
    const previous = latest.get(job.kind);
    if (!previous || job.createdAt > previous.createdAt) latest.set(job.kind, job);
  }
  return [...latest.values()];
}

function summarizeProcessingJobs(jobs: ProcessingJob[]): ProcessingSummary {
  const latestJobs = latestJobsByKind(jobs);
  const failedJob = latestJobs.find((job) => job.status === "failed") ?? null;
  const activeJobs = latestJobs.filter(
    (job) => job.status === "pending" || job.status === "processing",
  );
  const completed = latestJobs.filter((job) => job.status === "completed").length;
  const progressTotal = latestJobs.reduce<number | null>((total, job) => {
    if (job.progressTotal == null) return total;
    return (total ?? 0) + job.progressTotal;
  }, null);
  const progressCurrent = latestJobs.reduce((current, job) => current + job.progressCurrent, 0);

  return {
    active: activeJobs.length > 0,
    hasOcrJob: latestJobs.some((job) => job.kind === "ocr_image" || job.kind === "ocr_pdf_page"),
    completed,
    total: latestJobs.length,
    progressCurrent,
    progressTotal,
    message: activeJobs.find((job) => job.progressMessage)?.progressMessage ?? null,
    failedJob,
  };
}

export function summariesFromJobs(itemIds: string[], jobs: ProcessingJob[]) {
  const grouped = new Map<string, ProcessingJob[]>();
  for (const job of jobs) {
    const group = grouped.get(job.itemId) ?? [];
    group.push(job);
    grouped.set(job.itemId, group);
  }
  return new Map(itemIds.map((id) => [id, summarizeProcessingJobs(grouped.get(id) ?? [])]));
}
