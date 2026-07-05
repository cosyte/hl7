/**
 * `timing` — Phase M (order / medication timing) extraction. Projects the
 * TQ1 segment (HL7 v2.5+, Ch. 4 §4.5.4) and the **legacy embedded TQ** data
 * type in ORC-7 / RXE-1 (pre-v2.5, Ch. 2A §2.A.81 — retained backward-compat
 * only, detail withdrawn as of v2.7) into the typed {@link OrderTiming}
 * surfaced on `Order.timings` / `Medication.timings`.
 *
 * Safety rules enforced here (Phase M §Fail-safe):
 *   - The **repeat pattern** (TQ1-3 / legacy interval RI.1, HL7 Table 0335) is
 *     surfaced **verbatim** — never normalized, never resolved to clock times,
 *     never mapped to a different frequency. Reading `Q6H` as "daily" or losing
 *     a `BID` silently changes the administered dose count (transcription-class
 *     harm).
 *   - A parametric `Q<integer><unit>` template's integer is **load-bearing** and
 *     is never dropped — surfaced on `RepeatPattern.interval`.
 *   - Total occurrences is read from **TQ1-14** (NM), *not* TQ1-11 (which is a
 *     Text Instruction, TX).
 *   - Never throws — a malformed timing surfaces as omitted keys (HELPERS-07).
 *   - hl7 surfaces the timing *structure* only; it does NOT compute schedules,
 *     resolve "institution-specified times", or interpret sig.
 *
 * Field maps:
 *   TQ1 segment — TQ1-2 quantity (CQ), TQ1-3 repeat pattern (RPT.1, Table 0335),
 *   TQ1-4 explicit time, TQ1-6 service duration, TQ1-7 start (DTM), TQ1-8 end
 *   (DTM), TQ1-9 priority (CWE), TQ1-14 total occurrences (NM).
 *   Legacy embedded TQ (one field) — TQ.1 quantity (CQ), TQ.2 interval (RI.1
 *   repeat pattern / RI.2 explicit time), TQ.3 duration, TQ.4 start (TS), TQ.5
 *   end (TS), TQ.6 priority (ID), TQ.12 total occurrences (NM).
 */

import { parseDtm } from "../parser/dates.js";
import type { EncodingCharacters, RawComponent, RawRepetition } from "../parser/types.js";
import type { Field } from "../model/field.js";
import type { Segment } from "../model/segment.js";
import { parseCwe, type CWE } from "../model/types/cwe.js";
import { readSubcomponent } from "../model/types/_shared.js";
import type { OrderTiming, RepeatPattern, TimingQuantity } from "./types.js";

/**
 * Table-0335 fixed mnemonics scheduled at institution-specified times — a
 * conservative, provenance-only set (HL7 v2.5.1 Ch. 4 Table 0335). Membership
 * only sets `RepeatPattern.kind = "named"`; it never changes the verbatim
 * `code` or resolves a schedule. Compared case-insensitively. @internal
 */
const NAMED_PATTERNS: ReadonlySet<string> = new Set<string>([
  "BID",
  "TID",
  "QID",
  "QOD",
  "QHS",
  "QAM",
  "QPM",
  "QSHIFT",
  "QD",
  "PRN",
  "AC",
  "PC",
  "HS",
  "C",
]);

/** `Q<integer><unit>` parametric template (seconds/minutes/hours/days/weeks/lunar-months). @internal */
const PARAMETRIC = /^Q(\d+)([SMHDWL])$/iu;
/** `Q<integer>J<day-of-week>` parametric template (every N weeks on a weekday). @internal */
const PARAMETRIC_DOW = /^Q(\d+)(J)(\d)$/iu;

