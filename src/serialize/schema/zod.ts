/**
 * Zod emission for the serialized message projection, as TypeScript SOURCE
 * TEXT.
 *
 * TEXT, NEVER A VALUE. This module builds a string. It does not import `zod`,
 * does not reference a `zod` value, and does not require `zod` to be installed
 * for anything in this package to build, typecheck, lint or run. `@cosyte/hl7`
 * ships zero runtime dependencies and the emitted `import { z } from "zod"` is
 * a line of text a consumer pastes into their own codebase, where their own
 * `zod` install resolves it.
 *
 * IT VALIDATES NOTHING, for the same reason the JSON Schema emitter does not:
 * the artifact is a description handed to the caller, and what the caller does
 * with it is theirs.
 *
 * THE TEXT IS RENDERED, NOT FORMATTED. Running the repository's formatter over
 * it would put a development dependency on the library's own hot path, so the
 * layout below is produced directly and is what the committed artifact holds
 * byte for byte.
 */

import { SERIALIZED_MESSAGE_SHAPE, shapeObjects, type ShapeNode } from "./shape.js";

/** The module specifier the emitted source imports from. */
const ZOD_MODULE = "zod";

/** Two spaces per level, matching the repository's own formatting width. */
const INDENT = "  ";

/**
 * Render one string as a TypeScript double-quoted literal. Delegated to
 * `JSON.stringify` so an escape is the engine's business, not this module's.
 */
function literal(value: string): string {
  return JSON.stringify(value);
}

/** The `const` name a named object is emitted under. */
function schemaConst(name: string): string {
  return `${name}Schema`;
}

/**
 * Render one shape node as a Zod expression.
 *
 * `indent` is the leading whitespace the expression's FIRST line already sits
 * behind, so a multi-line expression can indent its continuation lines to match.
 * An enumeration is the only node that goes multi-line: the warning registry
 * carries twenty codes and one line of them reads as a wall rather than a list.
 */
function renderNode(node: ShapeNode, indent: string): string {
  switch (node.kind) {
    case "string":
      return "z.string()";
    case "boolean":
      return "z.boolean()";
    case "integer":
      return "z.number().int()";
    case "enum": {
      const items = node.values.map((value) => `${indent}${INDENT}${literal(value)},`).join("\n");
      return `z.enum([\n${items}\n${indent}])`;
    }
    case "array":
      return `z.array(${renderNode(node.items, indent)})`;
    case "ref":
      return schemaConst(node.name);
  }
}

/**
 * Render the whole Zod module for the serialized message projection.
 *
 * Pure and repeatable: it reads the measured shape and the warning-code
 * registry, nothing else. It parses no message, reads no network, and two calls
 * in one process return the identical string whatever happened between them.
 *
 * The output declares exactly one import, whose module specifier is `zod`, one
 * `const` per named object in an order where a definition always precedes the
 * definition that references it, and one inferred type alias for the
 * projection.
 *
 * @example
 * ```ts
 * import { messageZodSource } from "@cosyte/hl7";
 * const source = messageZodSource();
 * source.startsWith("//");                       // a header comment
 * source.includes('import { z } from "zod";');   // the single import
 * source.includes("export const SerializedMessageSchema");
 * ```
 */
export function messageZodSource(): string {
  const lines: string[] = [
    "// Zod schemas for the @cosyte/hl7 serialized message projection: the object",
    "// `Hl7Message.toJSON()` returns.",
    "//",
    "// GENERATED FILE. DO NOT EDIT BY HAND. `@cosyte/hl7` emits it from the shape",
    "// its own serializer produces, so an edit here is an edit the emitter does not",
    "// reproduce. Regenerate with `pnpm generate:schema`.",
    "//",
    "// `zod` is a dependency of YOUR project, not of @cosyte/hl7, which ships none.",
    "",
    `import { z } from ${literal(ZOD_MODULE)};`,
    "",
  ];

  for (const object of shapeObjects(SERIALIZED_MESSAGE_SHAPE)) {
    lines.push(`export const ${schemaConst(object.name)} = z`);
    lines.push(`${INDENT}.object({`);
    const memberIndent = `${INDENT}${INDENT}`;
    for (const member of object.members) {
      const expression = renderNode(member.node, memberIndent);
      const suffix = member.optional ? ".optional()" : "";
      lines.push(`${memberIndent}${member.name}: ${expression}${suffix},`);
    }
    lines.push(`${INDENT}})`);
    // `.strict()` is the Zod spelling of the JSON Schema document's
    // `additionalProperties: false`: the projection carries a fixed key set at
    // every level, so a member outside it is not something it can hold.
    lines.push(`${INDENT}.strict();`);
    lines.push("");
  }

  const root = schemaConst(SERIALIZED_MESSAGE_SHAPE.root.name);
  lines.push(`export type ${SERIALIZED_MESSAGE_SHAPE.root.name} = z.infer<typeof ${root}>;`);
  return `${lines.join("\n")}\n`;
}
