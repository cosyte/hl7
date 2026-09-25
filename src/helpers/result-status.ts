/**
 * Result status classification. Reads OBX-11 against HL7 Table 0085 and
 * OBR-25 against HL7 Table 0123, and classifies each by HL7's published
 * v2-to-FHIR status map for that table: the ConceptMaps
 * `table-hl70085-to-observation-status` and
 * `table-hl70123-queries-to-diagnostic-report-status`, both version 1.0.0.
 *
 * Only the rows those maps MAP are carried here. A code the map lists as
 * "(not mapped)", a code outside the table, and any field that is not exactly
 * one code classify as `"undetermined"`: the lookup has no fallback row, so a
 * near-miss can never reach `"final"`.
 *
 * "Exactly one code" is read on the field as received: one repetition, one
 * component, one subcomponent, no escape sequence standing in for the letter,
 * no whitespace the parser trimmed off it, and no VT or FS byte the parser
 * removed from inside it. The raw code carried beside the classification is
 * the field's decoded first value, byte-identical to the `status` /
 * `orderStatus` the same helper output already surfaces.
 */

import type { Field } from "../model/field.js";
import type { Segment } from "../model/segment.js";
import { fieldArrivedAltered } from "../parser/wire-fidelity.js";
import type {
  ResultStatusClass,
  ResultStatusClassification,
  ResultStatusMap,
  ResultStatusTable,
} from "./types.js";

const TABLE_0085: ResultStatusTable = Object.freeze({ name: "HL7 Table 0085", version: "3.0.0" });
const TABLE_0123: ResultStatusTable = Object.freeze({ name: "HL7 Table 0123", version: "3.0.0" });

const MAP_0085: ResultStatusMap = Object.freeze({
  url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70085-to-observation-status",
  version: "1.0.0",
});
const MAP_0123: ResultStatusMap = Object.freeze({
  url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70123-queries-to-diagnostic-report-status",
  version: "1.0.0",
});

// The mapped rows of the Table 0085 map. B, I, N, O, R, S, V and U are
// "(not mapped)" there and are deliberately absent. A `Map`, not an object
// literal, so an inherited key such as `constructor` can never match.
const OBSERVATION_STATUS: ReadonlyMap<string, ResultStatusClass> = new Map([
  ["A", "amended"],
  ["C", "corrected"],
  ["D", "entered-in-error"],
  ["F", "final"],
  ["P", "preliminary"],
  ["X", "cancelled"],
  ["W", "entered-in-error"],
]);

// The mapped rows of the Table 0123 map. A, Y, Z, M and N are
// "(not mapped)" there and are deliberately absent.
const ORDER_STATUS: ReadonlyMap<string, ResultStatusClass> = new Map([
  ["O", "registered"],
  ["I", "registered"],
  ["S", "registered"],
  ["P", "preliminary"],
  ["C", "corrected"],
  ["R", "partial"],
  ["F", "final"],
  ["X", "cancelled"],
]);

/**
 * The field's sole value when it holds exactly one: one repetition, one
 * component, one subcomponent, written on the wire as itself. `undefined` for
 * a null, empty or structured field, for a value that arrived as an escape
 * sequence (the escape overlay records its wire bytes), and for a field the
 * parser altered on the way in (trimmed, or a VT or FS byte removed).
 *
 * @example
 * ```ts
 * const obx = msg.segments("OBX")[0];
 * if (obx !== undefined) {
 *   soleValue(obx.field(11)); // "F" for OBX-11 F; undefined for F~W or a trimmed " F"
 * }
 * ```
 *
 * @internal
 */
export function soleValue(field: Field): string | undefined {
  if (fieldArrivedAltered(field.raw) || field.repetitions.length !== 1) return undefined;
  const components = field.repetitions[0]?.components ?? [];
  if (components.length !== 1) return undefined;
  const component = components[0];
  if (component?.subcomponents.length !== 1) return undefined;
  if (component.rawSubcomponents?.[0] !== undefined) return undefined;
  return component.subcomponents[0];
}

/** Classify one status field against one map; frozen at the boundary. @internal */
function classify(
  field: Field,
  rows: ReadonlyMap<string, ResultStatusClass>,
  table: ResultStatusTable,
  map: ResultStatusMap,
): ResultStatusClassification {
  const sole = soleValue(field);
  const classification = (sole === undefined ? undefined : rows.get(sole)) ?? "undetermined";
  // `Field.value` is exactly what `status` / `orderStatus` reads, so the raw
  // code stays byte-identical to it and is omitted exactly when it is.
  const code = field.value;
  return Object.freeze(
    code === "" ? { classification, table, map } : { classification, code, table, map },
  );
}

/**
 * Classify an OBX's own OBX-11 by the Table 0085 to Observation Status map.
 * Never throws.
 *
 * @example
 * ```ts
 * const obx = msg.segments("OBX")[0];
 * if (obx !== undefined) {
 *   classifyObservationStatus(obx).classification; // "final" for OBX-11 F
 * }
 * ```
 *
 * @internal
 */
export function classifyObservationStatus(obx: Segment): ResultStatusClassification {
  return classify(obx.field(11), OBSERVATION_STATUS, TABLE_0085, MAP_0085);
}

/**
 * Classify an OBR's own OBR-25 by the Table 0123 to Diagnostic Report Status
 * map. Never throws.
 *
 * @example
 * ```ts
 * const obr = msg.segments("OBR")[0];
 * if (obr !== undefined) {
 *   classifyOrderStatus(obr).classification; // "partial" for OBR-25 R
 * }
 * ```
 *
 * @internal
 */
export function classifyOrderStatus(obr: Segment): ResultStatusClassification {
  return classify(obr.field(25), ORDER_STATUS, TABLE_0123, MAP_0123);
}