/**
 * Classify a Table-0335 repeat-pattern `code` for **provenance only** — the
 * verbatim `code` is always authoritative and is never modified. A parametric
 * `Q<n><unit>` template surfaces its load-bearing integer + unit on `interval`;
 * a recognized mnemonic is `"named"`; anything else is `"unknown"` (surfaced
 * verbatim, never mapped). Never throws.
 *
 * @example
 * ```ts
 * classifyRepeatPattern("Q6H"); // { code: "Q6H", kind: "parametric", interval: { count: 6, unit: "H" } }
 * classifyRepeatPattern("BID"); // { code: "BID", kind: "named" }
 * classifyRepeatPattern("Q4-6H"); // { code: "Q4-6H", kind: "unknown" } — verbatim, never mapped
 * ```
 * @internal
 */
export function classifyRepeatPattern(code: string): RepeatPattern {
  const parametric = PARAMETRIC.exec(code);
  if (parametric !== null) {
    const count = Number.parseInt(parametric[1] ?? "", 10);
    const unit = (parametric[2] ?? "").toUpperCase();
    if (!Number.isNaN(count)) {
      return { code, kind: "parametric", interval: { count, unit } };
    }
  }
  const dow = PARAMETRIC_DOW.exec(code);
  if (dow !== null) {
    const count = Number.parseInt(dow[1] ?? "", 10);
    if (!Number.isNaN(count)) {
      return { code, kind: "parametric", interval: { count, unit: "J" } };
    }
  }
  if (NAMED_PATTERNS.has(code.toUpperCase())) {
    return { code, kind: "named" };
  }
  return { code, kind: "unknown" };
}

