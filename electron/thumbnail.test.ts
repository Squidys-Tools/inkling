import { expect, test } from "bun:test";
import sharp from "sharp";
import { createImageThumbnail, inspectImage, validateImageDimensions } from "./thumbnail.ts";

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

test("compression preserves transparent pixels without enlarging or mutating originals", async () => {
  const source = await sharp({
    create: { width: 24, height: 12, channels: 4, background: { r: 50, g: 100, b: 150, alpha: 0 } },
  })
    .png()
    .toBuffer();
  const original = Buffer.from(source);
  const thumbnail = await createImageThumbnail(source);
  const decoded = await sharp(thumbnail.bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(decoded.info).toMatchObject({ width: 24, height: 12, channels: 4 });
  expect(
    [...decoded.data].filter((_, index) => index % 4 === 3).every((alpha) => alpha === 0),
  ).toBe(true);
  expect(source).toEqual(original);
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

test("inspecting an image reads the oriented size and refuses what capture must not keep", async () => {
  const jpeg = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: "#335577" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  expect(await inspectImage(jpeg)).toEqual({ width: 768, height: 1024 });

  const tooWide = await sharp({
    create: { width: 20_001, height: 1, channels: 3, background: "#335577" },
  })
    .png()
    .toBuffer();
  await expect(inspectImage(tooWide)).rejects.toThrow("safe limits");
  await expect(inspectImage(Buffer.from("definitely not an image"))).rejects.toThrow();
});

test("inspecting a BMP checks its header and leaves the size to the thumbnail", async () => {
  const bitmap = Buffer.alloc(26 + 8);
  bitmap.write("BM");
  bitmap.writeUInt32LE(bitmap.length, 2);
  bitmap.writeUInt32LE(26, 10);
  bitmap.writeUInt32LE(12, 14);
  bitmap.writeUInt16LE(2, 18);
  bitmap.writeUInt16LE(2, 20);
  bitmap.writeUInt16LE(1, 22);
  bitmap.writeUInt16LE(24, 24);
  expect(await inspectImage(bitmap)).toBeNull();

  bitmap.writeUInt16LE(20_001, 18);
  await expect(inspectImage(bitmap)).rejects.toThrow("safe limits");
});

test("image dimensions respect side and decoded-allocation limits", () => {
  expect(() => validateImageDimensions(20_001, 1)).toThrow("safe limits");
  expect(() => validateImageDimensions(8193, 4096)).toThrow("safe limits");
  expect(() => validateImageDimensions(8192, 4096)).not.toThrow();
});

test("OS/2 core-header BMP dimensions use their 16-bit fields", async () => {
  const width = 2;
  const height = 2;
  const rowBytes = 8;
  const pixels = Buffer.alloc(rowBytes * height, 0x66);
  const bitmap = Buffer.alloc(26 + pixels.length);
  bitmap.write("BM");
  bitmap.writeUInt32LE(bitmap.length, 2);
  bitmap.writeUInt32LE(26, 10);
  bitmap.writeUInt32LE(12, 14);
  bitmap.writeUInt16LE(width, 18);
  bitmap.writeUInt16LE(height, 20);
  bitmap.writeUInt16LE(1, 22);
  bitmap.writeUInt16LE(24, 24);
  pixels.copy(bitmap, 26);

  const thumbnail = await createImageThumbnail(bitmap);
  expect(thumbnail).toMatchObject({ width, height });
  expect((await sharp(thumbnail.bytes).metadata()).format).toBe("webp");
});

test("Sharp thumbnails retain BMP, GIF, ICO, JPEG, PNG, TIFF, and WebP inputs", async () => {
  const source = sharp({
    create: { width: 16, height: 16, channels: 3, background: "#335577" },
  });
  const png = await source.clone().png().toBuffer();
  const bmp = Buffer.alloc(54 + 16 * 16 * 3);
  bmp.write("BM");
  bmp.writeUInt32LE(bmp.length, 2);
  bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(16, 18);
  bmp.writeInt32LE(16, 22);
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28);
  bmp.writeUInt32LE(16 * 16 * 3, 34);
  for (let index = 54; index < bmp.length; index += 3) {
    bmp[index] = 0x77;
    bmp[index + 1] = 0x55;
    bmp[index + 2] = 0x33;
  }
  const iconHeader = Buffer.alloc(22);
  iconHeader.writeUInt16LE(1, 2);
  iconHeader.writeUInt16LE(1, 4);
  iconHeader[6] = 16;
  iconHeader[7] = 16;
  iconHeader.writeUInt16LE(1, 10);
  iconHeader.writeUInt16LE(32, 12);
  iconHeader.writeUInt32LE(png.length, 14);
  iconHeader.writeUInt32LE(iconHeader.length, 18);
  const inputs = [
    ["bmp", bmp],
    ["gif", await source.clone().gif().toBuffer()],
    ["ico", Buffer.concat([iconHeader, png])],
    ["jpeg", await source.clone().jpeg().toBuffer()],
    ["png", png],
    ["tiff", await source.clone().tiff().toBuffer()],
    ["webp", await source.clone().webp().toBuffer()],
  ] as const;

  for (const [format, bytes] of inputs) {
    const thumbnail = await createImageThumbnail(bytes);
    const output = await sharp(thumbnail.bytes).metadata();
    expect(thumbnail).toMatchObject({ width: 16, height: 16 });
    expect(output.format).toBe("webp");
    expect(format).toBeTruthy();
  }

  const oversizedPng = Buffer.from(png);
  oversizedPng.writeUInt32BE(20_001, 16);
  await expect(createImageThumbnail(Buffer.concat([iconHeader, oversizedPng]))).rejects.toThrow(
    "safe limits",
  );
});
