import { tryParseHttpUrl } from "@inkling/ingestion/url";

/**
 * The URL as inkling saves it, or null unless it is http(s), has no credentials
 * and names a public host. Any web page can open an `inkling://` link, so a link
 * must not make inkling fetch a device on the user's network. Unlike the Add
 * page, a link from outside must spell out its scheme.
 */
export const publicWebUrl = (value: string) =>
  URL.canParse(value.trim()) ? (tryParseHttpUrl(value)?.toString() ?? null) : null;
