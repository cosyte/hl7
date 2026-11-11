/**
 * The `@cosyte/hl7/arbitraries` subpath: what each generator promises, checked on fixed seeds so
 * every run reaches the same cases, and how the subpath is packaged (an optional peer dependency
 * that the main entry point never loads).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { Hl7Message, KNOWN_SEGMENTS, WARNING_CODES, parseHL7 } from "../src/index.js";
import type { EncodingCharacters, RawField } from "../src/index.js";
import {
  component,
  encodingCharacters,
  escapeSequence,
  field,
  hostileInput,
  message,
  messageText,
  messageType,
  repetition,
  segment,
  value,
} from "../src/arbitraries/index.js";
import { DELIMITER_POOL } from "../src/arbitraries/encoding.js";
import {
  applyEdits,
  applyQuirk,
  cleanMessageText,
  type SegmentQuirk,
} from "../src/arbitraries/message.js";
import {
  BODY_SEGMENT_NAMES,
  escapeValue,
  isCleanValue,
  writeField,
} from "../src/arbitraries/tree.js";

const root = join(import.meta.dirname, "..");

/**
 * Draw `n` values from a fixed seed. These are checks on what a generator draws, not properties:
 * a fixed seed makes every run reach the same cases.
 */
// property-depth: a generator sample on a fixed seed, so a check that a case is drawn never flakes.
function draw<T>(arb: fc.Arbitrary<T>, n = 200, seed = 20261110): T[] {
  return fc.sample(arb, { numRuns: n, seed });
}

const STANDARD: EncodingCharacters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
};
const WITH_TRUNCATION: EncodingCharacters = { ...STANDARD, truncation: "#" };

/** Whether a field's last repetition, component and subcomponent are all non-empty. */
function endsNonEmpty(f: RawField): boolean {
  if (f.isNull) return f.repetitions.length === 0;
  const rep = f.repetitions.at(-1);
  const comp = rep?.components.at(-1);
  return (comp?.subcomponents.at(-1) ?? "") !== "";
}

describe("encodingCharacters", () => {
  it("gives distinct characters from the pool, the standard set among them", () => {
    const sets = draw(encodingCharacters());
    for (const enc of sets) {
      const chars = [enc.field, enc.component, enc.repetition, enc.escape, enc.subcomponent];
      if (enc.truncation !== undefined) chars.push(enc.truncation);
      expect(new Set(chars).size).toBe(chars.length);
      for (const c of chars) expect(DELIMITER_POOL).toContain(c);
    }
    expect(sets.some((e) => e.field === "|" && e.component === "^")).toBe(true);
    expect(sets.some((e) => e.field !== "|")).toBe(true);
    expect(sets.some((e) => e.truncation !== undefined)).toBe(true);
    expect(sets.some((e) => e.truncation === undefined)).toBe(true);
  });

  it("honours the delimiters and truncation options", () => {
    expect(draw(encodingCharacters({ delimiters: "standard", truncation: false }), 20)).toEqual(
      Array.from({ length: 20 }, () => STANDARD),
    );
    expect(
      draw(encodingCharacters({ delimiters: "standard", truncation: true }), 5).every(
        (e) => e.truncation === "#",
      ),
    ).toBe(true);
    expect(
      draw(encodingCharacters({ truncation: true }), 50).every((e) => e.truncation !== undefined),
    ).toBe(true);
    expect(
      draw(encodingCharacters({ delimiters: "any", truncation: false }), 50).every(
        (e) => e.truncation === undefined,
      ),
    ).toBe(true);
  });

  it("every set opens a message the parser reads with those delimiters", () => {
    for (const enc of draw(encodingCharacters())) {
      const msh2 = enc.component + enc.repetition + enc.escape + enc.subcomponent;
      const raw = `MSH${enc.field}${msh2}${enc.truncation ?? ""}${enc.field}A`;
      expect(parseHL7(raw).encodingCharacters).toEqual(enc);
    }
  });
});

