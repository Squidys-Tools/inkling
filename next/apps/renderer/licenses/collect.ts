import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ThirdPartyLicense } from "../src/settings/licenseList.ts";

type Manifest = {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: ({ type?: string } | string)[];
  repository?: string | { url?: string };
  homepage?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** Code and models inkling ships that no package manifest describes. Paths are from the workspace root. */
const vendoredNotices = [
  {
    name: "bloub",
    license: "MIT",
    sourceUrl: "https://github.com/jeremy-prt/bloub",
    description: "The mascot's animation engine, vendored in apps/renderer/src/mascot/bot.",
    noticeFile: "apps/renderer/src/mascot/bot/LICENSE.md",
  },
  {
    name: "Rare UI Grid Reveal",
    license: "MIT + Commons Clause + Attribution",
    sourceUrl: "https://rareui.com/components/gridreveal",
    description: "The photo that splits out of a grid on the welcome screens.",
    noticeFile: "apps/renderer/licenses/LICENSE-rare-ui.md",
  },
  {
    name: "nomic-embed-text-v1.5",
    license: "Apache-2.0",
    sourceUrl: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5",
    description: "The text model behind search. Copyright Nomic AI.",
    noticeFile: "apps/renderer/licenses/Apache-2.0.txt",
  },
  {
    name: "nomic-embed-vision-v1.5",
    license: "Apache-2.0",
    sourceUrl: "https://huggingface.co/nomic-ai/nomic-embed-vision-v1.5",
    description: "The image model behind search. Copyright Nomic AI.",
    noticeFile: "apps/renderer/licenses/Apache-2.0.txt",
  },
];

// electron-builder ships the `dependencies` closure; Electron itself is a dev
// dependency to the package manager but ships as the runtime.
const SHIPPED_DEV_DEPENDENCIES = ["electron"];
const NOTICE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

const readManifest = (dir: string): Manifest =>
  JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

// Node's lookup, which also finds Bun's isolated layout: a package's
// dependencies sit beside it in node_modules/.bun/<name>@<version>/node_modules.
function findPackage(name: string, fromDir: string) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const manifest = join(dir, "node_modules", name, "package.json");
    if (existsSync(manifest)) return dirname(realpathSync(manifest));
    if (dirname(dir) === dir) return null;
  }
}

/** The package folder a bundled module came from, or null for the app's own code. */
export function packageDirOf(moduleId: string) {
  // Vite writes module ids with forward slashes on every system, Windows included.
  const path = moduleId.replace(/^\0/, "").replace(/\?.*$/, "").replaceAll("\\", "/");
  const marker = "/node_modules/";
  const at = path.lastIndexOf(marker);
  if (at < 0) return null;
  const [scopeOrName = "", name] = path.slice(at + marker.length).split("/");
  const packagePath = scopeOrName.startsWith("@") ? `${scopeOrName}/${name}` : scopeOrName;
  return realpathSync(path.slice(0, at + marker.length) + packagePath);
}

function licenseOf(manifest: Manifest) {
  if (typeof manifest.license === "string") return manifest.license;
  if (typeof manifest.license?.type === "string") return manifest.license.type;
  if (Array.isArray(manifest.licenses)) {
    return manifest.licenses
      .map((entry) => (typeof entry === "string" ? entry : entry.type))
      .join(" OR ");
  }
  return null;
}

export function sourceUrlOf(manifest: Manifest) {
  const repository =
    typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
  if (typeof repository === "string" && repository) {
    const shorthand = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(repository);
    if (shorthand) return `https://github.com/${shorthand[1]}`;
    const url = repository
      .replace(/^git\+/, "")
      .replace(/^git:\/\//, "https://")
      .replace(/^(?:ssh:\/\/)?git@([^:/]+)[:/]/, "https://$1/")
      .replace(/\.git$/, "");
    if (/^https?:\/\//.test(url)) return url;
  }
  return typeof manifest.homepage === "string" && /^https?:\/\//.test(manifest.homepage)
    ? manifest.homepage
    : null;
}

function noticeTextIn(dir: string) {
  return readdirSync(dir)
    .filter((file) => NOTICE_FILE.test(file) && statSync(join(dir, file)).isFile())
    .sort()
    .map((file) => readFileSync(join(dir, file), "utf8").trim())
    .join("\n\n");
}

/**
 * Everything inkling ships from someone else: the workspace's production
 * dependency closure and Electron, the packages the renderer bundle took
 * modules from (`bundledPackageDirs`), and the vendored notices. A package with
 * no license or no license text still gets a row, plus a warning for the build.
 */
export function collectThirdPartyLicenses(
  workspaceDir: string,
  bundledPackageDirs: Iterable<string> = [],
  notices = vendoredNotices,
) {
  const root = readManifest(workspaceDir);
  const queue = [
    ...Object.keys(root.dependencies ?? {}).map((name) => ({ name, optional: false })),
    ...Object.keys(root.optionalDependencies ?? {}).map((name) => ({ name, optional: true })),
    ...SHIPPED_DEV_DEPENDENCIES.map((name) => ({ name, optional: false })),
  ].map((dependency) => ({ ...dependency, fromDir: workspaceDir }));
  const seen = new Set<string>();
  const listed = new Set<string>();
  const packages: ThirdPartyLicense[] = [];
  const warnings: string[] = [];

  const add = (dir: string) => {
    const manifest = readManifest(dir);
    if (manifest.name?.startsWith("@inkling/")) return manifest;
    const entry = {
      name: manifest.name ?? dir,
      version: manifest.version ?? null,
      license: licenseOf(manifest) ?? "Unknown",
      sourceUrl: sourceUrlOf(manifest),
      noticeText: noticeTextIn(dir),
    };
    const id = `${entry.name}@${entry.version}`;
    // Bun keeps one folder per set of peer dependencies, so a version can sit in two.
    if (listed.has(id)) return manifest;
    listed.add(id);
    if (entry.license === "Unknown") warnings.push(`${id} declares no license.`);
    if (!entry.noticeText) warnings.push(`${id} has no license file.`);
    packages.push(entry);
    return manifest;
  };

  while (queue.length > 0) {
    const { name, fromDir, optional } = queue.shift()!;
    const dir = findPackage(name, fromDir);
    if (!dir) {
      // Optional and peer dependencies for other platforms are not installed,
      // so they do not ship either.
      if (!optional) warnings.push(`${name} is a dependency but is not installed.`);
      continue;
    }
    if (seen.has(dir)) continue;
    seen.add(dir);
    const manifest = add(dir);
    queue.push(
      ...Object.keys(manifest.dependencies ?? {}).map((dep) => ({
        name: dep,
        fromDir: dir,
        optional: false,
      })),
      ...Object.keys({ ...manifest.optionalDependencies, ...manifest.peerDependencies }).map(
        (dep) => ({
          name: dep,
          fromDir: dir,
          optional: true,
        }),
      ),
    );
  }

  for (const dir of bundledPackageDirs) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    add(dir);
  }

  const vendored = notices.map(({ noticeFile, ...notice }) => ({
    version: null,
    ...notice,
    noticeText: readFileSync(join(workspaceDir, noticeFile), "utf8").trim(),
  }));
  const entries = [...packages, ...vendored].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
  return { entries, warnings };
}
