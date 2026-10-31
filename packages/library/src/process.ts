import type { MessagePortMain } from "electron";
import {
  type ItemDetail,
  type ItemRecord,
  LibraryError,
  LibraryRpcs,
  type LibraryChange,
} from "@inkling/contracts";
import { layerProtocol, type PortSource } from "@inkling/rpc-electron/server";
import { Effect, Fiber, Layer, PubSub, Stream } from "effect";
import { RpcServer } from "effect/rpc";
import { join } from "node:path";
import { queryVector } from "./jobs/query-vector.ts";
import { jobLanesLayer } from "./jobs/runtime.ts";
import { layerPorts } from "./jobs/worker-client.ts";
import { createLibrarySizeCache } from "./library-size.ts";
import { errorMessage } from "./storage/errors.ts";
import { JobQueue, Library, libraryLayer } from "./storage/library.ts";
import { cardItem } from "./storage/rows.ts";
import { smartSpaceSubjects } from "./storage/spaces.ts";
import { snapshotDatabase } from "./storage/sqlite-snapshot.ts";
import {
  interfaceLabel,
  interfacePrompt,
  otherSubjects,
  subjectPrompt,
  type SubjectVectors,
  visualSubjects,
} from "./storage/visual-subject.ts";

// The library process: the only owner of the SQLite file. Main starts it with
// the library directory and app version and hands it one port per client.
const directoryFlag = process.argv.indexOf("--library-directory");
const libraryDirectory = process.argv[directoryFlag + 1];
if (directoryFlag < 0 || !libraryDirectory) throw new Error("--library-directory is required");
const versionFlag = process.argv.indexOf("--app-version");
const appVersion = process.argv[versionFlag + 1];
if (versionFlag < 0 || !appVersion) throw new Error("--app-version is required");

// Main sends the worker's port as soon as both processes run, which can be before
// the server starts, so the newest one waits here until the client takes it.
let waitingWorkerPort: MessagePortMain | undefined;
let onWorkerPort: ((port: MessagePortMain) => void) | undefined;
process.parentPort.on("message", ({ data, ports }) => {
  if ((data as { type?: unknown } | null)?.type !== "worker") return;
  for (const port of ports) {
    if (onWorkerPort) onWorkerPort(port);
    else {
      waitingWorkerPort?.close();
      waitingWorkerPort = port;
    }
  }
});
const workerPorts: PortSource = (onPort) => {
  onWorkerPort = onPort;
  if (waitingWorkerPort) onPort(waitingWorkerPort);
  waitingWorkerPort = undefined;
  return () => {
    onWorkerPort = undefined;
  };
};

const databasePath = join(libraryDirectory, "library.sqlite3");
const librarySize = createLibrarySizeCache(databasePath, join(libraryDirectory, "assets"));
const changes = Effect.runSync(PubSub.unbounded<LibraryChange>());
const publish = (change: LibraryChange) => PubSub.publish(changes, change);

// The subject prompts never change, so their vectors are embedded once, after the
// worker can answer; until then a photo Space has nothing it can confirm.
let subjectVectors: SubjectVectors | null = null;
const loadSubjectVectors = Effect.suspend(() => {
  if (subjectVectors) return Effect.succeed(subjectVectors);
  const prompts = [
    ...[...visualSubjects, ...otherSubjects].map(
      (subject) => [subject, subjectPrompt(subject)] as const,
    ),
    [interfaceLabel, interfacePrompt] as const,
  ];
  return Effect.forEach(prompts, ([label, prompt]) =>
    Effect.map(queryVector(prompt), (vector) => [label, vector] as const),
  ).pipe(
    Effect.map((vectors) => {
      if (vectors.some(([, vector]) => !vector?.length)) return null;
      subjectVectors = new Map(vectors.map(([label, vector]) => [label, vector!]));
      return subjectVectors;
    }),
  );
});

// Every failure reaches the renderer as one message it can show.
const failure = (cause: unknown) => new LibraryError({ message: errorMessage(cause) });
const answer = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.mapError(effect, failure);
const itemChanged = (id: string) => publish({ _tag: "ItemsChanged", ids: [id] });

// Small writes answer with the card, and the item view gets everything but the
// article HTML, which only the reader asks for: full content stays off IPC.
const articleHtml = (item: ItemDetail | null) =>
  typeof item?.metadata.html === "string" && item.metadata.html.trim() ? item.metadata.html : null;
const itemRecord = (item: ItemDetail | null): ItemRecord | null =>
  item && {
    ...item,
    metadata: Object.fromEntries(Object.entries(item.metadata).filter(([key]) => key !== "html")),
    hasArticleContent: articleHtml(item) !== null,
  };

