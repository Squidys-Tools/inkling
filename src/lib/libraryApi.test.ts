import { expect, test } from "bun:test";

const invokeCalls: { command: string; args?: Record<string, unknown> }[] = [];

const commands = new Proxy(
  {} as Record<string, (args?: Record<string, unknown>) => Promise<unknown>>,
  {
    get: (_target, property) => {
      if (typeof property !== "string") return undefined;
      return async (args?: Record<string, unknown>) => {
        invokeCalls.push({ command: property, args });
        if (property === "initialize_storage") {
          return { databasePath: "library.sqlite3", fts5Enabled: true, schemaVersion: 1 };
        }
        if (property === "list_spaces") return [];
        if (property === "import_library") {
          return {
            importedItems: 1,
            skippedDuplicateItems: 0,
            importedSpaces: 0,
            skippedDuplicateSpaces: 0,
            assetFiles: 0,
            unverifiedAssetFiles: 0,
          };
        }
        throw new Error(`Unexpected command: ${property}`);
      };
    },
  },
);

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { inkling: { commands } },
});

const { assetUrl, selectLibraryDirectory } = await import("./libraryApi");

test("Electron resolves managed assets through app protocol and uses its native folder picker", async () => {
  const originalWindow = globalThis.window;
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        inkling: {
          commands: {
            select_library_directory: async ({ title }: { title: string }) => `/scratch/${title}`,
          },
        },
      },
    });

    expect(await assetUrl("assets/items/abc/my image.png")).toBe(
      "app://local/library-assets/items/abc/my%20image.png",
    );
    expect(await assetUrl("assets/items/../outside.png")).toBeUndefined();
    expect(await assetUrl("assets/items//outside.png")).toBeUndefined();
    expect(await assetUrl("assets/items/./outside.png")).toBeUndefined();
    expect(await assetUrl("assets/items/abc:outside.png")).toBeUndefined();
    expect(await selectLibraryDirectory("Exports")).toBe("/scratch/Exports");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("Space reads and export restores wait for storage initialization", async () => {
  // Mounted capture fixtures may have initialized the default module already.
  const apiModule = "./libraryApi?library-api-initialization-test";
  const { listSpaces, importLibrary } = (await import(apiModule)) as typeof import("./libraryApi");
  invokeCalls.length = 0;

  await Promise.all([listSpaces(), importLibrary("export-folder")]);

  expect(invokeCalls[0]?.command).toBe("initialize_storage");
  expect(
    invokeCalls
      .slice(1)
      .map((call) => call.command)
      .sort(),
  ).toEqual(["import_library", "list_spaces"]);
  expect(invokeCalls.find((call) => call.command === "import_library")?.args).toEqual({
    exportDirectory: "export-folder",
  });
});
