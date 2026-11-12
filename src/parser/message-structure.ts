/**
 * Message-type & structure awareness: a conservative
 * **misroute / truncation safety net**, NOT an abstract-message-syntax
 * validator.
 *
 * It answers one question per message: **"for this trigger event, are the
 * segments the published structure definition gives a minimum of one actually
 * present?"** When a required segment is absent (e.g. an `ORU^R01` carrying no
 * `OBR`: the classic signature of a truncated or misrouted feed), the parser
 * emits a single additive Tier-2 `MISSING_EXPECTED_GROUP` warning naming that
 * segment. It never throws, never refuses, never rewrites the message.
 *
 * Design constraints, all accuracy-driven:
 *
 *   - **Derived, never hand-picked.** The registry below is generated from a
 *     vendored, byte-for-byte snapshot of HL7's own machine-readable message
 *     structures. There is no leniency list and no suppression list: what the
 *     registry expects is what the publication says, and the one pair the
 *     publication does not carry at all is marked as a retained transcription
 *     carrying its reason.
 *   - **Per trigger event, never per family.** The claim that an ADT family
 *     shares one shape is false: events diverge by trigger. Every definition
 *     keys on the (messageCode, triggerEvent) pair, except `ACK`, whose
 *     MSH-9.2 carries the ACKNOWLEDGED message's trigger event.
 *   - **Optional groups never make a segment required.** A segment counts as
 *     required only when its minimum is at least one along the whole path from
 *     the structure root, so a conformant OBX-free `ORU^R01` never warns.
 *   - **A family must agree.** Where the publication splits a structure into
 *     variants, a segment is required only when every variant requires it.
 *   - **Unrecognized = silent.** A message whose type has no definition here
 *     produces an unrecognized structure summary and zero structural warnings.
 *
 * Provenance: every expectation traces to `STRUCTURE_REGISTRY_PROVENANCE`,
 * which names the publication, the commit, the sha256 of every vendored file
 * and the structure behind each recognized pair. Per-entry adjudication against
 * the transcription this replaced lives in
 * `docs-content/spec-notes-structure.md`.
 *
 * Zero runtime deps, and zero network: pure data + pure functions.
 */

import {
  GENERATED_MESSAGE_STRUCTURE_DEFINITIONS,
  GENERATED_STRUCTURE_REGISTRY_PROVENANCE,
} from "./generated/message-structures.js";
import type {
  MessageStructure,
  MessageStructureDefinition,
  StructureGroup,
} from "./structure-types.js";
import { boundedIdentifier } from "./tokens.js";

export type {
  ExpectedSegmentGroup,
  MessageStructure,
  MessageStructureDefinition,
  StructureDerivation,
  StructureFamily,
  StructureGroup,
  StructurePublicationRef,
  StructureRegistryProvenance,
  StructureSnapshotFile,
  StructureSourcePair,
} from "./structure-types.js";

/** Freeze a definition and everything reachable from it. */
function freezeDefinition(def: MessageStructureDefinition): MessageStructureDefinition {
  return Object.freeze({
    ...def,
    triggerEvents: Object.freeze([...def.triggerEvents]),
    expectedGroups: Object.freeze(def.expectedGroups.map((g) => Object.freeze({ ...g }))),
    requiredSegments: Object.freeze([...def.requiredSegments]),
    structureIds: Object.freeze([...def.structureIds]),
  });
}

/**
 * The derived expected-segment registry. Generated from HL7's published,
 * machine-readable message structures (see `STRUCTURE_REGISTRY_PROVENANCE` for
 * the publication, the commit and the per-file hashes) and frozen: data, not
 * config. Deliberately narrow in COVERAGE (twelve message codes) and not narrow
 * in CONTENT: within those codes it expects exactly what the publication marks
 * required. It is still a safety net, not a conformance validator.
 *
 * @example
 * ```ts
 * import { MESSAGE_STRUCTURE_DEFINITIONS } from "@cosyte/hl7";
 * const adt = MESSAGE_STRUCTURE_DEFINITIONS.find((d) =>
 *   d.messageCode === "ADT" && d.triggerEvents.includes("A01"),
 * );
 * console.log(adt?.requiredSegments); // ["EVN", "MSH", "PID", "PV1"]
 * ```
 */
export const MESSAGE_STRUCTURE_DEFINITIONS: readonly MessageStructureDefinition[] = Object.freeze(
  GENERATED_MESSAGE_STRUCTURE_DEFINITIONS.map(freezeDefinition),
);

/**
 * Where every expectation in {@link MESSAGE_STRUCTURE_DEFINITIONS} came from:
 * the publication and the commit it was read at, the sha256 and upstream URL of
 * every vendored file, the variant family behind each referenced structure, and
 * the structure id behind each recognized (message code, trigger event) pair.
 *
 * A consumer auditing a warning can answer "says who?" without leaving the
 * package and without a network call.
 *
 * @example
 * ```ts
 * import { STRUCTURE_REGISTRY_PROVENANCE } from "@cosyte/hl7";
 * console.log(STRUCTURE_REGISTRY_PROVENANCE.publication.repository); // "HL7/v2ig"
 * const a01 = STRUCTURE_REGISTRY_PROVENANCE.pairs.find(
 *   (p) => p.messageCode === "ADT" && p.triggerEvent === "A01",
 * );
 * console.log(a01?.structureId); // "ADT_A01"
 * ```
 */
