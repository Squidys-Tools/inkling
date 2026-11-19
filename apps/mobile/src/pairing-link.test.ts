/// <reference types="bun" />
import { expect, test } from "bun:test";
import { parsePairingLink } from "./pairing-link";

test("a pairing link gives the desktop address and token, and anything else is ignored", () => {
  for (const [link, expected] of [
    [
      "inkling-mobile://pair?address=100.86.34.42%3A47620&token=abc",
      { address: "100.86.34.42:47620", token: "abc" },
    ],
    [
      "inkling-mobile://pair/?token=abc&address=%5Bfd7a%3A%3A1%5D%3A47620",
      { address: "[fd7a::1]:47620", token: "abc" },
    ],
    ["inkling-mobile://pair?address=100.86.34.42%3A47620", null],
    ["inkling-mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082", null],
    ["https://example.com/pair?address=a&token=b", null],
    ["inkling-mobile://pair?address=100.86.34.42%3A47620&token=%E0%A4%A", null],
  ] as const)
    expect([link, parsePairingLink(link)]).toEqual([link, expected]);
});