describe("escapeSequence", () => {
  it("writes each sequence with the escape character, and the parser reads each one", () => {
    const tokens = draw(escapeSequence(), 400);
    for (const token of tokens) {
      expect(token.startsWith("\\") && token.endsWith("\\")).toBe(true);
      expect(token).not.toBe("\\P\\");
    }
    for (const body of ["F", "S", "T", "R", "E", ".br", "H", "C2842"]) {
      expect(tokens).toContain(`\\${body}\\`);
    }
    expect(tokens.some((t) => /^\\X([0-9A-Fa-f]{2})+\\$/u.test(t))).toBe(true);
    expect(tokens.some((t) => t.startsWith("\\Z"))).toBe(true);
  });

  it("uses the given escape character and writes \\P\\ only when a truncation character is declared", () => {
    const custom = { ...STANDARD, escape: "!", truncation: "#" };
    const tokens = draw(escapeSequence({ encodingCharacters: custom }), 400);
    expect(tokens.every((t) => t.startsWith("!") && t.endsWith("!"))).toBe(true);
    expect(tokens).toContain("!P!");
  });

  it("decodes to what HL7 says, and serializes back byte for byte", () => {
    for (const token of draw(escapeSequence({ encodingCharacters: WITH_TRUNCATION }), 300)) {
      const raw = `MSH|^~\\&#|A|||||ORU^R01|1|P|2.7\rNTE|1||x${token}y\r`;
      expect(parseHL7(raw).toString()).toBe(raw);
    }
  });
});

describe("value", () => {
  it("is never empty, never the explicit null, and never has a space at either end", () => {
    const values = draw(value(), 500);
    for (const v of values) {
      expect(v.length).toBeGreaterThan(0);
      expect(isCleanValue(v)).toBe(true);
    }
    expect(values.some((v) => /[|^~\\&]/u.test(v))).toBe(true);
    expect(values.some((v) => v.includes("\n"))).toBe(true);
  });

  it("honours its length bounds", () => {
    for (const v of draw(value({ minLength: 3, maxLength: 5 }))) {
      expect([...v].length).toBeGreaterThanOrEqual(3);
      expect([...v].length).toBeLessThanOrEqual(5);
    }
    for (const v of draw(value({ minLength: 0, maxLength: 0 }), 20)) expect([...v].length).toBe(1);
  });

  it("isCleanValue refuses the explicit null and edge spaces, and allows edge line breaks", () => {
    expect(isCleanValue('""')).toBe(false);
    expect(isCleanValue(" a")).toBe(false);
    expect(isCleanValue("a ")).toBe(false);
    expect(isCleanValue("\n a")).toBe(false);
    expect(isCleanValue("\na\r")).toBe(true);
    expect(isCleanValue("a b")).toBe(true);
  });
});

describe("component, repetition, field and segment", () => {
  it("end every list on a non-empty item, with empty items allowed before it", () => {
    const fields = draw(field(), 400);
    expect(fields.every(endsNonEmpty)).toBe(true);
    expect(fields.some((f) => f.isNull)).toBe(true);
    expect(fields.some((f) => f.repetitions.length > 1)).toBe(true);
    expect(
      fields.some((f) =>
        f.repetitions.some((r) => r.components.some((c) => c.subcomponents[0] === "")),
      ),
    ).toBe(true);
    for (const c of draw(component())) expect(c.subcomponents.at(-1)).not.toBe("");
    for (const c of draw(component({ maxSubcomponents: 2 }))) {
      expect(c.subcomponents.length).toBeLessThanOrEqual(2);
      expect(c.subcomponents.at(-1)).not.toBe("");
    }
    for (const r of draw(repetition({ maxComponents: 2, values: fc.constant("v") }))) {
      expect(r.components.length).toBeLessThanOrEqual(2);
      expect(r.components.at(-1)?.subcomponents.at(-1)).toBe("v");
    }
  });

  it("honours nullable, the bounds and the leaf values", () => {
    const fields = draw(
      field({
        nullable: false,
        maxRepetitions: 1,
        maxComponents: 1,
        maxSubcomponents: 1,
        values: fc.constant("q"),
      }),
      50,
    );
    expect(fields).toEqual(
      Array.from({ length: 50 }, () => ({
        isNull: false,
        repetitions: [{ components: [{ subcomponents: ["q"] }] }],
      })),
    );
  });

  it("names segments from the common list or as Z segments, or from the names given", () => {
    const segments = draw(segment(), 300);
    for (const s of segments) {
      expect(s.fields[0]).toEqual({
        isNull: false,
        repetitions: [{ components: [{ subcomponents: [s.name] }] }],
      });
      expect(s.fields.length).toBeGreaterThan(1);
      expect(s.fields.length).toBeLessThanOrEqual(9);
      expect(BODY_SEGMENT_NAMES.includes(s.name) || /^Z[A-Z0-9]{2}$/u.test(s.name)).toBe(true);
    }
    expect(segments.some((s) => s.name.startsWith("Z"))).toBe(true);
    expect(
      segments.some((s) => s.fields.some((f) => !f.isNull && f.repetitions.length === 0)),
    ).toBe(true);
    const named = draw(segment({ names: ["NTE"], maxFields: 2 }), 50);
    expect(named.every((s) => s.name === "NTE" && s.fields.length <= 3)).toBe(true);
  });

  it("uses only segment names the library knows, apart from Z segments", () => {
    for (const name of BODY_SEGMENT_NAMES) expect(KNOWN_SEGMENTS.has(name)).toBe(true);
  });
});

