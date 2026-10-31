import { dirname, join, resolve } from "node:path";

/**
 * Where the library lives. The folder name is the one the first Windows build
 * used, so every existing library is found again; `--user-data-dir` points a
 * scratch copy elsewhere, and a portable build keeps it beside the executable.
 */
export function libraryDirectory({
  executablePath,
  appDataDirectory,
  portable,
  overrideDirectory,
}: {
  executablePath: string;
  appDataDirectory: string;
  portable: boolean;
  overrideDirectory: string | undefined;
}) {
  if (portable) return join(dirname(executablePath), "data");
  if (overrideDirectory) return resolve(overrideDirectory);
  return join(appDataDirectory, "com.inkling.library");
}
