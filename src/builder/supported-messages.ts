/**
 * The **published support claim** for the typed builders: which (message code,
 * trigger event) pairs `@cosyte/hl7` can author from a typed init, and which
 * segments each typed builder is able to emit.
 *
 * Two properties make the claim checkable rather than decorative:
 *
 * - **Derived, never hand-listed.** A pair is published only when the derived
 *   structure registry recognises it AND every segment that registry marks
 *   required for it can be supplied through the builder's typed init. A pair
 *   whose published structure requires a segment no init can supply (an
 *   `ADT^A15`, which requires `PRT`; an `ADT^A20`, which requires `NPU`) is
 *   therefore absent from the set by construction, not by omission.
 * - **Every published pair round-trips clean.** Building any published pair
 *   from a typed init produces a serialization that re-parses with zero
 *   warnings and an empty `structure.missingGroups`.
 *
 * A trigger event OUTSIDE the set is not rejected: a builder that takes a
 * trigger event still emits the message assembled from the content supplied,
 * exactly as before. The set is a support claim, not an allow list.
 *
 * Zero runtime deps: pure data derived from the registry at module load.
 */

import {
  MESSAGE_STRUCTURE_DEFINITIONS,
  findMessageStructureDefinition,
} from "../parser/message-structure.js";
import type { MessageStructureDefinition } from "../parser/structure-types.js";

/**
 * One typed builder's emit capability: the message code it authors and the
 * segment names its typed init can populate. The published support set is the
 * intersection of this with the derived structure registry.
 *
 * @example
 * ```ts
 * import { TYPED_BUILDER_COVERAGE } from "@cosyte/hl7";
 * const adt = TYPED_BUILDER_COVERAGE.find((c) => c.builder === "buildAdt");
 * console.log(adt?.segments.includes("MRG")); // true: prior identity is supported
 * ```
 */
export interface TypedBuilderCoverage {
  /** The exported builder function that authors this message code. */
  readonly builder: string;
  /** MSH-9.1 message code this builder authors. */
  readonly messageCode: string;
  /** Every segment name the builder's typed init can populate. */
  readonly segments: readonly string[];
  /**
   * The trigger events this builder can author, when it authors a fixed set.
   * Empty when the builder authors every trigger event the registry records for
   * its message code (the builders that take a trigger-event argument).
   */
  readonly fixedTriggerEvents: readonly string[];
}

/**
 * One (message code, trigger event) pair the typed builders can author, with
 * the builder that authors it and the segments the published structure requires
 * for it.
 *
 * `triggerEvent` is the empty string for a pair the registry matches on message
 * code alone (`ACK`, whose MSH-9.2 carries the acknowledged message's trigger
 * event); {@link supportsBuilderMessage} treats such an entry as matching any
 * trigger event for that code.
 *
 * @example
 * ```ts
 * import { SUPPORTED_BUILDER_MESSAGES } from "@cosyte/hl7";
 * const vxu = SUPPORTED_BUILDER_MESSAGES.find((m) => m.messageCode === "VXU");
 * console.log(vxu?.triggerEvent, vxu?.builder); // "V04" "buildVxu"
 * ```
 */
export interface SupportedBuilderMessage {
  /** MSH-9.1 message code. */
  readonly messageCode: string;
  /** MSH-9.2 trigger event; `""` when the registry matches on message code alone. */
  readonly triggerEvent: string;
  /** The exported builder that authors this pair. */
  readonly builder: string;
  /** The segments the derived structure registry marks required for this pair. */
  readonly requiredSegments: readonly string[];
}

/**
 * What each typed builder can emit. Frozen data, exposed so a consumer can
 * check the support claim's exclusions for themselves: a registry pair whose
 * required segments are not a subset of the matching entry's `segments` is
 * exactly the pair the support set leaves out.
 *
 * @example
 * ```ts
 * import { TYPED_BUILDER_COVERAGE, findMessageStructureDefinition } from "@cosyte/hl7";
 * const cov = TYPED_BUILDER_COVERAGE.find((c) => c.messageCode === "ADT");
 * const a20 = findMessageStructureDefinition("ADT", "A20");
 * // A20 requires NPU, which no typed init supplies, so A20 is not published:
 * console.log(a20?.requiredSegments.every((s) => cov?.segments.includes(s))); // false
 * ```
 */
