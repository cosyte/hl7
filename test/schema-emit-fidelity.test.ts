/**
 * The emitted JSON Schema against the projection the library actually produces.
 *
 * THIS IS THE ANTI-STALENESS MECHANISM. The emitter is hand-written, so nothing
 * about its implementation stops it describing a shape the serializer stopped
 * producing three changes ago. What stops that is here: the document is walked
 * beside a LIVE projection of every message in the canonical fixture corpus,
 * beside the warning-code registry, and beside a projection of a message that
 * parsed to nothing at all. Change the serializer and this file goes red.
 *
 * THE COMPARISON IS A TEST, NOT AN API. Nothing here is exported, nothing here
 * runs at consumer run time, and the library gains no validate/check/assert
 * behaviour from it. The walk exists because the fidelity criteria are stated
 * against live projections and there is no other honest way to grade them.
 *
 * THE ENCODING-CHARACTERS CASE IS THE ONE TO READ FIRST. `EncodingCharacters`
 * declares an optional `truncation` member; `emitJson` copies exactly five keys
 * and never that one. A schema transcribed from the TypeScript declaration
 * would describe a member the projection cannot contain, so the case below
 * parses a v2.7 message whose MSH-2 really does carry a truncation character,
 * proves the parsed message has it, and proves the projection does not.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENCODING_CHARACTERS,
  Hl7Message,
  WARNING_CODES,
  messageJsonSchema,
  parseHL7,
  profiles,
} from "../src/index.js";
import type { JsonSchemaDocument, JsonSchemaNode, SerializedMessage } from "../src/index.js";

const CANONICAL_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "canonical",
);

/** Every canonical fixture, by name, sorted so a failure is reproducible. */
const CANONICAL_FIXTURES: readonly string[] = readdirSync(CANONICAL_DIR)
  .filter((name) => name.endsWith(".hl7"))
  .sort((a, b) => a.localeCompare(b, "en"));

/**
 * A live projection of every canonical fixture, plus one taken with a profile
 * applied so the optional `profile` member is exercised rather than assumed
 * absent.
 */
function corpusProjections(): { name: string; projection: SerializedMessage }[] {
  const out = CANONICAL_FIXTURES.map((name) => ({
    name,
    projection: parseHL7(readFileSync(path.join(CANONICAL_DIR, name), "utf8")).toJSON(),
  }));
  out.push({
    name: "adt-a01.hl7 (epic profile applied)",
    projection: parseHL7(readFileSync(path.join(CANONICAL_DIR, "adt-a01.hl7"), "utf8"), {
      profile: profiles.epic,
    }).toJSON(),
  });
  return out;
}

/** What one walk of a projection beside the schema found. */
interface WalkReport {
  /** `<definition>.<member>` for a member the projection carried and the schema does not describe. */
  readonly undescribed: string[];
  /** `<definition>.<member>` for a declared member the projection omitted at least once. */
  readonly absent: Set<string>;
  /** `<definition>.<member>` for a member whose JSON type disagrees with the schema. */
  readonly mistyped: string[];
  /** Every string that appeared as a leaf value in a projection. */
  readonly leafValues: Set<string>;
}

function newReport(): WalkReport {
  return { undescribed: [], absent: new Set(), mistyped: [], leafValues: new Set() };
}

/** Follow a `$ref` to the definition it names; a node without one is already resolved. */
function resolve(
  node: JsonSchemaNode,
  document: JsonSchemaDocument,
): { node: JsonSchemaNode; definition: string | undefined } {
  if (node.$ref === undefined) return { node, definition: undefined };
  const name = /^#\/\$defs\/(.+)$/.exec(node.$ref)?.[1];
  const target = name === undefined ? undefined : document.$defs[name];
  if (name === undefined || target === undefined) {
    throw new Error(`the emitted schema references a definition it does not carry: ${node.$ref}`);
  }
  return { node: target, definition: name };
}

