import base from "./vitest.config.js";

/**
 * `pnpm test:eager`: the whole suite once more, with `parseHL7` building every segment during the
 * parse (`{ lazy: false }`) unless a test passes `lazy` itself. `pnpm test` runs the default, a
 * lazy parse; this run proves the eager build passes the same tests. The tests of laziness itself
 * are left out: they assert the default. No coverage: `pnpm test:coverage` measures the default
 * run.
 */
export default {
  ...base,
  test: {
    ...base.test,
    setupFiles: ["test/_helpers/eager-default.setup.ts"],
    exclude: [...(base.test?.exclude ?? ["**/node_modules/**"]), "test/parser-lazy.test.ts"],
  },
};
