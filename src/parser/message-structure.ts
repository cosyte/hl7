/**
 * Message-type & structure awareness (roadmap Phase G) — a conservative
 * **misroute / truncation safety net**, NOT an abstract-message-syntax
 * validator.
 *
 * It answers one question per message: **"for this trigger event, are the
 * core segment groups the spec marks Required actually present?"** When an
 * expected group is entirely absent (e.g. an `ORU^R01` carrying no `OBR`/`OBX`
 * result group — the classic signature of a truncated or misrouted feed), the
 * parser emits a single additive Tier-2 `MISSING_EXPECTED_GROUP` warning. It
 * never throws, never refuses, never rewrites the message.
 *
 * Design constraints (all accuracy-driven, to guarantee ZERO spec
 * false-positives):
 *
 *   - **Per trigger event, never per family.** The claim that an ADT family
 *     shares one shape is false — events diverge by version and trigger. Every
 *     definition keys on the (messageCode, triggerEvent) pair.
 *   - **Required (R) anchors only.** A group is modelled only when its anchor
 *     segment is genuinely Required by the v2.5.1 abstract syntax for that
 *     event. Optional groups (e.g. PID in ORU, RXA in VXU, OBR in OML) are
 *     deliberately excluded so a conformant-but-sparse message never warns.
 *   - **Presence is liberal.** A group counts as present if ANY of its anchor
 *     segments appears — the conservative direction (it suppresses a warning
 *     rather than inventing one).
 *   - **Unrecognized = silent.** A message whose type has no definition here
 *     produces an unrecognized structure summary and zero structural warnings.
 *
 * Spec traceability: HL7 v2.5.1 — Ch. 3 (ADT), Ch. 4 (orders), Ch. 6
 * (financial — DFT), Ch. 7 (observation — ORU), Ch. 9 (MDM), Ch. 10
 * (scheduling — SIU), Ch. 2 (ACK), CDC IG (VXU). Per-entry sourcing lives in
 * `docs-content/spec-notes-structure.md`.
 *
 * Zero runtime deps — pure data + pure functions.
 */

/**
 * One expected segment group for a recognized trigger event. The group is
 * considered **present** when at least one of its `anchorSegments` appears in
 * the parsed message; its total absence is what signals a truncated or
 * misrouted message.
 */
export interface ExpectedSegmentGroup {
  /** Human-readable group label, e.g. `"result"`, `"patient"`, `"order"`. */
  readonly name: string;
  /**
   * The segment name(s) whose presence proves this group is present. Only
   * segments the HL7 v2.5.1 abstract syntax marks **Required (R)** for the
   * owning trigger event appear here, so a conformant message can never lack
   * all of them.
   */
  readonly anchorSegments: readonly string[];
}

/**
 * The expected structure of one recognized message type, keyed on the
 * (messageCode, triggerEvent) pair. A definition with an empty `triggerEvents`
 * list matches on `messageCode` alone (used for `ACK`, which carries no
 * trigger event in MSH-9.2).
 */
export interface MessageStructureDefinition {
  /** MSH-9.1 message code, e.g. `"ORU"`. */
  readonly messageCode: string;
  /**
   * The MSH-9.2 trigger events this definition applies to, e.g. `["R01"]`.
   * An empty list means "match on message code alone" (e.g. `ACK`).
   */
  readonly triggerEvents: readonly string[];
  /** The Required (R) segment groups expected for these events. */
  readonly expectedGroups: readonly ExpectedSegmentGroup[];
}

/**
 * The conservative, Required-only expected-group registry. Each entry's spec
 * source is recorded in `docs-content/spec-notes-structure.md`. Deliberately
 * narrow: it recognizes the common message types' **core Required groups
 * only** and is NOT a conformance validator. Frozen (data, not config).
 *
 * @example
 * ```ts
 * import { MESSAGE_STRUCTURE_DEFINITIONS } from "@cosyte/hl7";
 * const oru = MESSAGE_STRUCTURE_DEFINITIONS.find((d) => d.messageCode === "ORU");
 * console.log(oru?.expectedGroups[0]?.name); // "result"
 * ```
 */
