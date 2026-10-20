const posterEdge = 512;

// The OS shell decodes the frame, so inkling ships no codec or ffmpeg. The shell
// thumbnailer only exists on Windows and macOS; elsewhere, and for any file the
// shell cannot read, there is no poster and the card keeps the typed video artwork.
export async function createVideoPoster(filePath, { nativeImage } = {}) {
  const thumbnailer = nativeImage ?? (await import("electron")).nativeImage;
  if (typeof thumbnailer?.createThumbnailFromPath !== "function") return null;
  const image = await thumbnailer.createThumbnailFromPath(filePath, {
    width: posterEdge,
    height: posterEdge,
  });
  return image.isEmpty() ? null : image.toPNG();
}
