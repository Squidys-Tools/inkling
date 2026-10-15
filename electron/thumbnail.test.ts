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
