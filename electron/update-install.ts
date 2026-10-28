import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

export async function installDebianUpdate(file: string, expectedVersion: string) {
  if (!isAbsolute(file) || !file.endsWith(".deb") || file.includes("\0"))
    throw new Error("Invalid update package path.");
  const { stdout } = await execute("/usr/bin/dpkg-deb", ["--field", file, "Package", "Version"]);
  const fields = Object.fromEntries(
    stdout
      .trim()
      .split("\n")
      .map((line) => {
        const separator = line.indexOf(":");
        return [line.slice(0, separator), line.slice(separator + 1).trim()];
      }),
  );
  if (fields.Package !== "inkling" || fields.Version !== expectedVersion.replaceAll("-", "~"))
    throw new Error("Update package identity does not match.");
  // PolicyKit owns authentication; no shell, password collection, apt repair or security overrides.
  await execute("/usr/bin/pkexec", ["/usr/bin/dpkg", "--install", file], { timeout: 300_000 });
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
