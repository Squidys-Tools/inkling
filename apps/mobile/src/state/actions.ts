import * as Haptics from "expo-haptics";
import { Atom, type AtomRegistry } from "effect/reactivity";
import { DesktopError, desktopStatus, type Scope } from "../desktop";
import { SerializedAsyncQueue } from "../lib/serialized-async-queue";
import { readOutbox, sendOutbox, type OutboxEntry } from "../outbox";
import { forgetPairing, loadPairing, savePairing, type Pairing } from "../pairing";
import {
  cardsAtom,
  noticeAtom,
  pairingAtom,
  scopeAtom,
  searchAtom,
  spacesAtom,
  statusAtom,
} from "./library";

/** Captures waiting for the desktop, newest first; they show as cards until it saves them. */
export const outboxAtom = Atom.make<readonly OutboxEntry[]>([]).pipe(Atom.keepAlive);
/** Captures the desktop refused (too large, unreadable); they stay queued and say so. */
export const refusedAtom = Atom.make<ReadonlySet<string>>(new Set<string>()).pipe(Atom.keepAlive);

// Desktop fills in titles and thumbnails in background jobs after a save.
const SETTLE_DELAY = 5000;
const outboxQueue = new SerializedAsyncQueue();
let settleTimer: ReturnType<typeof setTimeout> | undefined;

const success = () =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export const loadSavedPairing = (registry: AtomRegistry.AtomRegistry) =>
  loadPairing().then(
    (pairing) => registry.set(pairingAtom, pairing),
    () => registry.set(pairingAtom, null),
  );

/** Shows what the Share Sheet queued, then sends it if a desktop is paired. Never runs twice at once. */
export const syncOutbox = (registry: AtomRegistry.AtomRegistry) =>
  outboxQueue.run(async () => {
    registry.set(outboxAtom, readOutbox());
    const pairing = registry.get(pairingAtom);
    if (!pairing || registry.get(outboxAtom).length === 0) return;
    const { sent, refused } = await sendOutbox(pairing).catch((error: unknown) => {
      if (error instanceof DesktopError) registry.refresh(statusAtom);
      return { sent: 0, refused: [] as string[] };
    });
    // A forget or re-pair during the upload: this result belongs to the old desktop.
    if (registry.get(pairingAtom) !== pairing) return;
    registry.set(outboxAtom, readOutbox());
    registry.set(refusedAtom, new Set(refused));
    if (sent === 0) return;
    registry.set(noticeAtom, `Sent ${plural(sent, "saved item")} to desktop`);
    success();
    registry.refresh(cardsAtom);
    registry.refresh(statusAtom);
    clearTimeout(settleTimer);
    // Refreshing re-reads with whatever is current then, so it can't bring back an old scope or desktop.
    settleTimer = setTimeout(() => registry.refresh(cardsAtom), SETTLE_DELAY);
  });

export function refreshLibrary(registry: AtomRegistry.AtomRegistry) {
  registry.set(noticeAtom, "");
  registry.refresh(statusAtom);
  registry.refresh(spacesAtom);
  registry.refresh(cardsAtom);
  return syncOutbox(registry);
}

export function submitSearch(registry: AtomRegistry.AtomRegistry, text: string) {
  registry.set(noticeAtom, "");
  registry.set(searchAtom, text.trim());
}

/** A collection picked in the sidebar replaces the search, which only covers the whole library. */
export function selectScope(registry: AtomRegistry.AtomRegistry, scope: Scope) {
  registry.set(searchAtom, "");
  registry.set(scopeAtom, scope);
}

function reset(registry: AtomRegistry.AtomRegistry, pairing: Pairing | null) {
  clearTimeout(settleTimer);
  // Another desktop's Spaces and refusals don't exist on this one.
  registry.set(scopeAtom, { kind: "everything" });
  registry.set(searchAtom, "");
  registry.set(noticeAtom, "");
  registry.set(refusedAtom, new Set<string>());
  registry.set(pairingAtom, pairing);
}

/** Checks the desktop answers with this token before keeping it, so a typo never replaces a working pairing. */
export async function pair(registry: AtomRegistry.AtomRegistry, next: Pairing) {
  await desktopStatus(next);
  await savePairing(next);
  reset(registry, next);
  success();
  void syncOutbox(registry);
}

export async function forget(registry: AtomRegistry.AtomRegistry) {
  await forgetPairing();
  reset(registry, null);
}
