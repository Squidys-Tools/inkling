import { expect, test } from "bun:test";
import { createSingleFlightDirectoryPicker } from "./native-dialog.mjs";

test("directory picker is parented, single-flight, and restores focus after cancellation", async () => {
  const deferred = {
    resolve: (_result: { canceled: boolean; filePaths: string[] }) => {},
  };
  const calls: string[] = [];
  let dialogCount = 0;
  const parent = {
    isDestroyed: () => false,
    isMinimized: () => true,
    isVisible: () => false,
    restore: () => calls.push("restore"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
  };
  const chooseDirectory = createSingleFlightDirectoryPicker({
    getParent: () => parent,
    showOpenDialog: (actualParent, options) => {
      dialogCount += 1;
      calls.push("dialog");
      expect(actualParent).toBe(parent);
      expect(options).toEqual({ properties: ["openDirectory"], title: "Export library" });
      if (dialogCount > 1)
        return Promise.resolve({ canceled: false, filePaths: ["export-folder"] });
      return new Promise((resolve) => {
        deferred.resolve = resolve;
      });
    },
  });

  const first = chooseDirectory("Export library");
  expect(await chooseDirectory("Restore library")).toBeNull();
  expect(calls).toEqual(["dialog"]);

  deferred.resolve({ canceled: true, filePaths: [] });
  expect(await first).toBeNull();
  expect(calls).toEqual(["dialog", "restore", "show", "focus"]);
  expect(await chooseDirectory("Export library")).toBe("export-folder");
  expect(calls).toEqual([
    "dialog",
    "restore",
    "show",
    "focus",
    "dialog",
    "restore",
    "show",
    "focus",
  ]);
});

test("directory picker restores focus and clears its lock when opening fails", async () => {
  const calls: string[] = [];
  const parent = {
    isDestroyed: () => false,
    isMinimized: () => false,
    isVisible: () => true,
    restore: () => calls.push("restore"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
  };
  const chooseDirectory = createSingleFlightDirectoryPicker({
    getParent: () => parent,
    showOpenDialog: async () => {
      calls.push("dialog");
      throw new Error("picker failed");
    },
  });

  await expect(chooseDirectory("Export library")).rejects.toThrow("picker failed");
  await expect(chooseDirectory("Export library")).rejects.toThrow("picker failed");
  expect(calls).toEqual(["dialog", "focus", "dialog", "focus"]);
});

test("directory picker does not open without a live parent window", async () => {
  for (const parent of [null, { isDestroyed: () => true }]) {
    const chooseDirectory = createSingleFlightDirectoryPicker({
      getParent: () => parent,
      showOpenDialog: () => {
        throw new Error("must not open an unparented picker");
      },
    });

    expect(await chooseDirectory("Export library")).toBeNull();
  }
});
