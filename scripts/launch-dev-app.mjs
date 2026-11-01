import { chmod, copyFile, link, mkdir, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const electronExecutable = require("electron");
let executable = electronExecutable;

if (process.platform === "win32" || process.platform === "linux") {
  const version = require("electron/package.json").version;
  const win = process.platform === "win32";
  const iconPath = join(root, "build", win ? "icon.ico" : "icon.png");
  const suffix = win
    ? `-${createHash("sha256")
        .update(await readFile(iconPath))
        .digest("hex")
        .slice(0, 12)}`
    : "";
  const directory = join(root, ".artifacts", "dev-electron", `${version}${suffix}`);
  await mkdir(directory, { recursive: true });

  async function stageDirectory(source, destination) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      const from = join(source, entry.name);
      const to = join(destination, entry.name);
      if (entry.isDirectory()) {
        await stageDirectory(from, to);
      } else if (win && from === electronExecutable) {
        continue;
      } else {
        try {
          await link(from, to);
        } catch (error) {
          if (error.code === "EEXIST") continue;
          await copyFile(from, to);
        }
      }
    }
  }

  await stageDirectory(dirname(electronExecutable), directory);
  executable = join(directory, win ? "inkling.exe" : "inkling");
  if (!win) {
    try {
      await link(electronExecutable, executable);
    } catch (error) {
      if (error.code !== "EEXIST") await copyFile(electronExecutable, executable);
    }
  } else if (!(await Bun.file(executable).exists())) {
    await copyFile(electronExecutable, executable);
    const electronBuilderRequire = createRequire(require.resolve("electron-builder"));
    const { editWindowsResources } = electronBuilderRequire("app-builder-lib/out/util/resEdit.js");
    const { version: appVersion, author } = require("../package.json");
    const fileVersion = `${appVersion}.0`;
    await editWindowsResources({
      file: executable,
      versionStrings: {
        CompanyName: author,
        FileDescription: "inkling",
        InternalName: "inkling",
        OriginalFilename: "inkling.exe",
        ProductName: "inkling",
      },
      fileVersion,
      productVersion: fileVersion,
      iconPath,
    });
  }
  if (!win) await chmod(executable, 0o755);
}

const args = [".", "--preview"];
if (process.env.INKLING_DEV_USER_DATA_DIR)
  args.push(`--user-data-dir=${process.env.INKLING_DEV_USER_DATA_DIR}`);
if (process.env.INKLING_DEV_REMOTE_DEBUGGING_PORT)
  args.push(`--remote-debugging-port=${process.env.INKLING_DEV_REMOTE_DEBUGGING_PORT}`);
const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
const child = spawn(executable, args, {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Could not start inkling: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
