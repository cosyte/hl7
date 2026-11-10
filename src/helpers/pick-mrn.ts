/**
 * `pickMrn`: pick the Medical Record Number string from a PID-3 identifier
 * list. Isolated from `patient.ts` so a profile hook can substitute
 * a profile-aware variant without patching the helper that calls it.
 *
 * Silent (helpers emit no warnings). Never throws.
 */

import type { CX } from "../model/types/cx.js";

/**
 * Pick the Medical Record Number string from a list of PID-3 CX identifiers.
 *
 * Prefer the first CX whose `identifierTypeCode === "MR"` (HL7 v2.5+
 * canonical MRN marker). The match is case-SENSITIVE: lowercase
 * `"mr"` does NOT match; spec mandates uppercase.
 *
 * When no MR-typed identifier is found, fall back to the first CX's
 * `idNumber`. Returns `undefined` when the first CX has no `idNumber` (even
 * if later CXs do: the fallback is strictly "first CX", not "first CX with
 * idNumber", because we need a deterministic answer).
 *
 * No warning emitted. Callers who need strict MR resolution can walk
 * `patient.identifiers` themselves.
 *
 * @example
 * ```ts
 * import { pickMrn } from "@cosyte/hl7";
 * pickMrn([
 *   { idNumber: "X1" },
 *   { idNumber: "MRN001", identifierTypeCode: "MR" },
 * ]);
 * // → "MRN001"
 *
 * pickMrn([{ idNumber: "X1" }]);
 * // → "X1"  (fallback: no MR entry)
 *
 * pickMrn([]);
 * // → undefined
 * ```
 */
export function pickMrn(identifiers: readonly CX[]): string | undefined {
  for (const cx of identifiers) {
    if (cx.identifierTypeCode === "MR" && cx.idNumber !== undefined) {
      return cx.idNumber;
    }
  }
  const first = identifiers[0];
  return first?.idNumber;
}
