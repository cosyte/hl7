import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for @cosyte/hl7-parser.
 *
 * Phase 1 ships a minimal test surface (just a sanity test) but declares
 * coverage thresholds now so Phase 7 only has to flip `enabled: true` on
 * the thresholds, not re-architect the config.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "coverage/**"],
    reporters: ["default"],
    testTimeout: 10_000,
    hookTimeout: 10_000,

    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/index.ts",
        "src/**/*.d.ts",
        "src/**/__fixtures__/**",
      ],
      // Phase 7 will enable these thresholds. Declared now so the config
      // shape is stable across phases.
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
        // Per-directory thresholds matching CLAUDE.md guardrail.
        "src/parser/**": {
          lines: 90,
          branches: 85,
          functions: 90,
          statements: 90,
        },
        "src/model/**": {
          lines: 90,
          branches: 85,
          functions: 90,
          statements: 90,
        },
        "src/helpers/**": {
          lines: 90,
          branches: 85,
          functions: 90,
          statements: 90,
        },
        // Phase 5 additions — `src/serialize/**` is the emit pipeline
        // (emit-field, to-string, to-json, pretty-print); `src/builder/**`
        // is the outbound factory (build-message, format-timestamp,
        // control-id). Same >= 90% bar so Phase 7's `pnpm test:coverage`
        // gate applies uniformly across the whole `src/` tree.
        "src/serialize/**": {
          lines: 90,
          branches: 85,
          functions: 90,
          statements: 90,
        },
        "src/builder/**": {
          lines: 90,
          branches: 85,
          functions: 90,
          statements: 90,
        },
      },
    },
  },
});
