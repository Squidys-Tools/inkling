import { describe, expect, test } from "bun:test";
import { answerConfirm, confirm, confirmRequests } from "./confirm.ts";

describe("confirm", () => {
  test("answers the open question, and a new question cancels the one it replaces", async () => {
    const first = confirm({ message: "Delete it?", confirmLabel: "Delete" });
    const second = confirm({ message: "Discard it?", confirmLabel: "Discard" });
    expect(await first).toBe(false);
    expect(confirmRequests.get()?.message).toBe("Discard it?");
    answerConfirm(true);
    expect(await second).toBe(true);
    expect(confirmRequests.get()).toBeNull();
  });
});
