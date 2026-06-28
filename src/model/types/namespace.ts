/**
 * `HL7` namespace — type-only re-exports of the 10 composite interfaces
 * (XPN, XAD, CX, CWE, CE, XTN, PL, TS, NM, HD). Consumed via
 * `export * as HL7 from "./model/types/namespace.js";` in the top-level barrel
 * (`src/index.ts`). Named exports of the same interfaces live in the public
 * barrel alongside this namespace for developers who prefer the direct
 * `import type { XPN } ...` style (D-13).
 *
 * The namespace is TYPES-ONLY — parser functions (`parseXpn`, `parseXad`, ...)
 * are exported as value exports from the main barrel, not under `HL7`.
 */

export type { XPN } from "./xpn.js";
export type { XAD } from "./xad.js";
export type { CX } from "./cx.js";
export type { CWE } from "./cwe.js";
export type { CE } from "./ce.js";
export type { XTN } from "./xtn.js";
export type { PL } from "./pl.js";
export type { TS } from "./ts.js";
export type { NM } from "./nm.js";
export type { SN } from "./sn.js";
export type { HD } from "./hd.js";
export type { XCN } from "./xcn.js";
