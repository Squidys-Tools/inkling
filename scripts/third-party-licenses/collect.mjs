import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

// Everything inkling ships that came from someone else, for Settings → General →
// Open source licenses. Packages are the installed production dependency closure
// of the app, its workspace packages included, read from node_modules at build
// time. notices.json adds what has no package: vendored code and the bundled
// models. The Vite plugin in vite.config.ts writes the result beside index.html,
// and Settings fetches it only when the page opens.

// Electron is a dev dependency to the package manager but ships as the runtime.
const SHIPPED_DEV_DEPENDENCIES = ["electron"];
const NOTICE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Node's lookup, which also finds Bun's isolated layout: a package's
// dependencies sit beside it in node_modules/.bun/<name>@<version>/node_modules.
function findPackage(name, fromDir) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const manifest = join(dir, "node_modules", name, "package.json");
    if (existsSync(manifest)) return dirname(realpathSync(manifest));
    if (dirname(dir) === dir) return null;
  }
}

function licenseOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (typeof pkg.license?.type === "string") return pkg.license.type;
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses.map((entry) => entry?.type ?? entry).join(" OR ");
  }
  return null;
}

export function sourceUrlOf(pkg) {
  const repository = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
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
  return typeof pkg.homepage === "string" && /^https?:\/\//.test(pkg.homepage)
    ? pkg.homepage
    : null;
}

function noticeTextIn(dir) {
  return readdirSync(dir)
    .filter((file) => NOTICE_FILE.test(file) && statSync(join(dir, file)).isFile())
    .sort()
    .map((file) => readFileSync(join(dir, file), "utf8").trim())
    .join("\n\n");
}

/**
 * Returns `entries` for the Settings page and `warnings` for the build: a
 * package that declares no license or carries no license text still gets a row,
 * but someone should look at it.
 */
export function collectThirdPartyLicenses(rootDir) {
  const root = readJson(join(rootDir, "package.json"));
  const queue = [
    ...Object.keys(root.dependencies ?? {}).map((name) => ({ name, optional: false })),
    ...Object.keys(root.optionalDependencies ?? {}).map((name) => ({ name, optional: true })),
    ...SHIPPED_DEV_DEPENDENCIES.map((name) => ({ name, optional: false })),
  ].map((dependency) => ({ ...dependency, fromDir: rootDir }));
  const seen = new Set();
  const packages = [];
  const warnings = [];

  while (queue.length > 0) {
    const { name, fromDir, optional } = queue.shift();
    const dir = findPackage(name, fromDir);
    if (!dir) {
      // Optional and peer dependencies for other platforms are not installed,
      // so they do not ship either.
      if (!optional) warnings.push(`${name} is a dependency but is not installed.`);
      continue;
    }
    if (seen.has(dir)) continue;
    seen.add(dir);
    const pkg = readJson(join(dir, "package.json"));
    queue.push(
      ...Object.keys(pkg.dependencies ?? {}).map((dep) => ({
        name: dep,
        fromDir: dir,
        optional: false,
      })),
      ...Object.keys({ ...pkg.optionalDependencies, ...pkg.peerDependencies }).map((dep) => ({
        name: dep,
        fromDir: dir,
        optional: true,
      })),
    );
    if (pkg.name?.startsWith("@inkling/")) continue;

    const entry = {
      name: pkg.name ?? name,
      version: pkg.version ?? null,
      license: licenseOf(pkg) ?? "Unknown",
      sourceUrl: sourceUrlOf(pkg),
      noticeText: noticeTextIn(dir),
    };
    const id = `${entry.name}@${entry.version}`;
    if (entry.license === "Unknown") warnings.push(`${id} declares no license.`);
    if (!entry.noticeText) warnings.push(`${id} has no license file.`);
    packages.push(entry);
  }

  const notices = readJson(join(rootDir, "scripts/third-party-licenses/notices.json")).map(
    ({ noticeFile, ...notice }) => ({
      version: null,
      ...notice,
      noticeText: readFileSync(join(rootDir, noticeFile), "utf8").trim(),
    }),
  );
  const entries = [...packages, ...notices].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
  return { entries, warnings };
}
