import { cosyteVitest } from "@cosyte/vitest-config";

/**
 * Vitest config for the profile starter kit from the shared @cosyte/vitest-config standard.
 * The kit's test contract is green-or-red against the sample fixture; coverage is available via
 * `vitest run --coverage` but not gated here.
 */
export default cosyteVitest({
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
  },
});