/** Strict-`Number` parse of a raw HL7 numeric — `undefined` (never `NaN`) on empty/garbage. @internal */
function strictNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Build a `CWE` from the subcomponents of one raw component — used to surface
 * the units (a CE) nested inside a CQ (e.g. TQ1-2's `quantity^units&&`). Each
 * subcomponent maps to one CWE component. Returns `undefined` when the
 * component is absent or carries no content. @internal
 */
function cweFromSubcomponents(
  component: RawComponent | undefined,
  enc: EncodingCharacters,
): CWE | undefined {
  if (component === undefined || component.subcomponents.length === 0) return undefined;
  const rep: RawRepetition = {
    components: component.subcomponents.map((sub) => ({ subcomponents: [sub] })),
  };
  const cwe = parseCwe(rep, enc);
  return Object.keys(cwe).length === 0 ? undefined : cwe;
}

/** Build a `TimingQuantity` from a CQ-shaped field (TQ1-2 / legacy TQ.1). @internal */
function buildQuantity(
  quantityRaw: string | undefined,
  unitsComponent: RawComponent | undefined,
  enc: EncodingCharacters,
): TimingQuantity | undefined {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<TimingQuantity> = {};

  const value = strictNumber(quantityRaw);
  if (value !== undefined) out.value = value;

  const units = cweFromSubcomponents(unitsComponent, enc);
  if (units !== undefined) out.units = units;

  return Object.keys(out).length === 0 ? undefined : Object.freeze(out);
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
 * Build one {@link OrderTiming} from a TQ1 segment (v2.5+). Reads TQ1-2, -3, -4,
 * -6, -7, -8, -9, -14. Never throws.
 *
 * @example
 * ```ts
 * const tq1 = msg.segments("TQ1")[0];
 * if (tq1 !== undefined) console.log(buildTq1Timing(tq1).repeatPattern?.code);
 * ```
 * @internal
 */
export function buildTq1Timing(tq1: Segment): OrderTiming {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<OrderTiming> = { source: "TQ1" };

  // TQ1-2 quantity (CQ): CQ.1 = component 0 subcomponent 0, CQ.2 units = component 1.
  const q2 = tq1.field(2);
  const quantity = buildQuantity(fieldSub(q2, 0, 0), componentAt(q2, 1), tq1.enc);
  if (quantity !== undefined) out.quantity = quantity;

  // TQ1-3 repeat pattern (RPT.1) — verbatim, classified for provenance only.
  const rpt = fieldSub(tq1.field(3), 0, 0);
  if (rpt !== undefined) out.repeatPattern = Object.freeze(classifyRepeatPattern(rpt));

  // TQ1-4 explicit time — verbatim (first repetition/value).
  const explicit = fieldSub(tq1.field(4), 0, 0);
  if (explicit !== undefined) out.explicitTime = explicit;

  // TQ1-6 service duration — verbatim.
  const duration = fieldSub(tq1.field(6), 0, 0);
  if (duration !== undefined) out.serviceDuration = duration;

  // TQ1-7 / TQ1-8 start / end (DTM) — Phase N fidelity TS.
  const start = tq1.field(7).asTs();
  if (start.raw !== "") out.startDateTime = start;
  const end = tq1.field(8).asTs();
  if (end.raw !== "") out.endDateTime = end;

  // TQ1-9 priority (CWE).
  const priority = tq1.field(9).asCwe();
  if (Object.keys(priority).length > 0) out.priority = priority;

  // TQ1-14 total occurrences (NM) — NOT TQ1-11.
  const total = strictNumber(fieldSub(tq1.field(14), 0, 0));
  if (total !== undefined) out.totalOccurrences = total;

  return Object.freeze(out) as OrderTiming;
}

/**
 * Build one {@link OrderTiming} from a legacy embedded TQ data type carried in a
 * single field (ORC-7 for orders, RXE-1 for encoded medications; pre-v2.5).
 * Reads TQ.1 (quantity), TQ.2 (interval → repeat pattern / explicit time),
 * TQ.3 (duration), TQ.4/TQ.5 (start / end TS), TQ.6 (priority), TQ.12 (total
 * occurrences). Returns `undefined` when the field carries no timing content so
 * the caller does not surface an empty legacy timing. Never throws.
 *
 * @example
 * ```ts
 * const orc = msg.segments("ORC")[0];
 * if (orc !== undefined) console.log(buildLegacyTiming(orc.field(7))?.repeatPattern?.code);
 * ```
 * @internal
 */
export function buildLegacyTiming(field: Field): OrderTiming | undefined {
  const rep = field.repetitions[0];
  if (rep === undefined) return undefined;

  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<OrderTiming> = { source: "legacy" };

  // TQ.1 Quantity (CQ): CQ.1 = component 0 subcomponent 0, CQ.2 units = subcomponent 1.
  const quantity = buildQuantity(fieldSub(field, 0, 0), undefined, field.enc);
  if (quantity !== undefined) {
    // Legacy CQ.2 units collapse to a single subcomponent — surface as { identifier }.
    const unitsId = fieldSub(field, 0, 1);
    out.quantity =
      unitsId !== undefined
        ? Object.freeze({ ...quantity, units: { identifier: unitsId } })
        : quantity;
  }

  // TQ.2 Interval (RI): RI.1 = repeat pattern, RI.2 = explicit time.
  const rpt = fieldSub(field, 1, 0);
  if (rpt !== undefined) out.repeatPattern = Object.freeze(classifyRepeatPattern(rpt));
  const explicit = fieldSub(field, 1, 1);
  if (explicit !== undefined) out.explicitTime = explicit;

  // TQ.3 Duration.
  const duration = fieldSub(field, 2, 0);
  if (duration !== undefined) out.serviceDuration = duration;

  // TQ.4 / TQ.5 Start / End (TS) — Phase N fidelity parse of the embedded value.
  const startRaw = fieldSub(field, 3, 0);
  if (startRaw !== undefined) out.startDateTime = parseDtm(startRaw);
  const endRaw = fieldSub(field, 4, 0);
  if (endRaw !== undefined) out.endDateTime = parseDtm(endRaw);

  // TQ.6 Priority (ID) — surfaced as a CWE { identifier } for shape parity with TQ1-9.
  const priorityId = fieldSub(field, 5, 0);
  if (priorityId !== undefined) out.priority = Object.freeze({ identifier: priorityId });

  // TQ.12 Total occurrences (NM).
  const total = strictNumber(fieldSub(field, 11, 0));
  if (total !== undefined) out.totalOccurrences = total;

  // A source-only object (nothing else populated) is not a real timing.
  if (Object.keys(out).length === 1) return undefined;

  return Object.freeze(out) as OrderTiming;
}
