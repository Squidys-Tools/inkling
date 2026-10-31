import { expect, test } from "bun:test";
import { rendererPids, summarizeFrames, type TraceEvent } from "./trace.ts";

const frame = (
  pid: number,
  id: string,
  ts: number,
  duration: number,
  reporter: Record<string, unknown>,
  field = "chrome_frame_reporter",
): TraceEvent[] => [
  { name: "PipelineReporter", ph: "b", pid, ts, id, args: { [field]: reporter } },
  { name: "PipelineReporter", ph: "e", pid, ts: ts + duration, id },
];

test("frames are counted per presentation state, only for the app's renderer", () => {
  const events: TraceEvent[] = [
    { name: "process_name", ph: "M", pid: 7, ts: 0, args: { name: "Renderer" } },
    { name: "process_name", ph: "M", pid: 1, ts: 0, args: { name: "Browser" } },
    ...frame(7, "0x1", 1_000, 8_000, { state: "STATE_PRESENTED_ALL" }),
    ...frame(7, "0x2", 17_000, 161_000, { state: "STATE_PRESENTED_PARTIAL" }),
    ...frame(7, "0x3", 33_000, 9_000, { state: "STATE_DROPPED", affects_smoothness: true }),
    ...frame(
      7,
      "0x4",
      50_000,
      9_000,
      { state: "DROPPED", affects_smoothness: false },
      "frame_reporter",
    ),
    ...frame(7, "0x5", 66_000, 1_000, { state: "STATE_NO_UPDATE_DESIRED" }),
    ...frame(1, "0x6", 1_000, 400_000, { state: "STATE_DROPPED", affects_smoothness: true }),
    { name: "PipelineReporter", ph: "b", pid: 7, ts: 90_000, id: "0x7" },
  ];
  const pids = rendererPids(events);
  expect([...pids]).toEqual([7]);
  expect(summarizeFrames(events, pids)).toEqual({
    presented: 1,
    partial: 1,
    dropped: 2,
    droppedVisible: 1,
    longestMillis: 161,
  });
});