export const STRUCTURE_REGISTRY_PROVENANCE = Object.freeze({
  ...GENERATED_STRUCTURE_REGISTRY_PROVENANCE,
  publication: Object.freeze({ ...GENERATED_STRUCTURE_REGISTRY_PROVENANCE.publication }),
  files: Object.freeze(
    GENERATED_STRUCTURE_REGISTRY_PROVENANCE.files.map((f) => Object.freeze({ ...f })),
  ),
  families: Object.freeze(
    GENERATED_STRUCTURE_REGISTRY_PROVENANCE.families.map((f) =>
      Object.freeze({ ...f, members: Object.freeze([...f.members]) }),
    ),
  ),
  pairs: Object.freeze(
    GENERATED_STRUCTURE_REGISTRY_PROVENANCE.pairs.map((p) => Object.freeze({ ...p })),
  ),
});

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
 * Analyze a parsed message's structure against the derived expected-segment
 * registry. Pure: it takes the message code, trigger event, and the set of
 * segment names actually present, and returns a `MessageStructure` summary. It
 * decides nothing about whether to warn: the caller (parser) emits one
 * `MISSING_EXPECTED_GROUP` warning per name in `missingSegments`.
 *
 * @param messageCode - MSH-9.1 (e.g. `"ORU"`); empty string if absent.
 * @param triggerEvent - MSH-9.2 (e.g. `"R01"`); empty string if absent.
 * @param presentSegmentNames - the set of segment names present in the message.
 *
 * @example
 * ```ts
 * import { analyzeMessageStructure } from "@cosyte/hl7";
 * const s = analyzeMessageStructure("ORU", "R01", new Set(["MSH", "PID"]));
 * console.log(s.recognized);        // true
 * console.log(s.missingSegments);   // ["OBR"]  (the published minimum of one)
 * ```
 */
export function analyzeMessageStructure(
  messageCode: string,
  triggerEvent: string,
  presentSegmentNames: ReadonlySet<string>,
): MessageStructure {
  const def = findDefinition(messageCode, triggerEvent);
  if (def === undefined) {
    // Bounded on the UNRECOGNIZED branch. These two fields are echoed straight
    // back from MSH-9, and on a malformed message MSH-9 can hold a data field,
    // so an unrecognized structure is where narrative reaches a field a
    // consumer reads as an identifier.
    //
    // BE PRECISE ABOUT THE RECOGNIZED BRANCH, because an earlier version of
    // this comment was wrong about it: that branch returns these same
    // PARAMETERS, not `def.*`. `messageCode` is safe there by construction,
    // since `findDefinition` skips any definition whose `messageCode` differs.
    // `triggerEvent` is NOT: a definition with an empty `triggerEvents` list
    // matches on message code alone (the `ACK` entry), so a recognized `ACK`
    // echoes MSH-9.2 verbatim. It is left unbounded deliberately rather than
    // by oversight: no real sender putting narrative in MSH-9.2 is grounded in
    // a de-identified document, and bounding it is a separate change with its
    // own backlog item, not a silent widening of this one.
    return Object.freeze({
      recognized: false,
      messageCode: boundedIdentifier(messageCode, "segmentId"),
      triggerEvent: boundedIdentifier(triggerEvent, "segmentId"),
      expectedGroups: Object.freeze([]),
      missingGroups: Object.freeze([]),
      requiredSegments: Object.freeze([]),
      missingSegments: Object.freeze([]),
      structureIds: Object.freeze([]),
    });
  }

  const groups: StructureGroup[] = [];
  const missing: string[] = [];
  for (const expected of def.expectedGroups) {
    const present = presentSegmentNames.has(expected.requiredSegment);
    groups.push(
      Object.freeze({
        name: expected.name,
        anchorSegments: expected.anchorSegments,
        requiredSegment: expected.requiredSegment,
        present,
      }),
    );
    if (!present) missing.push(expected.requiredSegment);
  }

  const missingSegments = Object.freeze(missing);
  return Object.freeze({
    recognized: true,
    messageCode,
    triggerEvent,
    expectedGroups: Object.freeze(groups),
    missingGroups: missingSegments,
    requiredSegments: def.requiredSegments,
    missingSegments,
    structureIds: def.structureIds,
  });
}

/**
 * The registry entry behind a recognized (message code, trigger event) pair, or
 * `undefined` when the pair is not modelled. Exposed so a consumer reading a
 * structural warning can reach the published structure it came from.
 *
 * @example
 * ```ts
 * import { findMessageStructureDefinition } from "@cosyte/hl7";
 * const def = findMessageStructureDefinition("ORU", "R01");
 * console.log(def?.structureId); // "ORU_R01"
 * ```
 */
export function findMessageStructureDefinition(
  messageCode: string,
  triggerEvent: string,
): MessageStructureDefinition | undefined {
  return findDefinition(messageCode, triggerEvent);
}
