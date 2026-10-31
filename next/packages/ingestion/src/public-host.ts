import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { UrlIngestionError } from "./errors.ts";
import { isPublicIpAddress } from "./url.ts";

export type LookupHost = (hostname: string) => Promise<ReadonlyArray<{ address: string }>>;

export const lookupHost: LookupHost = (hostname) => lookup(hostname, { all: true });

/**
 * Refuses a URL whose host resolves to any non-public address, which a name such
 * as `127.0.0.1.nip.io` does while looking public. DNS can still answer
 * differently when the request connects (rebinding); this check cannot close that.
 */
export async function assertPublicHost(url: string, lookup: LookupHost = lookupHost) {
  const hostname = new URL(url).hostname.replace(/^\[|\]$/gu, "");
  if (isIP(hostname)) {
    if (isPublicIpAddress(hostname)) return;
  } else {
    let addresses: ReadonlyArray<{ address: string }>;
    try {
      addresses = await lookup(hostname);
    } catch (cause) {
      throw new UrlIngestionError("network-error", "The address could not be found.", {
        cause,
        url,
      });
    }
    if (addresses.length > 0 && addresses.every(({ address }) => isPublicIpAddress(address)))
      return;
  }
  throw new UrlIngestionError("invalid-url", "Private network URLs are not supported.", { url });
}