export const TYPED_BUILDER_COVERAGE: readonly TypedBuilderCoverage[] = Object.freeze(
  (
    [
      {
        builder: "buildAck",
        messageCode: "ACK",
        segments: ["MSH", "MSA", "ERR"],
        fixedTriggerEvents: [""],
      },
      {
        builder: "buildAdt",
        messageCode: "ADT",
        segments: ["MSH", "EVN", "PID", "MRG", "PV1"],
        fixedTriggerEvents: [],
      },
      {
        builder: "buildDft",
        messageCode: "DFT",
        segments: ["MSH", "EVN", "PID", "PV1", "FT1"],
        fixedTriggerEvents: [],
      },
      {
        builder: "buildMdm",
        messageCode: "MDM",
        segments: ["MSH", "EVN", "PID", "PV1", "TXA", "OBX"],
        fixedTriggerEvents: [],
      },
      {
        builder: "buildOrm",
        messageCode: "ORM",
        segments: ["MSH", "PID", "ORC", "OBR", "OBX"],
        fixedTriggerEvents: ["O01"],
      },
      {
        builder: "buildOru",
        messageCode: "ORU",
        segments: ["MSH", "PID", "OBR", "OBX"],
        fixedTriggerEvents: ["R01"],
      },
      {
        builder: "buildSiu",
        messageCode: "SIU",
        segments: ["MSH", "SCH", "PID", "PV1", "RGS", "AIS", "AIG", "AIL", "AIP"],
        fixedTriggerEvents: [],
      },
      {
        builder: "buildVxu",
        messageCode: "VXU",
        segments: ["MSH", "PID", "ORC", "RXA", "RXR", "OBX"],
        fixedTriggerEvents: ["V04"],
      },
    ] satisfies TypedBuilderCoverage[]
  ).map((c) =>
    Object.freeze({
      ...c,
      segments: Object.freeze([...c.segments]),
      fixedTriggerEvents: Object.freeze([...c.fixedTriggerEvents]),
    }),
  ),
);

/**
 * The trigger events one coverage entry contributes from one registry
 * definition. A builder with a fixed set contributes only those of its events
 * the definition actually covers; a builder that takes an arbitrary trigger
 * event contributes every event the definition records. A definition with an
 * empty trigger-event list matches on message code alone, and pairs with the
 * empty trigger event. @internal
 */
function eventsFrom(
  coverage: TypedBuilderCoverage,
  def: MessageStructureDefinition,
): readonly string[] {
  if (coverage.fixedTriggerEvents.length > 0) {
    return coverage.fixedTriggerEvents.filter((ev) =>
      def.triggerEvents.length === 0 ? ev === "" : def.triggerEvents.includes(ev),
    );
  }
  return def.triggerEvents;
}

/** Derive the published set from the registry and the coverage table. @internal */
function derivePairs(): readonly SupportedBuilderMessage[] {
  const out: SupportedBuilderMessage[] = [];
  for (const coverage of TYPED_BUILDER_COVERAGE) {
    for (const def of MESSAGE_STRUCTURE_DEFINITIONS) {
      if (def.messageCode !== coverage.messageCode) continue;
      // A pair is claimed only when every segment the published structure marks
      // required is one the typed init can supply. This is the exclusion rule:
      // nothing else removes a pair from the set.
      if (!def.requiredSegments.every((seg) => coverage.segments.includes(seg))) continue;
      for (const triggerEvent of eventsFrom(coverage, def)) {
        out.push(
          Object.freeze({
            messageCode: def.messageCode,
            triggerEvent,
            builder: coverage.builder,
            requiredSegments: def.requiredSegments,
          }),
        );
      }
    }
  }
  out.sort((a, b) =>
    a.messageCode === b.messageCode
      ? a.triggerEvent.localeCompare(b.triggerEvent)
      : a.messageCode.localeCompare(b.messageCode),
  );
  return Object.freeze(out);
}

