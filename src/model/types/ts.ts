/**
 * TS/DTM — HL7 v2 Time Stamp composite. The ONLY composite in Phase 3 that
 * delegates to a Phase 2 helper: parsing logic lives in
 * `src/parser/dates.ts::parseHl7Timestamp` (D-10 "zero duplicate date logic").
 * The composite shape is locked to `{ raw, date }` (D-14); the caller gets
 * both the raw HL7 string and the parsed JS `Date`, with `date` normalized
 * to `undefined` on calendar-invalid or shape-mismatched input (D-24).
 *
 * No-offset timestamps resolve to UTC (D-21). Truncations (YYYYMMDD, YYYYMM,
 * YYYY) resolve to midnight / first-of-month / Jan-1 in the resolved TZ
 * (D-22). Fractional seconds truncate to 3 digits via JS stdlib `Date`
 * milliseconds (D-23) — the `.raw` string preserves full precision.
 *
 * Zero runtime deps — delegates to `parseHl7Timestamp` + `unescape`.
 */

import { parseHl7Timestamp } from "../../parser/dates.js";
import { unescape } from "../../parser/escapes.js";
import type {
  EncodingCharacters,
  Hl7Position,
  RawRepetition,
} from "../../parser/types.js";

/** @internal No-op emitter — composite parsers are silent (D-09). */
const NOOP_EMITTER = (): void => {};

/** @internal Best-effort position for unescape calls from the TS composite. */
const DEFAULT_POSITION: Hl7Position = { segmentIndex: 0 };

/**
 * HL7 v2 Time Stamp (TS) / Date Time (DTM) composite. Always carries both
 * the raw HL7 string and the parsed JS `Date`. `.date` is `undefined` when
 * the raw string matches neither the HL7 TS shape nor any built-in fallback
 * and produces no valid `Date` — NEVER throws (TYPES-04 no-throw guarantee).
 *
 * Unlike the other composites in this phase, both `raw` and `date` are
 * ALWAYS-PRESENT keys (not optional) — `date` is explicitly typed as
 * `Date | undefined` so callers can destructure uniformly.
 *
 * @example
 * ```ts
 * import type { TS } from "@cosyte/hl7";
 * const ts: TS = { raw: "20250102", date: new Date("2025-01-02T00:00:00.000Z") };
 * const invalid: TS = { raw: "not a date", date: undefined };
 * ```
 */
export interface TS {
  readonly raw: string;
  readonly date: Date | undefined;
}

/**
 * Parse an HL7 v2 TS/DTM repetition into `{ raw, date }`. Delegates the date
 * parsing to `parseHl7Timestamp` — the SAME cascade that backs every
 * timestamp in the library (Phase 2). No user `dateFormats` at this layer;
 * Phase 4 helpers (e.g. `msg.meta.timestamp`) that DO know the
 * `ParseOptions.dateFormats` may call `parseHl7Timestamp` directly with
 * options.
 *
 * Calendar-invalid shape matches (e.g. month 13, Feb 30) produce
 * `new Date(NaN)` inside `parseHl7Timestamp`; this composite normalizes
 * `NaN` getTime to `undefined` per D-24 so callers never see an Invalid
 * Date leak through `.date`.
 *
 * @example
 * ```ts
 * import { parseTs, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [{ subcomponents: ["20250102153045"] }] };
 * const ts = parseTs(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(ts.raw);  // "20250102153045"
 * console.log(ts.date); // Date — 2025-01-02T15:30:45.000Z (UTC by default)
 * ```
 */
export function parseTs(rep: RawRepetition, enc: EncodingCharacters): TS {
  const comp = rep.components[0];
  const sub = comp?.subcomponents[0] ?? "";
  const raw = sub === "" ? "" : unescape(sub, enc, NOOP_EMITTER, DEFAULT_POSITION);

  // D-10: delegate to parseHl7Timestamp — zero duplicate date logic.
  // D-24: normalize calendar-invalid Date (NaN getTime) to undefined.
  const parsed = raw === "" ? undefined : parseHl7Timestamp(raw, {});
  const date = parsed !== undefined && !Number.isNaN(parsed.getTime()) ? parsed : undefined;

  return { raw, date };
}
