import { expect, test } from "bun:test";
import { tokenLooksValid } from "./pairing-token.ts";

test("a stored pairing token is reused only when it looks generated", () => {
  expect(tokenLooksValid("a".repeat(64))).toBe(true);
  expect(tokenLooksValid("short")).toBe(false);
  expect(tokenLooksValid("has spaces in it yes indeed 1234567890")).toBe(false);
});
