/**
 * `appointments` — Phase Q (scheduling breadth) implementation of the SIU
 * appointment extractor. Walks the message in document order and projects each
 * SCH (Scheduling Activity Information) segment into a typed {@link Appointment},
 * grouping the AIS/AIG/AIL/AIP resource segments that follow it positionally
 * under that SCH — the same open-a-group-on-the-anchor state machine
 * `immunizations()` uses for ORC→RXA→[RXR]. Covers the common SIU trigger
 * events (S12 new / S13 reschedule / S14 modify / S15 cancel / S26 no-show).
 *
 * Field map (HL7 v2 Ch. 10 — scheduling):
 *   - SCH-1  placer appointment ID (EI; first component surfaced verbatim)
 *   - SCH-2  filler appointment ID (EI; first component surfaced verbatim)
 *   - SCH-11 appointment timing quantity (TQ) — TQ.4 start / TQ.5 end (DTM)
 *   - SCH-25 filler status code (CWE — HL7 Table 0278): the appointment status
 *   - AIS-3  universal service ID (CE)      → resource kind "service"
 *   - AIG-3  general resource ID (CE)        → resource kind "general"
 *   - AIL-3  location resource (PL / coded)  → resource kind "location"
 *   - AIP-3  personnel resource (XCN)        → resource kind "personnel" (provider)
 *
 * Safety rules enforced here (Phase Q §Fail-safe):
 *   - Never throws — a malformed SCH / AI* surfaces as omitted keys (HELPERS-07).
 *   - The filler status code (SCH-25) is surfaced VERBATIM (provenance-only) — a
 *     mis-keyed status is echoed exactly, never normalized or validated.
 *   - Missing fields → keys omitted; `resources` is ALWAYS a (possibly empty) array.
 *   - Output is frozen at the boundary (D-01); NOT memoized (D-06).
 *
 * Known limitations: this covers the appointment-level identifiers, status,
 * SCH-11 timing, and the AI* resource identifiers only — it is NOT a
 * scheduling-workflow state machine, and it does not resolve per-resource start
 * offsets/durations. See KNOWN-LIMITATIONS.md.
 */

import type { Field } from "../model/field.js";
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { RawComponent } from "../parser/types.js";
import { parseDtm } from "../parser/dates.js";
import { readSubcomponent } from "../model/types/_shared.js";
import type { CWE } from "../model/types/cwe.js";
import type { XCN } from "../model/types/xcn.js";

import type { Appointment, AppointmentResource } from "./types.js";

/** Normalize HL7 empty-string to `undefined` for the helper layer. @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** Drop empty-composite leaks so an optional CWE key stays absent when the field was blank. @internal */
function cweOrUndefined(field: Field): CWE | undefined {
  const cwe = field.asCwe();
  return Object.keys(cwe).length === 0 ? undefined : cwe;
}

/** First repetition's component at `index` (or `undefined`). @internal */
function componentAt(field: Field, index: number): RawComponent | undefined {
  return field.repetitions[0]?.components[index];
}

/** Read `field`'s first-repetition component `compIdx`, subcomponent `subIdx`, unescaped. @internal */
function fieldSub(field: Field, compIdx: number, subIdx: number): string | undefined {
  return readSubcomponent(componentAt(field, compIdx), subIdx, field.enc);
}

/**
 * The AI* segment types that carry an appointment resource, mapped to the
 * `kind` surfaced on {@link AppointmentResource}. AIP is the personnel
 * (provider) resource; AIL the location. @internal
 */
const RESOURCE_KIND: Readonly<Record<string, AppointmentResource["kind"]>> = Object.freeze({
  AIS: "service",
  AIG: "general",
  AIL: "location",
  AIP: "personnel",
});

/**
 * Build one {@link AppointmentResource} from an AI* segment. The resource id
 * lives at position 3 for all four segment types; AIP-3 is an `XCN` (personnel)
 * and is additionally surfaced as `person`, while AIS/AIG/AIL-3 surface as a
 * coded `code` (first component verbatim). Returns `undefined` when the segment
 * carries no resource id at all. @internal
 */
