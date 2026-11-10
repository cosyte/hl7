import { DEFAULT_MUTATE, cosyteStryker } from "@cosyte/vitest-config/stryker";

// Mutation testing for @cosyte/hl7, on the shared StrykerJS config.
//
//   pnpm mutate full                         every file below; its score is the floor's
//   pnpm mutate changed --base origin/main   only the source files a change touched
//   pnpm quality:mutation [--base origin/main]
//
// The shared list leaves out every `index.ts` as a barrel. Here `src/parser/index.ts` is not one: it
// holds `parseHL7` itself, so it is mutated, and the barrels are named one by one instead. A file
// left out of this list is a file no mutant ever tests.
const BARRELS = [
  "!src/index.ts",
  "!src/arbitraries/index.ts",
  "!src/conformance/index.ts",
  "!src/helpers/index.ts",
  "!src/model/types/index.ts",
  "!src/profiles/index.ts",
  "!src/text/index.ts",
];

export default cosyteStryker({
  mutate: [...DEFAULT_MUTATE.filter((pattern) => pattern !== "!src/**/index.ts"), ...BARRELS],
  // The suite without the tests that read a clock (see that file).
  vitestConfig: "vitest.mutation.config.ts",
  stryker: {
    // StrykerJS writes `// @ts-nocheck` into every source file of its sandbox by default, and a
    // test here compares the committed generated module with a fresh render byte for byte. Vitest
    // never type-checks, so the comment changes nothing a test runs, only the bytes.
    disableTypeChecks: false,
    // Static mutants (module-level code: the warning registry, segment and structure tables) run the
    // whole suite each, since no test can be traced to them. Measured on 2026-11-10: 5,328 of 12,280
    // mutants, estimated by StrykerJS at 94% of a run of about 20 hours on 15 workers. They are left
    // out until the suite can afford them; the score and its floor are of the other mutants.
    ignoreStatic: true,
  },
});
