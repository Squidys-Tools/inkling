import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

export async function installDebianUpdate(file: string, expectedVersion: string, sha512: string) {
  if (!isAbsolute(file) || !file.endsWith(".deb") || file.includes("\0"))
    throw new Error("Invalid update package path.");
  // The installed root-owned helper verifies a private copy after OS authorization, closing cache swaps.
  await execute(
    "/usr/bin/pkexec",
    [
      "/usr/bin/python3",
      "-I",
      "-B",
      "/opt/inkling/resources/update-helper.py",
      file,
      sha512,
      expectedVersion,
    ],
    { timeout: 300_000 },
  );
}

export function updateDisabledReason({
  isPackaged,
  isPreview,
  hasFeed,
  platform,
  appImage,
  packageType,
}: {
  isPackaged: boolean;
  isPreview: boolean;
  hasFeed: boolean;
  platform: NodeJS.Platform;
  appImage?: string;
  packageType?: string;
}) {
  if (!isPackaged || isPreview || !hasFeed)
    return "Updates are available only in installed release builds with a configured feed.";
  if (platform === "win32") return null;
  if (platform === "linux" && (appImage || packageType === "deb")) return null;
  return "Use the Windows installer, Linux AppImage or Debian package to receive updates.";
}
