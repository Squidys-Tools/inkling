import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  link,
  mkdir,
  readFile,
  readlink,
  readdir,
  rename,
  symlink,
  unlink,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";

const [electronExecutable] = process.argv.slice(2);
if (!electronExecutable) throw new Error("Expected the Electron executable path.");

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const electronBuilderRequire = createRequire(require.resolve("electron-builder"));
const version = require("electron/package.json").version;
const windows = process.platform === "win32";
const macOS = process.platform === "darwin";
const iconPath = join(root, "build", windows ? "icon.ico" : macOS ? "icon.icns" : "icon.png");
const iconHash = `-${createHash("sha256")
  .update(await readFile(iconPath))
  .digest("hex")
  .slice(0, 12)}`;
const directory = join(
  root,
  ".artifacts",
  "dev-electron",
  `${version}-${process.platform}-${process.arch}${iconHash}`,
);
await mkdir(directory, { recursive: true });

async function stageDirectory(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      await symlink(await readlink(from), to);
    } else if (entry.isDirectory()) {
      await stageDirectory(from, to);
    } else if (windows && from === electronExecutable) {
      continue;
    } else {
      try {
        await link(from, to);
      } catch (error) {
        if (error.code !== "EEXIST") await copyFile(from, to);
      }
    }
  }
}

let executable;
if (windows) {
  executable = join(directory, "inkling.exe");
  if (!(await Bun.file(executable).exists())) {
    await stageDirectory(dirname(electronExecutable), directory);
    await copyFile(electronExecutable, executable);
    const { editWindowsResources } = electronBuilderRequire("app-builder-lib/out/util/resEdit.js");
    const { version: appVersion, author } = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    );
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
} else if (macOS) {
  const appBundle = join(directory, "inkling.app");
  executable = join(appBundle, "Contents", "MacOS", "inkling");
  if (!(await Bun.file(executable).exists())) {
    const sourceBundle = resolve(dirname(electronExecutable), "../..");
    const stagingBundle = join(directory, `.inkling-${process.pid}-${Date.now()}.app`);
    const clone = Bun.spawn(["cp", "-cR", sourceBundle, stagingBundle], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await clone.exited) !== 0)
      throw new Error("Could not stage the inkling macOS app bundle.");

    const { parsePlistFile, savePlistFile } = electronBuilderRequire(
      "app-builder-lib/out/util/plist.js",
    );
    const appId = "com.inkling.library.dev";
    const sourceContents = join(sourceBundle, "Contents");
    const stagedContents = join(stagingBundle, "Contents");

    async function updatePlist(sourcePath, stagedPath, updates) {
      // Detach the staged plist before writing to keep Electron's source bundle untouched.
      await unlink(stagedPath);
      await copyFile(sourcePath, stagedPath);
      const plist = await parsePlistFile(stagedPath);
      await savePlistFile(stagedPath, { ...plist, ...updates });
    }

    const sourceInfo = join(sourceContents, "Info.plist");
    const stagedInfo = join(stagedContents, "Info.plist");
    await updatePlist(sourceInfo, stagedInfo, {
      CFBundleDisplayName: "inkling",
      CFBundleExecutable: "inkling",
      CFBundleIconFile: "icon.icns",
      CFBundleIdentifier: appId,
      CFBundleName: "inkling",
    });
    await rename(
      join(stagedContents, "MacOS", basename(electronExecutable)),
      join(stagedContents, "MacOS", "inkling"),
    );

    const sourceFrameworks = join(sourceContents, "Frameworks");
    const stagedFrameworks = join(stagedContents, "Frameworks");
    for (const entry of await readdir(sourceFrameworks, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        !entry.name.startsWith("Electron Helper") ||
        !entry.name.endsWith(".app")
      )
        continue;
      const helperName = entry.name.slice(0, -".app".length);
      const renamedHelper = helperName.replace(/^Electron/, "inkling");
      const sourceHelper = join(sourceFrameworks, entry.name);
      const stagedHelper = join(stagedFrameworks, entry.name);
      const helperInfo = join("Contents", "Info.plist");
      const sourceHelperPlist = join(sourceHelper, helperInfo);
      const stagedHelperPlist = join(stagedHelper, helperInfo);
      const helperRole = helperName
        .slice("Electron Helper".length)
        .replace(/[()]/g, "")
        .trim()
        .replace(/\s+/g, ".")
        .toLowerCase();

      await updatePlist(sourceHelperPlist, stagedHelperPlist, {
        CFBundleDisplayName: renamedHelper,
        CFBundleExecutable: renamedHelper,
        CFBundleIdentifier: `${appId}.helper${helperRole ? `.${helperRole}` : ""}`,
        CFBundleName: renamedHelper,
      });
      await rename(
        join(stagedHelper, "Contents", "MacOS", helperName),
        join(stagedHelper, "Contents", "MacOS", renamedHelper),
      );
      await rename(stagedHelper, join(stagedFrameworks, `${renamedHelper}.app`));
    }

    const stagedIcon = join(stagedContents, "Resources", "icon.icns");
    try {
      await unlink(stagedIcon);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await copyFile(iconPath, stagedIcon);
    const signature = Bun.spawn(["codesign", "--force", "--deep", "--sign", "-", stagingBundle], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await signature.exited) !== 0)
      throw new Error("Could not sign the inkling macOS app bundle.");
    await rename(stagingBundle, appBundle);
  }
} else {
  executable = join(directory, "inkling");
  await stageDirectory(dirname(electronExecutable), directory);
  try {
    await link(electronExecutable, executable);
  } catch (error) {
    if (error.code !== "EEXIST") await copyFile(electronExecutable, executable);
  }
  await chmod(executable, 0o755);
}

process.stdout.write(executable);
