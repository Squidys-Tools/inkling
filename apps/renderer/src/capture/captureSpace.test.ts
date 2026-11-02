import { expect, test } from "bun:test";
import { finishSpaceCapture } from "./captureSpace.ts";

test("capture files into the starting Regular Space, not the destination open at completion", async () => {
  const events: string[] = [];
  const destination = { id: "start", kind: "regular" as const };
  expect(
    await finishSpaceCapture("new", destination, {
      add: async (space, item) => {
        events.push(`${space}:${item}`);
      },
      reload: (space) => {
        events.push(`reload:${space}`);
      },
    }),
  ).toBeNull();
  expect(events).toEqual(["start:new", "reload:start"]);
});

test("Smart Space and Everything captures are never forced into query results", async () => {
  const actions = {
    add: async () => {
      throw Error("must not file");
    },
    reload: () => {
      throw Error("must not reload");
    },
  };
  expect(await finishSpaceCapture("new", { id: "smart", kind: "smart" }, actions)).toBeNull();
  expect(await finishSpaceCapture("new", null, actions)).toBeNull();
});

test("filing failure reports partial success rather than retrying and duplicating the save", async () => {
  expect(
    await finishSpaceCapture(
      "saved",
      { id: "deleted", kind: "regular" },
      {
        add: async () => {
          throw Error("gone");
        },
        reload: () => {},
      },
    ),
  ).toContain("Saved in Everything");
});
