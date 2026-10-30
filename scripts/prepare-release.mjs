import { readFile, writeFile } from "node:fs/promises";
import { valid, prerelease, inc } from "semver";

const channel = process.env.RELEASE_CHANNEL ?? "stable";
const tag = process.env.RELEASE_VERSION ?? process.env.GITHUB_REF_NAME ?? "";
if (!["stable", "nightly"].includes(channel)) throw new Error("Unsupported release channel");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const version =
  channel === "nightly"
    ? `${inc(pkg.version.split("-")[0], "patch")}-nightly.${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.${process.env.GITHUB_RUN_NUMBER ?? "0"}`
    : tag.replace(/^v/, "");
if (!valid(version) || (channel === "stable" && prerelease(version)))
  throw new Error(
    "Stable/Beta uses a regular semver; experimental builds use the nightly channel.",
  );
pkg.version = version;
pkg.build.publish[0].releaseType = channel === "nightly" ? "prerelease" : "release";
pkg.build.generateUpdatesFilesForAllChannels = false;
await writeFile("package.json", JSON.stringify(pkg, null, 2) + "\n");
if (process.env.GITHUB_OUTPUT)
  await writeFile(
    process.env.GITHUB_OUTPUT,
    `version=${version}\ntag=v${version}\nprerelease=${channel === "nightly"}\n`,
    { flag: "a" },
  );
console.log(`Staged ${channel} version ${version}; no release was published.`);
