/**
 * XTN — HL7 v2 Extended Telecommunication Number composite. 12-component
 * structured telecom shape (v1 trimmed from the HL7 v2.5 full 14-component
 * XTN — slots 13/14 are rarely-used legacy fields; v2 may restore the full
 * shape) parsed from a `RawRepetition` on demand by `Field.asXtn()` (wired
 * in Plan 04). Fields are OMITTED when absent (exactOptionalPropertyTypes)
 * — NEVER set to `undefined`.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent } from "./_shared.js";

/**
 * HL7 v2 Extended Telecommunication Number (XTN) — structured telecom per
 * HL7 Chapter 2. All 12 v1 components are optional. Fields are OMITTED when
 * the underlying component is absent (exactOptionalPropertyTypes).
 *
 * Component positions (HL7 1-indexed; this interface is 0-indexed by key):
 * 1. telephoneNumber — formatted or unformatted phone number
 * 2. telecommunicationUseCode — PRN=Primary Residence, WPN=Work, NET=Internet,
 *    ORN=Other Residence, BPN=Beeper, VHN=Vacation Home, ASN=Answering
 *    Service, EMR=Emergency, ...
 * 3. telecommunicationEquipmentType — PH=Phone, FX=Fax, MD=Modem,
 *    CP=Cellular Phone, BP=Beeper, Internet, X.400, TDD, TTY
 * 4. emailAddress
 * 5. countryCode (e.g. "+1")
 * 6. areaCityCode
 * 7. localNumber
 * 8. extension
 * 9. anyText — free-text note
 * 10. extensionPrefix (e.g. "x")
 * 11. speedDialCode
 * 12. unformattedTelephoneNumber
 *
 * @example
 * ```ts
 * import type { XTN } from "@cosyte/hl7";
 * const phone: XTN = {
 *   telephoneNumber: "(555) 555-1234",
 *   telecommunicationUseCode: "WPN",
 *   telecommunicationEquipmentType: "PH",
 * };
 * ```
 */
export interface XTN {
  readonly telephoneNumber?: string;
  readonly telecommunicationUseCode?: string;
  readonly telecommunicationEquipmentType?: string;
  readonly emailAddress?: string;
  readonly countryCode?: string;
  readonly areaCityCode?: string;
  readonly localNumber?: string;
  readonly extension?: string;
  readonly anyText?: string;
  readonly extensionPrefix?: string;
  readonly speedDialCode?: string;
  readonly unformattedTelephoneNumber?: string;
}

/**
 * Parse an HL7 v2 XTN repetition into a structured `XTN` object. Components
 * are auto-unescaped via `unescape()`. Absent / empty components are OMITTED
 * from the result (exactOptionalPropertyTypes semantics). Components past
 * position 12 are silently ignored in v1.
 *
 * @example
 * ```ts
 * import { parseXtn, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [
 *   { subcomponents: ["555-1234"] },
 *   { subcomponents: ["PRN"] },
 *   { subcomponents: ["PH"] },
 * ] };
 * const xtn = parseXtn(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(xtn.telephoneNumber); // "555-1234"
 * ```
 */
export function parseXtn(rep: RawRepetition, enc: EncodingCharacters): XTN {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<XTN> = {};

  const telephoneNumber = readComponent(rep, 0, enc);
  if (telephoneNumber !== undefined) out.telephoneNumber = telephoneNumber;

  const telecommunicationUseCode = readComponent(rep, 1, enc);
  if (telecommunicationUseCode !== undefined)
    out.telecommunicationUseCode = telecommunicationUseCode;

  const telecommunicationEquipmentType = readComponent(rep, 2, enc);
  if (telecommunicationEquipmentType !== undefined) {
    out.telecommunicationEquipmentType = telecommunicationEquipmentType;
  }

  const emailAddress = readComponent(rep, 3, enc);
  if (emailAddress !== undefined) out.emailAddress = emailAddress;

  const countryCode = readComponent(rep, 4, enc);
  if (countryCode !== undefined) out.countryCode = countryCode;

  const areaCityCode = readComponent(rep, 5, enc);
  if (areaCityCode !== undefined) out.areaCityCode = areaCityCode;

  const localNumber = readComponent(rep, 6, enc);
  if (localNumber !== undefined) out.localNumber = localNumber;

  const extension = readComponent(rep, 7, enc);
  if (extension !== undefined) out.extension = extension;

  const anyText = readComponent(rep, 8, enc);
  if (anyText !== undefined) out.anyText = anyText;

  const extensionPrefix = readComponent(rep, 9, enc);
  if (extensionPrefix !== undefined) out.extensionPrefix = extensionPrefix;

  const speedDialCode = readComponent(rep, 10, enc);
  if (speedDialCode !== undefined) out.speedDialCode = speedDialCode;

  const unformattedTelephoneNumber = readComponent(rep, 11, enc);
  if (unformattedTelephoneNumber !== undefined) {
    out.unformattedTelephoneNumber = unformattedTelephoneNumber;
  }

  return out;
}
