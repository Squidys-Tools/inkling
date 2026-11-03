import { expect, test } from "bun:test";
import { validateCapturePayload } from "./payload.ts";

test("v1 payloads normalize to the capture an inkling link makes", () => {
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
  expect(input).toEqual({ kind: "url", url: "https://example.com/article", title: "A quiet page" });

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
  // regression: a hostname stood in for the title, and the library kept it as the user's.
  expect(blankTitle).toEqual({ kind: "url", url: "https://www.example.com/post" });

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
  expect(longTitle).toMatchObject({ title: "t".repeat(500) });

  const loopback = validateCapturePayload(
    Buffer.from(
      JSON.stringify({ version: 1, kind: "page", url: "http://127.0.0.1:3000/dev-notes" }),
    ),
  );
  expect(loopback).toMatchObject({ kind: "url", url: "http://127.0.0.1:3000/dev-notes" });

  const capture = (fields: Record<string, unknown>) =>
    validateCapturePayload(
      Buffer.from(JSON.stringify({ version: 1, url: "https://www.example.com/essay", ...fields })),
    );
  expect(capture({ kind: "quote", selection: "  Keep this.  ", attribution: "An Essay" })).toEqual({
    kind: "quote",
    url: "https://www.example.com/essay",
    selection: "Keep this.",
    attribution: "An Essay",
  });
  const long = capture({ kind: "quote", selection: "q".repeat(1_600), attribution: "" });
  expect(long).toMatchObject({ selection: "q".repeat(1_500), attribution: "example.com" });
  expect(
    capture({ kind: "image", imageUrl: "https://cdn.example.com/a.jpg", alt: "A fox" }),
  ).toEqual({
    kind: "image",
    pageUrl: "https://www.example.com/essay",
    imageUrl: "https://cdn.example.com/a.jpg",
    alt: "A fox",
  });

  for (const invalid of [
    { title: "no url" },
    { version: 1, kind: "page", url: "javascript:alert(1)" },
    { version: 1, kind: "page", url: "ftp://example.com/file" },
    { version: 1, kind: "page", url: "https://user:pass@example.com/" },
    { version: 1, kind: "page", url: "not a url" },
    { version: 1, kind: "page", url: "" },
    { version: 1, kind: "page", url: `https://example.com/${"a".repeat(9_000)}` },
    { version: 2, kind: "page", url: "https://example.com/" },
    { version: 1, kind: "selection", url: "https://example.com/" },
    { version: 1, kind: "quote", url: "https://example.com/", selection: "   " },
    { version: 1, kind: "quote", url: "javascript:alert(1)", selection: "text" },
    { version: 1, kind: "image", url: "https://example.com/" },
    { version: 1, kind: "image", url: "https://example.com/", imageUrl: "http://127.0.0.1/a.png" },
    { version: 1, kind: "image", url: "https://example.com/", imageUrl: "data:image/png,x" },
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
