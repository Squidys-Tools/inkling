import { createStore, useStore } from "./store.ts";

/** The card the library marks: the one last opened, or a note just saved. */
export const selection = createStore<string | null>(null);

export const selectCard = (id: string | null) => selection.set(id);
export const useIsSelected = (id: string) => useStore(selection, (selected) => selected === id);
