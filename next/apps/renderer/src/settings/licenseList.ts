/** One row of third-party-licenses.json, which licenses/plugin.ts writes at build time. */
export type ThirdPartyLicense = {
  name: string;
  version: string | null;
  license: string;
  sourceUrl: string | null;
  description?: string;
  noticeText: string;
};

/** Each license with how many notices carry it, most common first, so MIT sits at the top. */
export function licenseCounts(entries: readonly ThirdPartyLicense[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.license, (counts.get(entry.license) ?? 0) + 1);
  return [...counts].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
}

/** Entries under any of the `licenses` picked (all when none is), whose name, version or license contains `query`. */
export function filterLicenses(
  entries: readonly ThirdPartyLicense[],
  query: string,
  licenses: ReadonlySet<string>,
) {
  const needle = query.trim().toLowerCase();
  if (!needle && licenses.size === 0) return entries;
  return entries.filter(
    (entry) =>
      (licenses.size === 0 || licenses.has(entry.license)) &&
      [entry.name, entry.version, entry.license].some((field) =>
        field?.toLowerCase().includes(needle),
      ),
  );
}

let loading: Promise<ThirdPartyLicense[]> | undefined;

/** Fetched on first open, so the notices never weigh on startup. A failure lets the next open retry. */
export function loadLicenses() {
  loading ??= fetch(new URL("third-party-licenses.json", document.baseURI)).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<ThirdPartyLicense[]>;
  });
  loading.catch(() => {
    loading = undefined;
  });
  return loading;
}