export const MESSAGE_STRUCTURE_DEFINITIONS: readonly MessageStructureDefinition[] = Object.freeze([
  // ── ADT (Ch. 3): patient identification (PID) + visit (PV1) are Required
  //    for these admit/transfer/discharge/register/update/cancel events.
  //    EVN is intentionally excluded — real senders omit it freely, making it
  //    a weak (false-positive-prone) signal.
  Object.freeze({
    messageCode: "ADT",
    triggerEvents: Object.freeze(["A01", "A02", "A03", "A04", "A05", "A08", "A11", "A13"]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "patient", anchorSegments: Object.freeze(["PID"]) }),
      Object.freeze({ name: "visit", anchorSegments: Object.freeze(["PV1"]) }),
    ]),
  }),
  // ── ORU^R01 (Ch. 7): the OBR/OBX result group is the Required payload.
  //    PID is excluded (the patient-result group's PID is R within the group,
  //    but a result-only relay can legitimately omit it at the top — keep the
  //    anchor on the result segments themselves, the true truncation signal).
  Object.freeze({
    messageCode: "ORU",
    triggerEvents: Object.freeze(["R01"]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "result", anchorSegments: Object.freeze(["OBR", "OBX"]) }),
    ]),
  }),
  // ── Orders (Ch. 4): ORC is the Required common-order segment across the
  //    order message family. OBR is excluded — it is Optional in several of
  //    these (OML/OMG/OMI carry it inside an optional observation-request
  //    group), so anchoring only on ORC avoids a false positive.
  Object.freeze({
    messageCode: "ORM",
    triggerEvents: Object.freeze(["O01"]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "order", anchorSegments: Object.freeze(["ORC"]) }),
    ]),
  }),
  Object.freeze({
    messageCode: "OML",
    triggerEvents: Object.freeze(["O21"]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "order", anchorSegments: Object.freeze(["ORC"]) }),
    ]),
  }),
  Object.freeze({
    messageCode: "OMG",
    triggerEvents: Object.freeze(["O19"]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "order", anchorSegments: Object.freeze(["ORC"]) }),
    ]),
  }),
  Object.freeze({
    messageCode: "OMP",
    triggerEvents: Object.freeze(["O09"]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "order", anchorSegments: Object.freeze(["ORC"]) }),
    ]),
  }),
  Object.freeze({
    messageCode: "OMI",
    triggerEvents: Object.freeze(["O23"]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "order", anchorSegments: Object.freeze(["ORC"]) }),
    ]),
  }),
  // ── SIU scheduling (Ch. 10): SCH (schedule activity) is Required for every
  //    S12–S26 event. The patient group (PID) is Optional in the SIU abstract
  //    syntax, so it is excluded.
  Object.freeze({
    messageCode: "SIU",
    triggerEvents: Object.freeze([
      "S12",
      "S13",
      "S14",
      "S15",
      "S16",
      "S17",
      "S18",
      "S19",
      "S20",
      "S21",
      "S22",
      "S23",
      "S24",
      "S26",
    ]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "schedule", anchorSegments: Object.freeze(["SCH"]) }),
    ]),
  }),
  // ── MDM (Ch. 9): document management — PID + the TXA document header are
  //    Required for T02 (original document) and T06 (document addendum).
  Object.freeze({
    messageCode: "MDM",
    triggerEvents: Object.freeze(["T02", "T06"]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "patient", anchorSegments: Object.freeze(["PID"]) }),
      Object.freeze({ name: "document", anchorSegments: Object.freeze(["TXA"]) }),
    ]),
  }),
  // ── DFT^P03 (Ch. 6): financial transaction — PID + at least one FT1
  //    financial-transaction segment are Required.
  Object.freeze({
    messageCode: "DFT",
    triggerEvents: Object.freeze(["P03"]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "patient", anchorSegments: Object.freeze(["PID"]) }),
      Object.freeze({ name: "financial", anchorSegments: Object.freeze(["FT1"]) }),
    ]),
  }),
  // ── VXU^V04 (CDC IG): immunization update — PID is Required. RXA is
  //    excluded: it lives in the Optional order group of the CDC IG, so a
  //    query-shaped VXU with no administered vaccine must not warn.
  Object.freeze({
    messageCode: "VXU",
    triggerEvents: Object.freeze(["V04"]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "patient", anchorSegments: Object.freeze(["PID"]) }),
    ]),
  }),
  // ── ACK (Ch. 2): a general acknowledgment — MSA (message acknowledgment) is
  //    Required. Matched on message code alone (no trigger event in MSH-9.2).
  Object.freeze({
    messageCode: "ACK",
    triggerEvents: Object.freeze([]),
    expectedGroups: Object.freeze([
      Object.freeze({ name: "acknowledgment", anchorSegments: Object.freeze(["MSA"]) }),
    ]),
  }),
]);

