import sharp from "sharp";

const maxImageDimension = 20_000;
const maxImageAllocation = 256 * 1024 * 1024;
const maxImagePixels = Math.floor(maxImageAllocation / 8);
const thumbnailEdge = 512;

export function validateImageDimensions(width, height) {
  if (!width || !height) throw new Error("image processing error: unable to decode image");
  if (
    width > maxImageDimension ||
    height > maxImageDimension ||
    width * height * 8 > maxImageAllocation
  ) {
    throw new Error("image processing error: image dimensions exceed safe limits");
  }
}

function validateIconImage(bytes) {
  const count = bytes.readUInt16LE(4);
  const directoryEnd = 6 + count * 16;
  if (count < 1 || directoryEnd > bytes.length) {
    throw new Error("invalid ICO image directory");
  }

  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    validateImageDimensions(bytes[entry] || 256, bytes[entry + 1] || 256);
    const size = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    if (offset < directoryEnd || offset + size > bytes.length || size < 12) {
      throw new Error("invalid ICO image data");
    }

    const image = bytes.subarray(offset, offset + size);
    const isPng = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (isPng) {
      if (image.length < 24) throw new Error("invalid ICO PNG data");
      validateImageDimensions(image.readUInt32BE(16), image.readUInt32BE(20));
      continue;
    }

    const headerSize = image.readUInt32LE(0);
    if (headerSize >= 40 && headerSize <= size) {
      validateImageDimensions(Math.abs(image.readInt32LE(4)), Math.abs(image.readInt32LE(8)));
      continue;
    }
    if (headerSize === 12) {
      validateImageDimensions(image.readUInt16LE(4), image.readUInt16LE(6));
      continue;
    }
    throw new Error("unsupported ICO image data");
  }
}

export async function sharpImageInput(bytes) {
  try {
    await sharp(bytes, { limitInputPixels: maxImagePixels }).metadata();
    return bytes;
  } catch (error) {
    const isBitmap = bytes.subarray(0, 2).toString("ascii") === "BM";
    const isIcon = bytes.length >= 6 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1;
    if (!isBitmap && !isIcon) throw error;
    if (isIcon) validateIconImage(bytes);
    if (isBitmap && bytes.length >= 26) {
      const coreHeader = bytes.readUInt32LE(14) === 12;
      const width = coreHeader ? bytes.readUInt16LE(18) : bytes.readInt32LE(18);
      const height = coreHeader ? bytes.readUInt16LE(20) : bytes.readInt32LE(22);
      validateImageDimensions(Math.abs(width), Math.abs(height));
    }
    const [{ CanvasElement }, { default: loadImage }] = await Promise.all([
      import("@napi-rs/canvas/js-binding.js"),
      import("@napi-rs/canvas/load-image.js"),
    ]);
    const image = await loadImage(bytes);
    validateImageDimensions(image.width, image.height);
    const canvas = new CanvasElement(image.width, image.height);
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.encode("png");
  }
}

export async function createImageThumbnail(bytes) {
  const input = await sharpImageInput(bytes);
  const image = sharp(input, { limitInputPixels: maxImagePixels });
  const { width, height, orientation } = await image.metadata();
  validateImageDimensions(width, height);
  const isRotated = orientation != null && orientation >= 5 && orientation <= 8;
  const thumbnail = await image
    .rotate()
    .resize({
      width: thumbnailEdge,
      height: thumbnailEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp()
    .toBuffer();
  return {
    bytes: thumbnail,
    width: isRotated ? height : width,
    height: isRotated ? width : height,
  };
}

export async function dominantImageColors(bytes) {
  const input = await sharpImageInput(bytes);
  const { data, info } = await sharp(input, { limitInputPixels: maxImagePixels })
    .resize({ width: 64, height: 64, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bins = new Map();
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index] >> 4;
    const green = data[index + 1] >> 4;
    const blue = data[index + 2] >> 4;
    const key = (red << 8) | (green << 4) | blue;
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  const colors = [...bins]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(
      ([key]) =>
        `#${((key >> 8) * 17).toString(16).padStart(2, "0")}${(((key >> 4) & 15) * 17).toString(16).padStart(2, "0")}${((key & 15) * 17).toString(16).padStart(2, "0")}`,
    );
  while (colors.length < 5) colors.push(colors.at(-1) ?? "#000000");
  return colors;
}
