import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { libraryDirectory } from "./data-directory.ts";

test("data directory keeps portable precedence and the product app-data identity", () => {
  const paths = {
    executablePath: "/apps/inkling/inkling.exe",
    appDataDirectory: "/users/test/AppData/Roaming",
  };
  expect(
    libraryDirectory({ ...paths, portable: true, overrideDirectory: "/scratch/library" }),
  ).toBe(join("/apps/inkling", "data"));
  expect(libraryDirectory({ ...paths, portable: false, overrideDirectory: undefined })).toBe(
    join("/users/test/AppData/Roaming", "com.inkling.library"),
  );
  expect(
    libraryDirectory({ ...paths, portable: false, overrideDirectory: "/scratch/library" }),
  ).toBe(resolve("/scratch/library"));
});
