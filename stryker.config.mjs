import { cosyteStryker } from "@cosyte/vitest-config/stryker";

// Mutation testing for @cosyte/hl7, on the shared StrykerJS config.
//
//   pnpm mutate full                         every file below; its score is the floor's
//   pnpm mutate changed --base origin/main   only the source files a change touched
//   pnpm quality:mutation [--base origin/main]
//
// The files mutated are the shared default: every `.ts` file under `src/` but tests, declarations,
// `generated/` tables and barrels. The shared config finds a barrel by reading each file: one that
// holds nothing but re-exports. So `src/parser/index.ts` (`parseHL7`), `src/profiles/index.ts`
// (the built-in profiles) and `src/index.ts` (`VERSION`) are mutated, and a new barrel needs no
// entry here. A file left out of this list is a file no mutant ever tests.
export default cosyteStryker({
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
    // A mutant times out when a test takes longer than timeoutFactor times its first, unmutated
    // run plus timeoutMS. At StrykerJS's defaults (1.5 and 5,000 ms), 413 of the full run's 13,133
    // mutants timed out on GitHub-hosted runners (2026-11-11), and 99 of them survived when given
    // this margin: slow survivors the defaults counted as detected, at 81.04 where the score is
    // 80.25. A mutant near that line can be a timeout on one run and a survivor on the next, which
    // moves a full score the ratchet compares exactly. With this margin two full runs scored 80.25
    // each, and only a mutant that never ends times out.
    timeoutFactor: 3,
    timeoutMS: 10_000,
  },
});