describe("escapeValue and writeField", () => {
  it("escape every delimiter, the truncation character when declared, line breaks and carriage returns", () => {
    expect(escapeValue("a|b^c&d~e\\f\ng\rh#", WITH_TRUNCATION)).toBe(
      "a\\F\\b\\S\\c\\T\\d\\R\\e\\E\\f\\.br\\g\\X0D\\h\\P\\",
    );
    expect(escapeValue("h#", STANDARD)).toBe("h#");
  });

  it("writes the explicit null, and joins repetitions, components and subcomponents", () => {
    expect(writeField({ isNull: true, repetitions: [] }, STANDARD)).toBe('""');
    expect(
      writeField({ isNull: false, repetitions: [[["a", "b"], ["c"]], [["d"]]] }, STANDARD),
    ).toBe("a&b^c~d");
  });
});

describe("messageType", () => {
  it("draws the common types, ADT first among them", () => {
    const types = draw(messageType(), 300);
    const seen = new Set(types.map((t) => `${t.code}^${t.trigger}`));
    for (const t of ["ADT^A01", "ORU^R01", "ORM^O01", "SIU^S12", "VXU^V04", "ACK^A01"]) {
      expect(seen.has(t)).toBe(true);
    }
  });
});

describe("message and its clean text", () => {
  it("parses into one Hl7Message class, the one the main entry point exports", () => {
    for (const m of draw(message(), 20)) expect(m).toBeInstanceOf(Hl7Message);
  });

  it("prints a counterexample as the call that rebuilds it", () => {
    const [m] = draw(message(), 1);
    expect(fc.stringify(m)).toMatch(/^parseHL7\("MSH/u);
  });

  it("clones by parsing again, so code that changes a message cannot change the case fast-check replays", () => {
    const [m] = draw(message(), 1);
    if (m === undefined) throw new Error("no sample");
    expect(fc.hasCloneMethod(m)).toBe(true);
    const text = m.toString();
    m.addSegment("ZZZ", ["changed"]);
    const copy = fc.cloneIfNeeded(m);
    expect(copy).not.toBe(m);
    expect(copy.toString()).toBe(text);
    expect(fc.stringify(copy)).toBe(fc.stringify(m));
  });

  it("opens the body with the message type's segments, and adds at most the extra segments asked for", () => {
    for (const m of draw(message({ maxExtraSegments: 0, escapes: false }), 100)) {
      const names = m.rawSegments.map((s) => s.name);
      expect(names[0]).toBe("MSH");
      expect(names.length).toBeGreaterThan(1);
      expect(names.length).toBeLessThanOrEqual(6);
      expect(m.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE);
    }
  });

  it("writes the version to match MSH-2: 2.7 and later with a truncation character, earlier without", () => {
    for (const text of draw(cleanMessageText(), 200)) {
      const m = parseHL7(text);
      const after27 = Number.parseFloat(m.version ?? "0") >= 2.7;
      expect(after27).toBe(m.encodingCharacters.truncation !== undefined);
    }
  });

  it("uses the encoding characters given, and keeps body segments within maxFields", () => {
    const enc = fc.constant({ ...STANDARD, field: "#", escape: "!" });
    for (const text of draw(cleanMessageText({ encodingCharacters: enc, maxFields: 2 }), 100)) {
      expect(text.startsWith("MSH#^~!&#")).toBe(true);
      for (const line of text.split("\r").slice(1, -1)) {
        expect(line.split("#").length - 1).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("messageText", () => {
  it("carries every kind of mess, and always parses", () => {
    const texts = draw(messageText(), 300);
    const codes = new Set<string>();
    for (const t of texts) for (const w of parseHL7(t).warnings) codes.add(w.code);
    for (const code of [
      WARNING_CODES.MLLP_FRAMING_STRIPPED,
      WARNING_CODES.FIELD_WHITESPACE_TRIMMED,
      WARNING_CODES.SEGMENT_CASE,
      WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE,
      WARNING_CODES.UNKNOWN_SEGMENT,
    ]) {
      expect(codes.has(code)).toBe(true);
    }
    expect(texts.some((t) => t.startsWith("﻿"))).toBe(true);
    expect(texts.some((t) => t.includes("\r\n"))).toBe(true);
    expect(texts.some((t) => /UNICODE UTF-8|8859\/1/u.test(t))).toBe(true);
  });

  it("applyQuirk makes each change to a segment's fields", () => {
    const fields = ["PID", "a", "b"];
    const apply = (q: SegmentQuirk): readonly string[] => applyQuirk(fields, q, STANDARD);
    expect(apply({ kind: "none" })).toEqual(fields);
    expect(apply({ kind: "pad", field: 1 })).toEqual(["PID", "a", " b "]);
    expect(apply({ kind: "trailing", delimiters: 2 })).toEqual(["PID", "a", "b", "", ""]);
    expect(apply({ kind: "lowercase" })).toEqual(["pid", "a", "b"]);
    expect(apply({ kind: "unknownEscape", field: 2 })).toEqual(["PID", "a\\Q1\\", "b"]);
    expect(apply({ kind: "unterminatedEscape" })).toEqual(["PID", "a", "b\\F"]);
    expect(apply({ kind: "hollowField", alone: true, separators: 3 })).toEqual(["PID", "^&^"]);
    expect(apply({ kind: "hollowField", alone: false, separators: 1 })).toEqual([
      "PID",
      "a",
      "b",
      "^",
    ]);
  });
});

describe("hostileInput", () => {
  it("gives strings and Buffers, and stays within maxLength for the random runs", () => {
    const inputs = draw(hostileInput({ maxLength: 10 }), 400);
    expect(inputs.some((i) => typeof i === "string")).toBe(true);
    expect(inputs.some((i) => Buffer.isBuffer(i))).toBe(true);
    expect(inputs.some((i) => typeof i === "string" && i.startsWith("MSH"))).toBe(true);
    const long = draw(hostileInput(), 400);
    expect(long.some((i) => typeof i === "string" && i.length > 10 && !i.includes("MSH"))).toBe(
      true,
    );
  });

  it("applyEdits cuts, deletes and inserts at positions taken modulo the length", () => {
    expect(applyEdits("abcdef", [{ kind: "cut", at: 3 }])).toBe("abc");
    expect(applyEdits("abcdef", [{ kind: "cut", at: 10 }])).toBe("abc");
    expect(applyEdits("abcdef", [{ kind: "delete", at: 1, length: 2 }])).toBe("adef");
    expect(applyEdits("abc", [{ kind: "insert", at: 1, text: "XY" }])).toBe("aXYbc");
    expect(applyEdits("", [{ kind: "insert", at: 5, text: "Z" }])).toBe("Z");
  });
});

describe("packaging", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    exports: Record<string, unknown>;
    typesVersions: Record<string, Record<string, string[]>>;
    dependencies?: Record<string, string>;
    peerDependencies: Record<string, string>;
    peerDependenciesMeta: Record<string, { optional?: boolean }>;
  };

  it("exports the subpath for import and require, each with its own types", () => {
    expect(pkg.exports["./arbitraries"]).toEqual({
      import: { types: "./dist/arbitraries.d.ts", default: "./dist/arbitraries.mjs" },
      require: { types: "./dist/arbitraries.d.cts", default: "./dist/arbitraries.cjs" },
    });
    expect(pkg.typesVersions["*"]?.["arbitraries"]).toEqual(["./dist/arbitraries.d.ts"]);
  });

  it("takes fast-check as an optional peer dependency, never a dependency", () => {
    expect(pkg.peerDependencies["fast-check"]).toBeDefined();
    expect(pkg.peerDependenciesMeta["fast-check"]?.optional).toBe(true);
    expect(pkg.dependencies?.["fast-check"]).toBeUndefined();
  });

  it("imports fast-check only under src/arbitraries, and nothing the main entry reaches imports that folder", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(join(dir, e.name))
          : e.name.endsWith(".ts")
            ? [join(dir, e.name)]
            : [],
      );
    const offenders: string[] = [];
    for (const file of walk(join(root, "src"))) {
      const rel = relative(join(root, "src"), file);
      if (rel.startsWith("arbitraries")) continue;
      const text = readFileSync(file, "utf8");
      if (/from\s+["']fast-check["']/u.test(text) || /from\s+["'][./]*arbitraries/u.test(text)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
