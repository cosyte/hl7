/**
 * `charges` — Phase Q (financial breadth) implementation of the DFT charge
 * extractor. Walks the message in document order and projects each FT1
 * (Financial Transaction) segment into a typed {@link Charge}. Flat, one FT1
 * per {@link Charge} (parity with `diagnoses()` / `allergies()`) — DFT^P03 posts
 * a list of financial transactions, each self-contained. Covers the common
 * DFT^P03 post-charges event.
 *
 * Field map (HL7 v2 Ch. 6 — financial management):
 *   - FT1-4  transaction date (TS)
 *   - FT1-6  transaction type (IS — Table 0017: CG charge / CD credit /
 *            PY payment / AJ adjustment; verbatim)
 *   - FT1-7  transaction code (CE — the institution charge/procedure code)
 *   - FT1-10 transaction quantity (NM)
 *   - FT1-11 transaction amount, extended (CP) — surfaced as canonical wire text
 *   - FT1-12 transaction amount, unit (CP) — surfaced as canonical wire text
 *   - FT1-19 diagnosis code(s) (CE, repeating) — billing diagnosis linkage
 *
 * Safety rules enforced here (Phase Q §Fail-safe):
 *   - Never throws — a malformed FT1 surfaces as omitted keys (HELPERS-07).
 *   - **No billing logic, no money-as-float.** The extended/unit amounts (CP)
 *     are surfaced as their canonical wire text (`amountExtended`/`amountUnit`),
 *     never parsed to a `number` — currency + price are preserved intact and no
 *     rounding is ever introduced. `Field.text` is byte-exact for a plain numeric
 *     amount (`150.00^USD`); it canonicalizes only escape sequences + trailing
 *     empty components (D-02), which a CP amount does not carry. The transaction
 *     type + code are provenance-only; nothing is validated, priced, or adjudicated.
 *   - Missing fields → keys omitted; `diagnoses` is ALWAYS a (possibly empty)
 *     array.
 *   - Output is frozen at the boundary (D-01); NOT memoized (D-06).
 *
 * Known limitations: `charges()` surfaces billing-critical FT1 fields only. It
 * is NOT a claims/pricing engine — no charge validation, no adjudication, no
 * amount arithmetic. See KNOWN-LIMITATIONS.md.
 */

import type { Field } from "../model/field.js";
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import { parseCwe, type CWE } from "../model/types/cwe.js";

import type { Charge } from "./types.js";

/** Normalize HL7 empty-string to `undefined` for the helper layer. @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** Drop empty-composite leaks so an optional CWE key stays absent when the field was blank. @internal */
function cweOrUndefined(field: Field): CWE | undefined {
  const cwe = field.asCwe();
  return Object.keys(cwe).length === 0 ? undefined : cwe;
}

/**
 * Every repetition of a repeating coded field as a `CWE`, dropping empty
 * repetitions. Used for FT1-19 (diagnosis linkage, repeating CE). @internal
 */
function repeatingCwe(field: Field): readonly CWE[] {
  const out: CWE[] = [];
  for (const rep of field.repetitions) {
    const cwe = parseCwe(rep, field.enc);
    if (Object.keys(cwe).length > 0) out.push(Object.freeze(cwe));
  }
  return out;
}

/** Build a frozen {@link Charge} from one FT1 segment. @internal */
function finalizeCharge(ft1: Segment): Charge {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Charge> = { diagnoses: Object.freeze(repeatingCwe(ft1.field(19))) };

  // FT1-4 transaction date (fidelity TS, Phase N).
  const transactionDate = ft1.field(4).asTs();
  if (transactionDate.raw !== "") out.transactionDate = transactionDate;

  // FT1-6 transaction type (Table 0017) — verbatim.
  const transactionType = stringOrUndefined(ft1.field(6).value);
  if (transactionType !== undefined) out.transactionType = transactionType;

  // FT1-7 transaction code — institution charge/procedure code (CWE).
  const transactionCode = cweOrUndefined(ft1.field(7));
  if (transactionCode !== undefined) out.transactionCode = transactionCode;

  // FT1-10 transaction quantity (NM) — strict-parsed, never NaN.
  const quantity = ft1.field(10).asNm().value;
  if (quantity !== undefined) out.quantity = quantity;

  // FT1-11 / FT1-12 extended / unit amount (CP) — canonical wire text, never a float.
  const amountExtended = stringOrUndefined(ft1.field(11).text);
  if (amountExtended !== undefined) out.amountExtended = amountExtended;
  const amountUnit = stringOrUndefined(ft1.field(12).text);
  if (amountUnit !== undefined) out.amountUnit = amountUnit;

  return Object.freeze(out) as Charge;
}

/**
 * Every FT1 of a DFT message as a typed {@link Charge}, one per FT1 in document
 * order. Returns `[]` when no FT1 is present. NOT memoized — each call re-walks
 * `msg.allSegments()`. Never throws (HELPERS-07).
 *
 * Billing-critical fields are surfaced (transaction type/code, extended/unit
 * amount, diagnosis linkage); there is **no billing logic and no money-as-float**
 * — amounts are the canonical CP wire text (byte-exact for a plain numeric
 * amount), never a `number`. See {@link Charge}.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const charge of msg.charges()) {
 *   console.log(charge.transactionType, charge.transactionCode?.identifier);
 *   console.log(charge.amountExtended); // e.g. "150.00^USD" — wire text, never a number
 *   for (const dx of charge.diagnoses) console.log(dx.identifier);
 * }
 * ```
 *
 * @internal
 */
export function charges(msg: Hl7Message): readonly Charge[] {
  const out: Charge[] = [];
  for (const seg of msg.allSegments()) {
    if (seg.type === "FT1") out.push(finalizeCharge(seg));
  }
  return Object.freeze(out);
}
