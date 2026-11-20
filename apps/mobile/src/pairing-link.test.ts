/// <reference types="bun" />
import { expect, test } from "bun:test";
import { parsePairingLink } from "./pairing-link";

test("a pairing link gives the desktop's HTTPS address and token, and anything else is ignored", () => {
  const url = "https://studio.tail1234.ts.net:8443";
  for (const [link, expected] of [
    [`inkling-mobile://pair?url=${encodeURIComponent(url)}&token=abc`, { url, token: "abc" }],
    [`inkling-mobile://pair/?token=abc&url=${encodeURIComponent(url)}`, { url, token: "abc" }],
    [`inkling-mobile://pair?url=${encodeURIComponent(url)}`, null],
    // Plain HTTP, a path, or a bare tailnet address would send the token somewhere it shouldn't go.
    ["inkling-mobile://pair?url=http%3A%2F%2Fstudio.ts.net&token=abc", null],
    [`inkling-mobile://pair?url=${encodeURIComponent(`${url}/evil`)}&token=abc`, null],
    ["inkling-mobile://pair?address=100.86.34.42%3A47620&token=abc", null],
    ["inkling-mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082", null],
    ["https://example.com/pair?url=a&token=b", null],
    [`inkling-mobile://pair?url=${encodeURIComponent(url)}&token=%E0%A4%A`, null],
  ] as const)
    expect([link, parsePairingLink(link)]).toEqual([link, expected]);
});
