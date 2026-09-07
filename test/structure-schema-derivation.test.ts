/**
 * The ORDERED structural expectation: what the derivation now keeps that it
 * used to throw away.
 *
 * The presence-only registry reads each vendored element's `min` and its
 * segment type and discards the rest. The ordered expectation keeps the rest:
 * position, maximum and enclosing group. So the load-bearing test here is not
 * "the generator ran" but "the committed expectation says exactly what the
 * vendored bytes say, element for element, in the publication's own order",
 * checked against the vendored JSON directly rather than through the generator
 * that produced it. A derivation that agreed only with itself would be a
 * transcription with extra steps, which is the failure this whole pipeline
 * exists to avoid.
 *
 * The refusals are tested the way the generator's other refusals are: corrupt
 * one input, demand a refusal that names the file, and demand that whatever was
 * already on disk is still there byte for byte afterwards.
 */

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  DERIVATION_REPORT_PATH,
  REGISTRY_MODULE_PATH,
  SCHEMAS_MODULE_PATH,
  VENDOR_DIR,
  deriveRegistry,
  main,
  renderSchemasModule,
} from "../scripts/generate-message-structures.js";
import { GENERATED_STRUCTURE_SCHEMAS } from "../src/parser/generated/message-structure-schemas.js";
import type { StructureExpectationNode } from "../src/parser/structure-types.js";
import { MESSAGE_STRUCTURE_DEFINITIONS } from "../src/index.js";
import { occurrenceBounds } from "../src/structure/walk.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REAL_VENDOR = path.join(REPO_ROOT, VENDOR_DIR);
const STRUCTURE_DIR = path.join(REAL_VENDOR, "message-structure");
const SEGMENT_TYPE_PREFIX = "http://hl7.org/v2/StructureDefinition/";

const scratch: string[] = [];

