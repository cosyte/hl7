/**
 * Typed-composite **encoders** for the `@cosyte/hl7` emit path (roadmap Phase
 * T) — the conservative-emit mirror of the `src/model/types/*` read parsers.
 *
 * Each encoder takes one typed composite (an {@link XPN} name, a {@link CX}
 * identifier, a {@link TS} timestamp, …) and produces a `RawField` whose
 * positional structure matches exactly what the corresponding `parseXxx`
 * reads back. The load-bearing guarantees:
 *
 * - **No delimiter injection.** Component values are stored **decoded** (the
 *   same surface `parseXxx` returns), and the serializer (`emit-field.ts`)
 *   runs every subcomponent through `reescape` — the HL7-R encode-safe codec —
 *   on the way out. A `familyName` of `"Smith^Jr"` is therefore emitted as
 *   `Smith\S\Jr` (one component) and re-parses to the exact string `"Smith^Jr"`,
 *   never forging a component boundary. The caller never hand-assembles
 *   `^`/`&`/`~`.
 * - **`emit ∘ parse` identity on the modelled fields.** Interior empty
 *   components are preserved (so component positions stay aligned) and only
 *   trailing empties are trimmed (matching the serializer's D-02 strip and the
 *   parser's omit-on-absent), so `parseXxx(encodeXxx(v)) ` reproduces `v` on
 *   every modelled field.
 * - **Never fabricate.** An omitted optional field encodes to an empty /
 *   absent component — never a defaulted value. An all-empty composite encodes
 *   to an absent field (`repetitions: []`).
 *
 * Zero runtime deps — pure functions over the raw positional tree.
 */

import type { RawComponent, RawField, RawRepetition } from "../parser/types.js";

import type { CE } from "../model/types/ce.js";
import type { CWE } from "../model/types/cwe.js";
import type { CX } from "../model/types/cx.js";
import type { HD } from "../model/types/hd.js";
import type { NM } from "../model/types/nm.js";
import type { PL } from "../model/types/pl.js";
import type { TS } from "../model/types/ts.js";
import type { XAD } from "../model/types/xad.js";
import type { XCN } from "../model/types/xcn.js";
import type { XPN } from "../model/types/xpn.js";
import type { XTN } from "../model/types/xtn.js";

/**
 * The 11 typed composite kinds this module can encode. Mirrors the read-side
 * composite set (`XPN`, `XAD`, `CX`, `CWE`, `CE`, `XTN`, `PL`, `TS`, `NM`,
 * `HD`, `XCN`).
 */
export type CompositeKind =
  | "XPN"
  | "XAD"
  | "CX"
  | "CWE"
  | "CE"
  | "XTN"
  | "PL"
  | "TS"
  | "NM"
  | "HD"
  | "XCN";

/**
 * Maps each {@link CompositeKind} to the typed value {@link encodeComposite}
 * (and `setComposite`) accept for it. `TS` also accepts a pre-formatted HL7
 * timestamp string; `NM` also accepts a `number` or a raw numeric string —
 * both are emitted verbatim (the serializer never re-formats a claimed value).
 */
export interface CompositeValueByKind {
  readonly XPN: XPN;
  readonly XAD: XAD;
  readonly CX: CX;
  readonly CWE: CWE;
  readonly CE: CE;
  readonly XTN: XTN;
  readonly PL: PL;
  readonly TS: TS | string;
  readonly NM: NM | number | string;
  readonly HD: HD;
  readonly XCN: XCN;
}

/** A single-subcomponent component carrying `value` (or empty when absent). @internal */
function sc(value: string | undefined): RawComponent {
  return { subcomponents: [value ?? ""] };
}

/**
 * A component whose subcomponents form a nested HD (namespaceId & universalId &
 * universalIdType) — the shape `parseHd` reads from a synthesised repetition
 * inside CX-4 / PL-4 / XCN-9. Trailing-empty subcomponents are trimmed so the
 * emitted `&`-run matches what the parser produced. Absent HD → empty component.
 * @internal
 */
