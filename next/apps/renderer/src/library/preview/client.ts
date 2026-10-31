import type {
  CardScope,
  ItemDetail,
  Job,
  LibraryCard,
  LibraryChange,
  Space,
  SpaceQuery,
} from "@inkling/contracts";
import { displayKind } from "../cardModel.ts";
import type { LibraryClient } from "../connection.ts";
import {
  seedArchived,
  seedBodies,
  seedCards,
  seedJobs,
  seedMembership,
  seedSpaces,
} from "./seed.ts";

// The web preview has no library process. This client answers the same calls
// from memory, seeded with the demo library, and pushes the same change events,
// so every store and screen runs unchanged. Nothing persists across reloads.

type Entry = { card: LibraryCard; body: string };

const unavailable = (what: string) => Promise.reject(new Error(`${what} needs the desktop app.`));

function matchesSmart(card: LibraryCard, query: SpaceQuery) {
  const tags = Array.isArray(card.metadata.tags) ? card.metadata.tags.map(String) : [];
  if (query.tag && !tags.some((tag) => tag.toLowerCase() === query.tag?.toLowerCase()))
    return false;
  if (query.kind && displayKind(card.kind) !== displayKind(query.kind)) return false;
  return !query.text || haystack(card).includes(query.text.toLowerCase());
}

function haystack(card: LibraryCard) {
  const tags = Array.isArray(card.metadata.tags) ? card.metadata.tags.join(" ") : "";
  return [
    card.title,
    card.description,
    card.sourceLabel,
    card.sourceUrl,
    card.kind,
    tags,
    card.ocrText,
  ]
    .join(" ")
    .toLowerCase();
}

/** The operators the library process understands, approximated over the seed. */
function matchesSearch(card: LibraryCard, query: string) {
  const tags = Array.isArray(card.metadata.tags) ? card.metadata.tags.map(String) : [];
  return query
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean)
    .every((term) => {
      const [operator, value] = term.includes(":") ? term.split(":", 2) : ["", term];
      if (!value) return true;
      switch (operator) {
        case "type":
        case "kind":
        case "format":
          return displayKind(card.kind).toLowerCase() === displayKind(value).toLowerCase();
        case "tag":
          return tags.some((tag) => tag.toLowerCase() === value);
        case "site":
          return (card.sourceUrl ?? "").toLowerCase().includes(value);
        default:
          return haystack(card).includes(value);
      }
    });
}

function job(itemId: string, status: Job["status"]): Job {
  const now = Date.now();
  return {
    id: `job-${itemId}`,
    itemId,
    kind: status === "failed" ? "thumbnail" : "url_enrichment",
    status,
    retryCount: 0,
    maxRetries: 3,
    errorMessage: status === "failed" ? "The file could not be read." : null,
    createdAt: now,
    startedAt: now,
    completedAt: null,
    progressCurrent: 0,
    progressTotal: null,
    progressMessage: status === "processing" ? "Reading the page" : null,
  };
}

