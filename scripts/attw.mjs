#!/usr/bin/env node
/**
 * scripts/attw.mjs: the `attw` publish gate, run as a CALLER of the shared body in
 * `@cosyte/script-utils/attw`, pinned to an exact version. Nothing of the gate lives here.
 *
 * Its nets, its argument allow-list and every measurement behind them are documented ONCE, in the
 * docblock at the top of `node_modules/@cosyte/script-utils/attw.js`. Read it there. A fix to the
 * gate is a publish of that package and a version bump here, never a local edit: a second copy of
 * the body is the defect this file replaced.
 *
 * What this file owns:
 *
 *   - `callerUrl: import.meta.url`. The gate runs `../node_modules/.bin/attw` resolved from the
 *     CALLER's URL, so the binary it runs is this package's own `@arethetypeswrong/cli`.
 *   - Failing closed. If the shared body cannot be imported, the specifier and the reason go to
 *     stderr and the exit is 1. There is no local copy behind the import and there must never be
 *     one: a fallback is a second copy of the gate wearing a different hat.
 */

const SPECIFIER = "@cosyte/script-utils/attw";

let runAttwGate;
try {
  ({ runAttwGate } = await import(SPECIFIER));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `\n✗ attw gate: could not load ${SPECIFIER}, so nothing was checked.\n` +
      `  ${reason}\n` +
      `  Install dependencies first (pnpm install). There is no local copy of the gate\n` +
      `  behind this import, deliberately.\n`,
  );
  process.exit(1);
}

process.exit(runAttwGate({ callerUrl: import.meta.url }));
