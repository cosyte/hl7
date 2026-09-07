/**
 * Typed message overlays: the compile-time view of a message whose type the
 * runtime has just established.
 *
 * A parsed `Hl7Message` says what it is through `meta.messageCode` and
 * `meta.triggerEvent`, both `string | undefined`, and a `switch` on them leaves
 * every later access as widely typed as it was before. `msg.is("ADT^A01")`
 * closes that gap: it answers at run time from the pair the parser extracted
 * from MSH-9, and narrows to {@link TypedMessage} for the compiler, whose
 * `part` / `parts` accessors are scoped to the segment names that pair's
 * published structure marks required.
 *
 * Two properties keep the overlay honest, and both are the reason it is
 * deliberately thin:
 *
 * - **The key set is derived, never hand-listed.** {@link SUPPORTED_OVERLAY_MESSAGES}
 *   is computed from the derived structure registry at module load, so it can
 *   never claim a pair the structure net does not recognize, in either
 *   direction.
 * - **No accessor is typed as guaranteed-present.** The parser is deliberately
 *   lenient, and a real `ADT^A01` arrives with no `PID` often enough that the
 *   library warns rather than refuses. `part` therefore returns
 *   `Segment | undefined` and `parts` a possibly-empty list for every segment
 *   name, required or not: an overlay that promised presence would delete the
 *   optional chain from consumer code and turn a truncated feed into a crash.
 *
 * Zero runtime deps: pure data derived from the registry, plus one pure lookup.
 */

import { MESSAGE_STRUCTURE_DEFINITIONS } from "../parser/message-structure.js";
import type { Meta } from "../helpers/types.js";

import type { Hl7Message } from "./message.js";
import type { Segment } from "./segment.js";

/**
 * Every published overlay key, mapped to the segment names the pair's published
 * structure marks required. This is the compile-time face of the derived
 * structure registry: the runtime support claim
 * ({@link SUPPORTED_OVERLAY_MESSAGES}) is computed from that registry, and a
 * test compares the two in both directions so this table can never claim a pair
 * the registry does not recognize.
 *
 * A key is `"<MSH-9.1>^<MSH-9.2>"` (`"ADT^A01"`), or `"<MSH-9.1>"` alone for a
 * registry entry that matches on message code alone (`"ACK"`, whose MSH-9.2
 * carries the acknowledged message's trigger event rather than one of its own).
 *
 * @example
 * ```ts
 * import type { OverlayStructures } from "@cosyte/hl7";
 * // The required segments for one pair, at the type level:
 * type A01 = OverlayStructures["ADT^A01"]; // readonly ["EVN", "MSH", "PID", "PV1"]
 * ```
 */
