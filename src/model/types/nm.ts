/**
 * NM — HL7 v2 Numeric composite. Parses the raw HL7 numeric string into a
 * `number` via the stricter `Number(raw)` (not `parseFloat`, which tolerates
 * trailing garbage like "12abc" → 12). `NaN` is normalized to `undefined`
 * per the same no-throw discipline as TS/DTM (D-24 analogous).
 *
 * The raw string is preserved verbatim on the composite so callers needing
 * to round-trip or render with the original precision/formatting can.
 *
 * Zero runtime deps — pure function over the raw tree + `unescape` + stdlib
 * `Number`.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

/**
 * HL7 v2 Numeric (NM) composite. Carries both the raw HL7 numeric string
 * and the parsed JS `number`. `.value` is `undefined` when the raw string
 * is empty or not fully numeric — NEVER throws.
 *
 * Unlike most composites in this phase, both `raw` and `value` are
 * ALWAYS-PRESENT keys (not optional) — `value` is explicitly typed as
 * `number | undefined` so callers can destructure uniformly.
 *
 * @example
 * ```ts
 * import type { NM } from "@cosyte/hl7";
 * const glucose: NM = { raw: "120", value: 120 };
 * const bad: NM = { raw: "N/A", value: undefined };
 * ```
 */
export interface NM {
  readonly raw: string;
  readonly value: number | undefined;
}

/**
 * Parse an HL7 v2 NM repetition into `{ raw, value }`. Uses `Number(raw)`
 * for strict numeric parsing — trailing non-numeric characters produce
 * `NaN`, normalized to `undefined`. Empty raw also produces `undefined`.
 *
 * `Number("")` is `0` in JS — which is the wrong answer for an empty HL7
 * numeric field. The explicit empty-string check below returns
 * `{ raw: "", value: undefined }` so empty inputs match missing inputs.
 *
 * @example
 * ```ts
 * import { parseNm, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [{ subcomponents: ["120.5"] }] };
 * const nm = parseNm(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(nm.value); // 120.5
 * ```
 */
export function parseNm(rep: RawRepetition, _enc: EncodingCharacters): NM {
  const comp = rep.components[0];
  // The tokenizer already unescaped every subcomponent on parse (parser-02), so
  // the stored value is decoded — use it directly, never a second unescape (that
  // would double-decode a value whose bytes look like an escape). `_enc` is kept
  // for composite-parser signature uniformity.
  const raw = comp?.subcomponents[0] ?? "";
  if (raw === "") return { raw, value: undefined };
  const n = Number(raw);
  const value = Number.isNaN(n) ? undefined : n;
  return { raw, value };
}