const handlers = LibraryRpcs.toLayer(
  Effect.gen(function* () {
    const library = yield* Library;
    const jobs = yield* JobQueue;
    // Announce every write, so each window refetches that one card.
    const written = <A extends { id: string }, E, R>(effect: Effect.Effect<A, E, R>) =>
      answer(effect).pipe(Effect.tap((item) => itemChanged(item.id)));

    return {
      status: () =>
        answer(
          Effect.gen(function* () {
            const page = yield* library.cardsPage(false, null, 0);
            return { ...library.status(), itemCount: page.total };
          }),
        ),
      cards: ({ scope, cursor, limit }) => {
        switch (scope._tag) {
          case "Active":
            return answer(library.cardsPage(false, cursor, limit));
          case "Archived":
            return answer(library.cardsPage(true, cursor, limit));
          case "Space":
            return answer(
              Effect.gen(function* () {
                const space = yield* library.getSpace(scope.spaceId);
                if (space && smartSpaceSubjects(space)) {
                  const prompts = yield* loadSubjectVectors;
                  return yield* library.spaceCardsPage(scope.spaceId, cursor, limit, null, prompts);
                }
                const vector = yield* queryVector(
                  space?.kind === "smart" ? (space.query.text ?? "") : "",
                );
                return yield* library.spaceCardsPage(scope.spaceId, cursor, limit, vector);
              }),
            );
        }
      },
      cardsById: ({ ids }) => answer(library.getItemCards(ids)),
      item: ({ id }) => answer(Effect.map(library.getItem(id), itemRecord)),
      articleHtml: ({ id }) => answer(Effect.map(library.getItem(id), articleHtml)),
      itemContent: ({ id }) => answer(library.getItemContent(id)),
      search: ({ query, limit }) =>
        answer(
          queryVector(query).pipe(
            Effect.flatMap((vector) => library.searchItems(query, limit, vector)),
          ),
        ),
      similar: ({ id, by, limit }) => answer(library.searchSimilar(id, by, limit)),
      createNote: (input) => written(library.createNote(input)),
      createQuote: (input) => written(library.createQuote(input)),
      captureUrl: (input) => written(library.captureUrl(input)),
      saveFile: (input) => written(library.saveFile(input)),
      updateItem: (input) => written(Effect.map(library.updateItem(input), cardItem)),
      // Archiving or deleting an item changes the counts of the Spaces it is in.
      setArchived: ({ id, archived }) =>
        written(Effect.map(library.archiveItem(id, archived), cardItem)).pipe(
          Effect.tap(() => publish({ _tag: "SpacesChanged" })),
        ),
      deleteItem: ({ id }) =>
        answer(library.deleteItem(id)).pipe(
          Effect.tap(() => publish({ _tag: "ItemsRemoved", ids: [id] })),
          Effect.tap(() => publish({ _tag: "SpacesChanged" })),
        ),
      spaces: () => answer(library.listSpaces()),
      createSpace: (input) =>
        answer(library.createSpace(input)).pipe(
          Effect.tap(() => publish({ _tag: "SpacesChanged" })),
        ),
      updateSpace: (input) =>
        answer(library.updateSpace(input)).pipe(
          Effect.tap(() => publish({ _tag: "SpacesChanged" })),
        ),
      deleteSpace: ({ id }) =>
        answer(library.deleteSpace(id)).pipe(Effect.tap(() => publish({ _tag: "SpacesChanged" }))),
      swapSpaces: ({ firstId, secondId }) =>
        answer(library.swapSpacePositions(firstId, secondId)).pipe(
          Effect.tap(() => publish({ _tag: "SpacesChanged" })),
        ),
      addToSpace: ({ spaceId, itemId }) =>
        answer(library.addSpaceItem(spaceId, itemId)).pipe(
          Effect.tap(() => publish({ _tag: "SpacesChanged" })),
        ),
      removeFromSpace: ({ spaceId, itemId }) =>
        answer(library.removeSpaceItem(spaceId, itemId)).pipe(
          Effect.tap(() => publish({ _tag: "SpacesChanged" })),
        ),
      itemSpaces: ({ itemId }) => answer(library.listItemSpaces(itemId)),
      jobsFor: ({ itemIds }) => answer(jobs.getForItems(itemIds)),
      activeJobs: () => answer(jobs.countActive()),
      retryJob: ({ jobId }) => answer(jobs.retry(jobId)),
      runOcr: ({ itemId }) => answer(jobs.enqueueOcr(itemId)),
      exportLibrary: ({ destination, timezoneOffsetMinutes }) =>
        answer(library.exportLibrary(destination, timezoneOffsetMinutes)),
      importLibrary: ({ exportDirectory }) =>
        answer(library.importLibrary(exportDirectory)).pipe(
          Effect.tap(() => publish({ _tag: "LibraryReplaced" })),
        ),
      lastExport: () => answer(library.getLastExport()),
      librarySize: ({ refresh }) =>
        answer(Effect.tryPromise(() => librarySize.get({ refresh }))).pipe(
          Effect.map(({ bytes }) => bytes),
        ),
      onboardingCompleted: () => answer(library.hasCompletedOnboarding()),
      completeOnboarding: () => answer(library.completeOnboarding()),
      changes: () => Stream.fromPubSub(changes),
    };
  }),
);

const storage = libraryLayer({
  databasePath,
  appVersion,
  jobQueue: {
    onUpdated: (itemId) => Effect.runFork(publish({ _tag: "JobsChanged", itemIds: [itemId] })),
  },
  media: {
    // A header read on capture, kept here so a busy worker never delays a save.
    inspectImage: (bytes) => import("@inkling/jobs/thumbnail").then((m) => m.inspectImage(bytes)),
    createSnapshot: snapshotDatabase,
  },
});

// The lanes depend on the worker client, so closing the server stops them, and
// hands their jobs back, before the client and the database close.
const server = Layer.mergeAll(
  RpcServer.layer(LibraryRpcs).pipe(Layer.provide(handlers), Layer.provide(layerProtocol())),
  jobLanesLayer(itemChanged),
).pipe(Layer.provide(Layer.merge(storage, layerPorts(workerPorts))));

const launched: Effect.Effect<never, unknown> = Layer.launch(server);
const fiber = Effect.runFork(launched);

// Main asks for a clean stop on quit: interrupting the server hands running
// jobs back and closes the database before the process exits.
process.parentPort.on("message", ({ data }) => {
  if ((data as { type?: unknown } | null)?.type !== "shutdown") return;
  Effect.runFork(Fiber.interrupt(fiber)).addObserver(() => process.exit(0));
});