export function createPreviewClient(): LibraryClient {
  const items = new Map<string, Entry>();
  for (const card of [...seedCards, ...seedArchived])
    items.set(card.id, { card, body: seedBodies[card.id] ?? "" });
  let spaces: Space[] = seedSpaces.map((space) => ({ ...space }));
  const membership = new Map(Object.entries(seedMembership).map(([id, ids]) => [id, new Set(ids)]));
  const jobs = new Map<string, Job>([
    [seedJobs.processing, job(seedJobs.processing, "processing")],
    [seedJobs.failed, job(seedJobs.failed, "failed")],
  ]);
  const listeners = new Set<(change: LibraryChange) => void>();
  const emit = (change: LibraryChange) => {
    // Delivered after the call that caused it resolves, as over a real port.
    queueMicrotask(() => {
      for (const listener of listeners) listener(change);
    });
  };

  const ordered = (archived: boolean) =>
    [...items.values()]
      .filter((entry) => entry.card.archived === archived)
      .sort((a, b) => b.card.updatedAt - a.card.updatedAt || b.card.createdAt - a.card.createdAt);

  const detail = ({ card, body }: Entry): ItemDetail => ({
    ...card,
    body,
    bodyFormat: "md",
    metadata: { ...card.metadata },
  });

  const spaceMembers = (spaceId: string) => {
    const space = spaces.find((candidate) => candidate.id === spaceId);
    if (!space) throw new Error("That Space no longer exists.");
    const active = ordered(false).map((entry) => entry.card);
    if (space.kind === "regular") {
      const ids = membership.get(space.id) ?? new Set();
      return active.filter((card) => ids.has(card.id));
    }
    return active.filter((card) => matchesSmart(card, space.query));
  };

  const withCounts = () =>
    spaces.map((space) =>
      space.kind === "regular"
        ? { ...space, itemCount: membership.get(space.id)?.size ?? 0 }
        : space,
    );

  const write = (card: LibraryCard, body = "") => {
    const entry = { card: { ...card, updatedAt: Date.now() }, body };
    items.set(card.id, entry);
    emit({ _tag: "ItemsChanged", ids: [card.id] });
    return detail(entry);
  };

  const fresh = (
    kind: string,
    fields: Partial<LibraryCard>,
    metadata: LibraryCard["metadata"] = {},
  ) =>
    ({
      id: crypto.randomUUID(),
      kind,
      title: null,
      description: null,
      sourceUrl: null,
      sourceLabel: null,
      localAssetPath: null,
      thumbnailPath: null,
      ocrText: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archived: false,
      hasArticleContent: false,
      ...fields,
      metadata,
    }) satisfies LibraryCard;

  const page = (
    scope: { _tag?: CardScope["_tag"]; spaceId?: string },
    cursor: string | null,
    limit: number,
  ) => {
    const all = scope.spaceId
      ? spaceMembers(scope.spaceId)
      : ordered(scope._tag === "Archived").map((entry) => entry.card);
    const start = cursor ? Number(cursor) : 0;
    const cards = all.slice(start, start + limit);
    const end = start + cards.length;
    return { cards, next: end < all.length ? String(end) : null, total: all.length };
  };

  const entry = (id: string) => {
    const found = items.get(id);
    if (!found) throw new Error("That item is no longer in the library.");
    return found;
  };

  const spaceById = (id: string) => {
    const found = spaces.find((space) => space.id === id);
    if (!found) throw new Error("That Space no longer exists.");
    return found;
  };

  const touchSpaces = <T>(result: T) => {
    emit({ _tag: "SpacesChanged" });
    return result;
  };

  return {
    status: async () => ({
      databasePath: "preview",
      fts5Enabled: false,
      schemaVersion: 0,
      itemCount: ordered(false).length,
    }),
    cards: async ({ scope, cursor, limit }) => page(scope, cursor, limit),
    cardsById: async ({ ids }) =>
      ids.flatMap((id) => {
        const found = items.get(id);
        return found ? [found.card] : [];
      }),
    item: async ({ id }) => {
      const found = items.get(id);
      return found ? detail(found) : null;
    },
    itemContent: async ({ id }) => ({ id, body: entry(id).body, bodyFormat: "md" }),
    search: async ({ query, limit }) =>
      ordered(false)
        .map((found) => found.card)
        .filter((card) => matchesSearch(card, query))
        .slice(0, limit),
    similar: async () => [],

    createNote: async ({ title, body, metadata }) => {
      const firstLine = body.split("\n").find((line) => line.trim()) ?? "";
      return write(
        fresh(
          "note",
          {
            title: title?.trim() || firstLine.replace(/^#+\s*/u, "").slice(0, 80) || null,
            description: body.slice(0, 240),
            sourceLabel: "Quick note",
          },
          { ...metadata },
        ),
        body,
      );
    },
    createQuote: async ({ body, attribution, sourceUrl, metadata }) =>
      write(
        fresh(
          "quote",
          { title: body, description: attribution ?? null, sourceUrl: sourceUrl ?? null },
          { ...metadata },
        ),
        body,
      ),
    captureUrl: async ({ sourceUrl, title }) => {
      const url = new URL(sourceUrl);
      return write(
        fresh("url", {
          title: title ?? url.hostname,
          sourceUrl: url.toString(),
          sourceLabel: url.hostname.replace(/^www\./u, ""),
        }),
      );
    },
    saveFile: async ({ fileName, mimeType, bytes }) => {
      const type = mimeType ?? "";
      const kind = type.startsWith("image/")
        ? "image"
        : type === "application/pdf"
          ? "pdf"
          : type.startsWith("video/")
            ? "video"
            : "file";
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
      const size =
        kind === "image"
          ? await new Promise<{ width: number; height: number } | null>((resolve) => {
              const image = new Image();
              image.onload = () =>
                resolve({ width: image.naturalWidth, height: image.naturalHeight });
              image.onerror = () => resolve(null);
              image.src = url;
            })
          : null;
      return write(
        fresh(
          kind,
          {
            title: fileName,
            sourceLabel: type || null,
            localAssetPath: url,
            thumbnailPath: kind === "image" ? url : null,
          },
          {
            fileSizeBytes: bytes.byteLength,
            ...(size ? { mediaWidth: size.width, mediaHeight: size.height } : {}),
          },
        ),
      );
    },
    updateItem: async ({ id, title, description, body, sourceUrl, metadataPatch, addTag }) => {
      const found = entry(id);
      const tags = Array.isArray(found.card.metadata.tags)
        ? found.card.metadata.tags.map(String)
        : [];
      const card: LibraryCard = {
        ...found.card,
        title: title ?? found.card.title,
        description: description ?? found.card.description,
        sourceUrl: sourceUrl ?? found.card.sourceUrl,
        metadata: {
          ...found.card.metadata,
          ...metadataPatch,
          ...(addTag ? { tags: [...new Set([...tags, addTag])] } : {}),
        },
      };
      return write(card, body ?? found.body);
    },
    setArchived: async ({ id, archived }) => write({ ...entry(id).card, archived }, entry(id).body),
    deleteItem: async ({ id }) => {
      items.delete(id);
      for (const ids of membership.values()) ids.delete(id);
      emit({ _tag: "ItemsRemoved", ids: [id] });
    },

    spaces: async () => withCounts(),
    createSpace: async ({ name, color, query, kind }) => {
      const space: Space = {
        id: crypto.randomUUID(),
        name,
        color: color ?? "blue",
        query: query ?? {},
        kind: kind ?? "smart",
        position: Math.max(0, ...spaces.map((candidate) => candidate.position)) + 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      spaces = [...spaces, space];
      return touchSpaces(space);
    },
    updateSpace: async ({ id, name, color, query, position }) => {
      const current = spaceById(id);
      const updated: Space = {
        ...current,
        name: name ?? current.name,
        color: color ?? current.color,
        query: query ?? current.query,
        position: position ?? current.position,
        updatedAt: Date.now(),
      };
      spaces = spaces.map((space) => (space.id === id ? updated : space));
      return touchSpaces(updated);
    },
    deleteSpace: async ({ id }) => {
      spaces = spaces.filter((space) => space.id !== id);
      membership.delete(id);
      touchSpaces(undefined);
    },
    swapSpaces: async ({ firstId, secondId }) => {
      const first = spaceById(firstId);
      const second = spaceById(secondId);
      spaces = spaces.map((space) =>
        space.id === first.id
          ? { ...space, position: second.position }
          : space.id === second.id
            ? { ...space, position: first.position }
            : space,
      );
      return touchSpaces(withCounts());
    },
    addToSpace: async ({ spaceId, itemId }) => {
      spaceById(spaceId);
      membership.set(spaceId, new Set([...(membership.get(spaceId) ?? []), itemId]));
      touchSpaces(undefined);
    },
    removeFromSpace: async ({ spaceId, itemId }) => {
      membership.get(spaceId)?.delete(itemId);
      touchSpaces(undefined);
    },
    itemSpaces: async ({ itemId }) =>
      [...membership.entries()].filter(([, ids]) => ids.has(itemId)).map(([id]) => id),

    jobsFor: async ({ itemIds }) =>
      itemIds.flatMap((id) => {
        const found = jobs.get(id);
        return found ? [found] : [];
      }),
    activeJobs: async () =>
      [...jobs.values()].filter((job) => job.status === "pending" || job.status === "processing")
        .length,
    retryJob: async ({ jobId }) => {
      const found = [...jobs.values()].find((candidate) => candidate.id === jobId);
      if (!found) return false;
      jobs.delete(found.itemId);
      emit({ _tag: "JobsChanged", itemIds: [found.itemId] });
      return true;
    },
    runOcr: () => unavailable("Reading text from images"),
    exportLibrary: () => unavailable("Exporting the library"),
    importLibrary: () => unavailable("Importing a library"),
    lastExport: async () => null,
    librarySize: async () => 0,
    onboardingCompleted: async () => true,
    completeOnboarding: async () => {},

    changes: (onValue) => {
      listeners.add(onValue);
      return () => void listeners.delete(onValue);
    },
  };
}
