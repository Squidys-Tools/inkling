import { expect, test } from "bun:test";
import type { LibraryItem } from "../../lib/types";
import { warmThumbnails } from "./thumbnailCache";

test("warming is thumbnail-only, desktop-local, concurrency/retention bounded, and retries failed decodes", async () => {
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const images: LocalImage[] = [];
  const pending: Array<{ done: () => void; fail: () => void }> = [];
  class LocalImage {
    src = "";
    decoding = "";
    naturalWidth = 256;
    naturalHeight = 256;
    constructor() {
      images.push(this);
    }
    decode() {
      return new Promise<void>((resolve, reject) =>
        pending.push({ done: resolve, fail: () => reject(new Error("bad thumbnail")) }),
      );
    }
  }
  const location = { href: "app://local/index.html", protocol: "app:", host: "local" };
  for (const [key, value] of Object.entries({ Image: LocalImage, location })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const items = (urls: string[]) => urls.map((thumbnailUrl) => ({ thumbnailUrl }) as LibraryItem);
  const settle = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  const drain = async () => {
    while (pending.length) {
      pending.splice(0).forEach((entry) => entry.done());
      await settle();
    }
  };
  try {
    warmThumbnails([{ image: "app://local/large-original.png" } as LibraryItem]);
    expect(images).toHaveLength(0);
    const local = Array.from({ length: 30 }, (_, i) => `app://local/thumbnail-${i}.webp`);
    warmThumbnails(items(local));
    expect(images).toHaveLength(4);
    expect(images.every((image) => image.decoding === "async")).toBe(true);
    await drain();
    expect(images).toHaveLength(24);
    warmThumbnails(items(local.slice(0, 24)));
    expect(images).toHaveLength(24);
    warmThumbnails(
      items([
        "https://remote.test/art.jpg",
        "app://other/art.jpg",
        "data:image/png,private",
        "file:///private/photo.jpg",
        "app://local/retry.webp",
      ]),
    );
    expect(images).toHaveLength(25);
    expect(images[images.length - 1]?.src).toBe("app://local/retry.webp");
    pending.shift()!.fail();
    await settle();
    warmThumbnails(items(["app://local/retry.webp"]));
    expect(images).toHaveLength(26);
    await drain();
    location.protocol = "http:";
    location.href = "http://local/index.html";
    warmThumbnails(items(["http://local/preview-thumbnail.webp"]));
    expect(images).toHaveLength(26);
    location.protocol = "app:";
    location.href = "app://local/index.html";
    // Four at a time plus byte-based eviction: 24 512² thumbnails exceed 16MiB.
    const full = Array.from({ length: 24 }, (_, i) => `app://local/full-${i}.webp`);
    warmThumbnails(items(full));
    while (pending.length) {
      images.slice(-pending.length).forEach((image) => {
        image.naturalWidth = 512;
        image.naturalHeight = 512;
      });
      pending.splice(0).forEach((entry) => entry.done());
      await settle();
    }
    const before = images.length;
    warmThumbnails(items([full[0]]));
    expect(images).toHaveLength(before + 1); // oldest evicted, not retained forever
    await drain();
    warmThumbnails(items(["app://local/oversized.webp"]));
    images[images.length - 1]!.naturalWidth = 12000;
    pending.shift()!.done();
    await settle();
    const oversized = images.length;
    warmThumbnails(items(["app://local/oversized.webp"]));
    expect(images).toHaveLength(oversized + 1); // oversized decode is never retained
    await drain();
  } finally {
    await drain();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
