/**
 * SN — HL7 v2 Structured Numeric composite (HL7 Chapter 2A). Parses an OBX-5
 * value declared as `OBX-2 = SN` into its four positional components so a
 * comparator or a range/ratio is preserved as TYPED data instead of being
 * flattened to a string (where everything past the first component is lost).
 *
 * Component positions (HL7 1-indexed; this interface is 0-indexed by key):
 *   1. comparator (ST)         — `>` `<` `>=` `<=` `=` `<>`; absent ⇒ `=`
 *   2. num1 (NM)
 *   3. separatorOrSuffix (ST)  — `-` (range), `:` / `/` (ratio), `+` (suffix), `.`
 *   4. num2 (NM)
 *
 * Usage examples (the literal OBX-5 string ⇒ what this parses):
 *   `>^100`        ⇒ greater-than 100        → { comparator: ">", num1: 100 }
 *   `<^10`         ⇒ less-than 10            → { comparator: "<", num1: 10 }
 *   `^100^-^200`   ⇒ range 100–200          → { num1: 100, separatorOrSuffix: "-", num2: 200 }
 *   `^1^:^128`     ⇒ titer/ratio 1:128      → { num1: 1, separatorOrSuffix: ":", num2: 128 }
 *
 * Safety: `num1`/`num2` are parsed with the same strict `Number()` discipline
 * as NM — non-numeric input becomes `undefined`, NEVER `NaN` and never a
 * silently wrong number. The comparator is surfaced ONLY when SN.1 is a
 * recognized operator, so a non-operator value in the comparator slot is never
 * passed off as a real relation.
 *
 * Zero runtime deps — pure function over the raw positional tree + `unescape`.
 */

import type { EncodingCharacters, RawRepetition } from "../../parser/types.js";

import { readComponent } from "./_shared.js";

/**
 * The canonical HL7 SN comparator operator set (HL7 Ch 2A SN.1). An absent
 * comparator means `=` per the spec; a value outside this set is treated as
 * non-conformant and is not surfaced as a comparator (fail-safe).
 *
 * @internal
 */
const SN_COMPARATORS: ReadonlySet<string> = new Set([">", "<", ">=", "<=", "=", "<>"]);

/**
 * HL7 v2 Structured Numeric (SN) composite. `num1` and `num2` are
 * ALWAYS-PRESENT keys (typed `number | undefined`) so callers can destructure
 * uniformly, mirroring `NM`; `comparator` and `separatorOrSuffix` are OMITTED
 * when absent (`exactOptionalPropertyTypes`).
 *
 * An absent `comparator` means the default `=` relation per HL7 Chapter 2A.
 * This library surfaces the structure only — it does not evaluate the
 * inequality, validate the unit, or convert values.
 *
 * @example
 * ```ts
 * import type { SN } from "@cosyte/hl7";
 * const gfr: SN = { comparator: ">", num1: 90, num2: undefined };       // >90
 * const range: SN = { num1: 100, separatorOrSuffix: "-", num2: 200 };   // 100-200
 * ```
 */
export interface SN {
  /** SN.1 comparator — one of `>` `<` `>=` `<=` `=` `<>`. Omitted ⇒ default `=`. */
  readonly comparator?: string;
  /** SN.2 first numeric value. `undefined` when absent or non-numeric (never `NaN`). */
  readonly num1: number | undefined;
  /** SN.3 separator/suffix — `-` (range), `:`/`/` (ratio), `+` (suffix), `.`. Omitted when absent. */
  readonly separatorOrSuffix?: string;
  /** SN.4 second numeric value. `undefined` when absent or non-numeric (never `NaN`). */
  readonly num2: number | undefined;
}

/** Strict numeric coercion mirroring NM: empty/non-numeric ⇒ undefined, never NaN. @internal */
function numericOrUndefined(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * Parse an HL7 v2 SN repetition into a structured `SN`, or `undefined` when the
 * field carries no usable structured-numeric content (empty, or so malformed
 * that no comparator, number, or separator can be recovered). Components are
 * auto-unescaped; `num1`/`num2` use strict `Number()` parsing.
 *
 * Fail-safe: a non-operator value in the comparator slot (SN.1) is dropped
 * rather than surfaced as a relation, and a non-numeric SN.2/SN.4 becomes
 * `undefined` — the parser never emits a confident wrong comparator or number.
 *
 * @example
 * ```ts
 * import { parseSn, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7";
 * const rep = { components: [
 *   { subcomponents: [">"] },
 *   { subcomponents: ["90"] },
 * ] };
 * const sn = parseSn(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(sn?.comparator, sn?.num1); // ">" 90
 * ```
 */
export function parseSn(rep: RawRepetition, enc: EncodingCharacters): SN | undefined {
  const rawComparator = readComponent(rep, 0, enc);
  const num1 = numericOrUndefined(readComponent(rep, 1, enc));
  const separatorOrSuffix = readComponent(rep, 2, enc);
  const num2 = numericOrUndefined(readComponent(rep, 3, enc));

  const comparator =
    rawComparator !== undefined && SN_COMPARATORS.has(rawComparator) ? rawComparator : undefined;

  // Malformed / empty SN: nothing usable recovered → undefined (never a wrong number).
  if (
    comparator === undefined &&
    num1 === undefined &&
    separatorOrSuffix === undefined &&
    num2 === undefined
  ) {
    return undefined;
  }

  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<SN> = { num1, num2 };
  if (comparator !== undefined) out.comparator = comparator;
  if (separatorOrSuffix !== undefined) out.separatorOrSuffix = separatorOrSuffix;
  return out as SN;
}