export interface OverlayStructures {
  readonly ACK: readonly ["MSA", "MSH"];
  readonly "ADT^A01": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A02": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A03": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A04": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A05": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A06": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A07": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A08": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A09": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A10": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A11": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A12": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A13": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A14": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A15": readonly ["EVN", "MSH", "PID", "PRT", "PV1"];
  readonly "ADT^A16": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A17": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A20": readonly ["EVN", "MSH", "NPU"];
  readonly "ADT^A21": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A22": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A23": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A24": readonly ["EVN", "MSH", "PID"];
  readonly "ADT^A25": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A26": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A27": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A28": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A29": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A31": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A32": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A33": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A37": readonly ["EVN", "MSH", "PID"];
  readonly "ADT^A38": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A40": readonly ["EVN", "MRG", "MSH", "PID"];
  readonly "ADT^A41": readonly ["EVN", "MRG", "MSH", "PID"];
  readonly "ADT^A42": readonly ["EVN", "MRG", "MSH", "PID"];
  readonly "ADT^A43": readonly ["EVN", "MRG", "MSH", "PID"];
  readonly "ADT^A44": readonly ["EVN", "MRG", "MSH", "PID"];
  readonly "ADT^A45": readonly ["EVN", "MRG", "MSH", "PID", "PV1"];
  readonly "ADT^A47": readonly ["EVN", "MRG", "MSH", "PID"];
  readonly "ADT^A49": readonly ["EVN", "MRG", "MSH", "PID"];
  readonly "ADT^A50": readonly ["EVN", "MRG", "MSH", "PID", "PV1"];
  readonly "ADT^A51": readonly ["EVN", "MRG", "MSH", "PID", "PV1"];
  readonly "ADT^A52": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A53": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A54": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A55": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A60": readonly ["EVN", "MSH", "PID"];
  readonly "ADT^A61": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "ADT^A62": readonly ["EVN", "MSH", "PID", "PV1"];
  readonly "DFT^P03": readonly ["EVN", "FT1", "MSH", "PID"];
  readonly "DFT^P11": readonly ["EVN", "FT1", "MSH", "PID"];
  readonly "MDM^T01": readonly ["EVN", "MSH", "PID", "PV1", "TXA"];
  readonly "MDM^T02": readonly ["EVN", "MSH", "OBX", "PID", "PV1", "TXA"];
  readonly "MDM^T03": readonly ["EVN", "MSH", "PID", "PV1", "TXA"];
  readonly "MDM^T04": readonly ["EVN", "MSH", "OBX", "PID", "PV1", "TXA"];
  readonly "MDM^T05": readonly ["EVN", "MSH", "PID", "PV1", "TXA"];
  readonly "MDM^T06": readonly ["EVN", "MSH", "OBX", "PID", "PV1", "TXA"];
  readonly "MDM^T07": readonly ["EVN", "MSH", "PID", "PV1", "TXA"];
  readonly "MDM^T08": readonly ["EVN", "MSH", "OBX", "PID", "PV1", "TXA"];
  readonly "MDM^T09": readonly ["EVN", "MSH", "PID", "PV1", "TXA"];
  readonly "MDM^T10": readonly ["EVN", "MSH", "OBX", "PID", "PV1", "TXA"];
  readonly "MDM^T11": readonly ["EVN", "MSH", "PID", "PV1", "TXA"];
  readonly "OMG^O19": readonly ["MSH", "OBR", "ORC"];
  readonly "OMI^O23": readonly ["IPC", "MSH", "OBR", "ORC"];
  readonly "OML^O21": readonly ["MSH", "ORC"];
  readonly "OML^O33": readonly ["MSH", "ORC", "SPM"];
  readonly "OML^O35": readonly ["MSH", "ORC", "SAC", "SPM"];
  readonly "OML^O39": readonly ["MSH", "ORC"];
  readonly "OML^O59_A": readonly ["MSH", "ORC"];
  readonly "OMP^O09": readonly ["MSH", "ORC", "RXO", "RXR"];
  readonly "ORM^O01": readonly ["ORC"];
  readonly "ORU^R01": readonly ["MSH", "OBR"];
  readonly "ORU^R30": readonly ["MSH", "OBR", "OBX", "ORC", "PID"];
  readonly "ORU^R31": readonly ["MSH", "OBR", "OBX", "ORC", "PID"];
  readonly "ORU^R32": readonly ["MSH", "OBR", "OBX", "ORC", "PID"];
  readonly "ORU^R40": readonly ["MSH", "OBR"];
  readonly "ORU^R42": readonly ["MSH", "OBR"];
  readonly "ORU^R43": readonly ["MSH", "OBR"];
  readonly "SIU^S12": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S13": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S14": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S15": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S16": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S17": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S18": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S19": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S20": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S21": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S22": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S23": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S24": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S26": readonly ["MSH", "RGS", "SCH"];
  readonly "SIU^S27": readonly ["MSH", "RGS", "SCH"];
  readonly "VXU^V04": readonly ["MSH", "PID"];
}

/**
 * Every string {@link Hl7Message.is} narrows on: one key per (message code,
 * trigger event) pair the structure registry recognizes, plus a code-only key
 * for each registry entry that matches on message code alone.
 *
 * Any other string is a documented `false`, never a throw: the three-component
 * MSH-9 form (`"ADT^A01^ADT_A01"`) is not a key, because `is` compares the pair
 * the parser already extracted rather than parsing its own argument, and a
 * caller who wants a raw comparison has `msg.meta.type`.
 *
 * @example
 * ```ts
 * import type { OverlayKey } from "@cosyte/hl7";
 * const key: OverlayKey = "ORU^R01";
 * // const nope: OverlayKey = "ADT^A01^ADT_A01"; // not a key: does not compile
 * ```
 */