function buildResource(seg: Segment): AppointmentResource | undefined {
  const kind = RESOURCE_KIND[seg.type];
  if (kind === undefined) return undefined;

  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<AppointmentResource> = { kind };

  const field3 = seg.field(3);
  if (kind === "personnel") {
    const person: XCN = field3.asXcn();
    if (Object.keys(person).length > 0) out.person = person;
  }
  // Every AI*-3 is surfaced as a coded element too (provenance-only, first
  // component verbatim) so a uniform `code.identifier` is always available.
  const code = cweOrUndefined(field3);
  if (code !== undefined) out.code = code;

  // A resource with no id at all is not worth surfacing.
  if (out.code === undefined && out.person === undefined) return undefined;
  return Object.freeze(out) as AppointmentResource;
}

/** Build a frozen {@link Appointment} from one SCH + its attached AI* resources. @internal */
function finalizeAppointment(sch: Segment, resources: readonly AppointmentResource[]): Appointment {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Appointment> = { resources: Object.freeze(resources.slice()) };

  // SCH-1 / SCH-2 appointment ids (EI) — first component surfaced verbatim.
  const placer = stringOrUndefined(sch.field(1).value);
  if (placer !== undefined) out.placerAppointmentId = placer;
  const filler = stringOrUndefined(sch.field(2).value);
  if (filler !== undefined) out.fillerAppointmentId = filler;

  // SCH-11 appointment timing quantity (TQ): TQ.4 start / TQ.5 end (DTM).
  const timing = sch.field(11);
  const startRaw = fieldSub(timing, 3, 0);
  if (startRaw !== undefined) out.startDateTime = parseDtm(startRaw);
  const endRaw = fieldSub(timing, 4, 0);
  if (endRaw !== undefined) out.endDateTime = parseDtm(endRaw);

  // SCH-25 filler status code (Table 0278) — verbatim/provenance-only.
  const status = cweOrUndefined(sch.field(25));
  if (status !== undefined) out.fillerStatusCode = status;

  return Object.freeze(out) as Appointment;
}

/**
 * Every SCH of an SIU message as a typed {@link Appointment}, with the
 * AIS/AIG/AIL/AIP resource segments that follow it grouped positionally under
 * that SCH (service / general resource / location / personnel). Document order.
 * Returns `[]` when no SCH is present. NOT memoized — each call re-walks
 * `msg.allSegments()`. Never throws (HELPERS-07).
 *
 * The filler status code (SCH-25, Table 0278) is surfaced verbatim; per-resource
 * offsets/durations and the full scheduling workflow are out of scope (see the
 * package known-limitations).
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const appt of msg.appointments()) {
 *   console.log(appt.fillerAppointmentId, appt.fillerStatusCode?.identifier);
 *   console.log(appt.startDateTime?.raw, appt.endDateTime?.raw);
 *   for (const r of appt.resources) console.log(r.kind, r.code?.identifier, r.person?.familyName);
 * }
 * ```
 *
 * @internal
 */
export function appointments(msg: Hl7Message): readonly Appointment[] {
  const out: Appointment[] = [];

  let currentSch: Segment | undefined;
  let resources: AppointmentResource[] = [];

  const closeCurrent = (): void => {
    if (currentSch !== undefined) out.push(finalizeAppointment(currentSch, resources));
  };

  for (const seg of msg.allSegments()) {
    if (seg.type === "SCH") {
      closeCurrent();
      currentSch = seg;
      resources = [];
      continue;
    }
    if (currentSch === undefined) continue; // AI* before any SCH — dropped.
    if (RESOURCE_KIND[seg.type] !== undefined) {
      const resource = buildResource(seg);
      if (resource !== undefined) resources.push(resource);
    }
  }

  closeCurrent();

  return Object.freeze(out);
}
