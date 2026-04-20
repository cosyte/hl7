/**
 * Smoke-runs every example under `examples/*.ts` at depth 1. Does NOT
 * recurse into `examples/data/` or `examples/profile-starter-kit/`.
 * For each example, asserts the process exits 0 and stdout contains a
 * known marker string. Exits non-zero if any example fails.
 *
 * Run from repo root (will be invoked by `pnpm examples` once Plan 08-05
 * wires the script into `package.json`):
 *
 *     pnpm tsx scripts/run-examples.ts
 *
 * Security note (Phase 8 threat T-08-01): filenames are passed as argv
 * to spawnSync — they are NEVER concatenated into a shell template. Any
 * future example file whose name contains shell metacharacters (spaces,
 * `;`, `$`, backticks, etc.) would still run safely.
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const EXAMPLES_DIR = "examples";

const expectedMarkers: Record<string, string> = {
  "extract-patient-info.ts": "Patient MRN:",
  "read-lab-results.ts": "Observation",
  "modify-and-resend.ts": "Re-serialized HL7",
};

const entries = readdirSync(EXAMPLES_DIR, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith(".ts") && !d.name.startsWith("_"))
  .map((d) => d.name)
  .sort();

let failed = 0;
for (const file of entries) {
  // argv array — NOT shell text — so filenames with metacharacters are safe.
  const result = spawnSync("pnpm", ["tsx", `${EXAMPLES_DIR}/${file}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const marker = expectedMarkers[file];
  const stdout = result.stdout ?? "";
  const markerOk = marker === undefined || stdout.includes(marker);

  if (result.status !== 0 || !markerOk) {
    console.error(
      `FAIL ${file}\n  status=${String(result.status)}\n  stderr=${result.stderr ?? ""}\n  marker="${marker ?? "(none)"}" present=${String(markerOk)}`,
    );
    failed += 1;
    continue;
  }
  console.log(`OK   ${file}`);
}

process.exit(failed === 0 ? 0 : 1);
