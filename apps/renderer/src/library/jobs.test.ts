import { afterEach, describe, expect, it, mock } from "bun:test";
import { QueryObserver } from "@tanstack/react-query";

// Each count read waits until the test answers it, in whatever order the test picks.
const reads: ((count: number) => void)[] = [];
const failures: ((error: Error) => void)[] = [];
const waitingForRead: { count: number; resolve: () => void }[] = [];
const client = {
  activeJobs: () =>
    new Promise<number>((resolve, reject) => {
      reads.push(resolve);
      failures.push(reject);
      for (const waiter of waitingForRead.filter((w) => w.count <= reads.length)) waiter.resolve();
    }),
  changes: () => () => {},
};
let reconnect: ((fresh: typeof client) => void) | undefined;
mock.module("./connection.ts", () => ({
  libraryClient: async () => client,
  onReconnect: (listener: (fresh: typeof client) => void) => {
    reconnect = listener;
    return () => {};
  },
}));
const { activeJobsQuery, refreshActiveJobCount } = await import("./jobs.ts");
const { followLibraryChanges, queryClient } = await import("../queryClient.ts");

const readsStarted = (count: number) =>
  new Promise<void>((resolve) =>
    reads.length >= count ? resolve() : waitingForRead.push({ count, resolve }),
  );

/** Observes the count as the mascot does, recording every count it is shown. */
function observe() {
  const shown: number[] = [];
  const waiting: { count: number; resolve: () => void }[] = [];
  let failed = () => {};
  const observer = new QueryObserver(queryClient, activeJobsQuery);
  const stop = observer.subscribe(({ data, isError }) => {
    if (isError) failed();
    if (data === undefined || shown.at(-1) === data) return;
    shown.push(data);
    for (const waiter of waiting.filter((w) => w.count === data)) waiter.resolve();
  });
  const shows = (count: number) =>
    new Promise<void>((resolve) =>
      shown.at(-1) === count ? resolve() : waiting.push({ count, resolve }),
    );
  const fails = () => new Promise<void>((resolve) => (failed = resolve));
  return { shown, shows, fails, stop, current: () => observer.getCurrentResult().data };
}

let stop = () => {};
afterEach(() => {
  stop();
  queryClient.clear();
  reads.length = 0;
  failures.length = 0;
  waitingForRead.length = 0;
});

describe("active job count", () => {
  it("reads again when jobs change during the first read", async () => {
    const view = observe();
    stop = view.stop;
    await readsStarted(1);
    refreshActiveJobCount();
    await readsStarted(2);
    reads[1](3);
    await view.shows(3);
    // The first read was answered before the change; it lands last and is dropped.
    reads[0](0);
    refreshActiveJobCount();
    await readsStarted(3);
    reads[2](4);
    await view.shows(4);
    expect(view.shown).toEqual([3, 4]);
  });

  it("keeps the newest count when an older read answers last", async () => {
    const view = observe();
    stop = view.stop;
    await readsStarted(1);
    reads[0](1);
    await view.shows(1);
    refreshActiveJobCount();
    await readsStarted(2);
    refreshActiveJobCount();
    await readsStarted(3);
    reads[2](5);
    await view.shows(5);
    reads[1](2);
    refreshActiveJobCount();
    await readsStarted(4);
    reads[3](6);
    await view.shows(6);
    expect(view.shown).toEqual([1, 5, 6]);
  });

  it("keeps the last count when a read fails", async () => {
    const view = observe();
    stop = view.stop;
    await readsStarted(1);
    reads[0](2);
    await view.shows(2);
    refreshActiveJobCount();
    await readsStarted(2);
    const failing = view.fails();
    failures[1](new Error("The library restarted. Try again."));
    await failing;
    expect(view.current()).toBe(2);
  });

  it("reads again after the library process restarts", async () => {
    followLibraryChanges();
    const view = observe();
    stop = view.stop;
    await readsStarted(1);
    reads[0](1);
    await view.shows(1);
    reconnect?.(client);
    await readsStarted(2);
    reads[1](7);
    await view.shows(7);
    expect(view.shown).toEqual([1, 7]);
  });
});
