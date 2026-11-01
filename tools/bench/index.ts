// Runs one benchmark: `bun run bench [frames|library|first-page|quality]`.
// `frames` is the default; any further arguments pass through to the benchmark.

const benches: Record<string, string> = {
  frames: "tools/bench/frames.ts",
  library: "tools/bench/generate.ts",
  "first-page": "tools/bench/first-page.ts",
  quality: "benchmarks/harness/index.ts",
};

async function main() {
  const [name = "frames", ...rest] = process.argv.slice(2);
  const file = benches[name];
  if (!file) {
    console.error(
      `Unknown benchmark "${name}". Expected one of: ${Object.keys(benches).join(", ")}`,
    );
    process.exit(1);
  }
  const proc = Bun.spawn(["bun", file, ...rest], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(await proc.exited);
}

if (import.meta.main) await main();
