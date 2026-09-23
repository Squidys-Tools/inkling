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

  test("url capture keeps the title for a provisional card", () => {
    expect(
      parseDeepLinkCapture("inkling://capture?url=https%3A%2F%2Fexample.com%2Farticle&title=Great%20Essay&via=extension"),
    ).toEqual({
      kind: "url",
      url: "https://example.com/article",
      title: "Great Essay",
    });
  });

  test("blank title is omitted rather than kept empty", () => {
    expect(
      parseDeepLinkCapture("inkling://capture?url=https%3A%2F%2Fexample.com%2F&title=%20%20"),
    ).toEqual({
      kind: "url",
      url: "https://example.com/",
    });
  });

  test("ignores the via provenance marker", () => {
    expect(
      parseDeepLinkCapture("inkling://capture?url=https%3A%2F%2Fexample.com%2F&via=extension"),
    ).toEqual({
      kind: "url",
      url: "https://example.com/",
    });
  });

  test("image param captures an image with alt text", () => {
    expect(
      parseDeepLinkCapture(
        "inkling://capture?url=https%3A%2F%2Fexample.com%2Fpost&image=https%3A%2F%2Fexample.com%2Fphoto.jpg&alt=A%20sunset",
      ),
    ).toEqual({
      kind: "image",
      pageUrl: "https://example.com/post",
      imageUrl: "https://example.com/photo.jpg",
      alt: "A sunset",
    });
  });

  test("selection wins over image when both are present", () => {
    const parsed = parseDeepLinkCapture(
      "inkling://capture?url=https%3A%2F%2Fexample.com%2F&selection=keep&image=https%3A%2F%2Fexample.com%2Fphoto.jpg",
    );
    expect(parsed?.kind).toBe("quote");
  });

  test("rejects non-http image targets", () => {
    expect(
      parseDeepLinkCapture(
        "inkling://capture?url=https%3A%2F%2Fexample.com%2F&image=javascript%3Aalert(1)",
      ),
    ).toBeNull();
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
    expect(parseDeepLinkCapture("inkling://capture?image=https%3A%2F%2Fexample.com%2Fphoto.jpg")).toBeNull();
    expect(parseDeepLinkCapture("not a url")).toBeNull();
  });
});
