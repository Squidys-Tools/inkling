const { chmod, readdir, lstat } = require("node:fs/promises");
const { join } = require("node:path");

module.exports = async ({ electronPlatformName, appOutDir }) => {
  if (electronPlatformName !== "linux") return;
  process.umask(0o022);
  async function normalize(directory) {
    await chmod(directory, 0o755);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await normalize(path);
      else if (entry.isFile()) {
        const info = await lstat(path);
        await chmod(path, info.mode & 0o111 ? 0o755 : 0o644);
      }
    }
  }
  await normalize(appOutDir);
};
