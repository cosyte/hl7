/**
 * CX — HL7 v2 Extended Composite ID (with check digit) composite.
 * 10-component structured-identifier shape parsed from a `RawRepetition` on
 * demand by `Field.asCx()` (wired in Plan 04). Fields are OMITTED when
 * absent (exactOptionalPropertyTypes) — NEVER set to `undefined`.
 *
 * Component 4 (`assigningAuthority`) is the ONE nested-composite field in
 * this plan: its subcomponents form a 3-field HD (namespaceId, universalId,
 * universalIdType). To reuse `parseHd` without duplicating logic, the parser
 * synthesises a `RawRepetition` whose components wrap the subcomponents of
 * CX component 4.
 *
 * Component 6 (`assigningFacility`) is simplified to a flat `string` in v1
 * — the HL7 spec treats it as HD-shaped, but v1 favours simplicity. Callers
 * who need the full HD can parse the raw string separately.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 */

import type {
  EncodingCharacters,
  RawComponent,
  RawRepetition,
} from "../../parser/types.js";

import { readComponent } from "./_shared.js";
import { parseHd, type HD } from "./hd.js";

/**
 * HL7 v2 Extended Composite ID (CX) — structured identifier per HL7 Chapter
 * 2. All 10 components are optional. Fields are OMITTED when the underlying
 * component is absent (exactOptionalPropertyTypes). `assigningAuthority`
 * uses the nested `HD` shape; `assigningFacility` is flattened to a plain
 * string in v1.
 *
 * Component positions (HL7 1-indexed; this interface is 0-indexed by key):
 * 1. idNumber
 * 2. checkDigit
 * 3. checkDigitScheme (ISO 7064, M10, M11, NPI)
 * 4. assigningAuthority (nested HD — 3 subcomponents form a HD composite)
 * 5. identifierTypeCode (MR, SSN, DL, MC, ...)
 * 6. assigningFacility (v1: flattened to string; spec is HD-shaped)
 * 7. effectiveDate (raw HL7 TS string)
 * 8. expirationDate (raw HL7 TS string)
 * 9. assigningJurisdiction (v1: flattened to string)
 * 10. assigningAgencyOrDepartment (v1: flattened to string)
 *
 * @example
 * ```ts
 * import type { CX } from "@cosyte/hl7-parser";
 * const mrn: CX = {
 *   idNumber: "123456",
 *   assigningAuthority: { namespaceId: "EPIC", universalId: "1.2.840.114350", universalIdType: "ISO" },
 *   identifierTypeCode: "MR",
 * };
 * ```
 */
export interface CX {
  readonly idNumber?: string;
  readonly checkDigit?: string;
  readonly checkDigitScheme?: string;
  readonly assigningAuthority?: HD;
  readonly identifierTypeCode?: string;
  readonly assigningFacility?: string;
  readonly effectiveDate?: string;
  readonly expirationDate?: string;
  readonly assigningJurisdiction?: string;
  readonly assigningAgencyOrDepartment?: string;
}

/**
 * Parse CX component 4 (assigningAuthority) from its subcomponents into an
 * `HD`. The 3 HD subfields live as subcomponents of the CX component; we
 * build a synthetic `RawRepetition` where each synthetic component wraps one
 * subcomponent of the CX component as its own single subcomponent. This
 * lets `parseHd` consume the value via its existing `(rep, enc)` signature
 * without reimplementing the read.
 *
 * Returns `undefined` when the source component is missing or every
 * subcomponent is the empty string — prevents stub empty HD objects from
 * leaking into CX output (T-03-02-02 mitigation).
 *
 * @internal
 */
function parseAssigningAuthority(
  comp: RawComponent | undefined,
  enc: EncodingCharacters,
): HD | undefined {
  if (comp === undefined) return undefined;
  if (comp.subcomponents.every((s) => s === "")) return undefined;
  const synthetic: RawRepetition = {
    components: comp.subcomponents.map((sub) => ({ subcomponents: [sub] })),
  };
  const hd = parseHd(synthetic, enc);
  return Object.keys(hd).length === 0 ? undefined : hd;
}

/**
 * Parse an HL7 v2 CX repetition into a structured `CX` object. Components
 * are auto-unescaped via `unescape()`. Absent / empty components are OMITTED
 * from the result (exactOptionalPropertyTypes semantics). Component 4
 * (`assigningAuthority`) is parsed as a nested `HD`; see component table in
 * the `CX` interface JSDoc for the v1 simplifications on components 6/9/10.
 *
 * @example
 * ```ts
 * import { parseCx, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7-parser";
 * const rep = { components: [
 *   { subcomponents: ["123"] },
 *   { subcomponents: [""] },
 *   { subcomponents: [""] },
 *   { subcomponents: ["EPIC", "1.2.840.114350", "ISO"] },
 *   { subcomponents: ["MR"] },
 * ] };
 * const cx = parseCx(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(cx.idNumber);                       // "123"
 * console.log(cx.assigningAuthority?.namespaceId); // "EPIC"
 * ```
 */
export function parseCx(rep: RawRepetition, enc: EncodingCharacters): CX {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<CX> = {};

  const idNumber = readComponent(rep, 0, enc);
  if (idNumber !== undefined) out.idNumber = idNumber;

  const checkDigit = readComponent(rep, 1, enc);
  if (checkDigit !== undefined) out.checkDigit = checkDigit;

  const checkDigitScheme = readComponent(rep, 2, enc);
  if (checkDigitScheme !== undefined) out.checkDigitScheme = checkDigitScheme;

  const assigningAuthority = parseAssigningAuthority(rep.components[3], enc);
  if (assigningAuthority !== undefined) out.assigningAuthority = assigningAuthority;

  const identifierTypeCode = readComponent(rep, 4, enc);
  if (identifierTypeCode !== undefined) out.identifierTypeCode = identifierTypeCode;

  const assigningFacility = readComponent(rep, 5, enc);
  if (assigningFacility !== undefined) out.assigningFacility = assigningFacility;

  const effectiveDate = readComponent(rep, 6, enc);
  if (effectiveDate !== undefined) out.effectiveDate = effectiveDate;

  const expirationDate = readComponent(rep, 7, enc);
  if (expirationDate !== undefined) out.expirationDate = expirationDate;

  const assigningJurisdiction = readComponent(rep, 8, enc);
  if (assigningJurisdiction !== undefined) out.assigningJurisdiction = assigningJurisdiction;

  const assigningAgencyOrDepartment = readComponent(rep, 9, enc);
  if (assigningAgencyOrDepartment !== undefined) {
    out.assigningAgencyOrDepartment = assigningAgencyOrDepartment;
  }

  return out;
}
