import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReaderView, type ReaderItem } from "./ReaderView";

// The reader footer's click handler is only one way out. Middle-click, open in
// new tab, and copy link address all read the rendered href, so a saved source
// URL that is not http(s) has to leave nothing in the footer to activate.
function readerHtml(sourceUrl: string): string {
  const item: ReaderItem = {
    id: "item-1",
    title: "Kept article",
    savedDate: "2026-01-01",
    sourceLabel: "example.com",
    sourceUrl,
    html: "<p>Body</p>",
  };
  return renderToStaticMarkup(
    createElement(ReaderView, { item, origin: { x: 0, y: 0 }, onRequestClose: () => {} }),
  );
}

describe("reader source link", () => {
  test("renders no link for a javascript: source URL", () => {
    const html = readerHtml("javascript:alert(1)");
    expect(html).not.toContain("href");
    expect(html).not.toContain("javascript");
    expect(html).not.toContain("Continue reading");
  });

  test("renders no link for a file: source URL", () => {
    const html = readerHtml("file:///C:/Windows/win.ini");
    expect(html).not.toContain("href");
    expect(html).not.toContain("win.ini");
  });

  test("renders the validated href for an http(s) source URL", () => {
    const html = readerHtml("  HTTPS://Example.com/Read  ");
    expect(html).toContain('href="https://example.com/Read"');
    expect(html).toContain("Continue reading at example.com");
  });
});