/**
 * The presence verdict for one expected group of a recognized message type.
 */
export interface StructureGroup {
  /** The group label from its `ExpectedSegmentGroup`, e.g. `"result"`. */
  readonly name: string;
  /** The anchor segment name(s) whose presence would satisfy this group. */
  readonly anchorSegments: readonly string[];
  /** `true` when at least one anchor segment is present in the message. */
  readonly present: boolean;
}

/**
 * The structure summary for a parsed message — the data behind
 * `Hl7Message.structure`. For an unrecognized type, `recognized` is `false`,
 * `expectedGroups` is empty, and `missingGroups` is empty (the safety net is
 * deliberately silent on types it does not model).
 */
export interface MessageStructure {
  /** `true` when a `MESSAGE_STRUCTURE_DEFINITIONS` entry matched the type. */
  readonly recognized: boolean;
  /** MSH-9.1 message code observed on the message (empty string if absent). */
  readonly messageCode: string;
  /** MSH-9.2 trigger event observed on the message (empty string if absent). */
  readonly triggerEvent: string;
  /** Per-expected-group presence verdicts (empty when unrecognized). */
  readonly expectedGroups: readonly StructureGroup[];
  /** Names of the expected groups that are entirely absent (the warnings). */
  readonly missingGroups: readonly string[];
}

/**
 * Find the structure definition for a (messageCode, triggerEvent) pair, or
 * `undefined` when the type is not modelled. A definition with an empty
 * `triggerEvents` list matches on message code alone.
 *
 * @internal
 */
function findDefinition(
  messageCode: string,
  triggerEvent: string,
): MessageStructureDefinition | undefined {
  for (const def of MESSAGE_STRUCTURE_DEFINITIONS) {
    if (def.messageCode !== messageCode) continue;
    if (def.triggerEvents.length === 0 || def.triggerEvents.includes(triggerEvent)) {
      return def;
    }
  }
  return undefined;
}

/**
 * Analyze a parsed message's structure against the conservative expected-group
 * registry. Pure: it takes the message code, trigger event, and the set of
 * segment names actually present, and returns a `MessageStructure` summary. It
 * decides nothing about whether to warn — the caller (parser) emits one
 * `MISSING_EXPECTED_GROUP` warning per name in `missingGroups`.
 *
 * @param messageCode - MSH-9.1 (e.g. `"ORU"`); empty string if absent.
 * @param triggerEvent - MSH-9.2 (e.g. `"R01"`); empty string if absent.
 * @param presentSegmentNames - the set of segment names present in the message.
 *
 * @example
 * ```ts
 * import { analyzeMessageStructure } from "@cosyte/hl7";
 * const s = analyzeMessageStructure("ORU", "R01", new Set(["MSH", "PID"]));
 * console.log(s.recognized);     // true
 * console.log(s.missingGroups);  // ["result"]  (no OBR/OBX)
 * ```
 */
export function analyzeMessageStructure(
  messageCode: string,
  triggerEvent: string,
  presentSegmentNames: ReadonlySet<string>,
): MessageStructure {
  const def = findDefinition(messageCode, triggerEvent);
  if (def === undefined) {
    return Object.freeze({
      recognized: false,
      messageCode,
      triggerEvent,
      expectedGroups: Object.freeze([]),
      missingGroups: Object.freeze([]),
    });
  }

  const groups: StructureGroup[] = [];
  const missing: string[] = [];
  for (const expected of def.expectedGroups) {
    const present = expected.anchorSegments.some((name) => presentSegmentNames.has(name));
    groups.push(
      Object.freeze({
        name: expected.name,
        anchorSegments: expected.anchorSegments,
        present,
      }),
    );
    if (!present) missing.push(expected.name);
  }

  return Object.freeze({
    recognized: true,
    messageCode,
    triggerEvent,
    expectedGroups: Object.freeze(groups),
    missingGroups: Object.freeze(missing),
  });
}
