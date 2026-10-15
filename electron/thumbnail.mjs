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

export async function createImageThumbnail(bytes) {
  const image = sharp(bytes, { limitInputPixels: maxImagePixels });
  const { width, height } = await image.metadata();
  validateImageDimensions(width, height);
  const thumbnail = await image
    .resize({
      width: thumbnailEdge,
      height: thumbnailEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp()
    .toBuffer();
  return { bytes: thumbnail, width, height };
}
