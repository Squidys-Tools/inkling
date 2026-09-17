import { describe, expect, test } from "bun:test";
import {
  DEEP_LINK_ATTRIBUTION_MAX_LENGTH,
  DEEP_LINK_SELECTION_MAX_LENGTH,
  parseDeepLinkCapture,
} from "./deepLink";

describe("parseDeepLinkCapture", () => {
  test("url-only inkling link keeps working", () => {
    expect(parseDeepLinkCapture("inkling://capture?url=https%3A%2F%2Fexample.com%2Farticle")).toEqual({
      kind: "url",
      url: "https://example.com/article",
    });
  });

  test("legacy mymind links keep working", () => {
    expect(parseDeepLinkCapture("mymind://capture?url=https%3A%2F%2Fexample.com%2F")).toEqual({
      kind: "url",
      url: "https://example.com/",
    });
  });

  test("supports the legacy source param", () => {
    expect(parseDeepLinkCapture("inkling://capture?source=https%3A%2F%2Fexample.com%2F")).toEqual({
      kind: "url",
      url: "https://example.com/",
    });
  });

  test("selection creates a quote with the title as attribution", () => {
    expect(
      parseDeepLinkCapture(
        "inkling://capture?url=https%3A%2F%2Fexample.com%2Fessay&title=Great%20Essay&selection=Some%20quoted%20text",
      ),
    ).toEqual({
      kind: "quote",
      url: "https://example.com/essay",
      selection: "Some quoted text",
      attribution: "Great Essay",
    });
  });

  test("selection text is url-decoded but otherwise untouched", () => {
    const parsed = parseDeepLinkCapture(
      "inkling://capture?url=https%3A%2F%2Fexample.com%2F&selection=hello%20%22world%22%20%26%20friends",
    );
    expect(parsed).toEqual({
      kind: "quote",
      url: "https://example.com/",
      selection: 'hello "world" & friends',
      attribution: "example.com",
    });
  });

  test("missing title falls back to the source hostname", () => {
    const parsed = parseDeepLinkCapture(
      "inkling://capture?url=https%3A%2F%2Fwww.example.com%2Fpost&selection=keep%20this",
    );
    expect(parsed?.kind).toBe("quote");
    if (parsed?.kind === "quote") expect(parsed.attribution).toBe("example.com");
  });

  test("selection truncates to the backend-safe limit", () => {
    const long = "x".repeat(DEEP_LINK_SELECTION_MAX_LENGTH + 500);
    const parsed = parseDeepLinkCapture(
      `inkling://capture?url=https%3A%2F%2Fexample.com%2F&selection=${long}`,
    );
    expect(parsed?.kind).toBe("quote");
    if (parsed?.kind === "quote") expect(parsed.selection).toBe("x".repeat(DEEP_LINK_SELECTION_MAX_LENGTH));
  });

  test("attribution truncates to the backend-safe limit", () => {
    const long = "t".repeat(DEEP_LINK_ATTRIBUTION_MAX_LENGTH + 100);
    const parsed = parseDeepLinkCapture(
      `inkling://capture?url=https%3A%2F%2Fexample.com%2F&title=${long}&selection=keep`,
    );
    if (parsed?.kind === "quote") {
      expect(parsed.attribution).toBe("t".repeat(DEEP_LINK_ATTRIBUTION_MAX_LENGTH));
      expect(parsed.selection).toBe("keep");
    } else {
      throw new Error("expected a quote capture");
    }
  });

  test("blank selection keeps url behavior", () => {
    expect(
      parseDeepLinkCapture("inkling://capture?url=https%3A%2F%2Fexample.com%2F&selection=%20%20"),
    ).toEqual({ kind: "url", url: "https://example.com/" });
  });

  test("rejects non-http targets", () => {
    expect(parseDeepLinkCapture("inkling://capture?url=javascript%3Aalert(1)")).toBeNull();
    expect(parseDeepLinkCapture("inkling://capture?url=ftp%3A%2F%2Fexample.com%2Ffile")).toBeNull();
    expect(parseDeepLinkCapture("inkling://capture?url=file%3A%2F%2F%2Fetc%2Fpasswd")).toBeNull();
  });

  test("rejects wrong scheme, host, and missing url", () => {
    expect(parseDeepLinkCapture("https://example.com/?url=https%3A%2F%2Fexample.com%2F")).toBeNull();
    expect(parseDeepLinkCapture("inkling://open?url=https%3A%2F%2Fexample.com%2F")).toBeNull();
    expect(parseDeepLinkCapture("inkling://capture?title=No%20url")).toBeNull();
    expect(parseDeepLinkCapture("not a url")).toBeNull();
  });
});