export type OverlayKey = keyof OverlayStructures;

/**
 * The segment names one overlay key's published structure marks required: the
 * names `part` and `parts` accept on a message narrowed to that key.
 *
 * @example
 * ```ts
 * import type { OverlayRequiredSegment } from "@cosyte/hl7";
 * type A01Segments = OverlayRequiredSegment<"ADT^A01">; // "EVN" | "MSH" | "PID" | "PV1"
 * ```
 */
export type OverlayRequiredSegment<K extends OverlayKey> = OverlayStructures[K][number];

/**
 * The MSH-9.1 message code one overlay key names, as a literal type.
 *
 * @example
 * ```ts
 * import type { OverlayMessageCode } from "@cosyte/hl7";
 * type Code = OverlayMessageCode<"ORU^R01">; // "ORU"
 * ```
 */
export type OverlayMessageCode<K extends OverlayKey> = K extends `${infer C}^${string}` ? C : K;

/**
 * The MSH-9.2 trigger event one overlay key names, as a literal type, or
 * `never` for a code-only key. A code-only key (`"ACK"`) constrains MSH-9.2 to
 * nothing at all, since it carries the acknowledged message's trigger event, so
 * a message narrowed to one keeps the base `triggerEvent?: string`.
 *
 * @example
 * ```ts
 * import type { OverlayTriggerEvent } from "@cosyte/hl7";
 * type Event = OverlayTriggerEvent<"ORU^R01">; // "R01"
 * type None = OverlayTriggerEvent<"ACK">;      // never: MSH-9.2 is unconstrained
 * ```
 */
export type OverlayTriggerEvent<K extends OverlayKey> = K extends `${string}^${infer E}`
  ? E
  : never;

/**
 * `Meta` with the message code (and, for a key that names one, the trigger
 * event) at the literal type the key established. Every other member is the
 * `Meta` member unchanged: narrowing a message type says nothing about whether
 * the sender populated MSH-10 or MSH-7.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * if (msg.is("ADT^A01")) {
 *   const code: "ADT" = msg.meta.messageCode; // no cast, no optional chain
 *   const event: "A01" = msg.meta.triggerEvent;
 *   console.log(code, event, msg.meta.controlId); // controlId is still optional
 * }
 * ```
 */
export type TypedMeta<K extends OverlayKey> = Omit<Meta, "messageCode" | "triggerEvent"> & {
  readonly messageCode: OverlayMessageCode<K>;
} & ([OverlayTriggerEvent<K>] extends [never]
    ? Pick<Meta, "triggerEvent">
    : { readonly triggerEvent: OverlayTriggerEvent<K> });

/**
 * A parsed message narrowed to one overlay key: every `Hl7Message` member
 * unchanged, the message code and trigger event at literal types, and `part` /
 * `parts` scoped at compile time to the segment names that pair's published
 * structure marks required.
 *
 * It is a view, not a subclass: `msg.is(key)` narrows the message you already
 * have, allocates nothing, and changes no runtime behaviour. Nothing here is
 * typed as guaranteed-present, because the parser tolerates a message that
 * omits a required segment (and warns); `part` returns `Segment | undefined`
 * and `parts` a possibly-empty list, exactly as `segments` does.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * if (msg.is("ORU^R01")) {
 *   const obr = msg.part("OBR"); // Segment | undefined, no cast
 *   console.log(obr?.field(4).value);
 *   // msg.part("PID"); // does not compile: PID is not required for ORU^R01
 *   console.log(msg.segments("PID").length); // the base accessor takes any name
 * }
 * ```
 */
export interface TypedMessage<K extends OverlayKey> extends Hl7Message {
  /** MSH-derived metadata, with the message type at the key's literal types. */
  readonly meta: TypedMeta<K>;
  /** The first segment of `name`, or `undefined` when the message carries none. */
  part(name: OverlayRequiredSegment<K>): Segment | undefined;
  /** Every segment of `name` in document order; empty when there are none. */
  parts(name: OverlayRequiredSegment<K>): readonly Segment[];
}

