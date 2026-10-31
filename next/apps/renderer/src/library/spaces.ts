import type { Space, SpaceColor, SpaceKind } from "@inkling/contracts";
import { libraryClient } from "./connection.ts";
import { errorMessage } from "./errors.ts";
import { createStore, useStore } from "./store.ts";

const spaceColors: readonly SpaceColor[] = ["blue", "orange", "green", "pink", "purple", "yellow"];

type SpacesState = { spaces: readonly Space[]; loaded: boolean; error: string | null };

export const spacesStore = createStore<SpacesState>({ spaces: [], loaded: false, error: null });

const ordered = (spaces: readonly Space[]) => [...spaces].sort((a, b) => a.position - b.position);

/** The order after swapping a Space with its neighbor, or null when it is already at that end. */
function swapWithNeighbor(spaces: readonly Space[], id: string, direction: -1 | 1) {
  const sorted = ordered(spaces);
  const index = sorted.findIndex((space) => space.id === id);
  const neighbor = sorted[index + direction];
  if (index < 0 || !neighbor) return null;
  const position = sorted[index].position;
  return {
    neighborId: neighbor.id,
    spaces: ordered(
      sorted.map((space) =>
        space.id === id
          ? { ...space, position: neighbor.position }
          : space.id === neighbor.id
            ? { ...space, position }
            : space,
      ),
    ),
  };
}

const fail = (message: string) => spacesStore.set((state) => ({ ...state, error: message }));
export const dismissSpaceError = () => spacesStore.set((state) => ({ ...state, error: null }));

// Each reload takes a number, and only the newest answer is applied, so a
// slow reload cannot put back an order a later move already changed.
let reloads = 0;
export async function reloadSpaces() {
  const mine = ++reloads;
  try {
    const spaces = await (await libraryClient()).spaces({});
    if (mine === reloads)
      spacesStore.set((state) => ({ ...state, spaces: ordered(spaces), loaded: true }));
  } catch (error) {
    if (mine === reloads) fail(errorMessage(error));
  }
}

async function attempt<T>(message: string, action: () => Promise<T>) {
  try {
    return await action();
  } catch {
    fail(message);
    return null;
  }
}

export function createSpace(name: string, kind: SpaceKind, queryText: string) {
  const { spaces } = spacesStore.get();
  return attempt("Couldn’t create this Space.", async () => {
    const client = await libraryClient();
    // A Regular Space is filled by hand, so a search behind it does not become its query.
    const created = await client.createSpace({
      name: name.trim().slice(0, 80),
      kind,
      color: spaceColors[spaces.length % spaceColors.length],
      query: kind === "smart" && queryText.trim() ? { text: queryText.trim() } : {},
    });
    spacesStore.set((state) => ({
      ...state,
      spaces: ordered([...state.spaces.filter((space) => space.id !== created.id), created]),
    }));
    return created;
  });
}

function replace(updated: Space) {
  spacesStore.set((state) => ({
    ...state,
    spaces: state.spaces.map((space) => (space.id === updated.id ? updated : space)),
  }));
}

export async function renameSpace(space: Space, name: string) {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed || trimmed === space.name) return true;
  const updated = await attempt("Couldn’t rename this Space.", async () =>
    (await libraryClient()).updateSpace({ id: space.id, name: trimmed }),
  );
  if (updated) replace(updated);
  return updated !== null;
}

export async function recolorSpace(space: Space) {
  const color = spaceColors[(spaceColors.indexOf(space.color) + 1) % spaceColors.length];
  replace({ ...space, color });
  const updated = await attempt("Couldn’t change this Space’s color.", async () =>
    (await libraryClient()).updateSpace({ id: space.id, color }),
  );
  if (updated) replace(updated);
  else replace(space);
}

export async function moveSpace(space: Space, direction: -1 | 1) {
  const swap = swapWithNeighbor(spacesStore.get().spaces, space.id, direction);
  if (!swap) return;
  // Shown at once, so quick repeated moves chain off the order on screen.
  spacesStore.set((state) => ({ ...state, spaces: swap.spaces }));
  const mine = ++reloads;
  try {
    const confirmed = await (
      await libraryClient()
    ).swapSpaces({
      firstId: space.id,
      secondId: swap.neighborId,
    });
    if (mine === reloads) spacesStore.set((state) => ({ ...state, spaces: ordered(confirmed) }));
  } catch {
    fail("Couldn’t move this Space.");
    void reloadSpaces();
  }
}

/** Deletes the Space only; its items stay in the library. */
export async function deleteSpace(space: Space) {
  const done = await attempt("Couldn’t delete this Space.", async () => {
    await (await libraryClient()).deleteSpace({ id: space.id });
    return true;
  });
  if (done)
    spacesStore.set((state) => ({
      ...state,
      spaces: state.spaces.filter((candidate) => candidate.id !== space.id),
    }));
  return done === true;
}

export async function setInSpace(spaceId: string, itemId: string, filed: boolean) {
  await attempt(
    filed ? "Couldn’t add this to the Space." : "Couldn’t take this out of the Space.",
    async () => {
      const client = await libraryClient();
      if (filed) await client.addToSpace({ spaceId, itemId });
      else await client.removeFromSpace({ spaceId, itemId });
    },
  );
}

export const useSpaces = () => useStore(spacesStore, (state) => state.spaces);
export const useSpace = (id: string | null) =>
  useStore(spacesStore, (state) =>
    id ? state.spaces.find((space) => space.id === id) : undefined,
  );
export const useSpaceError = () => useStore(spacesStore, (state) => state.error);
