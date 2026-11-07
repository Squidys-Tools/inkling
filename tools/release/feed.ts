// A feed entry that names a file the release does not hold downloads as a 404, so a release
// publishes only when every file a latest*.yml names is among its assets under that exact name.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export function feedFiles(yml: string) {
  return [...yml.matchAll(/^\s*(?:- )?(?:url|path):\s*(\S+)\s*$/gm)].map((match) => match[1]!);
}

export function missingFeedFiles(feeds: Record<string, string>, assets: Iterable<string>) {
  const held = new Set(assets);
  return Object.entries(feeds).flatMap(([feed, yml]) =>
    feedFiles(yml)
      .filter((file) => !held.has(file))
      .map((file) => `${feed} names ${file}`),
  );
}

if (import.meta.main) {
  const directory = process.argv[2] ?? "release-assets";
  const assets = await readdir(directory);
  const feeds = Object.fromEntries(
    await Promise.all(
      assets
        .filter((name) => /^latest.*\.yml$/.test(name))
        .map(async (name) => [name, await readFile(join(directory, name), "utf8")] as const),
    ),
  );
  if (Object.keys(feeds).length === 0) throw new Error(`No update feed in ${directory}.`);
  const missing = missingFeedFiles(feeds, assets);
  if (missing.length > 0)
    throw new Error(`Update feed entries without a matching asset:\n${missing.join("\n")}`);
  console.log(`Update feeds match their assets: ${Object.keys(feeds).join(", ")}.`);
}
