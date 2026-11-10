import { fileURLToPath } from "node:url";

import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for @cosyte/hl7 from the shared @cosyte/vitest-config standard.
 *
 * The shared standard gates every directory named below at >= 90 for lines, branches, functions and
 * statements, on top of the same global floor. That covers every core directory
 * (parser/model/helpers/serialize/builder/profiles/text/conformance/structure); the per-directory
 * entries and the global `branches: 90` this file used to restate were the shared gate's own values.
 *
 * This repository gates every metric at 100 globally, on top of that. A threshold only rises: a line
 * no input through the public API can reach carries an inline `v8 ignore` comment naming its true
 * reason, never a lowered number here.
 */
const config = cosyteVitest({
  coverageThresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
  coverageDirs: [
    "parser",
    "model",
    "helpers",
    "serialize",
    "builder",
    "profiles",
    "text",
    "conformance",
    "structure",
    "arbitraries",
  ],
  test: {
    // Vitest's default would also collect the starter kit's tests under `examples/`, which run
    // against the kit's own install in CI's `extras` job, not this one.
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // The suite has run against a 10 s ceiling, not Vitest's 5 s default, since this config was
    // first written, and many cases spawn `tsx`, `pnpm` or `node`. Lowering it is a measured change
    // of its own; a case that needs more declares its own budget next to its work.
    testTimeout: 10_000,
  },
});

const srcEntry = fileURLToPath(new URL("src/index.ts", import.meta.url));
const distDir = fileURLToPath(new URL("dist/", import.meta.url));

/**
 * `src/arbitraries/` imports the library by its package name, as the published subpath must (see
 * `tsup.config.ts`). Under test that name resolves to the source entry point, the mapping `paths`
 * gives the type checker, so the tests and coverage run against `src/`. Imported from the built
 * subpath (`dist/arbitraries.mjs`, which the docs samples load), it resolves to the built entry
 * point beside it, as it does for a consumer, so a sample never mixes built and source classes.
 */
const ownPackageName = {
  name: "cosyte-hl7-own-package-name",
  enforce: "pre" as const,
  resolveId(source: string, importer: string | undefined): string | null {
    if (source !== "@cosyte/hl7") return null;
    return importer?.startsWith(distDir) === true ? `${distDir}index.mjs` : srcEntry;
  },
};

export default { ...config, plugins: [ownPackageName] };
