/**
 * The MEASURED shape of the serialized message projection: one declaration the
 * JSON Schema renderer and the Zod renderer both read, so the two artifacts
 * cannot disagree about a member name or about whether a member is optional.
 *
 * MEASURED, NOT TRANSCRIBED. Every member below was read off a live
 * `Hl7Message.toJSON()` over the repository's canonical fixture corpus, not off
 * the TypeScript declarations that describe it, and the two do not agree. The
 * `EncodingCharacters` interface declares an OPTIONAL `truncation` member and
 * `emitJson` copies exactly five keys, never that one, so a v2.7 message whose
 * MSH-2 carries five encoding characters has `truncation` on
 * `msg.encodingCharacters` and NOT on `msg.toJSON().encodingCharacters`. A
 * schema transcribed from the declaration would describe a member the
 * projection cannot contain. `test/schema-emit-fidelity.test.ts` re-measures
 * this on every run rather than trusting the paragraph.
 *
 * The warning codes are read from the registry rather than listed here, so a
 * code added to or removed from `WARNING_CODES` moves the emitted constraint
 * with it and needs no edit in this file.
 *
 * DECLARATION ORDER IS LOAD-BEARING. The Zod renderer emits one `const` per
 * object in this order and a `const` is in its temporal dead zone until it is
 * evaluated, so a definition must be declared before the definition that
 * references it. `objects` is therefore ordered leaves first, root last.
 */

import { WARNING_CODES } from "../../parser/warnings.js";

/**
 * One node in the measured shape: a scalar, an enumeration of string values, an
 * array of another node, or a reference to a named object.
 *
 * @internal
 */
export type ShapeNode =
  | { readonly kind: "string" }
  | { readonly kind: "boolean" }
  | { readonly kind: "integer" }
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "array"; readonly items: ShapeNode }
  | { readonly kind: "ref"; readonly name: string };

/**
 * One member of a named object in the measured shape. `optional` is true only
 * where a live projection of the fixture corpus omitted the member on at least
 * one message.
 *
 * @internal
 */
export interface ShapeMember {
  readonly name: string;
  readonly optional: boolean;
  readonly node: ShapeNode;
}

/**
 * A named object in the measured shape. The name becomes a `$defs` key in the
 * emitted JSON Schema and a `const` name in the emitted Zod source.
 *
 * @internal
 */
export interface ShapeObject {
  readonly name: string;
  readonly members: readonly ShapeMember[];
}

/**
 * The whole measured shape: the reusable definitions its members reference,
 * leaves first, plus the one object that describes a complete projection.
 *
 * Kept as two fields rather than one list plus a root NAME so no renderer has
 * to look the root up and no renderer carries a branch for the case where the
 * lookup misses.
 *
 * @internal
 */
export interface ProjectionShape {
  readonly definitions: readonly ShapeObject[];
  readonly root: ShapeObject;
}

/**
 * Every named object in the shape, in an order where a definition is always
 * declared before anything that references it.
 *
 * @internal
 */
export function shapeObjects(shape: ProjectionShape): readonly ShapeObject[] {
  return [...shape.definitions, shape.root];
}

const STRING: ShapeNode = { kind: "string" };
const BOOLEAN: ShapeNode = { kind: "boolean" };
const INTEGER: ShapeNode = { kind: "integer" };

/** An array of `node`. */
function arrayOf(node: ShapeNode): ShapeNode {
  return { kind: "array", items: node };
}

/** A reference to the named object. */
function ref(name: string): ShapeNode {
  return { kind: "ref", name };
}

/** A required member. */
function required(name: string, node: ShapeNode): ShapeMember {
  return { name, optional: false, node };
}

/** A member a live projection omitted on at least one message. */
function optional(name: string, node: ShapeNode): ShapeMember {
  return { name, optional: true, node };
}

/**
 * Every code the warning registry defines, sorted so the emitted constraint is
 * stable against the order the registry happens to declare them in. Set
 * equality with the registry is what the fidelity check asserts; the ordering
 * is only about a stable diff.
 */
const WARNING_CODE_VALUES: readonly string[] = Object.values(WARNING_CODES)
  .slice()
  .sort((a, b) => a.localeCompare(b, "en"));

/**
 * The measured shape of `Hl7Message.toJSON()`, read off live projections rather
 * than off the TypeScript declarations. Both emitters render this and nothing
 * else, which is what makes them agree member for member.
 *
 * @internal
 */
export const SERIALIZED_MESSAGE_SHAPE: ProjectionShape = {
  definitions: [
    {
      // Exactly the five keys `emitJson` copies. `truncation` is declared on
      // the EncodingCharacters interface and is never copied, so it is absent
      // here on purpose: see this module's opening note.
      name: "SerializedEncodingCharacters",
      members: [
        required("field", STRING),
        required("component", STRING),
        required("repetition", STRING),
        required("escape", STRING),
        required("subcomponent", STRING),
      ],
    },
    {
      name: "SerializedComponent",
      members: [required("subcomponents", arrayOf(STRING))],
    },
    {
      name: "SerializedRepetition",
      members: [required("components", arrayOf(ref("SerializedComponent")))],
    },
    {
      name: "SerializedField",
      members: [
        required("repetitions", arrayOf(ref("SerializedRepetition"))),
        required("isNull", BOOLEAN),
      ],
    },
    {
      name: "SerializedSegment",
      members: [required("name", STRING), required("fields", arrayOf(ref("SerializedField")))],
    },
    {
      // `segmentIndex` is the only index every warning carries; the other four
      // are populated only as deep as the finding reaches.
      name: "SerializedPosition",
      members: [
        required("segmentIndex", INTEGER),
        optional("fieldIndex", INTEGER),
        optional("repetitionIndex", INTEGER),
        optional("componentIndex", INTEGER),
        optional("subcomponentIndex", INTEGER),
      ],
    },
    {
      name: "SerializedWarning",
      members: [
        required("code", { kind: "enum", values: WARNING_CODE_VALUES }),
        required("message", STRING),
        required("position", ref("SerializedPosition")),
      ],
    },
    {
      name: "SerializedProfile",
      members: [required("name", STRING), required("lineage", arrayOf(STRING))],
    },
  ],
  // The warnings array is ALWAYS present, empty included; `profile` is the one
  // member the projection omits outright when no profile was applied.
  root: {
    name: "SerializedMessage",
    members: [
      required("encodingCharacters", ref("SerializedEncodingCharacters")),
      required("segments", arrayOf(ref("SerializedSegment"))),
      required("warnings", arrayOf(ref("SerializedWarning"))),
      optional("profile", ref("SerializedProfile")),
    ],
  },
};