/** The JSON type name of a value, as the schema would spell it. */
function jsonTypeOf(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

/**
 * Walk one projection value beside the schema node that claims to describe it,
 * recording every disagreement rather than throwing on the first.
 *
 * `where` is the definition name the walk is currently inside, so a finding is
 * reported against the schema definition a maintainer would go and edit rather
 * than against the fixture path it happened to surface on.
 */
function walk(
  value: unknown,
  schemaNode: JsonSchemaNode,
  document: JsonSchemaDocument,
  where: string,
  report: WalkReport,
): void {
  const { node, definition } = resolve(schemaNode, document);
  const here = definition ?? where;

  if (Array.isArray(value)) {
    if (node.type !== "array" || node.items === undefined) {
      report.mistyped.push(`${here}: an array is described as ${String(node.type)}`);
      return;
    }
    for (const item of value) walk(item, node.items, document, here, report);
    return;
  }

  if (typeof value === "object" && value !== null) {
    if (node.type !== "object") {
      report.mistyped.push(`${here}: an object is described as ${String(node.type)}`);
      return;
    }
    const properties = node.properties ?? {};
    const instance: Record<string, unknown> = { ...value };
    for (const key of Object.keys(instance)) {
      const child = properties[key];
      if (child === undefined) {
        report.undescribed.push(`${here}.${key}`);
        continue;
      }
      walk(instance[key], child, document, here, report);
    }
    for (const declared of Object.keys(properties)) {
      if (!Object.hasOwn(instance, declared)) report.absent.add(`${here}.${declared}`);
    }
    return;
  }

  const actual = jsonTypeOf(value);
  if (actual !== node.type) {
    report.mistyped.push(`${here}: a ${actual} is described as ${String(node.type)}`);
    return;
  }
  if (typeof value === "string") {
    report.leafValues.add(value);
    if (node.enum !== undefined && !node.enum.includes(value)) {
      report.mistyped.push(`${here}: a value outside the emitted enumeration`);
    }
  }
}

/** The `required` list of a definition, or of the document root. */
function requiredOf(document: JsonSchemaDocument, definition: string): readonly string[] {
  if (definition === "#") return document.required ?? [];
  return document.$defs[definition]?.required ?? [];
}

/** One walk over every projection in the corpus. */
function walkCorpus(): WalkReport {
  const document = messageJsonSchema();
  const report = newReport();
  for (const { projection } of corpusProjections()) {
    walk(projection, document, document, "#", report);
  }
  return report;
}

describe("AC2: the emitted schema describes the projection the library produces", () => {
  const document = messageJsonSchema();
  const report = walkCorpus();

  it("reads a corpus worth having an opinion about", () => {
    expect(CANONICAL_FIXTURES.length).toBeGreaterThanOrEqual(20);
  });

  it("describes every member name present in those projections, at every level", () => {
    expect(report.undescribed).toEqual([]);
  });

  it("agrees with the projection about every value's JSON type", () => {
    expect(report.mistyped).toEqual([]);
  });

  it("declares no member required that a projection in the corpus omitted", () => {
    const wronglyRequired: string[] = [];
    for (const entry of report.absent) {
      const dot = entry.lastIndexOf(".");
      const definition = entry.slice(0, dot);
      const member = entry.slice(dot + 1);
      if (requiredOf(document, definition).includes(member)) wronglyRequired.push(entry);
    }
    expect(wronglyRequired).toEqual([]);
  });

  it("saw the optional members really go absent, so the rule above is not vacuous", () => {
    expect([...report.absent].sort((a, b) => a.localeCompare(b, "en"))).toEqual([
      "#.profile",
      "SerializedPosition.componentIndex",
      "SerializedPosition.fieldIndex",
      "SerializedPosition.repetitionIndex",
      "SerializedPosition.subcomponentIndex",
    ]);
  });
});

describe("AC3: the warning-code constraint is the registry, both directions", () => {
  const document = messageJsonSchema();
  const emitted = document.$defs["SerializedWarning"]?.properties?.["code"]?.enum;

  it("constrains the code member with an enumeration of strings", () => {
    expect(document.$defs["SerializedWarning"]?.properties?.["code"]?.type).toBe("string");
    expect(Array.isArray(emitted)).toBe(true);
  });

  it("misses no code the registry defines", () => {
    const missing = Object.values(WARNING_CODES).filter((code) => !(emitted ?? []).includes(code));
    expect(missing).toEqual([]);
  });

  it("invents no code the registry does not define", () => {
    const registry = new Set<string>(Object.values(WARNING_CODES));
    const invented = (emitted ?? []).filter((code) => !registry.has(code));
    expect(invented).toEqual([]);
  });

  it("is exactly the registry as a set", () => {
    expect([...(emitted ?? [])].sort()).toEqual(Object.values(WARNING_CODES).slice().sort());
  });
});

describe("AC5: encoding characters are the runtime member set, not the declared one", () => {
  // MSH-2 here carries FIVE encoding characters, which is what HL7 v2.7 added
  // and what populates `truncation` on the parsed message.
  const V27 =
    "MSH|^~\\&#|SEND|FAC|RECV|RFAC|20250102||ADT^A01|CTRL27|P|2.7\r" +
    "EVN||20250102\r" +
    "PID|||MRN12345\r";

  it("the parsed message really does carry a truncation character", () => {
    const parsed = parseHL7(V27);
    expect(parsed.encodingCharacters.truncation).toBe("#");
  });

  it("the projection of that same message does not", () => {
    const projection = parseHL7(V27).toJSON();
    expect(Object.keys(projection.encodingCharacters).sort()).toEqual([
      "component",
      "escape",
      "field",
      "repetition",
      "subcomponent",
    ]);
    expect(Object.hasOwn(projection.encodingCharacters, "truncation")).toBe(false);
  });

  it("the emitted schema declares exactly the five members the projection contains", () => {
    const encoding = messageJsonSchema().$defs["SerializedEncodingCharacters"];
    expect(Object.keys(encoding?.properties ?? {}).sort()).toEqual([
      "component",
      "escape",
      "field",
      "repetition",
      "subcomponent",
    ]);
    expect([...(encoding?.required ?? [])].sort()).toEqual([
      "component",
      "escape",
      "field",
      "repetition",
      "subcomponent",
    ]);
  });

  it("declares no member the serializer never emits, truncation included", () => {
    const encoding = messageJsonSchema().$defs["SerializedEncodingCharacters"];
    expect(Object.keys(encoding?.properties ?? {})).not.toContain("truncation");
    expect(encoding?.additionalProperties).toBe(false);
  });

  it("the v2.7 projection still walks clean against the emitted schema", () => {
    const document = messageJsonSchema();
    const report = newReport();
    walk(parseHL7(V27).toJSON(), document, document, "#", report);
    expect(report.undescribed).toEqual([]);
    expect(report.mistyped).toEqual([]);
  });
});

describe("AC10: an empty projection is still described, and emission does not throw", () => {
  const empty = new Hl7Message({
    segments: [],
    encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
    version: "2.5",
    warnings: [],
  }).toJSON();

  it("the projection really is empty on both arrays", () => {
    expect(empty.segments).toEqual([]);
    expect(empty.warnings).toEqual([]);
  });

  it("emission does not throw for it", () => {
    expect(() => messageJsonSchema()).not.toThrow();
  });

  it("declares segments and warnings as present arrays that permit zero entries", () => {
    const document = messageJsonSchema();
    expect(document.required).toContain("segments");
    expect(document.required).toContain("warnings");
    for (const member of ["segments", "warnings"] as const) {
      const node = document.properties?.[member] ?? {};
      expect(node.type, member).toBe("array");
      // No `minItems` and no `contains`, so zero entries satisfy it. Asserted
      // as an absence because a floor of one is exactly the constraint that
      // would refuse a clean message with nothing to say.
      expect(Object.hasOwn(node, "minItems"), member).toBe(false);
      expect(Object.hasOwn(node, "contains"), member).toBe(false);
    }
  });

  it("the empty projection walks clean against the emitted schema", () => {
    const document = messageJsonSchema();
    const report = newReport();
    walk(empty, document, document, "#", report);
    expect(report.undescribed).toEqual([]);
    expect(report.mistyped).toEqual([]);
  });
});

describe("AC12: no value taken from any parsed message reaches the artifact", () => {
  const document = messageJsonSchema();
  const text = JSON.stringify(document);

  /**
   * Every string the document carries, keys and values alike. `$defs` keys and
   * `properties` keys are member and definition names, which the criterion
   * names as permitted, so they are collected rather than exempted.
   */
  function everyString(value: unknown, into: Set<string>): void {
    if (typeof value === "string") {
      into.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) everyString(item, into);
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, child] of Object.entries(value)) {
        into.add(key);
        everyString(child, into);
      }
    }
  }

  it("carries no keyword that could hold a sample value", () => {
    for (const keyword of ["default", "examples", "const"]) {
      expect(text.includes(`"${keyword}"`), keyword).toBe(false);
    }
  });

  it("constrains a literal value in exactly one place: the warning-code enumeration", () => {
    const enumerations: string[] = [];
    const visit = (node: JsonSchemaNode, at: string): void => {
      if (node.enum !== undefined) enumerations.push(at);
      if (node.items !== undefined) visit(node.items, `${at}/items`);
      for (const [name, child] of Object.entries(node.properties ?? {})) {
        visit(child, `${at}/properties/${name}`);
      }
    };
    visit(document, "#");
    for (const [name, definition] of Object.entries(document.$defs)) {
      visit(definition, `#/$defs/${name}`);
    }
    expect(enumerations).toEqual(["#/$defs/SerializedWarning/properties/code"]);
  });

  it("carries only structural strings: the dialect, names, type names and registry codes", () => {
    const strings = new Set<string>();
    everyString(document, strings);

    const permitted = new Set<string>([
      "https://json-schema.org/draft/2020-12/schema",
      // JSON type names.
      "array",
      "boolean",
      "integer",
      "object",
      "string",
      // Keywords, which are member names of the schema document itself.
      "$schema",
      "$defs",
      "$ref",
      "type",
      "enum",
      "items",
      "properties",
      "required",
      "additionalProperties",
      // Definition names and the references that reach them.
      ...Object.keys(document.$defs),
      ...Object.keys(document.$defs).map((name) => `#/$defs/${name}`),
      // Every member name of the projection.
      ...Object.keys(document.properties ?? {}),
      ...Object.values(document.$defs).flatMap((definition) =>
        Object.keys(definition.properties ?? {}),
      ),
      // The warning codes, taken from the registry.
      ...Object.values(WARNING_CODES),
    ]);

    expect([...strings].filter((value) => !permitted.has(value)).sort()).toEqual([]);
  });

  it("carries no leaf value any projection of the corpus produced", () => {
    const report = walkCorpus();
    const strings = new Set<string>();
    everyString(document, strings);
    // The warning codes are the one overlap, and they are permitted: they come
    // from the registry the library defines, not from message content. Every
    // other leaf a real message produced must be absent.
    const registry = new Set<string>(Object.values(WARNING_CODES));
    const leaked = [...report.leafValues].filter(
      (value) => !registry.has(value) && strings.has(value),
    );
    expect(leaked).toEqual([]);
  });

  it("read enough real leaf values for the check above to mean something", () => {
    expect(walkCorpus().leafValues.size).toBeGreaterThan(100);
  });
});
