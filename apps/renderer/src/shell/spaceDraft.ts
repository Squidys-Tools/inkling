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

export const updateSpaceDraft = (patch: Partial<SpaceDraft>) =>
  spaceDraft.set((draft) => ({ ...draft, ...patch }));
export const closeSpaceDraft = () => spaceDraft.set(closed);
