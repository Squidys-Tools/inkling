import { expect, test } from "bun:test";
import { createNotifications } from "./toasts.ts";

test("repeated keyed outcomes update one notice and excess notices release retained actions", async () => {
  const notices = createNotifications();
  const events: { action: string; options: { id?: string; title?: string; timeout?: number } }[] =
    [];
  const stop = notices.manager[" subscribe"]((event) => events.push(event));
  let calls = 0;
  const old = notices.notify("Archived", {
    id: "archive:item",
    action: {
      label: "Undo",
      run: () => {
        calls++;
      },
    },
  });
  notices.notifyError("Could not copy", undefined, "copy");
  notices.notifyError("Could not copy", undefined, "copy");
  notices.notify("Saved", { id: "saved" });
  expect(events.filter((event) => event.action === "close")).toHaveLength(0);
  notices.notify("Space created");
  expect(events.find((event) => event.action === "close")?.options.id).toBe(old);
  await notices.runAction(old);
  expect(calls).toBe(0);
  expect(
    events.filter((event) => event.action === "add" && event.options.id === "copy"),
  ).toHaveLength(2);
  expect(events.find((event) => event.options.title === "Saved")?.options.timeout).toBe(5000);
  expect(events.find((event) => event.options.title === "Could not copy")?.options.timeout).toBe(0);
  stop();
});

test("Undo runs once while pending, closes only on success and exposes rejection", async () => {
  const notices = createNotifications();
  const events: { action: string; options: { title?: string; description?: string } }[] = [];
  notices.manager[" subscribe"]((event) => events.push(event));
  const gate = Promise.withResolvers<void>();
  let calls = 0;
  const id = notices.notify("Archived", {
    action: {
      label: "Undo",
      run: () => {
        calls++;
        return gate.promise;
      },
    },
  });
  const pending = notices.runAction(id);
  await notices.runAction(id);
  expect(calls).toBe(1);
  expect(events.some((event) => event.action === "close")).toBe(false);
  gate.resolve();
  await pending;
  expect(events.at(-1)?.action).toBe("close");
  const replaced = Promise.withResolvers<void>();
  const replacementId = notices.notify("Archived", {
    id: "same-item",
    action: { label: "Undo", run: () => replaced.promise },
  });
  const oldPending = notices.runAction(replacementId);
  notices.notify("Archived again", { id: replacementId });
  replaced.resolve();
  await oldPending;
  expect(events.at(-1)?.options.title).toBe("Archived again");
  let closed = 0;
  notices.notify("Capture failed", {
    id: "capture-error",
    onClose: () => {
      closed++;
    },
  });
  notices.dismiss("capture-error");
  expect(closed).toBe(1);
  const failed = notices.notify("Archived", {
    action: { label: "Undo", run: () => Promise.reject(new Error("Library unavailable")) },
  });
  await notices.runAction(failed);
  expect(events.at(-1)?.options).toMatchObject({
    title: "Couldn’t complete this action",
    description: "Library unavailable",
  });
});
