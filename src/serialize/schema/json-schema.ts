/**
 * JSON Schema emission for the serialized message projection, at the 2020-12
 * dialect.
 *
 * WHAT IT DESCRIBES AND WHAT IT DOES NOT. The document describes the object
 * `Hl7Message.toJSON()` returns: encoding characters, segments, fields,
 * repetitions, components, subcomponents, warnings and the optional profile.
 * That projection is a raw-tree mirror, so the schema is a description of that
 * mirror and carries no field-level datatype knowledge, no conformance rule and
 * no profile semantics.
 *
 * IT VALIDATES NOTHING. This module builds a document and hands it back. It
 * never evaluates a schema against a value, never inspects a message, and adds
 * no validation API; a caller who wants validation feeds the document to a
 * validator of their own choosing.
 *
 * THE KEYWORD SET IS BOUNDED ON PURPOSE. Only the core, applicator and
 * validation vocabularies are used: `$schema`, `$ref`, `$defs`, `properties`,
 * `items`, `additionalProperties`, `type`, `enum` and `required`. Nothing from
 * the meta-data vocabulary (`title`, `description`, `default`, `examples`)
 * appears, which is also what keeps the document free of any literal beyond the
 * dialect URI, the member names, the JSON type names and the warning codes the
 * registry defines.
 */

import { SERIALIZED_MESSAGE_SHAPE, type ShapeNode, type ShapeObject } from "./shape.js";

/**
 * The JSON Schema dialect the emitted document declares, and the only one this
 * library emits.
 *
 * @example
 * ```ts
 * import { JSON_SCHEMA_DIALECT, messageJsonSchema } from "@cosyte/hl7";
 * messageJsonSchema().$schema === JSON_SCHEMA_DIALECT; // true
 * ```
 */
export const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";

/**
 * One node of the emitted JSON Schema. Every member is optional because a node
 * carries only the keywords its own shape needs: a reference carries `$ref`
 * alone, a scalar carries `type`, an object carries `type`, `properties`,
 * `required` and `additionalProperties`.
 *
 * @example
 * ```ts
 * import type { JsonSchemaNode } from "@cosyte/hl7";
 * const subcomponents: JsonSchemaNode = { type: "array", items: { type: "string" } };
 * ```
 */
export interface JsonSchemaNode {
  readonly $ref?: string;
  readonly type?: "array" | "boolean" | "integer" | "object" | "string";
  readonly enum?: readonly string[];
  readonly items?: JsonSchemaNode;
  readonly properties?: Readonly<Record<string, JsonSchemaNode>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: false;
}

/**
 * The emitted JSON Schema document: the root node of the projection, plus the
 * reusable definitions its members reference.
 *
 * @example
 * ```ts
 * import { messageJsonSchema, type JsonSchemaDocument } from "@cosyte/hl7";
 * const doc: JsonSchemaDocument = messageJsonSchema();
 * Object.keys(doc.$defs).includes("SerializedWarning"); // true
 * ```
 */
export interface JsonSchemaDocument extends JsonSchemaNode {
  readonly $schema: string;
  readonly $defs: Readonly<Record<string, JsonSchemaNode>>;
}

/** Render one shape node as a schema node. */
function renderNode(node: ShapeNode): JsonSchemaNode {
  switch (node.kind) {
    case "string":
      return { type: "string" };
    case "boolean":
      return { type: "boolean" };
    case "integer":
      return { type: "integer" };
    case "enum":
      return { type: "string", enum: node.values };
    case "array":
      return { type: "array", items: renderNode(node.items) };
    case "ref":
      return { $ref: `#/$defs/${node.name}` };
  }
}

/**
 * The `properties` map and the `required` list one named object contributes.
 *
 * Split out from {@link renderObject} because the root object's members are
 * spread across the document's own top level rather than nested under a `$defs`
 * key, and both routes must produce them identically.
 */
function renderMembers(object: ShapeObject): {
  properties: Record<string, JsonSchemaNode>;
  required: string[];
} {
  const properties: Record<string, JsonSchemaNode> = {};
  const required: string[] = [];
  for (const member of object.members) {
    properties[member.name] = renderNode(member.node);
    if (!member.optional) required.push(member.name);
  }
  return { properties, required };
}

/**
 * Render one named object as a closed schema node: every member declared, the
 * non-optional ones listed in `required`, and no other member permitted.
 *
 * `additionalProperties: false` is what makes the profile constraint and the
 * encoding-characters constraint mean what they say. The projection is built by
 * a serializer that copies a fixed key set at every level, so a member outside
 * that set is not something the projection can carry.
 */
function renderObject(object: ShapeObject): JsonSchemaNode {
  const { properties, required } = renderMembers(object);
  return { type: "object", properties, required, additionalProperties: false };
}

/**
 * Build the JSON Schema document for the serialized message projection.
 *
 * Pure and repeatable: it reads the measured shape and the warning-code
 * registry, nothing else. It parses no message, reads no network and returns a
 * fresh document on every call, so two calls in one process produce equal
 * documents whatever happened between them.
 *
 * @example
 * ```ts
 * import { messageJsonSchema } from "@cosyte/hl7";
 * const schema = messageJsonSchema();
 * schema.$schema;          // "https://json-schema.org/draft/2020-12/schema"
 * schema.required;         // ["encodingCharacters", "segments", "warnings"]
 * schema.$defs["SerializedProfile"]?.additionalProperties; // false
 * ```
 */
export function messageJsonSchema(): JsonSchemaDocument {
  const definitions: Record<string, JsonSchemaNode> = {};
  for (const object of SERIALIZED_MESSAGE_SHAPE.definitions) {
    definitions[object.name] = renderObject(object);
  }
  const { properties, required } = renderMembers(SERIALIZED_MESSAGE_SHAPE.root);
  return {
    $schema: JSON_SCHEMA_DIALECT,
    type: "object",
    properties,
    required,
    additionalProperties: false,
    $defs: definitions,
  };
}
