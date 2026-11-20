import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { AsyncResult, Atom } from "effect/reactivity";
import {
  cardPage,
  DesktopError,
  desktopStatus,
  listSpaces,
  searchCards,
  type PhoneCard,
  type Scope,
} from "../desktop";
import type { Pairing } from "../pairing";

/** `undefined` until the Keychain has been read, so a stored pairing never flashes "Pair". */
export const pairingAtom = Atom.make<Pairing | null | undefined>(undefined).pipe(Atom.keepAlive);
export const scopeAtom = Atom.make<Scope>({ kind: "everything" }).pipe(Atom.keepAlive);
/** The search the user submitted; typing alone never searches. */
export const searchAtom = Atom.make("").pipe(Atom.keepAlive);
/** A line such as "Sent 2 saved items to desktop", shown above the grid until the next refresh. */
export const noticeAtom = Atom.make("").pipe(Atom.keepAlive);

const fromDesktop = <A>(load: (pairing: Pairing, signal: AbortSignal) => Promise<A>) =>
  Atom.make((get) => {
    const pairing = get(pairingAtom);
    return pairing
      ? Effect.tryPromise({ try: (signal) => load(pairing, signal), catch: (error) => error })
      : Effect.succeed(null);
  });

/** Also the connection probe: its result says whether desktop is reachable and still accepts us. */
export const statusAtom = fromDesktop(desktopStatus).pipe(Atom.keepAlive);
export const spacesAtom = fromDesktop(listSpaces).pipe(Atom.keepAlive);

/**
 * The grid: the submitted search, or the scope's cards a page per pull. Changing the pairing,
 * scope or search rebuilds it and interrupts the old request, so a late answer can't land.
 */
export const cardsAtom = Atom.pull((get): Stream.Stream<PhoneCard, unknown> => {
  const pairing = get(pairingAtom);
  const scope = get(scopeAtom);
  const query = get(searchAtom).trim();
  if (!pairing) return Stream.empty;
  if (query)
    return Stream.paginate(undefined, () =>
      Effect.tryPromise({
        try: (signal) => searchCards(pairing, query, signal),
        catch: (error) => error,
      }).pipe(Effect.map((cards) => [cards, Option.none<undefined>()] as const)),
    );
  return Stream.paginate(null as string | null, (cursor) =>
    Effect.tryPromise({
      try: (signal) => cardPage(pairing, scope, cursor, signal),
      catch: (error) => error,
    }).pipe(Effect.map((page) => [page.cards, Option.fromNullishOr(page.next)] as const)),
  );
});

export type CardsView = {
  cards: readonly PhoneCard[];
  /** More pages wait on the desktop. */
  more: boolean;
  loading: boolean;
  failed: boolean;
};

/** Atom.pull fails an empty stream with NoSuchElementError; to the grid that is just no cards. */
export function cardsView(result: Atom.PullResult<PhoneCard, unknown>): CardsView {
  const loading = result.waiting || AsyncResult.isInitial(result);
  if (AsyncResult.isSuccess(result))
    return { cards: result.value.items, more: !result.value.done, loading, failed: false };
  if (AsyncResult.isFailure(result)) {
    const empty = Cause.squash(result.cause) instanceof Cause.NoSuchElementError;
    const previous = Option.getOrUndefined(result.previousSuccess);
    return {
      cards: empty ? [] : (previous?.value.items ?? []),
      more: false,
      loading,
      failed: !empty && !Cause.hasInterruptsOnly(result.cause),
    };
  }
  return { cards: [], more: false, loading, failed: false };
}

export type Connection = "loading" | "unpaired" | "connecting" | "connected" | "offline" | "repair";

/** One state for every screen to switch on, from the pairing and the last status probe. */
export const connectionAtom = Atom.make((get): Connection => {
  const pairing = get(pairingAtom);
  if (pairing === undefined) return "loading";
  if (pairing === null) return "unpaired";
  const status = get(statusAtom);
  if (AsyncResult.isSuccess(status)) return "connected";
  if (AsyncResult.isFailure(status)) {
    const error = Cause.squash(status.cause);
    return error instanceof DesktopError && error.status === 401 ? "repair" : "offline";
  }
  return "connecting";
});

/** The library's size, from the last status the desktop answered. */
export const totalAtom = Atom.make((get) => {
  const status = get(statusAtom);
  return AsyncResult.isSuccess(status) ? (status.value?.items ?? null) : null;
});
