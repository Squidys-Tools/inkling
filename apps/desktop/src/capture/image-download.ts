import { assertPublicHost, type LookupHost, lookupHost } from "@inkling/ingestion/public-host";
import { publicWebUrl } from "./web-url.ts";

// The library refuses a larger file, so a download stops here instead of filling memory.
const maxImageBytes = 50 * 1024 * 1024;
const maxRedirects = 5;

// An unread body holds its connection open until it is collected.
async function refuse(response: Response, message: string): Promise<never> {
  await response.body?.cancel().catch(() => {});
  throw new Error(message);
}

/** Downloads the image an `inkling://` image link names, refusing anything that is not a public image under the size limit. */
export async function downloadImage(
  url: string,
  fetchImage: (url: string, init: RequestInit) => Promise<Response>,
  lookup: LookupHost = lookupHost,
) {
  const signal = AbortSignal.timeout(30_000);
  let target = url;
  let response: Response;
  // Redirects are followed by hand so each hop is checked, by name and by
  // resolved address, before it is requested.
  for (let hop = 0; ; hop++) {
    if (!publicWebUrl(target)) throw new Error("The image is not at a public address.");
    await assertPublicHost(target, lookup);
    response = await fetchImage(target, { redirect: "manual", signal });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) break;
    if (hop === maxRedirects) await refuse(response, "The image redirected too many times.");
    await response.body?.cancel().catch(() => {});
    target = new URL(location, target).toString();
  }
  if (!response.ok) await refuse(response, `The image returned HTTP ${response.status}.`);
  const mimeType =
    response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
  if (!mimeType.startsWith("image/"))
    await refuse(response, "The link does not point to an image.");
  if (Number(response.headers.get("content-length")) > maxImageBytes)
    await refuse(response, "The image is larger than 50 MB.");

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
