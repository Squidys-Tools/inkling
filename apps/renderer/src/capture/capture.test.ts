import { describe, expect, it } from "bun:test";
import { looksLikeUrl, withScheme } from "./capture.ts";

// The Add menu's quick field, paste and drag-and-drop all route through this
// split: a link becomes a saved page, anything else a note.
describe("looksLikeUrl", () => {
  it("accepts http and https URLs", () => {
    expect(looksLikeUrl("https://example.com/page?a=1")).toBe(true);
    expect(looksLikeUrl("http://example.com")).toBe(true);
  });

  it("accepts bare domains, with paths and ports", () => {
    expect(looksLikeUrl("example.com")).toBe(true);
    expect(looksLikeUrl("sub.example.co.uk/article")).toBe(true);
    expect(looksLikeUrl("example.com:8080/x")).toBe(true);
  });

  it("rejects plain note text", () => {
    expect(looksLikeUrl("pick up milk")).toBe(false);
    expect(looksLikeUrl("word")).toBe(false);
    expect(looksLikeUrl("a.b")).toBe(false);
    expect(looksLikeUrl("localhost:3000")).toBe(false);
    expect(looksLikeUrl("")).toBe(false);
  });
});

describe("withScheme", () => {
  it("leaves schemed URLs alone and upgrades bare domains", () => {
    expect(withScheme("http://example.com")).toBe("http://example.com");
    expect(withScheme("example.com/x")).toBe("https://example.com/x");
  });
});
