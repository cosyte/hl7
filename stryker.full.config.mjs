import config from "./stryker.config.mjs";

// The full mutation run whose score `quality-floor.json` holds, run by the weekly workflow and by
// hand with `pnpm mutate:full`. It is `stryker.config.mjs` over every source file but two kinds:
//
// - the generated structure tables (`src/parser/generated/`), which `stryker.config.mjs` already
//   leaves out by the shared list's `generated` rule: data a script writes, checked byte for byte
//   against a fresh render, not logic a mutant can tell apart;
// - the schema writers (`src/serialize/schema/`), which write the JSON Schema and Zod artifacts at
//   build time. Their output is compared whole with the committed artifacts by `pnpm test`.
//
// Static mutants stay ignored, as `stryker.config.mjs` sets: a mutant in code that runs once when a
// module loads (the warning registry, the segment and structure tables) can be tested only by
// running the whole suite again, and they were about 94% of a full run's time when measured. The
// score and its floor are of the other mutants.
//
// The weekly workflow splits the files across parallel jobs by the hash of each path and keeps
// StrykerJS's incremental results between runs, so a later run retests only what changed.
export default {
  ...config,
  mutate: [...config.mutate, "!src/serialize/schema/**"],
};