function hdComponent(hd: HD | undefined): RawComponent {
  if (hd === undefined) return { subcomponents: [] };
  const subs = [hd.namespaceId ?? "", hd.universalId ?? "", hd.universalIdType ?? ""];
  while (subs.length > 0 && subs[subs.length - 1] === "") subs.pop();
  return { subcomponents: subs };
}

/** True iff a component carries no content (no subcomponents, or all empty). @internal */
function isEmptyComponent(c: RawComponent): boolean {
  return c.subcomponents.every((s) => s === "");
}

/**
 * Assemble a `RawField` from an ordered component list: interior empties are
 * preserved (positions stay aligned for a faithful re-parse), trailing empties
 * are trimmed, and an all-empty list yields an absent field (`repetitions: []`).
 * @internal
 */
function toField(components: readonly RawComponent[]): RawField {
  const trimmed = components.slice();
  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    if (last !== undefined && isEmptyComponent(last)) trimmed.pop();
    else break;
  }
  if (trimmed.length === 0) return { repetitions: [], isNull: false };
  return { repetitions: [{ components: trimmed }], isNull: false };
}

/**
 * Encode an XPN (14 components) to a spec-clean field.
 *
 * @example
 * ```ts
 * import { encodeXpn } from "@cosyte/hl7";
 * encodeXpn({ familyName: "Doe", givenName: "Jane", prefix: "Dr" });
 * ```
 */
export function encodeXpn(v: XPN): RawField {
  return toField([
    sc(v.familyName),
    sc(v.givenName),
    sc(v.secondName),
    sc(v.suffix),
    sc(v.prefix),
    sc(v.degree),
    sc(v.nameTypeCode),
    sc(v.nameRepresentationCode),
    sc(v.nameContext),
    sc(v.nameValidityRange),
    sc(v.nameAssemblyOrder),
    sc(v.effectiveDate),
    sc(v.expirationDate),
    sc(v.professionalSuffix),
  ]);
}

/**
 * Encode an XAD (12 components) to a spec-clean field.
 *
 * @example
 * ```ts
 * import { encodeXad } from "@cosyte/hl7";
 * encodeXad({ street: "123 Main St", city: "Boston", stateOrProvince: "MA" });
 * ```
 */
export function encodeXad(v: XAD): RawField {
  return toField([
    sc(v.street),
    sc(v.otherDesignation),
    sc(v.city),
    sc(v.stateOrProvince),
    sc(v.zipOrPostalCode),
    sc(v.country),
    sc(v.addressType),
    sc(v.otherGeographicDesignation),
    sc(v.countyParishCode),
    sc(v.censusTract),
    sc(v.addressRepresentationCode),
    sc(v.addressValidityRange),
  ]);
}

/**
 * Encode a CX (identifier) — component 4 is a nested HD (assigningAuthority).
 *
 * @example
 * ```ts
 * import { encodeCx } from "@cosyte/hl7";
 * encodeCx({ idNumber: "MRN001", assigningAuthority: { namespaceId: "HOSP" }, identifierTypeCode: "MR" });
 * ```
 */
export function encodeCx(v: CX): RawField {
  return toField([
    sc(v.idNumber),
    sc(v.checkDigit),
    sc(v.checkDigitScheme),
    hdComponent(v.assigningAuthority),
    sc(v.identifierTypeCode),
    sc(v.assigningFacility),
    sc(v.effectiveDate),
    sc(v.expirationDate),
    sc(v.assigningJurisdiction),
    sc(v.assigningAgencyOrDepartment),
  ]);
}

/**
 * Encode a CWE (coded element, 9 modelled + preserved `extraComponents`).
 *
 * @example
 * ```ts
 * import { encodeCwe } from "@cosyte/hl7";
 * encodeCwe({ identifier: "GLU", text: "Glucose", nameOfCodingSystem: "LN" });
 * ```
 */
