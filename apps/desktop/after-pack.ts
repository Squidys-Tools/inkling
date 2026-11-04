import { chmod, lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AfterPackContext } from "electron-builder";

// electron-builder loads this hook on whatever Node runs it, which strips the types itself from 22.18.
// The update helper refuses to run unless every folder above it is not group or
// world writable, so the Linux packages ship with 755/644 whatever the build umask.
async function normalize(directory: string) {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await normalize(path);
    else if (entry.isFile()) await chmod(path, (await lstat(path)).mode & 0o111 ? 0o755 : 0o644);
  }
}

export default async function afterPack({ electronPlatformName, appOutDir }: AfterPackContext) {
  if (electronPlatformName !== "linux") return;
  process.umask(0o022);
  await normalize(appOutDir);
}
