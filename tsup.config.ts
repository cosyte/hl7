import { defineConfig } from "tsup";

/**
 * tsup build configuration for @cosyte/hl7-parser.
 *
 * Produces dual-format output matching the `exports` map in package.json:
 *   - dist/index.mjs   (ESM, consumed via the `import` condition)
 *   - dist/index.cjs   (CJS, consumed via the `require` condition)
 *   - dist/index.d.ts  (Type declarations, consumed via the `types` condition)
 *
 * SETUP-02: dual ESM + CJS with correct exports map resolution.
 * SETUP-04: type declarations with JSDoc forwarded for IntelliSense.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".mjs" : ".cjs",
    };
  },
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "node",
  treeshake: true,
  splitting: false,
  minify: false,
  shims: false,
  skipNodeModulesBundle: true,
});