export function encodeCwe(v: CWE): RawField {
  const components: RawComponent[] = [
    sc(v.identifier),
    sc(v.text),
    sc(v.nameOfCodingSystem),
    sc(v.alternateIdentifier),
    sc(v.alternateText),
    sc(v.nameOfAlternateCodingSystem),
    sc(v.codingSystemVersionId),
    sc(v.alternateCodingSystemVersionId),
    sc(v.originalText),
  ];
  for (const extra of v.extraComponents ?? []) components.push(sc(extra));
  return toField(components);
}

/**
 * Encode a CE (coded element, 6 modelled + preserved `extraComponents`).
 *
 * @example
 * ```ts
 * import { encodeCe } from "@cosyte/hl7";
 * encodeCe({ identifier: "GLU", text: "Glucose", nameOfCodingSystem: "L" });
 * ```
 */
export function encodeCe(v: CE): RawField {
  const components: RawComponent[] = [
    sc(v.identifier),
    sc(v.text),
    sc(v.nameOfCodingSystem),
    sc(v.alternateIdentifier),
    sc(v.alternateText),
    sc(v.nameOfAlternateCodingSystem),
  ];
  for (const extra of v.extraComponents ?? []) components.push(sc(extra));
  return toField(components);
}

/**
 * Encode an XTN (telecom, 12 components) to a spec-clean field.
 *
 * @example
 * ```ts
 * import { encodeXtn } from "@cosyte/hl7";
 * encodeXtn({ telephoneNumber: "555-1234", telecommunicationUseCode: "PRN" });
 * ```
 */
export function encodeXtn(v: XTN): RawField {
  return toField([
    sc(v.telephoneNumber),
    sc(v.telecommunicationUseCode),
    sc(v.telecommunicationEquipmentType),
    sc(v.emailAddress),
    sc(v.countryCode),
    sc(v.areaCityCode),
    sc(v.localNumber),
    sc(v.extension),
    sc(v.anyText),
    sc(v.extensionPrefix),
    sc(v.speedDialCode),
    sc(v.unformattedTelephoneNumber),
  ]);
}

/**
 * Encode a PL (person location) — component 4 is a nested HD (facility).
 *
 * @example
 * ```ts
 * import { encodePl } from "@cosyte/hl7";
 * encodePl({ pointOfCare: "ICU", room: "101", bed: "A" });
 * ```
 */
export function encodePl(v: PL): RawField {
  return toField([
    sc(v.pointOfCare),
    sc(v.room),
    sc(v.bed),
    hdComponent(v.facility),
    sc(v.locationStatus),
    sc(v.personLocationType),
    sc(v.building),
    sc(v.floor),
    sc(v.locationDescription),
    sc(v.comprehensiveLocationId),
    sc(v.assigningAuthorityForLocation),
  ]);
}

/**
 * Encode an HD (hierarchic designator, 3 components) to a spec-clean field.
 *
 * @example
 * ```ts
 * import { encodeHd } from "@cosyte/hl7";
 * encodeHd({ namespaceId: "EPIC", universalId: "1.2.840", universalIdType: "ISO" });
 * ```
 */
export function encodeHd(v: HD): RawField {
  return toField([sc(v.namespaceId), sc(v.universalId), sc(v.universalIdType)]);
}

/**
 * Encode a TS/DTM timestamp. Accepts either the typed {@link TS} (its `raw`
 * string is emitted verbatim — the serializer never re-derives a timestamp
 * from parts) or a pre-formatted HL7 timestamp string.
 *
 * @example
 * ```ts
 * import { encodeTs } from "@cosyte/hl7";
 * encodeTs("20260721101500");
 * ```
 */
export function encodeTs(v: TS | string): RawField {
  const raw = typeof v === "string" ? v : v.raw;
  return toField([sc(raw)]);
}

/**
 * Encode an NM numeric. Accepts the typed {@link NM} (its `raw` string emitted
 * verbatim, preserving the sender's precision/formatting), a `number`, or a raw
 * string. A `number` is stringified with `String(n)`; the value is never
 * reconciled or rounded.
 *
 * @example
 * ```ts
 * import { encodeNm } from "@cosyte/hl7";
 * encodeNm("120.50"); // precision preserved verbatim
 * ```
 */
