import { Directory, File } from "expo-file-system";
import InklingNative from "../modules/inkling-native/src/InklingNativeModule";

const APP_GROUP = "group.app.inkling.mobile.dev";

export type OutboxEntry = {
  id: string;
  kind: string;
  text: string;
  createdAt: number;
  file?: string;
};

export function readOutbox(): OutboxEntry[] {
  const root = InklingNative.appGroupPath(APP_GROUP);
  if (!root) return [];
  const outbox = new Directory(`file://${root}/outbox`);
  if (!outbox.exists) return [];
  return outbox
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith(".json"))
    .map((file) => JSON.parse(file.textSync()) as OutboxEntry)
    .sort((a, b) => b.createdAt - a.createdAt);
}
