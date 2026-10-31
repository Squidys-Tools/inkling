import type { Plugin } from "vite";

const api = "https://api.github.com/repos/Squidys-Tools/inkling/releases/latest";
const id = "virtual:latest-release";

type Asset = { name: string; browser_download_url: string };
type Release = { tag_name: string; html_url: string; assets: Asset[] };

// Installers by file type, as electron-builder names them in package.json's build block.
const kinds = {
  windows: /\.exe$/u,
  mac: /-mac-arm64\.dmg$/u,
  appImage: /\.AppImage$/u,
  deb: /\.deb$/u,
};

async function lookUp() {
  try {
    const response = await fetch(api, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const release = (await response.json()) as Release;
    const pick = (pattern: RegExp) =>
      release.assets.find((asset) => pattern.test(asset.name))?.browser_download_url ?? null;
    return {
      version: release.tag_name.replace(/^v/u, ""),
      windows: pick(kinds.windows),
      mac: pick(kinds.mac),
      appImage: pick(kinds.appImage),
      deb: pick(kinds.deb),
    };
  } catch (error) {
    // A build without a release, or offline, still links to GitHub's releases page.
    console.warn(`No latest release to link installers from: ${String(error)}`);
    return null;
  }
}

/**
 * `virtual:latest-release`: the installers of the latest GitHub release, looked
 * up once per build, so a download button fetches the file instead of opening
 * a release page. Redeploy the site after publishing a release.
 */
export function latestRelease(): Plugin {
  let release: ReturnType<typeof lookUp> | undefined;
  return {
    name: "inkling-latest-release",
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    async load(resolved) {
      if (resolved !== `\0${id}`) return;
      release ??= lookUp();
      return `export default ${JSON.stringify(await release)};`;
    },
  };
}
