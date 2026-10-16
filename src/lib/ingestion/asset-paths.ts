type AssetVariant = "original" | "thumbnail" | "preview";

export interface AssetPathOptions {
  itemId: string;
  variant: AssetVariant;
  extension: string;
}

/** Produces one safe, case-insensitive path segment. */
export function sanitizeAssetSegment(value: string, fallback = "asset"): string {
  const sanitize = (candidate: string): string =>
    candidate
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/[\\/]/gu, "-")
      .replace(/[^a-z0-9._-]/gu, "-")
      .replace(/-+/gu, "-")
      .replace(/^\.+/u, "")
      .replace(/\.+$/u, "");

  const safe = sanitize(value);
  if (safe.length > 0 && safe !== "." && safe !== "..") return safe;

  const safeFallback = sanitize(fallback);
  return safeFallback.length > 0 && safeFallback !== "." && safeFallback !== ".."
    ? safeFallback
    : "asset";
}

function safeExtension(extension: string): string {
  const normalized = extension.replace(/^\./u, "").toLowerCase();
  return /^[a-z0-9]{1,12}$/u.test(normalized) ? normalized : "bin";
}

/** Returns a stable relative filename with no user-controlled path separators. */
function assetFileName(options: Omit<AssetPathOptions, "itemId">): string {
  return `${sanitizeAssetSegment(options.variant)}.${safeExtension(options.extension)}`;
}

/** Returns the app-relative path used beneath its managed asset directory. */
export function assetRelativePath(options: AssetPathOptions): string {
  return `items/${sanitizeAssetSegment(options.itemId)}/${assetFileName(options)}`;
}
