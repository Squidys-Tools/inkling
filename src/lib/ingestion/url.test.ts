import { describe, expect, test } from "bun:test";
import { safePublicImageUrl } from "./url";

describe("safePublicImageUrl", () => {
  test("normalizes public HTTP images and rejects private hosts", () => {
    expect(safePublicImageUrl("https://example.com/image.jpg")).toBe(
      "https://example.com/image.jpg",
    );
    for (const value of [
      "http://127.0.0.1/image.jpg",
      "http://[::1]/image.jpg",
      "https://192.168.1.4/image.jpg",
      "https://photos.local/image.jpg",
      "https://photos.internal/image.jpg",
      "file:///tmp/image.jpg",
      "https://user:password@example.com/image.jpg",
    ]) {
      expect(safePublicImageUrl(value)).toBeUndefined();
    }
  });
});
