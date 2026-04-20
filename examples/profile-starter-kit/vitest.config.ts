/**
 * Vitest config for the profile starter kit. No coverage gate —
 * the kit's test contract is green-or-red against the sample fixture.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "coverage/**"],
    reporters: ["default"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
