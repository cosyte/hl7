/**
 * `observations` + `buildObservation` — Phase 4 Plan 03 (visit-and-observations)
 * implementation of HELPERS-04. Walks every OBX segment in document order and
 * projects each into a typed `Observation` discriminated by OBX-2
 * (`valueType`) per D-13. The per-segment builder `buildObservation` is
 * exported so Plan 04's `orders()` can reuse the same OBX → Observation
 * dispatch without duplicating the value-type switch (D-12 positional
 * grouping).
 *
 * Design decisions enforced here:
 *   - D-05: `observations(msg)` always returns a readonly array — `[]` when
 *     the message has no OBX segments.
 *   - D-06: NOT memoized — each call re-walks `msg.segments("OBX")`.
 *   - D-11: document order (matches the segment iteration order).
 *   - D-13: discriminated union on `valueType`:
 *       - `"NM"`            → `number | undefined`  (via `Field.asNm()`)
 *       - `"TS" | "DT"`     → `Date | undefined`    (via `Field.asTs()`, flat per D-18)
 *       - `"CWE" | "CE"`    → composite | undefined (via `Field.asCwe/asCe`)
 *       - other (`ST`/`TX`/`FT`/`ID`/`IS`/unknown) → `string | undefined`
 *   - D-15: common-field shape (setId, identifier, units, referenceRange,
 *     abnormalFlags, status, observedDateTime).
 *   - D-18: flat `Date | undefined` at the helper layer.
 *   - D-22: never throws — empty or malformed input surfaces as `undefined`.
 *   - D-01: each Observation and the outer array are frozen at the boundary.
 */

import type { Field } from "../model/field.js";
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { CE } from "../model/types/ce.js";
import type { CWE } from "../model/types/cwe.js";
import type { Observation, ObservationBase } from "./types.js";

/** Normalize HL7 empty-string to `undefined` for the helper layer (D-22). @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** Drop empty-composite leaks so optional `units` keys stay absent when OBX-6 was blank. @internal */
function cweOrUndefined(field: Field): CWE | undefined {
  const cwe = field.asCwe();
  return Object.keys(cwe).length === 0 ? undefined : cwe;
}

/**
 * Build the common (valueType-agnostic) piece of an Observation from one OBX
 * Segment. Omits keys that are absent so the output stays
 * `exactOptionalPropertyTypes`-clean.
 *
 * @internal
 */
function buildCommon(obx: Segment): ObservationBase {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  // `identifier` is always present (D-15) — always parse OBX-3, even if empty.
  const base: Mutable<ObservationBase> = {
    identifier: obx.field(3).asCwe(),
  };

  const setId = stringOrUndefined(obx.field(1).value);
  if (setId !== undefined) base.setId = setId;

  const units = cweOrUndefined(obx.field(6));
  if (units !== undefined) base.units = units;

  const referenceRange = stringOrUndefined(obx.field(7).value);
  if (referenceRange !== undefined) base.referenceRange = referenceRange;

  const abnormalFlags = stringOrUndefined(obx.field(8).value);
  if (abnormalFlags !== undefined) base.abnormalFlags = abnormalFlags;

  const status = stringOrUndefined(obx.field(11).value);
  if (status !== undefined) base.status = status;

  const observedDateTime = obx.field(14).asTs().date;
  if (observedDateTime !== undefined) base.observedDateTime = observedDateTime;

  return base as ObservationBase;
}

/**
 * Dispatch the OBX-5 value to the correct parser based on OBX-2 `valueType`
 * per D-13. The returned object is frozen at the boundary (D-01).
 *
 * @internal
 */
function dispatchValue(valueType: string, valueField: Field, common: ObservationBase): Observation {
  switch (valueType) {
    case "NM": {
      const nm = valueField.asNm();
      return Object.freeze({
        ...common,
        valueType: "NM" as const,
        value: nm.value,
      });
    }
    case "TS":
    case "DT": {
      const ts = valueField.asTs();
      return Object.freeze({
        ...common,
        valueType,
        value: ts.date,
      });
    }
    case "CWE": {
      const cwe = valueField.asCwe();
      const value: CWE | undefined = Object.keys(cwe).length === 0 ? undefined : cwe;
      return Object.freeze({
        ...common,
        valueType: "CWE" as const,
        value,
      });
    }
    case "CE": {
      const ce = valueField.asCe();
      const value: CE | undefined = Object.keys(ce).length === 0 ? undefined : ce;
      return Object.freeze({
        ...common,
        valueType: "CE" as const,
        value,
      });
    }
    default: {
      const raw = valueField.value;
      const value = raw === "" ? undefined : raw;
      return Object.freeze({
        ...common,
        valueType,
        value,
      });
    }
  }
}

/**
 * Build a single `Observation` from one OBX `Segment`. Value is dispatched
 * by OBX-2 per D-13; common fields follow D-15. Exported so Plan 04's
 * `orders()` can reuse this per-segment builder when grouping OBX under OBR
 * positionally (D-12) — do NOT re-implement OBX → Observation construction
 * there.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * const obx = msg.segments("OBX")[0];
 * if (obx !== undefined) {
 *   const obs = buildObservation(obx);
 *   if (obs.valueType === "NM") console.log(obs.value);
 * }
 * ```
 */
export function buildObservation(obx: Segment): Observation {
  const common = buildCommon(obx);
  const valueType = obx.field(2).value;
  const valueField = obx.field(5);
  return dispatchValue(valueType, valueField, common);
}

/**
 * Every OBX segment as a typed `Observation` in document order (D-11). D-05:
 * returns `[]` when no OBX segments are present. D-06: NOT memoized — each
 * call re-walks `msg.segments("OBX")`.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const obs of msg.observations()) {
 *   if (obs.valueType === "NM") console.log(obs.value); // number | undefined
 *   else if (obs.valueType === "TS") console.log(obs.value?.toISOString());
 * }
 * ```
 *
 * @internal
 */
export function observations(msg: Hl7Message): readonly Observation[] {
  const out: Observation[] = [];
  for (const obx of msg.segments("OBX")) {
    out.push(buildObservation(obx));
  }
  return Object.freeze(out);
}
