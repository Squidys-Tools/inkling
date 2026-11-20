import { Directory, File } from "expo-file-system";
import InklingNative from "../modules/inkling-native/src/InklingNativeModule";
import { DesktopError, uploadCapture } from "./desktop";
import type { Pairing } from "./pairing";

const APP_GROUP = "group.app.inkling.mobile.dev";
// The Share Extension writes a payload before its record, so a young payload may not have one yet.
const ORPHAN_AFTER = 10 * 60_000;

export type OutboxEntry = {
  id: string;
  kind: "url" | "note" | "image";
  text: string;
  createdAt: number;
  file?: string;
};

const isEntry = (value: unknown): value is OutboxEntry => {
  const entry = value as OutboxEntry | null;
  return (
    typeof entry?.id === "string" &&
    (entry.kind === "url" || entry.kind === "note" || entry.kind === "image") &&
    typeof entry.text === "string" &&
    typeof entry.createdAt === "number"
  );
};

function outboxDirectory() {
  const root = InklingNative.appGroupPath(APP_GROUP);
  return root ? new Directory(`file://${root}/outbox`) : null;
}

function parse(file: File) {
  try {
    const entry: unknown = JSON.parse(file.textSync());
    return isEntry(entry) ? [entry] : [];
  } catch {
    return [];
  }
}

/** Where a queued image waits on this phone, so its card can show it before desktop has it. */
export function payloadUri(entry: OutboxEntry) {
  const outbox = outboxDirectory();
  return outbox && entry.file ? new File(outbox, entry.file).uri : null;
}

/** Newest first. Also clears payloads whose record never landed or was already sent. */
export function readOutbox(now = Date.now()): OutboxEntry[] {
  const outbox = outboxDirectory();
  if (!outbox?.exists) return [];
  const files = outbox.list().filter((entry): entry is File => entry instanceof File);
  const records = new Set(
    files.filter((file) => file.name.endsWith(".json")).map((file) => file.name),
  );
  for (const file of files)
    if (
      file.name.endsWith(".bin") &&
      !records.has(file.name.replace(/\.bin$/u, ".json")) &&
      now - (file.info().modificationTime ?? now) > ORPHAN_AFTER
    )
      file.delete();
  return files
    .filter((file) => file.name.endsWith(".json"))
    .flatMap(parse)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Sends each queued capture oldest first; an entry leaves the outbox only after desktop saved it.
 * A capture desktop refuses, or one that fails in transit, stays queued and doesn't hold up the rest.
 */
export async function sendOutbox(pairing: Pairing) {
  const outbox = outboxDirectory();
  if (!outbox) return { sent: 0, refused: [] as string[] };
  let sent = 0;
  const refused: string[] = [];
  for (const entry of readOutbox().reverse()) {
    const payload = entry.file ? new File(outbox, entry.file) : null;
    try {
      await uploadCapture(pairing, {
        id: entry.id,
        kind: entry.kind,
        text: entry.text,
        file: payload,
      });
    } catch (error) {
      // A revoked token fails every entry the same way; stop and let the user pair again.
      if (error instanceof DesktopError && error.status === 401) throw error;
      if (error instanceof DesktopError && error.status < 500) refused.push(entry.id);
      continue;
    }
    // The record goes first: a crash between the two leaves only a payload, which readOutbox clears.
    new File(outbox, `${entry.id}.json`).delete();
    if (payload?.exists) payload.delete();
    sent += 1;
  }
  return { sent, refused };
}
