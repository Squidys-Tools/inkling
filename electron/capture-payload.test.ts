import { expect, test } from "bun:test";
import { validateCapturePayload, validateCaptureUrl } from "./capture-payload.ts";

test("capture URLs match storage's HTTP guards and allow explicit loopback saves", () => {
  expect(validateCaptureUrl("http://127.0.0.1:3000/dev-notes")).toBe(
    "http://127.0.0.1:3000/dev-notes",
  );
  expect(validateCaptureUrl("https://example.com/article?q=1")).toBe(
    "https://example.com/article?q=1",
  );
  for (const invalid of [
    "ftp://example.com/file",
    "https://user:pass@example.com/",
    "not a url",
    "",
    `https://example.com/${"a".repeat(9_000)}`,
  ]) {
    expect(() => validateCaptureUrl(invalid)).toThrow();
  }
});

test("v1 payloads normalize to a capture URL and title", () => {
  const good = {
    version: 1,
    kind: "page",
    url: "https://example.com/article",
    title: "A quiet page",
    defuddledHtml: "<p>kept</p><script>alert(1)</script>",
    text: "kept text",
    author: "A Writer",
    publishedDate: "2026-01-02T00:00:00Z",
    imageUrls: ["https://example.com/img.jpg", "javascript:evil()", "https://example.com/img.jpg"],
  };
  const input = validateCapturePayload(Buffer.from(JSON.stringify(good)));
  expect(input).toEqual({ sourceUrl: "https://example.com/article", title: "A quiet page" });

  const blankTitle = validateCapturePayload(
    Buffer.from(
      JSON.stringify({
        version: 1,
        kind: "page",
        url: "https://www.example.com/post",
        title: "  ",
        defuddledHtml: "",
        text: "words",
      }),
    ),
  );
  expect(blankTitle.title).toBe("www.example.com");

  const longTitle = validateCapturePayload(
    Buffer.from(
      JSON.stringify({
        version: 1,
        kind: "page",
        url: "https://example.com/",
        title: "t".repeat(600),
        defuddledHtml: "",
        text: "",
      }),
    ),
  );
  expect(longTitle.title).toBe("t".repeat(500));

  for (const invalid of [
    { title: "no url" },
    { version: 1, kind: "page", url: "javascript:alert(1)" },
    { version: 2, kind: "page", url: "https://example.com/" },
    { version: 1, kind: "selection", url: "https://example.com/" },
    { version: 1, kind: "page", url: "https://example.com/", author: "a".repeat(241) },
    { version: 1, kind: "page", url: "https://example.com/", imageUrls: [1] },
    { version: 1.5, kind: "page", url: "https://example.com/" },
    { version: 1, kind: "page", url: "https://example.com/", title: 5 },
    [],
    null,
  ]) {
    expect(() => validateCapturePayload(Buffer.from(JSON.stringify(invalid)))).toThrow();
  }
  expect(() => validateCapturePayload(Buffer.from("not json"))).toThrow();
});
