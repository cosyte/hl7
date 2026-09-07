/**
 * The named-target entry point for schema emission, and the typed error a
 * target this library does not support raises.
 *
 * A TARGET NAMES THE FORMAT AND THE DIALECT TOGETHER. `json-schema-2020-12` is
 * one name, not a format plus a separate dialect argument, so an unrecognised
 * format (`openapi`) and an unrecognised dialect of a recognised format
 * (`json-schema-draft-07`) are the same kind of mistake and take the same
 * route: a throw naming what was asked for and what is on offer. A partial or
 * empty artifact is never returned.
 */

import { messageJsonSchema } from "./json-schema.js";
import { messageZodSource } from "./zod.js";

/**
 * Every emission target this library supports, as a caller names it.
 *
 * @example
 * ```ts
 * import { SCHEMA_EMIT_TARGETS } from "@cosyte/hl7";
 * SCHEMA_EMIT_TARGETS.includes("zod"); // true
 * ```
 */
export const SCHEMA_EMIT_TARGETS = ["json-schema-2020-12", "zod"] as const;

/**
 * One of the emission targets this library supports.
 *
 * @example
 * ```ts
 * import { emitMessageSchema, type SchemaEmitTarget } from "@cosyte/hl7";
 * const target: SchemaEmitTarget = "json-schema-2020-12";
 * emitMessageSchema(target).startsWith("{");
 * ```
 */
export type SchemaEmitTarget = (typeof SCHEMA_EMIT_TARGETS)[number];

/**
 * Thrown when emission is requested for a target this library does not support.
 * Carries the requested name and the supported set as data as well as in the
 * message, so a caller can react without parsing prose.
 *
 * @example
 * ```ts
 * import { emitMessageSchema, SchemaTargetError } from "@cosyte/hl7";
 * try {
 *   emitMessageSchema("openapi-3.1");
 * } catch (error) {
 *   if (error instanceof SchemaTargetError) {
 *     error.requestedTarget; // "openapi-3.1"
 *     error.supportedTargets; // ["json-schema-2020-12", "zod"]
 *   }
 * }
 * ```
 */
export class SchemaTargetError extends Error {
  /** The target name the caller asked for, verbatim. */
  public readonly requestedTarget: string;
  /** Every target this library does support. */
  public readonly supportedTargets: readonly SchemaEmitTarget[];

  /** Build the error for one unsupported target name. */
  public constructor(requestedTarget: string) {
    super(
      `Unsupported schema emission target ${JSON.stringify(requestedTarget)}. ` +
        `Supported targets: ${SCHEMA_EMIT_TARGETS.join(", ")}.`,
    );
    this.name = "SchemaTargetError";
    this.requestedTarget = requestedTarget;
    this.supportedTargets = SCHEMA_EMIT_TARGETS;
  }
}

/**
 * Whether a name is one of the supported emission targets.
 *
 * @example
 * ```ts
 * import { isSchemaEmitTarget } from "@cosyte/hl7";
 * isSchemaEmitTarget("zod");         // true
 * isSchemaEmitTarget("json-schema"); // false
 * ```
 */
export function isSchemaEmitTarget(name: string): name is SchemaEmitTarget {
  return SCHEMA_EMIT_TARGETS.some((target) => target === name);
}

/**
 * Emit the named artifact for the serialized message projection, as text.
 *
 * `json-schema-2020-12` returns the JSON Schema document serialized with
 * two-space indentation and a trailing newline; `zod` returns the TypeScript
 * source text. Any other name throws {@link SchemaTargetError} and returns
 * nothing at all.
 *
 * Pure and repeatable: no message is read, no network is touched, and two calls
 * for the same target in one process return the identical string.
 *
 * @example
 * ```ts
 * import { emitMessageSchema } from "@cosyte/hl7";
 * const schema = emitMessageSchema("json-schema-2020-12");
 * const zod = emitMessageSchema("zod");
 * schema === emitMessageSchema("json-schema-2020-12"); // true
 * zod.includes("import { z } from \"zod\";");          // true
 * ```
 */
export function emitMessageSchema(target: string): string {
  if (target === "json-schema-2020-12") {
    return `${JSON.stringify(messageJsonSchema(), null, 2)}\n`;
  }
  if (target === "zod") return messageZodSource();
  throw new SchemaTargetError(target);
}
