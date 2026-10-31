import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../.github/workflows/electron-preview.yml", import.meta.url),
  "utf8",
);
const macJob = workflow.slice(workflow.indexOf("  build-mac:"));

test("PR macOS signing is ad-hoc only and keeps strict verification, native smoke and launch", () => {
  expect(macJob).toContain("github.event.pull_request.head.repo.full_name == github.repository");
  const sign = macJob.indexOf("codesign --force --deep --sign - --timestamp=none");
  const verify = macJob.indexOf("codesign --verify --deep --strict");
  const smoke = macJob.indexOf("bun scripts/packaged-backend-smoke.mjs");
  const launch = macJob.indexOf("- name: Launch the packaged app");
  expect(sign).toBeGreaterThan(macJob.indexOf("run: bun run build:dir"));
  expect(verify).toBeGreaterThan(sign);
  expect(smoke).toBeGreaterThan(verify);
  expect(launch).toBeGreaterThan(smoke);
  expect(macJob).toContain("set -euo pipefail");
  expect(macJob).toContain("grep -Fx 'Signature=adhoc'");
  expect(macJob).not.toMatch(
    /CSC_FOR_PULL_REQUEST|secrets\.|pull_request_target|continue-on-error|security (?:import|unlock-keychain)|notarytool/,
  );
});
