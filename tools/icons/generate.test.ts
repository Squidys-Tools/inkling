import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { generate } from "./generate.ts";

const dir = new URL("../../packages/ui/src/icons/", import.meta.url);

test("the committed icon files are what the manifest generates", () => {
  const onDisk = new Map(
    readdirSync(dir).map((name) => [
      name,
      readFileSync(new URL(name, dir), "utf8").replaceAll("\r\n", "\n"),
    ]),
  );
  expect(onDisk).toEqual(generate());
});
