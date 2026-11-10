import config from "./stryker.config.mjs";

// The full mutation run whose score `quality-floor.json` holds, run weekly in CI and by hand with
// `pnpm mutate:full`. It is `stryker.config.mjs` over the read and write path only: the parser
// (`src/parser/`, without the generated structure tables) and the serializers (`src/serialize/`,
// without `schema/`, which writes the JSON Schema and Zod artifacts at build time).
//
// Why not every file: measured on 2026-11-10, all of `src/` is 11,422 mutants (static ones left
// out), and StrykerJS estimated about 2 hours on 15 workers here. The weekly job runs on a 4-CPU
// GitHub-hosted runner within 180 minutes, about a fifth of that. A pull request still mutates
// every source file it changes, through `stryker.config.mjs`, and must kill every mutant in the
// lines it changed. Widening this list is how the floor grows to the rest of `src/`.
export default {
  ...config,
  mutate: [
    "src/parser/**/*.ts",
    "!src/parser/generated/**",
    "src/serialize/*.ts",
  ],
};