export function encodeNm(v: NM | number | string): RawField {
  let raw: string;
  if (typeof v === "number") raw = String(v);
  else if (typeof v === "string") raw = v;
  else raw = v.raw;
  return toField([sc(raw)]);
}

/**
 * Encode an XCN — component 9 is a nested HD (assigningAuthority).
 *
 * @example
 * ```ts
 * import { encodeXcn } from "@cosyte/hl7";
 * encodeXcn({ idNumber: "1234567890", familyName: "Welby", identifierTypeCode: "NPI" });
 * ```
 */
export function encodeXcn(v: XCN): RawField {
  return toField([
    sc(v.idNumber),
    sc(v.familyName),
    sc(v.givenName),
    sc(v.secondName),
    sc(v.suffix),
    sc(v.prefix),
    sc(v.degree),
    sc(v.sourceTable),
    hdComponent(v.assigningAuthority),
    sc(v.nameTypeCode),
    sc(v.identifierCheckDigit),
    sc(v.checkDigitScheme),
    sc(v.identifierTypeCode),
  ]);
}

/**
 * Encode any typed composite into a spec-clean `RawField` by its
 * {@link CompositeKind}. The single dispatcher `setComposite` and the typed
 * builders (`buildAdt`/`buildOru`) route through.
 *
 * Encoding takes **no** encoding-characters argument on purpose: the field it
 * produces carries the **decoded** component values, and the actual
 * delimiter-escaping happens later in the serializer against the message's own
 * encoding characters — so a composite is delimiter-independent to encode.
 *
 * @example
 * ```ts
 * import { encodeComposite } from "@cosyte/hl7";
 * // A hostile family name cannot break framing on emit:
 * const f = encodeComposite("XPN", { familyName: "Smith^Jr", givenName: "Ann" });
 * ```
 */
export function encodeComposite<K extends CompositeKind>(
  kind: K,
  value: CompositeValueByKind[K],
): RawField {
  switch (kind) {
    case "XPN":
      return encodeXpn(value as XPN);
    case "XAD":
      return encodeXad(value as XAD);
    case "CX":
      return encodeCx(value as CX);
    case "CWE":
      return encodeCwe(value as CWE);
    case "CE":
      return encodeCe(value as CE);
    case "XTN":
      return encodeXtn(value as XTN);
    case "PL":
      return encodePl(value as PL);
    case "TS":
      return encodeTs(value as TS | string);
    case "NM":
      return encodeNm(value as NM | number | string);
    case "HD":
      return encodeHd(value as HD);
    case "XCN":
      return encodeXcn(value as XCN);
    default: {
      // Exhaustiveness guard — a new CompositeKind must add a branch above.
      const never: never = kind;
      throw new TypeError(`encodeComposite: unknown composite kind ${JSON.stringify(never)}.`);
    }
  }
}

/**
 * Encode an array of typed composites into a single repeating `RawField` — one
 * HL7 repetition (`~`-joined on emit) per array element. Used for repeating
 * fields such as PID-3 (patient identifier list) and PID-11 (addresses). An
 * empty array yields an absent field.
 *
 * @example
 * ```ts
 * import { encodeCompositeReps } from "@cosyte/hl7";
 * const ids = encodeCompositeReps("CX", [
 *   { idNumber: "MRN001", identifierTypeCode: "MR" },
 *   { idNumber: "9990", identifierTypeCode: "SS" },
 * ]);
 * ```
 */
export function encodeCompositeReps<K extends CompositeKind>(
  kind: K,
  values: readonly CompositeValueByKind[K][],
): RawField {
  const repetitions: RawRepetition[] = [];
  for (const value of values) {
    const encoded = encodeComposite(kind, value);
    // Each single-composite encode yields at most one repetition; an all-empty
    // composite yields none — skip it so an empty entry never forges a bare `~`.
    for (const rep of encoded.repetitions) repetitions.push(rep);
  }
  return { repetitions, isNull: false };
}
