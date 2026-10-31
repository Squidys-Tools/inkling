import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { connect, pageTarget } from "../smoke/cdp.ts";
import { benchMarker, generateLibrary } from "./library.ts";
import { benchTargets, missingTargets, scenarios } from "./scenarios.ts";
import {
  type FrameSummary,
  rendererPids,
  summarizeFrames,
  type TraceEvent,
  traceCategories,
} from "./trace.ts";

const usage = `Usage: bun tools/bench/frames.ts [--library <folder from bench:library>] [--items 1000]
  [--executable <packaged app>] [--only <scenario name>] [--keep]

Launches the built app against a generated library, traces Chromium's frame
pipeline over CDP while each scenario runs, and prints the frames per state.
Scenarios find the UI by these attributes and are skipped when one is missing:
${Object.entries(benchTargets)
  .map(([name, role]) => `  data-bench="${name}"  ${role}`)
  .join("\n")}`;

const { values } = parseArgs({
  options: {
    library: { type: "string" },
    items: { type: "string", default: "1000" },
    executable: { type: "string" },
    only: { type: "string" },
    keep: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(usage);
  process.exit(0);
}
const items = Number(values.items);
if (!Number.isSafeInteger(items) || items < 1) throw new Error(usage);
if (!values.executable && !existsSync("dist/desktop/main.mjs"))
  throw new Error("Build the app first: bun run build:app");

// Only a library this tool generated: the app writes to the library it opens.
let directory = values.library && resolve(values.library);
if (directory && !existsSync(join(directory, benchMarker)))
  throw new Error(`${directory} was not made by bun run bench:library; refusing to open it.`);
const generated = !directory;
if (!directory) {
  directory = await mkdtemp(join(tmpdir(), "inkling-bench-"));
  console.log(`bench: generating ${items} items in ${directory}`);
  await generateLibrary({ directory, items });
}

const freePort = () =>
  new Promise<number>((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => done(typeof address === "object" && address ? address.port : 0));
    });
  });

type Page = Awaited<ReturnType<typeof connect>>;

async function traced(page: Page, action: () => Promise<string | void>) {
  const events: TraceEvent[] = [];
  const complete = Promise.withResolvers<void>();
  const stopListening = page.on((method, params) => {
    if (method === "Tracing.dataCollected")
      for (const event of (params as { value: TraceEvent[] }).value) events.push(event);
    else if (method === "Tracing.tracingComplete") complete.resolve();
  });
  await page.send("Tracing.start", {
    traceConfig: { includedCategories: traceCategories, excludedCategories: ["*"] },
    transferMode: "ReportEvents",
  });
  let problem: string | void;
  try {
    problem = await action();
  } finally {
    await page.send("Tracing.end");
    await complete.promise;
    stopListening();
  }
  const pids = rendererPids(events);
  return { problem, frames: summarizeFrames(events, pids) };
}

const port = await freePort();
const electron = (await import("electron")).default as unknown as string;
const command = values.executable ? [values.executable] : [electron, "."];
const app = Bun.spawn(
  [
    ...command,
    `--user-data-dir=${directory}`,
    `--remote-debugging-port=${port}`,
    ...(process.platform === "linux" ? ["--no-sandbox"] : []),
  ],
  { stdout: "inherit", stderr: "inherit" },
);

type Row = { scenario: string; frames?: FrameSummary; note?: string };
const rows: Row[] = [];
try {
  const page = await connect(await pageTarget(port, 60_000));
  const deadline = Date.now() + 30_000;
  while (
    Date.now() < deadline &&
    !(await page.evaluate<boolean>(`Boolean(document.querySelector('[data-bench="card"]'))`))
  )
    await Bun.sleep(200);
  // First-use work (fonts, route code, the first thumbnails) settles before measuring.
  await Bun.sleep(2_000);

  for (const scenario of scenarios) {
    if (values.only && scenario.name !== values.only) continue;
    const missing = await missingTargets(page, scenario);
    if (missing.length > 0) {
      rows.push({
        scenario: scenario.name,
        note: `skipped: no ${missing.map((target) => `[data-bench="${target}"]`).join(", ")}`,
      });
      continue;
    }
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 });
    await Bun.sleep(500);
    const { problem, frames } = await traced(page, () => scenario.run(page));
    rows.push({
      scenario: scenario.name,
      frames,
      note: problem ? `incomplete: ${problem}` : undefined,
    });
  }
  page.close();
} finally {
  app.kill();
  await app.exited;
  if (generated && !values.keep) await rm(directory, { recursive: true, force: true });
  else console.log(`bench: library kept at ${directory}`);
}

const header = [
  "scenario",
  "presented",
  "partial",
  "dropped",
  "visible drops",
  "longest ms",
  "result",
];
const table = rows.map(({ scenario, frames, note }) =>
  frames
    ? [
        scenario,
        String(frames.presented),
        String(frames.partial),
        String(frames.dropped),
        String(frames.droppedVisible),
        frames.longestMillis.toFixed(1),
        note ?? (frames.dropped === 0 ? "ok" : "drops frames"),
      ]
    : [scenario, "", "", "", "", "", note ?? ""],
);
const widths = header.map((title, column) =>
  Math.max(title.length, ...table.map((row) => row[column].length)),
);
for (const row of [header, widths.map((width) => "-".repeat(width)), ...table])
  console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
console.log(
  `\n${generated ? `${items} generated items` : directory} on ${process.platform}; the budget is no dropped frames.`,
);
