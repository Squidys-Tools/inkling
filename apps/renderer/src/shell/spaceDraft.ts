import type { SpaceKind } from "@inkling/contracts";
import { createStore, useStore } from "../library/store.ts";
import { setSidebarOpen } from "../libraryView/viewState.ts";

type SpaceDraft = {
  open: boolean;
  name: string;
  kind: SpaceKind;
  /** The search a Smart Space saves, captured when the draft opened. */
  query: string;
};

const closed: SpaceDraft = { open: false, name: "", kind: "smart", query: "" };

/** The new-Space form in the sidebar, which "Save as Space" opens from the search row. */
export const spaceDraft = createStore<SpaceDraft>(closed);

export const useSpaceDraft = () => useStore(spaceDraft, (draft) => draft);

export function openSpaceDraft(query = "") {
  setSidebarOpen(true);
  spaceDraft.set({ open: true, name: "", kind: "smart", query });
}

/** The compact + reveals an existing draft without discarding its captured query or name. */
export function resumeSpaceDraft() {
  if (spaceDraft.get().open) setSidebarOpen(true);
  else openSpaceDraft();
}

export const updateSpaceDraft = (patch: Partial<SpaceDraft>) =>
  spaceDraft.set((draft) => ({ ...draft, ...patch }));
export const closeSpaceDraft = () => spaceDraft.set(closed);

let creating = false;

/** Creates the drafted Space once, however often Enter or Create is pressed while it saves. */
export async function createDraftedSpace<Created>(
  create: (name: string, kind: SpaceKind, query: string) => Promise<Created | null>,
) {
  const draft = spaceDraft.get();
  if (creating || !draft.name.trim()) return null;
  creating = true;
  try {
    const created = await create(draft.name, draft.kind, draft.query);
    // The draft may have changed while the Space was being made; only close the one that asked.
    if (created && spaceDraft.get() === draft) closeSpaceDraft();
    return created;
  } finally {
    creating = false;
  }
}
