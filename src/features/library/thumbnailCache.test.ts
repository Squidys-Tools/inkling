import { expect, test } from "bun:test";
import type { LibraryItem } from "../../lib/types";
import { warmThumbnails } from "./thumbnailCache";

test("thumbnail warming stays local, bounds decoding and reuses successful decodes", async () => {
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const images: LocalImage[] = [];
  const pending: Array<{ done: () => void; fail: () => void }> = [];
  class LocalImage {
    src = "";
    decoding = "";
    crossOrigin = "";
    constructor() {
      images.push(this);
    }
    decode() {
      return new Promise<void>((resolve, reject) =>
        pending.push({ done: resolve, fail: () => reject(new Error("bad thumbnail")) }),
      );
    }
  }
  for (const [key, value] of Object.entries({
    Image: LocalImage,
    location: { href: "http://local.test/library", protocol: "http:", host: "local.test" },
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const items = (urls: string[]) => urls.map((image) => ({ image }) as LibraryItem);
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
    const local = Array.from({ length: 30 }, (_, i) => `http://local.test/thumbnail-${i}.webp`);
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
        "https://local.test/art.jpg",
        "data:image/png,private",
        "file:///private/photo.jpg",
        "http://local.test:80/new-local.webp",
      ]),
    );
    expect(images).toHaveLength(25);
    expect(images.at(-1)?.src).toBe("http://local.test:80/new-local.webp");
    pending.shift()!.fail();
    await settle();
    warmThumbnails(items(["http://local.test:80/new-local.webp"]));
    expect(images).toHaveLength(26);
    await drain();
  } finally {
    await drain();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
