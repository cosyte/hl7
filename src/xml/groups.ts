/**
 * Segment groups for the HL7 v2 XML writer: the message structures it knows the groups of, by
 * version, and the matcher that places a message's segments in a structure's groups.
 *
 * The v2 XML encoding writes each segment group as its own element, named for the message
 * structure and the group (`ORU_R01.PATIENT_RESULT`). The group names come from the schemas
 * published for each version, not from the chapter text, which leaves some groups unnamed. So the
 * writer only knows the structures listed in {@link XML_GROUP_TABLES} and takes any other from
 * its caller.
 */

import type { RawSegment } from "../parser/types.js";

import { Hl7XmlError, XML_ERROR_CODES } from "./errors.js";

/**
 * One item of a message structure or of a group in it: a segment id (`"PID"`), or a group. A
 * segment id may end in a cardinality: `?` for at most once, `*` for any number, `+` for at least
 * once, none for exactly once (`"SFT*"`, `"PD1?"`).
 *
 * @example
 * ```ts
 * import type { XmlStructureItem } from "@cosyte/hl7";
 * const items: XmlStructureItem[] = ["OBX", "NTE*"];
 * ```
 */
export type XmlStructureItem = string | XmlGroupDefinition;

/**
 * One segment group: its name without the structure prefix, ending in a cardinality as a segment
 * id may (`"ORDER_OBSERVATION+"`), and its items in order. The writer names its element
 * `STRUCTURE.GROUP` (`ORU_R01.ORDER_OBSERVATION`).
 *
 * @example
 * ```ts
 * import type { XmlGroupDefinition } from "@cosyte/hl7";
 * const observation: XmlGroupDefinition = { group: "OBSERVATION*", items: ["OBX", "NTE*"] };
 * ```
 */
export interface XmlGroupDefinition {
  /** The group's name, uppercase, with an optional cardinality: `OBSERVATION*`. */
  readonly group: string;
  /** The group's segments and groups, in order. */
  readonly items: readonly XmlStructureItem[];
}

/**
 * A message structure as the v2 XML writer places segments in it: the structure id, which names
 * the root element and prefixes every group element, and its segments and groups in order.
 *
 * @example
 * ```ts
 * import type { XmlMessageStructure } from "@cosyte/hl7";
 * const ack: XmlMessageStructure = { structure: "ACK", items: ["MSH", "SFT*", "MSA", "ERR*"] };
 * ```
 */
export interface XmlMessageStructure {
  /** The message structure id, the root element's name: `ORU_R01`. */
  readonly structure: string;
  /** The structure's segments and groups, in order. */
  readonly items: readonly XmlStructureItem[];
}

/** A frozen group of a table. */
function group(name: string, items: XmlStructureItem[]): XmlGroupDefinition {
  return Object.freeze({ group: name, items: Object.freeze(items) });
}

/**
 * The ORU_R01 structure of the HL7 v2.5 XML schema (the message definition `ORU_R01.xsd` in the
 * `urn:hl7-org:v2xml` namespace), as a public copy of that schema shows it. Built on each call, so
 * the writer reads the same structure the tests pin.
 */
function oruR01V25(): XmlMessageStructure {
  return Object.freeze({
    structure: "ORU_R01",
    items: Object.freeze([
      "MSH",
      "SFT*",
      group("PATIENT_RESULT+", [
        group("PATIENT?", ["PID", "PD1?", "NTE*", "NK1*", group("VISIT?", ["PV1", "PV2?"])]),
        group("ORDER_OBSERVATION+", [
          "ORC?",
          "OBR",
          "NTE*",
          group("TIMING_QTY*", ["TQ1", "TQ2*"]),
          "CTD?",
          group("OBSERVATION*", ["OBX", "NTE*"]),
          "FT1*",
          "CTI*",
          group("SPECIMEN*", ["SPM", "OBX*"]),
        ]),
      ]),
      "DSC?",
    ]),
  });
}

/**
 * The structure the tables give `root` in `version`, or `undefined` when they cover neither.
 *
 * @internal
 */
export function groupTable(version: string, root: string): XmlMessageStructure | undefined {
  return version === "2.5" && root === "ORU_R01" ? oruR01V25() : undefined;
}

/**
 * The message structures whose groups the v2 XML writer knows, by HL7 version (MSH-12) and then
 * by structure id. Each is read from that version's published v2 XML schema. It covers ORU_R01 in
 * v2.5 only: we found no public schema for any other version or structure. `toHl7Xml` refuses any
 * other structure with `GROUPS_UNKNOWN` unless it is given one in `groups`.
 *
 * @example
 * ```ts
 * import { XML_GROUP_TABLES } from "@cosyte/hl7";
 * console.log(Object.keys(XML_GROUP_TABLES["2.5"] ?? {})); // ["ORU_R01"]
 * ```
 */
// Stryker disable all: a module constant, evaluated once when the test runner loads the module, so a mutant of it is never live; the writer reads groupTable, and a test pins this to it
export const XML_GROUP_TABLES: Readonly<
  Record<string, Readonly<Record<string, XmlMessageStructure>>>
