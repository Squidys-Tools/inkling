import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../..", import.meta.url));
const inputs = ["apps/renderer", "packages", "tools/repo/assert-no-demo-seed.ts", "bun.lock"];
// Inside the demo folder so that any other build of it, which empties the folder, invalidates this.
const stamp = join(workspace, "apps/site/public/demo/.source-hash");

function sourceHash() {
  const files = execFileSync("git", ["ls-files", "-coz", "--exclude-standard", "--", ...inputs], {
    cwd: workspace,
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  const hash = createHash("sha256");
  for (const file of new Set(files.split("\0").filter(Boolean))) {
    const path = join(workspace, file);
    hash.update(file).update("\0");
    if (existsSync(path)) hash.update(readFileSync(path));
  }
  return hash.digest("hex");
}

const current = sourceHash();
if (existsSync(stamp) && readFileSync(stamp, "utf8") === current) {
  console.log("/demo/ is up to date, skipping its build");
} else {
  const { status } = spawnSync(
    "bun",
    ["run", "vite", "build", "--config", "../renderer/vite.config.ts", "--mode", "site"],
    { cwd: join(workspace, "apps/site"), stdio: "inherit" },
  );
  if (status !== 0) process.exit(status ?? 1);
  writeFileSync(stamp, current);
}