/** A throwaway repo root holding a copy of the vendored snapshot. */
function scratchRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "hl7-schemagen-"));
  scratch.push(root);
  mkdirSync(path.join(root, VENDOR_DIR), { recursive: true });
  cpSync(REAL_VENDOR, path.join(root, VENDOR_DIR), { recursive: true });
  mkdirSync(path.join(root, path.dirname(REGISTRY_MODULE_PATH)), { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** One vendored element, narrowed without an `as any`. */
interface VendoredElement {
  readonly id: string;
  readonly min: number;
  readonly max: string;
  readonly type?: readonly { readonly code?: string }[];
}

/** Read one vendored structure file's elements, independently of the generator. */
function vendoredElements(file: string): readonly VendoredElement[] {
  const doc: unknown = JSON.parse(readFileSync(file, "utf8"));
  const differential = (doc as { differential: { element: VendoredElement[] } }).differential;
  return differential.element;
}

/** The structure ids the snapshot carries, in the file order the generator reads. */
function vendoredStructureIds(): readonly string[] {
  return readdirSync(STRUCTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((name) => name.slice(0, -".json".length));
}

/** Overwrite one vendored element's `max`, leaving everything else alone. */
function withMax(root: string, structureId: string, elementIndex: number, max: unknown): string {
  const file = path.join(root, VENDOR_DIR, "message-structure", `${structureId}.json`);
  const doc: unknown = JSON.parse(readFileSync(file, "utf8"));
  const elements = (doc as { differential: { element: Record<string, unknown>[] } }).differential
    .element;
  const target = elements[elementIndex];
  if (target === undefined) throw new Error(`no element ${String(elementIndex)} in ${structureId}`);
  if (max === undefined) delete target["max"];
  else target["max"] = max;
  writeFileSync(file, JSON.stringify(doc, null, 2));
  return file;
}

describe("AC1: the committed expectation is the vendored elements, in publication order", () => {
  it("carries one expectation per vendored structure, under the same ids", () => {
    expect(GENERATED_STRUCTURE_SCHEMAS.map((schema) => schema.structureId)).toEqual(
      vendoredStructureIds(),
    );
  });

  it("records every vendored element's position, min, max and enclosing group", () => {
    let checkedNodes = 0;
    for (const schema of GENERATED_STRUCTURE_SCHEMAS) {
      const elements = vendoredElements(path.join(STRUCTURE_DIR, `${schema.structureId}.json`));
      // The structure root is the message itself and carries no sibling
      // ordinal, so it is the one element that is deliberately not a node.
      const children = elements.filter((element) => element.id.includes("."));
      expect(elements.length - children.length).toBe(1);
      expect(schema.nodes).toHaveLength(children.length);

      /** Node index of each vendored element id, for the parent cross-check. */
      const indexById = new Map<string, number>();
      for (const [index, element] of children.entries()) indexById.set(element.id, index);

      for (const [index, element] of children.entries()) {
        const node = schema.nodes[index];
        expect(node).toBeDefined();
        if (node === undefined) continue;

        const dot = element.id.lastIndexOf(".");
        const tail = element.id.slice(dot + 1);
        const ordinal = tail.slice(0, tail.indexOf("-"));
        const localName = tail.slice(tail.indexOf("-") + 1);
        const code = element.type?.[0]?.code ?? "";
        const isSegment = code.startsWith(SEGMENT_TYPE_PREFIX);

        expect(node.kind).toBe(isSegment ? "segment" : "group");
        expect(node.name).toBe(isSegment ? code.slice(SEGMENT_TYPE_PREFIX.length) : localName);
        expect(node.position).toBe(Number(ordinal));
        expect(node.min).toBe(element.min);
        expect(node.max).toBe(element.max === "*" ? "*" : Number(element.max));
        expect(node.parent).toBe(indexById.get(element.id.slice(0, dot)) ?? -1);
        checkedNodes += 1;
      }
    }
    // A silent zero here would let every assertion above pass vacuously.
    expect(checkedNodes).toBe(2854);
  });

  it("gives every published registry entry a non-empty expectation per family member", () => {
    const byId = new Map(GENERATED_STRUCTURE_SCHEMAS.map((s) => [s.structureId, s]));
    const published = MESSAGE_STRUCTURE_DEFINITIONS.filter((d) => d.derivation === "published");
    expect(published.length).toBeGreaterThan(0);
    for (const definition of published) {
      expect(definition.structureIds.length).toBeGreaterThan(0);
      for (const structureId of definition.structureIds) {
        const schema = byId.get(structureId);
        expect(schema?.nodes.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("re-renders the committed expectation module byte for byte", async () => {
    const rendered = await renderSchemasModule(deriveRegistry(REAL_VENDOR), REPO_ROOT);
    expect(rendered).toBe(readFileSync(path.join(REPO_ROOT, SCHEMAS_MODULE_PATH), "utf8"));
  });
});

describe("AC3: the unbounded marker is preserved as unbounded", () => {
  it("records `*` rather than a finite stand-in wherever the publication says `*`", () => {
    let unbounded = 0;
    for (const schema of GENERATED_STRUCTURE_SCHEMAS) {
      const elements = vendoredElements(path.join(STRUCTURE_DIR, `${schema.structureId}.json`));
      const children = elements.filter((element) => element.id.includes("."));
      for (const [index, element] of children.entries()) {
        if (element.max !== "*") continue;
        expect(schema.nodes[index]?.max).toBe("*");
        unbounded += 1;
      }
    }
    expect(unbounded).toBeGreaterThan(0);
  });

  it("gives a freely repeating segment no upper bound to exceed", () => {
    const schema = GENERATED_STRUCTURE_SCHEMAS.find((s) => s.structureId === "ADT_A02");
    expect(schema).toBeDefined();
    if (schema === undefined) return;
    const bounds = occurrenceBounds(schema.nodes);
    // ROL is `[0..*]` at the top level of this structure: no count can exceed it.
    expect(bounds.get("ROL")?.max).toBe("*");
    // EVN is the counter-example that keeps the assertion above honest.
    expect(bounds.get("EVN")?.max).toBe(1);
  });
});

describe("AC4: an unusable occurrence maximum refuses, naming the file, writing nothing", () => {
  /** Sentinel bytes at every artifact the generator owns. */
  function seedArtifacts(root: string): readonly string[] {
    const paths = [REGISTRY_MODULE_PATH, SCHEMAS_MODULE_PATH, DERIVATION_REPORT_PATH].map((rel) =>
      path.join(root, rel),
    );
    for (const file of paths) writeFileSync(file, "// previously generated\n");
    return paths;
  }

  it("refuses a maximum that is not a number and not the unbounded marker", async () => {
    const root = scratchRoot();
    withMax(root, "ADT_A02", 1, "two");
    const artifacts = seedArtifacts(root);
    await expect(main(root)).rejects.toThrow(/unusable occurrence max/);
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/ADT_A02\.json/);
    for (const file of artifacts) {
      expect(readFileSync(file, "utf8")).toBe("// previously generated\n");
    }
  });

  it("refuses a finite maximum below the element's own minimum", async () => {
    const root = scratchRoot();
    // Element 1 of this structure is the `[1..1]` MSH, so `max: 0` contradicts it.
    withMax(root, "ADT_A03", 1, "0");
    await expect(main(root)).rejects.toThrow(/unusable occurrence max/);
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/ADT_A03\.json/);
  });

  it("refuses a negative maximum", () => {
    const root = scratchRoot();
    withMax(root, "ADT_A12", 1, -1);
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/unusable occurrence max/);
  });

  it("refuses an element carrying no maximum at all", () => {
    const root = scratchRoot();
    withMax(root, "SIU_S12", 1, undefined);
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/SIU_S12\.json/);
  });

  it("accepts the numeric spelling of a maximum the publication writes as a string", () => {
    const root = scratchRoot();
    withMax(root, "VXU_V04", 1, 1);
    const model = deriveRegistry(path.join(root, VENDOR_DIR));
    const schema = model.schemas.find((s) => s.structureId === "VXU_V04");
    expect(schema?.nodes[0]?.max).toBe(1);
  });

  it("refuses an element whose id carries no sibling ordinal", () => {
    const root = scratchRoot();
    const file = path.join(root, VENDOR_DIR, "message-structure", "ADT_A16.json");
    writeFileSync(
      file,
      JSON.stringify({
        differential: {
          element: [
            { id: "ADT_A16", min: 0, max: "*" },
            { id: "ADT_A16.MSH", min: 1, max: "1" },
          ],
        },
      }),
    );
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/no sibling ordinal/);
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/ADT_A16\.json/);
  });

  it("still writes all three artifacts when nothing is wrong", async () => {
    const root = scratchRoot();
    await main(root);
    const nodes: readonly StructureExpectationNode[] =
      deriveRegistry(path.join(root, VENDOR_DIR)).schemas[0]?.nodes ?? [];
    expect(nodes.length).toBeGreaterThan(0);
    for (const rel of [REGISTRY_MODULE_PATH, SCHEMAS_MODULE_PATH, DERIVATION_REPORT_PATH]) {
      expect(readFileSync(path.join(root, rel), "utf8").length).toBeGreaterThan(0);
    }
  });
});
