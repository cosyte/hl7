/**
 * Lookup over the generated ordered expectations.
 *
 * The expectations are derived offline from the vendored publication snapshot
 * by `pnpm generate:structures` and committed; nothing here reads a file, makes
 * a network call, or decides anything. It exists so the validator asks for a
 * structure by id instead of scanning an 81-entry array per message.
 */

import { GENERATED_STRUCTURE_SCHEMAS } from "../parser/generated/message-structure-schemas.js";
import type { PublishedStructureSchema } from "../parser/structure-types.js";

/** Every generated ordered expectation, keyed by its published structure id. */
const SCHEMAS_BY_ID: ReadonlyMap<string, PublishedStructureSchema> = new Map(
  GENERATED_STRUCTURE_SCHEMAS.map((schema) => [schema.structureId, schema]),
);

/**
 * The ordered expectation for one published structure variant, or `undefined`
 * when the vendored snapshot carries no structure under that id.
 *
 * @internal
 */
export function findPublishedStructureSchema(
  structureId: string,
): PublishedStructureSchema | undefined {
  return SCHEMAS_BY_ID.get(structureId);
}
