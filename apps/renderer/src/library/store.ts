import { useSyncExternalStore } from "react";

export type Store<State> = {
  get: () => State;
  set: (next: State | ((current: State) => State)) => void;
  subscribe: (listener: () => void) => () => void;
};

/** A value outside React that components read through `useStore` with a selector. */
export function createStore<State>(initial: State): Store<State> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      const value = typeof next === "function" ? (next as (current: State) => State)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/**
 * Re-renders only when the selected value changes, so a selector must return
 * something already in the state (or a primitive), never a fresh object.
 */
export function useStore<State, Selected>(store: Store<State>, select: (state: State) => Selected) {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}