> = Object.freeze({ "2.5": Object.freeze({ ORU_R01: oruR01V25() }) });
// Stryker restore all

/** A structure item resolved: a segment or a group, how often it may stand, and its items. */
interface Node {
  readonly name: string;
  readonly required: boolean;
  readonly repeats: boolean;
  /** A group's items; `undefined` for a segment. */
  readonly items: readonly Node[] | undefined;
}

/**
 * A group element as the writer writes it: its name and what it holds, in order.
 *
 * @internal
 */
export interface PlacedGroup {
  readonly name: string;
  readonly children: readonly (RawSegment | PlacedGroup)[];
}

/** Refuse a malformed structure. */
function invalid(message: string): never {
  throw new Hl7XmlError(XML_ERROR_CODES.INVALID_OPTIONS, message);
}

/** Split a name ending in an optional cardinality. */
function cardinality(text: string): { name: string; required: boolean; repeats: boolean } {
  const last = text.at(-1);
  if (last === "?" || last === "*" || last === "+") {
    return { name: text.slice(0, -1), required: last === "+", repeats: last !== "?" };
  }
  return { name: text, required: true, repeats: false };
}

/** Resolve a structure's items, refusing any that is malformed. */
function resolve(items: unknown, prefix: string, depth: number): readonly Node[] {
  if (!Array.isArray(items) || items.length === 0) {
    invalid("A structure or group in `groups` has no items.");
  }
  // Each group nests one element deeper, and the reader caps the depth at 64 by default.
  if (depth > 32) invalid("The groups in `groups` nest too deep.");
  return items.map((item: unknown): Node => {
    if (typeof item === "string") {
      const { name, required, repeats } = cardinality(item);
      if (!/^[A-Z][A-Z0-9]{2}$/u.test(name)) {
        invalid("A segment in `groups` is not a segment id.");
      }
      return { name, required, repeats, items: undefined };
    }
    if (typeof item !== "object" || item === null) {
      invalid("An item in `groups` is neither a segment id nor a group.");
    }
    const group = (item as { group?: unknown }).group;
    if (typeof group !== "string") invalid("A group in `groups` has no name.");
    const { name, required, repeats } = cardinality(group);
    if (!/^[A-Z][A-Z0-9_]*$/u.test(name)) {
      invalid("A group name in `groups` is not uppercase letters, digits and underscores.");
    }
    return {
      name: `${prefix}.${name}`,
      required,
      repeats,
      items: resolve((item as { items?: unknown }).items, prefix, depth + 1),
    };
  });
}

/**
 * Resolve a caller's or a table's structure, refusing a malformed one.
 *
 * @internal
 */
export function resolveStructure(structure: XmlMessageStructure): {
  readonly root: string;
  readonly items: readonly Node[];
} {
  const root: unknown = (structure as { structure?: unknown }).structure;
  if (typeof root !== "string" || !/^[A-Za-z][A-Za-z0-9_]*$/u.test(root)) {
    invalid("The structure in `groups` is not an XML name.");
  }
  return { root, items: resolve(structure.items, root, 0) };
}

/** What one sequence of items took: how far it reached and what it placed. */
interface Taken {
  readonly end: number;
  readonly placed: (RawSegment | PlacedGroup)[];
}

/**
 * Place `segments` from `start` in `items`, each item taking as many segments as it can before
 * the next is tried, the way the abstract message syntax reads. `undefined` when a required item
 * finds nothing.
 */
function take(
  items: readonly Node[],
  segments: readonly RawSegment[],
  start: number,
): Taken | undefined {
  let at = start;
  const placed: (RawSegment | PlacedGroup)[] = [];
  for (const node of items) {
    let found = false;
    do {
      if (node.items === undefined) {
        const segment = segments[at];
        if (segment?.name !== node.name) break;
        placed.push(segment);
        at++;
      } else {
        const inner = take(node.items, segments, at);
        // A group that takes no segment is absent, which also ends a repeating group's loop.
        if (inner === undefined || inner.end === at) break;
        placed.push({ name: node.name, children: inner.placed });
        at = inner.end;
      }
      found = true;
    } while (node.repeats);
    if (node.required && !found) return undefined;
  }
  return { end: at, placed };
}

/**
 * Place a message's segments in a structure's groups, in order, refusing with `STRUCTURE_MISMATCH`
 * when they do not fit it: a required segment or group is missing, or a segment stands where the
 * structure has no place for it.
 *
 * @internal
 */
export function placeSegments(
  items: readonly Node[],
  segments: readonly RawSegment[],
): readonly (RawSegment | PlacedGroup)[] {
  const taken = take(items, segments, 0);
  if (taken === undefined) {
    throw new Hl7XmlError(
      XML_ERROR_CODES.STRUCTURE_MISMATCH,
      "The message lacks a segment or group the message structure requires.",
    );
  }
  if (taken.end < segments.length) {
    throw new Hl7XmlError(
      XML_ERROR_CODES.STRUCTURE_MISMATCH,
      `Segment ${String(taken.end + 1)} of the message has no place in the message structure.`,
    );
  }
  return taken.placed;
}
