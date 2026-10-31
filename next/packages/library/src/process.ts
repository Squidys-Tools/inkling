import { LibraryError, LibraryRpcs, type LibraryChange } from "@inkling/contracts";
import { layerProtocol } from "@inkling/rpc-electron/server";
import { Effect, Fiber, Layer, PubSub, Stream } from "effect";
import { RpcServer } from "effect/rpc";
import { join } from "node:path";
import { createLibrarySizeCache } from "./library-size.ts";
import { errorMessage } from "./storage/errors.ts";
import { JobQueue, Library, libraryLayer } from "./storage/library.ts";

// The library process: the only owner of the SQLite file. Main starts it with
// the library directory and hands it one port per client.
const directoryFlag = process.argv.indexOf("--library-directory");
const libraryDirectory = process.argv[directoryFlag + 1];
if (directoryFlag < 0 || !libraryDirectory) throw new Error("--library-directory is required");

const databasePath = join(libraryDirectory, "library.sqlite3");
const librarySize = createLibrarySizeCache(databasePath, join(libraryDirectory, "assets"));
const changes = Effect.runSync(PubSub.unbounded<LibraryChange>());
const publish = (change: LibraryChange) => PubSub.publish(changes, change);

// Every failure reaches the renderer as one message it can show.
const failure = (cause: unknown) => new LibraryError({ message: errorMessage(cause) });
const answer = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.mapError(effect, failure);
const itemChanged = (id: string) => publish({ _tag: "ItemsChanged", ids: [id] });

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
              library
                .listSpaceItems(scope.spaceId, 200, null)
                .pipe(Effect.map((cards) => ({ cards, next: null, total: cards.length }))),
            );
        }
      },
      cardsById: ({ ids }) => answer(library.getItemCards(ids)),
      item: ({ id }) => answer(library.getItem(id)),
      itemContent: ({ id }) => answer(library.getItemContent(id)),
      search: ({ query, limit }) => answer(library.searchItems(query, limit, null)),
      similar: ({ id, by, limit }) => answer(library.searchSimilar(id, by, limit)),
      createNote: (input) => written(library.createNote(input)),
      createQuote: (input) => written(library.createQuote(input)),
      captureUrl: (input) => written(library.captureUrl(input)),
      saveFile: (input) => written(library.saveFile(input)),
      updateItem: (input) => written(library.updateItem(input)),
      setArchived: ({ id, archived }) => written(library.archiveItem(id, archived)),
      deleteItem: ({ id }) =>
        answer(library.deleteItem(id)).pipe(
          Effect.tap(() => publish({ _tag: "ItemsRemoved", ids: [id] })),
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
      retryJob: ({ jobId }) => answer(jobs.retry(jobId)),
      runOcr: ({ itemId }) => answer(jobs.enqueueOcr(itemId)),
      exportLibrary: ({ destination, timezoneOffsetMinutes }) =>
        answer(library.exportLibrary(destination, timezoneOffsetMinutes)),
      importLibrary: ({ exportDirectory }) =>
        answer(library.importLibrary(exportDirectory)).pipe(
          Effect.tap(() => publish({ _tag: "SpacesChanged" })),
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
  jobQueue: {
    onUpdated: (itemId) => Effect.runFork(publish({ _tag: "JobsChanged", itemIds: [itemId] })),
  },
});

const server = RpcServer.layer(LibraryRpcs).pipe(
  Layer.provide(handlers),
  Layer.provide(storage),
  Layer.provide(layerProtocol()),
);

const launched: Effect.Effect<never, unknown> = Layer.launch(server);
const fiber = Effect.runFork(launched);

// Main asks for a clean stop on quit: interrupting the server hands running
// jobs back and closes the database before the process exits.
process.parentPort.on("message", ({ data }) => {
  if ((data as { type?: unknown } | null)?.type !== "shutdown") return;
  Effect.runFork(Fiber.interrupt(fiber)).addObserver(() => process.exit(0));
});
