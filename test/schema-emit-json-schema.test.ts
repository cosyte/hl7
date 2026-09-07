/**
 * The emitted JSON Schema document: the dialect it declares, the keyword set it
 * stays inside, and the profile member's exact constraint.
 *
 * WHY THE KEYWORD SET IS PINNED HERE RATHER THAN TRUSTED. A document may
 * declare the 2020-12 dialect and still lean on a keyword from a vocabulary a
 * consumer's validator does not implement, or on one from a later draft
 * entirely, and neither the declaration nor a passing round-trip would say so.
 * The allow-list below is the union of the `properties` keys of the three
 * vocabulary meta-schemas this emitter is bounded to (core, applicator,
 * validation) at `https://json-schema.org/draft/2020-12/`, transcribed rather
 * than fetched: no test in this repository reaches the network.
 *
 * The meta-data, format-annotation, unevaluated and content vocabularies are
 * deliberately NOT in the list. `title`, `description`, `default` and
 * `examples` are the ones a schema author reaches for by reflex, and the last
 * two are also how a value taken from a real message gets into a published
 * artifact, which is the one thing here no later deletion undoes.
 */

import { describe, expect, it } from "vitest";

import { JSON_SCHEMA_DIALECT, messageJsonSchema } from "../src/index.js";
import type { JsonSchemaDocument, JsonSchemaNode } from "../src/index.js";

/** Core vocabulary: `.../draft/2020-12/meta/core`. */
const CORE_KEYWORDS = [
  "$id",
  "$schema",
  "$ref",
  "$anchor",
  "$dynamicRef",
  "$dynamicAnchor",
  "$vocabulary",
  "$comment",
  "$defs",
] as const;

/** Applicator vocabulary: `.../draft/2020-12/meta/applicator`. */
const APPLICATOR_KEYWORDS = [
  "prefixItems",
  "items",
  "contains",
  "additionalProperties",
  "properties",
  "patternProperties",
  "dependentSchemas",
  "propertyNames",
  "if",
  "then",
  "else",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
] as const;

/** Validation vocabulary: `.../draft/2020-12/meta/validation`. */
const VALIDATION_KEYWORDS = [
  "type",
  "const",
  "enum",
  "multipleOf",
  "maximum",
  "exclusiveMaximum",
  "minimum",
  "exclusiveMinimum",
  "maxLength",
  "minLength",
  "pattern",
  "maxItems",
  "minItems",
  "uniqueItems",
  "maxContains",
  "minContains",
  "maxProperties",
  "minProperties",
  "required",
  "dependentRequired",
] as const;

const PERMITTED_KEYWORDS: ReadonlySet<string> = new Set<string>([
  ...CORE_KEYWORDS,
  ...APPLICATOR_KEYWORDS,
  ...VALIDATION_KEYWORDS,
]);

/**
 * Keywords from the vocabularies this emitter is NOT bounded to. Asserted
 * separately from the allow-list above: the allow-list catches them by
 * construction, and naming them makes the failure read as "this keyword is out
 * of bounds" rather than "this keyword is unknown".
 */
const OUT_OF_BOUNDS_KEYWORDS = [
  "title",
  "description",
  "default",
  "deprecated",
  "examples",
  "readOnly",
  "writeOnly",
  "format",
  "unevaluatedItems",
  "unevaluatedProperties",
  "contentEncoding",
  "contentMediaType",
  "contentSchema",
] as const;

/** Every schema node in the document, the root included, with its location. */
function everyNode(document: JsonSchemaDocument): { at: string; node: JsonSchemaNode }[] {
  const found: { at: string; node: JsonSchemaNode }[] = [];
  const visit = (node: JsonSchemaNode, at: string): void => {
    found.push({ at, node });
    if (node.items !== undefined) visit(node.items, `${at}/items`);
    for (const [name, child] of Object.entries(node.properties ?? {})) {
      visit(child, `${at}/properties/${name}`);
    }
  };
  visit(document, "#");
  for (const [name, definition] of Object.entries(document.$defs)) {
    visit(definition, `#/$defs/${name}`);
  }
  return found;
}

describe("AC1: the emitted document declares 2020-12 and stays inside three vocabularies", () => {
  const document = messageJsonSchema();

  it("declares exactly the 2020-12 dialect", () => {
    expect(document.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(document.$schema).toBe(JSON_SCHEMA_DIALECT);
  });

  it("uses no keyword outside the core, applicator and validation vocabularies", () => {
    const offenders: string[] = [];
    for (const { at, node } of everyNode(document)) {
      for (const key of Object.keys(node)) {
        if (!PERMITTED_KEYWORDS.has(key)) offenders.push(`${at}: ${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("carries none of the meta-data, format, unevaluated or content keywords", () => {
    const offenders: string[] = [];
    for (const { at, node } of everyNode(document)) {
      for (const keyword of OUT_OF_BOUNDS_KEYWORDS) {
        if (keyword in node) offenders.push(`${at}: ${keyword}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("resolves every reference it makes to a definition it carries", () => {
    const names = new Set(Object.keys(document.$defs));
    const dangling: string[] = [];
    for (const { at, node } of everyNode(document)) {
      if (node.$ref === undefined) continue;
      const match = /^#\/\$defs\/(.+)$/.exec(node.$ref);
      if (match?.[1] === undefined || !names.has(match[1])) dangling.push(`${at}: ${node.$ref}`);
    }
    expect(dangling).toEqual([]);
  });

  it("describes the projection as a closed object at every level", () => {
    for (const { at, node } of everyNode(document)) {
      if (node.type !== "object") continue;
      expect(node.additionalProperties, at).toBe(false);
    }
  });
});

describe("AC4: the profile member is optional and carries exactly two members", () => {
  const document = messageJsonSchema();

  it("declares `profile` but never requires it", () => {
    expect(Object.keys(document.properties ?? {})).toContain("profile");
    expect(document.required).not.toContain("profile");
  });

  it("constrains it to a string name and an array-of-strings lineage, and nothing else", () => {
    const reference = document.properties?.["profile"]?.$ref;
    expect(reference).toBe("#/$defs/SerializedProfile");
    const profile = document.$defs["SerializedProfile"];
    expect(profile?.type).toBe("object");
    expect(Object.keys(profile?.properties ?? {})).toEqual(["name", "lineage"]);
    expect(profile?.required).toEqual(["name", "lineage"]);
    expect(profile?.properties?.["name"]).toEqual({ type: "string" });
    expect(profile?.properties?.["lineage"]).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  it("permits no additional member on the profile", () => {
    expect(document.$defs["SerializedProfile"]?.additionalProperties).toBe(false);
  });
});
