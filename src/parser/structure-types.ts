/**
 * The public types behind the message-structure safety net.
 *
 * They live in their own module because the shipped registry is GENERATED:
 * `generated/message-structures.ts` is written by a script from the vendored
 * publication snapshot, and it needs these types without importing the module
 * that consumes it.
 *
 * Zero runtime deps: types only, no values.
 */

/**
 * How one registry entry's expectations were obtained.
 *
 * `"published"` means every expectation was read off HL7's own machine-readable
 * structure definitions. `"retained-transcription"` means the publication
 * carries no structure for the pair at all and the previous hand transcription
 * was kept rather than dropped; such an entry always carries the reason.
 */
export type StructureDerivation = "published" | "retained-transcription";

/**
 * One expected segment for a recognized message type.
 *
 * The published structure definition gives `requiredSegment` a minimum of one
 * along the whole path from the structure root, in every variant of the
 * referenced structure's family, so a structurally conformant message always
 * carries it. `name` and `anchorSegments` carry the same segment: they are the
 * long-standing shape of this type and a group is now exactly one required
 * segment, because the derivation works segment by segment rather than by
 * hand-picked bundle.
 */
export interface ExpectedSegmentGroup {
  /** The expectation's label, which is the required segment's name. */
  readonly name: string;
  /** The segment name(s) whose presence satisfies this expectation. */
  readonly anchorSegments: readonly string[];
  /** The segment the published structure gives a minimum of one. */
  readonly requiredSegment: string;
}

/**
 * The expected structure of one recognized message type.
 *
 * An entry covers one message code and the trigger events the publication maps
 * to a single structure. An empty `triggerEvents` list means "match on message
 * code alone" (used for `ACK`, whose MSH-9.2 carries the acknowledged message's
 * trigger event rather than one of its own).
 */
export interface MessageStructureDefinition {
  /** MSH-9.1 message code, e.g. `"ORU"`. */
  readonly messageCode: string;
  /**
   * The MSH-9.2 trigger events this definition applies to, e.g. `["R01"]`.
   * An empty list means "match on message code alone" (e.g. `ACK`).
   */
  readonly triggerEvents: readonly string[];
  /** One entry per segment the published structure requires. */
  readonly expectedGroups: readonly ExpectedSegmentGroup[];
  /** The required segment names, sorted: the same set, flattened. */
  readonly requiredSegments: readonly string[];
  /**
   * The published structure id these expectations were derived from, e.g.
   * `"ADT_A01"`. Empty for a retained transcription.
   */
  readonly structureId: string;
  /**
   * Every member of that structure's variant family that was actually read,
   * e.g. `["ADT_A01-A", "ADT_A01-B", "ADT_A01-C", "ADT_A01-D"]`. Empty for a
   * retained transcription.
   */
  readonly structureIds: readonly string[];
  /** Whether the expectations were derived or retained. */
  readonly derivation: StructureDerivation;
  /**
   * Why a retained transcription could not be derived from the publication.
   * Empty string for a derived entry.
   */
  readonly retainedReason: string;
}

/**
 * One vendored publication file the shipped registry was derived from.
 */
export interface StructureSnapshotFile {
  /** Path relative to the vendored snapshot directory. */
  readonly path: string;
  /** Byte length of the vendored file. */
  readonly bytes: number;
  /** Lowercase hex sha256 of the vendored bytes. */
  readonly sha256: string;
  /** The upstream URL the bytes were fetched from. */
  readonly url: string;
}

/**
 * A referenced structure id and the variant family actually read for it.
 */
export interface StructureFamily {
  /** The structure id the publication's message list references. */
  readonly structureId: string;
  /** The family members present in the snapshot, sorted. */
  readonly members: readonly string[];
}

/**
 * One (message code, trigger event) pair and the structure it came from.
 * An empty `triggerEvent` marks an entry matched on message code alone, and an
 * empty `structureId` marks a retained transcription.
 */
export interface StructureSourcePair {
  /** MSH-9.1 message code. */
  readonly messageCode: string;
  /** MSH-9.2 trigger event, or `""` for a code-alone match. */
  readonly triggerEvent: string;
  /** The published structure id, or `""` for a retained transcription. */
  readonly structureId: string;
}

/**
 * The publication a snapshot was taken from.
 */
export interface StructurePublicationRef {
  /** Human-readable name of the publication. */
  readonly name: string;
  /** The publishing repository, e.g. `"HL7/v2ig"`. */
  readonly repository: string;
  /** Its web URL. */
  readonly repositoryUrl: string;
  /** The commit the snapshot was taken at. */
  readonly commit: string;
  /** That commit's date. */
  readonly commitDate: string;
  /** The subtree the structure definitions live in. */
  readonly tree: string;
}

/**
 * Everything needed to audit where a structural expectation came from: the
 * publication, the exact bytes, and the structure behind every recognized pair.
 */
export interface StructureRegistryProvenance {
  /** The publication the registry was derived from. */
  readonly publication: StructurePublicationRef;
  /** ISO date the snapshot was taken. */
  readonly snapshotTakenAt: string;
  /** Every vendored file the registry was derived from, with its sha256. */
  readonly files: readonly StructureSnapshotFile[];
  /** Each referenced structure id and the variant family read for it. */
  readonly families: readonly StructureFamily[];
  /** Each recognized pair and the structure id it came from. */
  readonly pairs: readonly StructureSourcePair[];
}

/**
 * The presence verdict for one expected segment of a recognized message type.
 */
export interface StructureGroup {
  /** The expectation's label from its `ExpectedSegmentGroup`, e.g. `"OBR"`. */
  readonly name: string;
  /** The anchor segment name(s) whose presence would satisfy this group. */
  readonly anchorSegments: readonly string[];
  /** The segment the published structure gives a minimum of one. */
  readonly requiredSegment: string;
  /** `true` when the required segment is present in the message. */
  readonly present: boolean;
}

/**
 * The structure summary for a parsed message: the data behind
 * `Hl7Message.structure`. For an unrecognized type, `recognized` is `false` and
 * every list is empty (the safety net is deliberately silent on types it does
 * not model).
 */
export interface MessageStructure {
  /** `true` when a `MESSAGE_STRUCTURE_DEFINITIONS` entry matched the type. */
  readonly recognized: boolean;
  /**
   * MSH-9.1 message code observed on the message. `""` when absent, and
   * `"<withheld>"` when `recognized` is `false` and the observed value is not
   * identifier-shaped (MSH-9 can hold a data field on a malformed message).
   */
  readonly messageCode: string;
  /**
   * MSH-9.2 trigger event observed on the message. `""` when absent, and
   * `"<withheld>"` when `recognized` is `false` and the observed value is not
   * identifier-shaped. Note that on the `recognized` branch this is echoed
   * verbatim, which for a definition matching on message code alone (`ACK`)
   * means an arbitrary MSH-9.2.
   */
  readonly triggerEvent: string;
  /** Per-expected-segment presence verdicts (empty when unrecognized). */
  readonly expectedGroups: readonly StructureGroup[];
  /** Names of the expectations that are absent: the warnings. */
  readonly missingGroups: readonly string[];
  /** Every segment the published structure requires (empty when unrecognized). */
  readonly requiredSegments: readonly string[];
  /** The required segments the message does not carry. */
  readonly missingSegments: readonly string[];
  /**
   * The published structure ids the verdict was derived from. Empty when the
   * type is unrecognized or the entry is a retained transcription.
   */
  readonly structureIds: readonly string[];
}