/**
 * Every (message code, trigger event) pair the typed builders can author, with
 * the builder that authors it. Frozen; derived from the structure registry, so
 * it can never claim a pair the structure net would warn on.
 *
 * @example
 * ```ts
 * import { SUPPORTED_BUILDER_MESSAGES } from "@cosyte/hl7";
 * for (const m of SUPPORTED_BUILDER_MESSAGES) {
 *   console.log(`${m.messageCode}^${m.triggerEvent}`, m.builder);
 * }
 * ```
 */
export const SUPPORTED_BUILDER_MESSAGES: readonly SupportedBuilderMessage[] = derivePairs();

/**
 * Can a typed builder author this (message code, trigger event) pair as a
 * spec-clean, zero-warning message? A published entry whose trigger event is
 * the empty string matches any trigger event for that message code.
 *
 * A `false` answer does not mean the builder refuses the event: a builder that
 * takes a trigger event still emits the content supplied. It means the library
 * does not claim the result is structurally complete.
 *
 * @param messageCode - MSH-9.1, e.g. `"SIU"`.
 * @param triggerEvent - MSH-9.2, e.g. `"S12"`.
 *
 * @example
 * ```ts
 * import { supportsBuilderMessage } from "@cosyte/hl7";
 * supportsBuilderMessage("SIU", "S12"); // true
 * supportsBuilderMessage("ADT", "A20"); // false: the structure requires NPU
 * ```
 */
export function supportsBuilderMessage(messageCode: string, triggerEvent: string): boolean {
  return SUPPORTED_BUILDER_MESSAGES.some(
    (m) =>
      m.messageCode === messageCode && (m.triggerEvent === "" || m.triggerEvent === triggerEvent),
  );
}

/**
 * Refuse a typed init that is not an object at all, before any member of it is
 * read. Named for the builder so the message points at the call site.
 * @internal
 */
export function assertTypedInit(builder: string, init: unknown): void {
  if (init === null || typeof init !== "object" || Array.isArray(init)) {
    throw new TypeError(
      `${builder}: the typed init must be an object. Received: ${describeInit(init)}.`,
    );
  }
}

/** A short, value-free description of a rejected init. @internal */
function describeInit(init: unknown): string {
  if (init === null) return "null";
  if (init === undefined) return "undefined";
  if (Array.isArray(init)) return "an array";
  return typeof init;
}

/**
 * Refuse an empty or non-string trigger event. Mirrors `buildAdt`'s existing
 * guard so every trigger-taking builder refuses the same shapes.
 * @internal
 */
export function assertTriggerEvent(builder: string, example: string, event: unknown): void {
  if (typeof event !== "string" || event.trim().length === 0) {
    throw new TypeError(
      `${builder}: \`event\` (the trigger event, e.g. ${JSON.stringify(example)}) is required ` +
        `and must be a non-empty string. Received: ${JSON.stringify(event)}.`,
    );
  }
}

/**
 * Refuse a typed init that cannot produce every segment the requested pair's
 * published structure requires, naming the message type and the missing
 * content. Applies only to pairs in the published support set: a trigger event
 * outside it is emitted from the content supplied, never rejected.
 *
 * @param builder - the builder name, for the message.
 * @param messageCode - MSH-9.1 of the message being built.
 * @param triggerEvent - MSH-9.2 of the message being built.
 * @param emitted - the segment names this init will actually produce.
 * @param suppliedBy - segment name to the init member that would supply it.
 * @internal
 */
export function assertRequiredContent(
  builder: string,
  messageCode: string,
  triggerEvent: string,
  emitted: ReadonlySet<string>,
  suppliedBy: ReadonlyMap<string, string>,
): void {
  if (!supportsBuilderMessage(messageCode, triggerEvent)) return;
  const def = findMessageStructureDefinition(messageCode, triggerEvent);
  if (def === undefined) return;
  const missing = def.requiredSegments.filter((seg) => !emitted.has(seg));
  if (missing.length === 0) return;
  const detail = missing
    .map((seg) => {
      const member = suppliedBy.get(seg);
      return member === undefined ? seg : `${seg} (\`${member}\`)`;
    })
    .join(", ");
  throw new TypeError(
    `${builder}: ${messageCode}^${triggerEvent} requires ${detail}. The published structure ` +
      `for this message type gives ${missing.join("/")} a minimum of one, so an init that ` +
      `omits it is a typed error rather than an incomplete message.`,
  );
}
