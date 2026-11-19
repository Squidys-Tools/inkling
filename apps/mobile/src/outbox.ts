import { Directory, File } from "expo-file-system";
import InklingNative from "../modules/inkling-native/src/InklingNativeModule";
import { DesktopError, uploadCapture } from "./desktop";
import type { Pairing } from "./pairing";

const APP_GROUP = "group.app.inkling.mobile.dev";

export type OutboxEntry = {
  id: string;
  kind: string;
  text: string;
  createdAt: number;
  file?: string;
};

function outboxDirectory() {
  const root = InklingNative.appGroupPath(APP_GROUP);
  return root ? new Directory(`file://${root}/outbox`) : null;
}

export function readOutbox(): OutboxEntry[] {
  const outbox = outboxDirectory();
  if (!outbox?.exists) return [];
  return outbox
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith(".json"))
    .map((file) => JSON.parse(file.textSync()) as OutboxEntry)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Sends each queued capture oldest first; an entry leaves the outbox only after desktop saved it. */
export async function sendOutbox(pairing: Pairing) {
  const outbox = outboxDirectory();
  if (!outbox) return { sent: 0, refused: 0 };
  let sent = 0;
  let refused = 0;
  for (const entry of readOutbox().reverse()) {
    const payload = entry.file ? new File(outbox, entry.file) : null;
    try {
      await uploadCapture(pairing, {
        id: entry.id,
        kind: entry.kind,
        text: entry.text,
        file: payload?.exists ? await payload.base64() : undefined,
      });
    } catch (error) {
      // A capture desktop refuses (too large, unknown kind) stays queued without blocking the rest.
      if (!(error instanceof DesktopError) || error.status >= 500) throw error;
      refused += 1;
      continue;
    }
    // The record goes first, so a crash between the two never leaves a record without its file.
    new File(outbox, `${entry.id}.json`).delete();
    if (payload?.exists) payload.delete();
    sent += 1;
  }
  return { sent, refused };
}
