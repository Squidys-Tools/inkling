import { expect, test } from "bun:test";
import { searchDiagnostic } from "./search-diagnostics.ts";
test("local search diagnostics preserve causes but bound and redact remote credentials", () => {
  const diagnostic = searchDiagnostic(
    new Error(
      "CUDA provider missing\u0000 token=secret123 Bearer credential https://private.example/?key=private",
    ),
  );
  expect(diagnostic).toContain("CUDA provider missing");
  expect(diagnostic).not.toContain("secret123");
  expect(diagnostic).not.toContain("credential");
  expect(diagnostic).not.toContain("private.example");
  expect(diagnostic).not.toContain("\u0000");
  expect(searchDiagnostic("x".repeat(10000))).toHaveLength(2048);
});
