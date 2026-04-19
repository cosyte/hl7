/**
 * Internal barrel for composite types. Re-exports every composite interface
 * and its parser function under a single import path so `src/index.ts` and
 * future consumers (Phase 4 helpers) can pull the full surface in one line.
 *
 * The public HL7 namespace lives in `./namespace.js` (types only) and is
 * re-exported via `export * as HL7` from the top-level barrel — see
 * `src/index.ts`.
 */

export type { XPN } from "./xpn.js";
export { parseXpn } from "./xpn.js";
export type { XAD } from "./xad.js";
export { parseXad } from "./xad.js";
export type { CX } from "./cx.js";
export { parseCx } from "./cx.js";
export type { CWE } from "./cwe.js";
export { parseCwe } from "./cwe.js";
export type { CE } from "./ce.js";
export { parseCe } from "./ce.js";
export type { XTN } from "./xtn.js";
export { parseXtn } from "./xtn.js";
export type { PL } from "./pl.js";
export { parsePl } from "./pl.js";
export type { TS } from "./ts.js";
export { parseTs } from "./ts.js";
export type { NM } from "./nm.js";
export { parseNm } from "./nm.js";
export type { HD } from "./hd.js";
export { parseHd } from "./hd.js";
export type { XCN } from "./xcn.js";
export { parseXcn } from "./xcn.js";
