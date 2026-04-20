import { defineConfig } from "tsup";

/**
 * tsup config for the profile starter kit. Dual ESM+CJS build matching
 * the peer @cosyte/hl7-parser surface.
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
