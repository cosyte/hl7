/**
 * PL — HL7 v2 Person Location composite. 11-component structured-location
 * shape (v1 trimmed from the HL7 v2.5 full 12-component PL — slot 12
 * `entityIdentifier` is rarely used; v2 may restore the full shape) parsed
 * from a `RawRepetition` on demand by `Field.asPl()` (wired in Plan 04).
 * Fields are OMITTED when absent (exactOptionalPropertyTypes) — NEVER set
 * to `undefined`.
 *
 * Component 4 (`facility`) is the ONE nested-composite field in this
 * parser: its subcomponents form a 3-field HD (namespaceId, universalId,
 * universalIdType) — same synthesis pattern used in `parseCx` for
 * `assigningAuthority`. To reuse `parseHd` without duplicating logic, the
 * parser synthesises a `RawRepetition` whose components wrap the
 * subcomponents of PL component 4.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 */

import type { EncodingCharacters, RawComponent, RawRepetition } from "../../parser/types.js";

import { readComponent } from "./_shared.js";
import { parseHd, type HD } from "./hd.js";

/**
 * HL7 v2 Person Location (PL) — structured location per HL7 Chapter 2. All
 * 11 v1 components are optional. Fields are OMITTED when the underlying
 * component is absent (exactOptionalPropertyTypes). `facility` uses the
 * nested `HD` shape; `assigningAuthorityForLocation` is flattened to a
 * plain string in v1 (HL7 spec treats it as HD-shaped).
 *
 * Component positions (HL7 1-indexed; this interface is 0-indexed by key):
 * 1. pointOfCare — e.g. "ICU", "ED"
 * 2. room
 * 3. bed
 * 4. facility — nested HD (3 subcomponents form an HD composite)
 * 5. locationStatus — O=Occupied, U=Unoccupied, K=Contaminated, C=Closed,
 *    H=Housekeeping, I=Isolated
 * 6. personLocationType — C=Clinic, D=Department, H=Home, N=Nursing Unit,
 *    O=Office, R=Revenue Location
 * 7. building
 * 8. floor
 * 9. locationDescription — free-text
 * 10. comprehensiveLocationId
 * 11. assigningAuthorityForLocation (v1: flattened to string)
 *
 * @example
 * ```ts
 * import type { PL } from "@cosyte/hl7";
 * const bed: PL = {
 *   pointOfCare: "ICU",
 *   room: "101",
 *   bed: "A",
 *   facility: { namespaceId: "HOSP", universalId: "1.2.3", universalIdType: "UUID" },
 * };
 * ```
 */
export interface PL {
  readonly pointOfCare?: string;
  readonly room?: string;
  readonly bed?: string;
  readonly facility?: HD;
  readonly locationStatus?: string;
  readonly personLocationType?: string;
  readonly building?: string;
  readonly floor?: string;
  readonly locationDescription?: string;
  readonly comprehensiveLocationId?: string;
  readonly assigningAuthorityForLocation?: string;
}

/**
 * Parse PL component 4 (facility) from its subcomponents into an `HD`. The
 * 3 HD subfields live as subcomponents of the PL component; we build a
 * synthetic `RawRepetition` where each synthetic component wraps one
 * subcomponent of the PL component as its own single subcomponent. This
 * lets `parseHd` consume the value via its existing `(rep, enc)` signature
 * without reimplementing the read.
 *
 * Returns `undefined` when the source component is missing or every
 * subcomponent is the empty string — prevents stub empty HD objects from
 * leaking into PL output (T-03-03 analogue of CX's T-03-02-02 mitigation).
 *
 * @internal
 */
function parseFacility(comp: RawComponent | undefined, enc: EncodingCharacters): HD | undefined {
  if (comp === undefined) return undefined;
  if (comp.subcomponents.every((s) => s === "")) return undefined;
  const synthetic: RawRepetition = {
    components: comp.subcomponents.map((sub) => ({ subcomponents: [sub] })),
  };
  const hd = parseHd(synthetic, enc);
  return Object.keys(hd).length === 0 ? undefined : hd;
}

/**
 * Parse an HL7 v2 PL repetition into a structured `PL` object. Components
 * are returned verbatim (already decoded once by the tokenizer — never re-unescaped,
 * HL7-VALUE-REDECODE). Absent / empty components are OMITTED
 * from the result (exactOptionalPropertyTypes semantics). Component 4
 * (`facility`) is parsed as a nested `HD`; see component table in the `PL`
 * interface JSDoc for the v1 simplifications.
 *
 * @example
 * ```ts
 * import { parsePl, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [
 *   { subcomponents: ["ICU"] },
 *   { subcomponents: ["101"] },
 *   { subcomponents: ["A"] },
 *   { subcomponents: ["HOSP", "1.2.3", "UUID"] },
 * ] };
 * const pl = parsePl(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(pl.pointOfCare);           // "ICU"
 * console.log(pl.facility?.namespaceId); // "HOSP"
 * ```
 */
export function parsePl(rep: RawRepetition, enc: EncodingCharacters): PL {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<PL> = {};

  const pointOfCare = readComponent(rep, 0, enc);
  if (pointOfCare !== undefined) out.pointOfCare = pointOfCare;

  const room = readComponent(rep, 1, enc);
  if (room !== undefined) out.room = room;

  const bed = readComponent(rep, 2, enc);
  if (bed !== undefined) out.bed = bed;

  const facility = parseFacility(rep.components[3], enc);
  if (facility !== undefined) out.facility = facility;

  const locationStatus = readComponent(rep, 4, enc);
  if (locationStatus !== undefined) out.locationStatus = locationStatus;

  const personLocationType = readComponent(rep, 5, enc);
  if (personLocationType !== undefined) out.personLocationType = personLocationType;

  const building = readComponent(rep, 6, enc);
  if (building !== undefined) out.building = building;

  const floor = readComponent(rep, 7, enc);
  if (floor !== undefined) out.floor = floor;

  const locationDescription = readComponent(rep, 8, enc);
  if (locationDescription !== undefined) out.locationDescription = locationDescription;

  const comprehensiveLocationId = readComponent(rep, 9, enc);
  if (comprehensiveLocationId !== undefined) out.comprehensiveLocationId = comprehensiveLocationId;

  const assigningAuthorityForLocation = readComponent(rep, 10, enc);
  if (assigningAuthorityForLocation !== undefined) {
    out.assigningAuthorityForLocation = assigningAuthorityForLocation;
  }

  return out;
}
