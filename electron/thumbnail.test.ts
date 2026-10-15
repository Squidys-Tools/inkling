import { expect, test } from "bun:test";
import sharp from "sharp";
import { createImageThumbnail, validateImageDimensions } from "./thumbnail.mjs";

test("image thumbnails resize asynchronously and preserve source dimensions", async () => {
  const source = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: "#335577" },
  })
    .png()
    .toBuffer();
  const thumbnail = await createImageThumbnail(source);
  const output = await sharp(thumbnail.bytes).metadata();

  expect(thumbnail).toMatchObject({ width: 1024, height: 768 });
  expect(output).toMatchObject({ width: 512, height: 384, format: "webp" });
});

test("image thumbnails apply EXIF orientation before resizing", async () => {
  const source = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: "#335577" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const thumbnail = await createImageThumbnail(source);
  const output = await sharp(thumbnail.bytes).metadata();

  expect(thumbnail).toMatchObject({ width: 768, height: 1024 });
  expect(output).toMatchObject({ width: 384, height: 512, format: "webp" });
});

test("image dimensions respect side and decoded-allocation limits", () => {
  expect(() => validateImageDimensions(20_001, 1)).toThrow("safe limits");
  expect(() => validateImageDimensions(8193, 4096)).toThrow("safe limits");
  expect(() => validateImageDimensions(8192, 4096)).not.toThrow();
});