/**
 * One published overlay key, with the message type it matches and the segments
 * the published structure requires for it.
 *
 * `triggerEvent` is the empty string for a key the registry matches on message
 * code alone (`ACK`), and {@link Hl7Message.is} then answers `true` for that key
 * whatever MSH-9.2 carries, in the same way `supportsBuilderMessage` treats a
 * code-only registry entry.
 *
 * @example
 * ```ts
 * import { SUPPORTED_OVERLAY_MESSAGES } from "@cosyte/hl7";
 * const oru = SUPPORTED_OVERLAY_MESSAGES.find((m) => m.key === "ORU^R01");
 * console.log(oru?.messageCode, oru?.triggerEvent); // "ORU" "R01"
 * console.log(oru?.requiredSegments); // ["MSH", "OBR"]
 * ```
 */
export interface SupportedOverlayMessage {
  /** The overlay key, e.g. `"ORU^R01"` or the code-only `"ACK"`. */
  readonly key: string;
  /** MSH-9.1 message code. */
  readonly messageCode: string;
  /** MSH-9.2 trigger event; `""` when the registry matches on message code alone. */
  readonly triggerEvent: string;
  /** The segments the derived structure registry marks required for this key. */
  readonly requiredSegments: readonly string[];
}

/** Expand the registry into one entry per published overlay key. @internal */
function deriveOverlayMessages(): readonly SupportedOverlayMessage[] {
  const out: SupportedOverlayMessage[] = [];
  for (const def of MESSAGE_STRUCTURE_DEFINITIONS) {
    // An empty trigger-event list means "match on message code alone", which
    // is a code-only key rather than no key at all.
    const events = def.triggerEvents.length === 0 ? [""] : def.triggerEvents;
    for (const triggerEvent of events) {
      out.push(
        Object.freeze({
          key: triggerEvent === "" ? def.messageCode : `${def.messageCode}^${triggerEvent}`,
          messageCode: def.messageCode,
          triggerEvent,
          requiredSegments: def.requiredSegments,
        }),
      );
    }
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return Object.freeze(out);
}

/**
 * The published support claim for typed message overlays: every key
 * {@link Hl7Message.is} narrows on, with the segments that pair's published
 * structure requires. Frozen, and derived from the structure registry at module
 * load rather than hand-listed, so it can never claim a pair the structure net
 * does not recognize.
 *
 * @example
 * ```ts
 * import { SUPPORTED_OVERLAY_MESSAGES } from "@cosyte/hl7";
 * console.log(SUPPORTED_OVERLAY_MESSAGES.length); // one entry per published key
 * for (const m of SUPPORTED_OVERLAY_MESSAGES) console.log(m.key, m.requiredSegments);
 * ```
 */
export const SUPPORTED_OVERLAY_MESSAGES: readonly SupportedOverlayMessage[] =
  deriveOverlayMessages();

/** Key to claim entry, for the constant-time match behind `is`. @internal */
const OVERLAY_BY_KEY: ReadonlyMap<string, SupportedOverlayMessage> = new Map(
  SUPPORTED_OVERLAY_MESSAGES.map((m) => [m.key, m]),
);

/**
 * Does `key` name the (message code, trigger event) pair a message declared?
 * The comparison is on the pair the parser extracted, never on the raw MSH-9
 * string: a three-component `"ADT^A01^ADT_A01"` message matches the key
 * `"ADT^A01"`, and the string `"ADT^A01^ADT_A01"` matches no key at all.
 *
 * Pure and total: an unpublished key, an absent message code or an absent
 * trigger event is `false`, never a throw. A key the registry matches on
 * message code alone matches whatever MSH-9.2 carries, including nothing.
 *
 * @internal
 */
export function matchesOverlayKey(
  key: string,
  messageCode: string | undefined,
  triggerEvent: string | undefined,
): boolean {
  const entry = OVERLAY_BY_KEY.get(key);
  if (entry === undefined) return false;
  if (entry.messageCode !== messageCode) return false;
  return entry.triggerEvent === "" || entry.triggerEvent === triggerEvent;
}
