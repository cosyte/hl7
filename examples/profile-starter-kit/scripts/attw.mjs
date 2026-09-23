#!/usr/bin/env node
/**
 * scripts/attw.mjs: this package's `attw` publish gate, run as a CALLER of the shared body in
 * `@cosyte/script-utils/attw`. `prepublishOnly` runs it last, after the build.
 *
 * WHY NOT THE BARE CLI. `attw` reports a package whose tarball carries no type declarations and
 * still exits 0, so a publish that lost its `.d.ts` files reads as a pass. The shared gate closes
 * that and a few related false greens. What it checks, what it refuses and why are documented in
 * the docblock at the top of `node_modules/@cosyte/script-utils/attw.js` after `pnpm install`;
 * nothing is restated here.
 *
 * KEEP these three things as they are:
 *
 *   - the `attw` script in `package.json`, exactly `node scripts/attw.mjs`;
 *   - `@arethetypeswrong/cli` in `devDependencies`: the gate runs THIS package's own
 *     `node_modules/.bin/attw`, found from the `import.meta.url` passed below;
 *   - `@cosyte/script-utils` in `devDependencies`, at an exact version.
 *
 * If the shared body cannot be imported, the gate names what it could not load and exits 1. There
 * is no local copy behind the import, so a broken install can never read as a pass.
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
