// Rebuilds a Dependabot PR's bun.lock with the pinned Bun, starting from the lockfile the PR
// branched from. Dependabot's Bun drops the libc and hasInstallScript fields and keeps entries
// nothing depends on, and Bun keeps what an existing lockfile says, so it cannot repair in place.
import { $ } from "bun";
import { env, summary } from "./github.ts";

type Lockfile = { packages: Record<string, [string, ...unknown[]]> };

// "@babel/core@8.1.0" -> ["@babel/core", "8.1.0"]. Workspace, git, file and tarball entries have
// no registry version to compare.
function parseSpec(spec: string) {
  const at = spec.lastIndexOf("@");
  const version = spec.slice(at + 1);
  return at > 0 && /^\d+\.\d+\.\d+/.test(version) ? [spec.slice(0, at), version] : undefined;
}

function resolvedVersions(lockfile: Lockfile) {
  const versions = new Map<string, Set<string>>();
  for (const [spec] of Object.values(lockfile.packages)) {
    const parsed = parseSpec(spec);
    if (!parsed) continue;
    const [name, version] = parsed;
    versions.set(name, (versions.get(name) ?? new Set()).add(version));
  }
  return versions;
}

// A version Dependabot added with nothing at or above it on the same release line (the `^` range)
// means the rebuild reverted that update, as it does for a transitive-only update. Comparing
// across majors would let minimatch 10.x hide a reverted 3.1.5 -> 3.1.6 security bump.
export function revertedUpdates(base: Lockfile, dependabot: Lockfile, regenerated: Lockfile) {
  const before = resolvedVersions(base);
  const after = resolvedVersions(regenerated);
  const reverted: string[] = [];
  for (const [name, versions] of resolvedVersions(dependabot)) {
    for (const version of versions) {
      if (before.get(name)?.has(version)) continue;
      const kept = [...(after.get(name) ?? [])].some((v) => Bun.semver.satisfies(v, `^${version}`));
      if (!kept) reverted.push(`${name}@${version}`);
    }
  }
  return reverted;
}

// Bun only warns when a patch's version is no longer installed, and drops the patch.
export function stalePatches(patchedDependencies: Record<string, string>, lockfile: Lockfile) {
  const versions = resolvedVersions(lockfile);
  return Object.entries(patchedDependencies)
    .filter(([spec]) => {
      const parsed = parseSpec(spec);
      return parsed && !versions.get(parsed[0])?.has(parsed[1]);
    })
    .map(([spec, file]) => `${file} (${spec})`);
}

if (import.meta.main) {
  const base = (await $`git merge-base HEAD ${env("BASE_SHA")}`.text()).trim();
  const baseText = await $`git show ${base}:bun.lock`.text();
  const dependabotText = await Bun.file("bun.lock").text();
  await Bun.write("bun.lock", baseText);
  await $`${process.execPath} install --lockfile-only --ignore-scripts`;
  const regeneratedText = await Bun.file("bun.lock").text();

  const regenerated = Bun.JSONC.parse(regeneratedText) as Lockfile;
  const reverted = revertedUpdates(
    Bun.JSONC.parse(baseText) as Lockfile,
    Bun.JSONC.parse(dependabotText) as Lockfile,
    regenerated,
  );
  const { patchedDependencies = {} } = await Bun.file("package.json").json();
  const stale = stalePatches(patchedDependencies, regenerated);
  if (reverted.length > 0) {
    console.error(
      `Regenerating bun.lock from ${base} loses ${reverted.join(", ")}. ` +
        "Update the lockfile by hand with the Bun in .bun-version and push it.",
    );
  }
  if (stale.length > 0) {
    console.error(
      `${stale.join(", ")} no longer applies to the updated version. ` +
        "Remake the patch with `bun patch` for the new version and push it.",
    );
  }
  if (reverted.length > 0 || stale.length > 0) process.exit(1);
  const verdict = regeneratedText === dependabotText ? "already matched" : "was regenerated";
  await summary(`bun.lock ${verdict} from ${base.slice(0, 12)} with Bun ${Bun.version}.`);
  console.log(`bun.lock ${verdict} from ${base} with Bun ${Bun.version}.`);
}
