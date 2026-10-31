import { createStore, useStore } from "../library/store.ts";

// Card actions (archive, restore, delete, retry, copy) fail here, apart from
// capture failures, which are the only ones that make the mascot sad.
const actionError = createStore<string | null>(null);

export const reportActionError = (message: string) => actionError.set(message);
export const dismissActionError = () => actionError.set(null);
export const useActionError = () => useStore(actionError, (message) => message);
