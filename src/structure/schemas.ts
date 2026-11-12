/**
 * Lookup over the generated ordered expectations.
 *
 * The expectations are derived offline from the vendored publication snapshot
 * by `pnpm generate:structures` and committed; nothing here reads a file, makes
 * a network call, or decides anything. It exists so the validator asks for a
 * structure by id instead of scanning an 81-entry array per message.
 */

import { generatedStructureSchemas } from "../parser/generated/message-structure-schemas.js";
import type { PublishedStructureSchema } from "../parser/structure-types.js";

/**
 * Every generated ordered expectation, keyed by its published structure id.
 * Built on the first lookup rather than at import: the table is large, and a
 * caller who never validates a structure never pays for it.
 */
let schemasById: ReadonlyMap<string, PublishedStructureSchema> | undefined;

/**
 * The ordered expectation for one published structure variant, or `undefined`
 * when the vendored snapshot carries no structure under that id.
 *
 * @internal
 */
export function findPublishedStructureSchema(
  structureId: string,
): PublishedStructureSchema | undefined {
  schemasById ??= new Map(
    generatedStructureSchemas().map((schema) => [schema.structureId, schema]),
  );
  return schemasById.get(structureId);
}
