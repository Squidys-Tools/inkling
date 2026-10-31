import { publicWebUrl } from "./web-url.ts";

// The library refuses a larger file, so a download stops here instead of filling memory.
const maxImageBytes = 50 * 1024 * 1024;
const maxRedirects = 5;

/** Downloads the image an `inkling://` image link names, refusing anything that is not a public image under the size limit. */
export async function downloadImage(
  url: string,
  fetchImage: (url: string, init: RequestInit) => Promise<Response>,
) {
  const signal = AbortSignal.timeout(30_000);
  let target = url;
  let response: Response;
  // Redirects are followed by hand so each hop is checked before it is requested.
  for (let hop = 0; ; hop++) {
    if (!publicWebUrl(target)) throw new Error("The image is not at a public address.");
    response = await fetchImage(target, { redirect: "manual", signal });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) break;
    if (hop === maxRedirects) throw new Error("The image redirected too many times.");
    target = new URL(location, target).toString();
  }
  if (!response.ok) throw new Error(`The image returned HTTP ${response.status}.`);
  const mimeType =
    response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
  if (!mimeType.startsWith("image/")) throw new Error("The link does not point to an image.");
  if (Number(response.headers.get("content-length")) > maxImageBytes)
    throw new Error("The image is larger than 50 MB.");

  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = response.body?.getReader();
  for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) {
    length += chunk.value.byteLength;
    if (length > maxImageBytes) {
      await reader?.cancel();
      throw new Error("The image is larger than 50 MB.");
    }
    chunks.push(chunk.value);
  }
  const name = new URL(target).pathname.split("/").filter(Boolean).pop() || "image";
  return { fileName: name.slice(0, 80), mimeType, bytes: Buffer.concat(chunks, length) };
}
