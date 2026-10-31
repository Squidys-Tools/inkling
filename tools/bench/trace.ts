/** One event of a Chromium JSON trace, as `Tracing.dataCollected` delivers it. */
export type TraceEvent = {
  name: string;
  ph: string;
  pid: number;
  ts: number;
  id?: string;
  id2?: { local?: string; global?: string };
  args?: Record<string, unknown>;
};

export const traceCategories = [
  "benchmark",
  "cc",
  "viz",
  "disabled-by-default-devtools.timeline.frame",
];

export type FrameSummary = {
  presented: number;
  partial: number;
  dropped: number;
  /** Dropped frames Chromium counts against smoothness: the ones a user sees. */
  droppedVisible: number;
  /** The longest frame from begin to presentation, which shows a stall. */
  longestMillis: number;
};

type FrameReporter = { state?: unknown; affects_smoothness?: unknown };

// Chromium's JSON export names the field `chrome_frame_reporter`; some
// versions and converters use `frame_reporter`, with or without `STATE_`.
function reporterOf(event: TraceEvent) {
  const args = event.args ?? {};
  const reporter = (args.chrome_frame_reporter ?? args.frame_reporter) as FrameReporter | undefined;
  if (!reporter || typeof reporter.state !== "string") return null;
  return {
    state: reporter.state.replace(/^STATE_/u, ""),
    affectsSmoothness: reporter.affects_smoothness === true,
  };
}

const eventId = (event: TraceEvent) => event.id ?? event.id2?.local ?? event.id2?.global ?? "";

/**
 * Counts the frames of the renderer processes in `pids` by the state Chromium's
 * `PipelineReporter` gives each one. Frames with nothing to draw are not counted.
 */
export function summarizeFrames(events: readonly TraceEvent[], pids: ReadonlySet<number>) {
  const summary: FrameSummary = {
    presented: 0,
    partial: 0,
    dropped: 0,
    droppedVisible: 0,
    longestMillis: 0,
  };
  const begins = new Map<string, number>();
  for (const event of events) {
    if (event.name !== "PipelineReporter" || !pids.has(event.pid)) continue;
    const key = `${event.pid}:${eventId(event)}`;
    if (event.ph === "e") {
      const began = begins.get(key);
      if (began !== undefined)
        summary.longestMillis = Math.max(summary.longestMillis, (event.ts - began) / 1000);
      begins.delete(key);
      continue;
    }
    if (event.ph !== "b") continue;
    const reporter = reporterOf(event);
    if (!reporter) continue;
    if (reporter.state === "PRESENTED_ALL") summary.presented++;
    else if (reporter.state === "PRESENTED_PARTIAL") summary.partial++;
    else if (reporter.state === "DROPPED") {
      summary.dropped++;
      if (reporter.affectsSmoothness) summary.droppedVisible++;
    } else continue;
    begins.set(key, event.ts);
  }
  return summary;
}

/** The pids Chromium named `Renderer` in the trace's metadata. */
export const rendererPids = (events: readonly TraceEvent[]) =>
  new Set(
    events
      .filter(
        (event) =>
          event.ph === "M" && event.name === "process_name" && event.args?.name === "Renderer",
      )
      .map((event) => event.pid),
  );
