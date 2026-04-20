/**
 * XCN — HL7 v2 Extended Composite ID Number and Name for Persons. Common in
 * OBR-16 (ordering provider), PV1-7 (attending doctor), PV1-8 (referring
 * doctor), and other fields that identify a human clinician.
 *
 * Structurally XCN is XPN (person-name) components with an `idNumber` prefix
 * and an `assigningAuthority` nested-HD at component 9. v1 ships the 13
 * most-used components (HL7 v2.5 defines 23); additional components may be
 * restored in v2 if vendor-quirk fixtures require them.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 * Parser is silent (D-09 composite-parser silence).
 */

import type {
  EncodingCharacters,
  RawComponent,
  RawRepetition,
} from "../../parser/types.js";

import { readComponent } from "./_shared.js";
import { parseHd, type HD } from "./hd.js";

/**
 * HL7 v2 Extended Composite ID Number and Name for Persons (XCN) — per HL7
 * Chapter 2.A.88. All 13 v1 components are optional. Fields are OMITTED when
 * the underlying component is absent (exactOptionalPropertyTypes).
 *
 * Component positions (HL7 1-indexed; this interface is 0-indexed by key):
 * 1. idNumber — e.g. employee ID, NPI digits, DEA number (CX-1 analogue)
 * 2. familyName (XPN-1)
 * 3. givenName (XPN-2)
 * 4. secondName — second and further given names (XPN-3)
 * 5. suffix — Jr., III, etc. (XPN-4)
 * 6. prefix — Dr., Mrs., etc. (XPN-5)
 * 7. degree — MD, PhD, etc. (XPN-6)
 * 8. sourceTable
 * 9. assigningAuthority — nested HD (CX-4 analogue)
 * 10. nameTypeCode — L=Legal, M=Maiden, N=Nickname, ... (XPN-7)
 * 11. identifierCheckDigit
 * 12. checkDigitScheme — ISO 7064, M10, M11, NPI
 * 13. identifierTypeCode — "NPI", "DN" (DEA number), ... (CX-5 analogue)
 *
 * @example
 * ```ts
 * import type { XCN } from "@cosyte/hl7";
 * const orderingProvider: XCN = {
 *   idNumber: "1234567890",
 *   familyName: "Smith",
 *   givenName: "Jane",
 *   identifierTypeCode: "NPI",
 * };
 * ```
 */
export interface XCN {
  readonly idNumber?: string;
  readonly familyName?: string;
  readonly givenName?: string;
  readonly secondName?: string;
  readonly suffix?: string;
  readonly prefix?: string;
  readonly degree?: string;
  readonly sourceTable?: string;
  readonly assigningAuthority?: HD;
  readonly nameTypeCode?: string;
  readonly identifierCheckDigit?: string;
  readonly checkDigitScheme?: string;
  readonly identifierTypeCode?: string;
}

/**
 * Parse XCN component 9 (assigningAuthority) from its subcomponents into an
 * `HD`. The 3 HD subfields live as subcomponents of the XCN component; we
 * build a synthetic `RawRepetition` where each synthetic component wraps one
 * subcomponent of the XCN component as its own single subcomponent. This
 * lets `parseHd` consume the value via its existing `(rep, enc)` signature
 * without reimplementing the read.
 *
 * Returns `undefined` when the source component is missing or every
 * subcomponent is the empty string — prevents stub empty HD objects from
 * leaking into XCN output (mirrors the CX/PL convention).
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
 * Parse an HL7 v2 XCN repetition into a structured `XCN` object. Components
 * are auto-unescaped via `unescape()`. Absent / empty components are OMITTED
 * from the result (exactOptionalPropertyTypes semantics). Component 9
 * (`assigningAuthority`) is parsed as a nested `HD`; see component table in
 * the `XCN` interface JSDoc for the v1 trimming.
 *
 * @example
 * ```ts
 * import { parseXcn, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [
 *   { subcomponents: ["1234567890"] },
 *   { subcomponents: ["Smith"] },
 *   { subcomponents: ["Jane"] },
 *   { subcomponents: [""] },
 *   { subcomponents: [""] },
 *   { subcomponents: [""] },
 *   { subcomponents: [""] },
 *   { subcomponents: [""] },
 *   { subcomponents: ["HOSP", "1.2.3", "ISO"] },
 *   { subcomponents: ["L"] },
 *   { subcomponents: [""] },
 *   { subcomponents: [""] },
 *   { subcomponents: ["NPI"] },
 * ] };
 * const xcn = parseXcn(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(xcn.idNumber);                        // "1234567890"
 * console.log(xcn.familyName);                      // "Smith"
 * console.log(xcn.assigningAuthority?.namespaceId); // "HOSP"
 * console.log(xcn.identifierTypeCode);              // "NPI"
 * ```
 */
export function parseXcn(rep: RawRepetition, enc: EncodingCharacters): XCN {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<XCN> = {};

  const idNumber = readComponent(rep, 0, enc);
  if (idNumber !== undefined) out.idNumber = idNumber;

  const familyName = readComponent(rep, 1, enc);
  if (familyName !== undefined) out.familyName = familyName;

  const givenName = readComponent(rep, 2, enc);
  if (givenName !== undefined) out.givenName = givenName;

  const secondName = readComponent(rep, 3, enc);
  if (secondName !== undefined) out.secondName = secondName;

  const suffix = readComponent(rep, 4, enc);
  if (suffix !== undefined) out.suffix = suffix;

  const prefix = readComponent(rep, 5, enc);
  if (prefix !== undefined) out.prefix = prefix;

  const degree = readComponent(rep, 6, enc);
  if (degree !== undefined) out.degree = degree;

  const sourceTable = readComponent(rep, 7, enc);
  if (sourceTable !== undefined) out.sourceTable = sourceTable;

  const assigningAuthority = parseAssigningAuthority(rep.components[8], enc);
  if (assigningAuthority !== undefined) out.assigningAuthority = assigningAuthority;

  const nameTypeCode = readComponent(rep, 9, enc);
  if (nameTypeCode !== undefined) out.nameTypeCode = nameTypeCode;

  const identifierCheckDigit = readComponent(rep, 10, enc);
  if (identifierCheckDigit !== undefined) out.identifierCheckDigit = identifierCheckDigit;

  const checkDigitScheme = readComponent(rep, 11, enc);
  if (checkDigitScheme !== undefined) out.checkDigitScheme = checkDigitScheme;

  const identifierTypeCode = readComponent(rep, 12, enc);
  if (identifierTypeCode !== undefined) out.identifierTypeCode = identifierTypeCode;

  return out;
}
