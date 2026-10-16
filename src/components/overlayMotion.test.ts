import { expect, test } from "bun:test";
import { overlayMediaHeight } from "./overlayMotion";
import type { LibraryItem } from "../lib/types";

const item = (kind: LibraryItem["kind"], image?: string): LibraryItem => ({
  id: kind,
  kind,
  title: "Saved item",
  description: "",
  source: "local",
  date: "Today",
  tags: [],
  image,
});

test("a PDF detail overlay keeps its artwork height once a page thumbnail exists", () => {
  const artworkHeight = overlayMediaHeight(item("PDF"), 680, 900);
  expect(artworkHeight).toBe(260);
  expect(overlayMediaHeight(item("PDF", "thumbnail.webp"), 680, 900)).toBe(artworkHeight);
});

test("image items still size the overlay media from their thumbnail", () => {
  expect(overlayMediaHeight(item("Image", "photo.webp"), 680, 900)).toBe(400);
  expect(overlayMediaHeight(item("Image", "photo.webp"), 300, 900)).toBe(225);
  expect(overlayMediaHeight(item("Image"), 680, 900)).toBe(260);
});
