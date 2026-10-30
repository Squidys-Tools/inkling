// Asks the user for a display and encodes one frame of it as a PNG.
export async function grabScreenshot() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0)
      throw new Error("The selected display has no capturable frame.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The screenshot could not be encoded.");
    return new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" });
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}
