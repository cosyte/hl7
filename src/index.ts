/**
 * @cosyte/hl7-parser — public entry point.
 *
 * The full public API (parseHL7, defineProfile, helpers, types) is populated
 * in subsequent phases. This stub keeps the module resolvable and typed so
 * downstream tooling (tsup, vitest, tsc) can verify the build/typecheck
 * pipeline end-to-end.
 */

/**
 * Library version string, synced with `package.json#version` at build time
 * by downstream phases. Exported now so consumers (and the type-check
 * pipeline) have at least one symbol to resolve through the `exports` map.
 *
 * @example
 * ```ts
 * import { VERSION } from "@cosyte/hl7-parser";
 * console.log(VERSION);
 * ```
 */
export const VERSION: string = "0.0.0";
