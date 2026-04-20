import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for @cosyte/hl7.
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
      // Phase 7 Plan 06 (Wave 3) tightened branches 85 -> 90 across all
      // five gated per-directory entries after Plan 01's baseline showed
      // every gated dir clearing 90% branches with margin (model/** lowest
      // at 90.26%; parser/** 90.74%; serialize/** 92.85%; builder/** 93.54%;
      // helpers/** 95.09%). Scenario A per Plan 07-06 Task 1 — keep the
      // broad gate (parser/model/helpers per CLAUDE.md + serialize/builder
      // from Phase 5) because narrowing scope after the numbers already pass
      // would be a regression.
      //
      // Global (non-per-dir) thresholds kept at branches:85. CONTEXT.md D-02
      // and D-06 explicitly scope the 90% bar to the 5 per-dir entries;
      // everything else under `include` (currently only `src/profiles/**`,
      // which sits at branches 85.00% per Plan 01 baseline) is "reported but
      // ungated." Bumping global branches to 90 would implicitly gate
      // profiles/** — the opposite of the stated scope. The per-dir
      // thresholds below enforce the real CLAUDE.md bar; the global acts as
      // a floor only, not the CLAUDE.md gate.
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
        // Per-directory thresholds matching CLAUDE.md guardrail.
        "src/parser/**": {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
        "src/model/**": {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
        "src/helpers/**": {
          lines: 90,
          branches: 90,
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
          branches: 90,
          functions: 90,
          statements: 90,
        },
        "src/builder/**": {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
      },
    },
  },
});
