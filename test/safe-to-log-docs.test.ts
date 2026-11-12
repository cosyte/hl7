import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * What the docs say about logging and about versions agrees with itself.
 *
 * `example-print` (see `example-print.test.ts`) reads what a sample passes to a printer. These
 * checks hold the prose and the shown values it cannot read: the version promise below 1.0, the
 * debugging view `prettyPrint()`, the fields "What is safe to log" names, and the mark on a shown
 * value that identifies a person.
 */
const root = join(import.meta.dirname, "..");
const docsDir = join(root, "docs-content");

/** The README, the hand-written pages and the example READMEs, as `[label, text]`. */
function pages(): [string, string][] {
  const out: [string, string][] = [["README.md", readFileSync(join(root, "README.md"), "utf8")]];
  for (const name of readdirSync(docsDir).sort()) {
    if (name.endsWith(".md")) out.push([name, readFileSync(join(docsDir, name), "utf8")]);
  }
  for (const d of readdirSync(join(root, "examples"), { withFileTypes: true, recursive: true })) {
    if (!d.isFile() || d.name !== "README.md" || d.parentPath.includes("node_modules")) continue;
    const path = join(d.parentPath, d.name);
    out.push([path.slice(root.length + 1), readFileSync(path, "utf8")]);
  }
  return out;
}

/** The text of a `## heading` section of a page, up to the next `## ` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) return "";
  const end = text.indexOf("\n## ", start + 4);
  return text.slice(start, end === -1 ? undefined : end);
}

describe("the version promise below 1.0", () => {
  it("never says a break moves the minor version", () => {
    const hits: string[] = [];
    for (const [label, text] of pages()) {
      const flat = text.replace(/\s+/gu, " ");
      for (const m of flat.matchAll(/[^.]*\b(?:moves?|bumps?) the minor\b[^.]*/giu)) {
        hits.push(`${label}: ${m[0].trim()}`);
      }
      for (const m of flat.matchAll(
        /[^.]*\bbreak\w*[^.]{0,60}\b(?:ships?|lands?) in a minor\b[^.]*/giu,
      )) {
        hits.push(`${label}: ${m[0].trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("prettyPrint() on the modify page", () => {
  const page = readFileSync(join(docsDir, "modify-and-resend.md"), "utf8");

  it("is not taught as a log format", () => {
    expect(page).not.toMatch(/(?:dump|view|message) for (?:a )?logs?\b|reading logs/iu);
    expect(page).toMatch(/never for a log in production/u);
  });

  it("shows no segment line with its field values", () => {
    expect(page).not.toMatch(/\b[A-Z][A-Z0-9]{2} {2}\[\d+\]=/u);
  });
});

describe("What is safe to log", () => {
  const text = section(
    readFileSync(join(docsDir, "warning-and-fatal-codes.md"), "utf8"),
    "What is safe to log",
  );

  it("exists", () => {
    expect(text).not.toBe("");
  });

  it("names Hl7ParseError.snippet as never to log", () => {
    expect(text).toMatch(/Hl7ParseError\.snippet/u);
  });

  /** The results and shapes whose `raw` carries input verbatim: a whole message, a segment, a field. */
  it.each(["splitBatch", "parseStream", "readMessages", "BatchEnvelopeSegment", "DtmAmbiguity"])(
    "names raw on %s as never to log",
    (name) => {
      const lines = text.split("\n").filter((line) => line.includes(`\`${name}\``));
      expect(lines.some((line) => /`(?:\w+\.)?raw`/u.test(line))).toBe(true);
    },
  );

  it("is not contradicted by a page calling snippet the only field that echoes input", () => {
    const hits: string[] = [];
    for (const [label, text] of pages()) {
      const flat = text.replace(/\s+/gu, " ");
      for (const m of flat.matchAll(
        /[^.]*(?:\bthe only field that echoes\b|\bthe field to scrub\b)[^.]*/giu,
      )) {
        hits.push(`${label}: ${m[0].trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("agrees with the README on warnings", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).not.toMatch(/safe to log as-is/u);
  });
});

/** A shown value that reads a field identifying a person, by the expression that reads it. */
const IDENTIFYING =
  /(?:\.mrn|\bfullName|\bfamilyName|\bgivenName|\bidNumber|\bvisitNumber|dateOfBirth\?\.raw|\bdob\?\.raw|\baddress\?\.|"PID\.[35]\b[^"]*"|"NK1[^"]*\.2[^"]*"|field\(3\)\.value|"siteMrn")/u;

describe("a shown value that identifies a person", () => {
  it("is marked synthetic", () => {
    const unmarked: string[] = [];
    for (const [label, text] of pages()) {
      text.split("\n").forEach((line, i) => {
        const at = line.indexOf("; // =>");
        if (at === -1) return;
        const value = line.slice(at + "; // =>".length).trim();
        if (!value.startsWith('"') && !value.startsWith("[")) return;
        if (!IDENTIFYING.test(line.slice(0, at))) return;
        if (!value.endsWith("/* synthetic */")) unmarked.push(`${label}:${String(i + 1)}`);
      });
    }
    expect(unmarked).toEqual([]);
  });

  it("does not build a line joining a record number with a result", () => {
    const page = readFileSync(join(docsDir, "process-a-lab-feed.md"), "utf8");
    expect(page).not.toMatch(/\$\{mrn\}/u);
  });
});

/**
 * The identifying values this repository's synthetic data carries, read from the data and not from
 * the expression that shows them: a shown value is caught however it was reached.
 *
 * The sources are the PHI allow list (`scripts/phi-allow-list.txt`, which declares every synthetic
 * name, birth date, address and bare id), the HL7 fixtures under `test/fixtures` and
 * `examples/data`, and every HL7 or v2 XML literal in the pages and example scripts. From an HL7
 * segment it takes the fields that carry a person: ids, names, birth dates, addresses, phones and
 * emails, and the free text of a note (NTE-3) or a text observation (OBX-5 of type ST, TX or FT).
 */
interface Identifying {
  /** Whole words matched case-insensitively: names. */
  words: Set<string>;
  /** Substrings matched exactly: ids, addresses, phones, free text. */
  literals: Set<string>;
  /** Birth dates as `YYYYMMDD`, matched in every written form `datePatterns` builds. */
  dates: Set<string>;
}

/** Which fields of which segment carry a person, by kind, as 1-based field numbers. */
const PERSON_FIELDS: Record<
  string,
  {
    ids?: number[];
    names?: number[];
    xcn?: number[];
    dob?: number[];
    addr?: number[];
    phone?: number[];
  }
> = {
  PID: { ids: [2, 3, 4, 18, 19, 20], names: [5, 6, 9], dob: [7], addr: [11], phone: [13, 14] },
  NK1: { names: [2], addr: [4], phone: [5, 6], dob: [16] },
  MRG: { ids: [1, 2, 3, 4, 5, 6], names: [7] },
  GT1: { ids: [2], names: [3], addr: [5], phone: [6, 7], dob: [8] },
  IN1: { ids: [36], names: [16], dob: [18], addr: [19] },
  PV1: { ids: [19, 50], xcn: [7, 8, 9, 17] },
  ORC: { xcn: [10, 11, 12] },
  OBR: { xcn: [10, 16, 28] },
};

/** HL7 escape sequences, which break a free-text field into the plain runs between them. */
const ESCAPE = /\\[^\\]*\\/gu;

/** A free-text value with its escape sequences taken out, as a reader sees the words. */
function withoutEscapes(value: string): string {
  return value.replace(ESCAPE, "").replace(/\s+/gu, " ").trim();
}

/**
 * The plain runs of a free-text value worth matching: two words or more. Escapes can cut every run
 * to one word (`Critical \H\value\N\ and`), so the words read with the escapes taken out count too.
 */
function freeTextRuns(value: string): string[] {
  return [...value.split(ESCAPE), withoutEscapes(value)]
    .map((run) => run.trim())
    .filter((run) => run.length >= 6 && /\S\s+\S/u.test(run));
}

/** Add what one HL7 segment line carries about a person. */
function readSegment(line: string, into: Identifying): void {
  const fields = line.split("|");
  const id = fields[0] ?? "";
  const at = (n: number): string[] => (fields[n] ?? "").split("~").filter((v) => v !== "");
  const spec = PERSON_FIELDS[id];
  if (spec) {
    for (const n of spec.ids ?? []) {
      for (const rep of at(n)) {
        const value = rep.split("^")[0] ?? "";
        if (value.length >= 4) into.literals.add(value);
      }
    }
    const addName = (part: string): void => {
      for (const word of part.split(/[&\s]/u))
        if (word.length >= 3) into.words.add(word.toLowerCase());
    };
    for (const n of spec.names ?? []) {
      for (const rep of at(n)) rep.split("^").slice(0, 3).forEach(addName);
    }
    for (const n of spec.xcn ?? []) {
      for (const rep of at(n)) {
        const parts = rep.split("^");
        if ((parts[0] ?? "").length >= 4) into.literals.add(parts[0] ?? "");
        parts.slice(1, 4).forEach(addName);
      }
    }
    for (const n of spec.dob ?? []) {
      for (const rep of at(n)) {
        const digits = /^\d{8}/u.exec(rep);
        if (digits) into.dates.add(digits[0]);
      }
    }
    for (const n of spec.addr ?? []) {
      for (const rep of at(n)) {
        const street = rep.split("^")[0] ?? "";
        if (street.length >= 4) into.literals.add(street);
      }
    }
    for (const n of spec.phone ?? []) {
      for (const rep of at(n)) {
        const parts = rep.split("^");
        for (const part of [parts[0], parts[3], `${parts[5] ?? ""}${parts[6] ?? ""}`]) {
          if (part !== undefined && part.replace(/\D/gu, "").length >= 7) into.literals.add(part);
          else if (part?.includes("@")) into.literals.add(part);
        }
      }
    }
  }
  if (id === "NTE") for (const rep of at(3)) freeTextRuns(rep).forEach((r) => into.literals.add(r));
  if (id === "OBX" && ["ST", "TX", "FT"].includes(fields[2] ?? "")) {
    for (const rep of at(5)) freeTextRuns(rep).forEach((r) => into.literals.add(r));
  }
}

/** A segment line inside source text: a person-bearing or free-text segment id and its fields. */
const SEGMENT_IN_SOURCE = new RegExp(
  `\\b(?:${[...Object.keys(PERSON_FIELDS), "NTE", "OBX"].join("|")})\\|[^"'\`\\r\\n]*`,
  "gu",
);

/** Free text inside a v2 XML literal: a note or an observation value element. */
const XML_FREE_TEXT = /<(?:NTE\.3|OBX\.5)>([^<]*)<\/(?:NTE\.3|OBX\.5)>/gu;

/** Every identifying value the synthetic data carries. */
function identifying(): Identifying {
  const out: Identifying = { words: new Set(), literals: new Set(), dates: new Set() };
  for (const line of readFileSync(join(root, "scripts", "phi-allow-list.txt"), "utf8").split(
    "\n",
  )) {
    const m = /^(NAME|DOB|ADDR|ID) (.+)$/u.exec(line.trim());
    if (!m) continue;
    const [, tag, value = ""] = m;
    if (tag === "NAME" && value.length >= 3) out.words.add(value.toLowerCase());
    if (tag === "DOB" && /^\d{8}$/u.test(value)) out.dates.add(value);
    if (tag === "ADDR" || tag === "ID") out.literals.add(value);
  }
  const hl7Files = [join(root, "test", "fixtures"), join(root, "examples", "data")].flatMap((dir) =>
    readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((d) => d.isFile() && /\.(?:hl7|ndhl7)$/u.test(d.name))
      .map((d) => join(d.parentPath, d.name)),
  );
  for (const file of hl7Files) {
    for (const line of readFileSync(file, "latin1").split(/\r\n|\r|\n/u)) readSegment(line, out);
  }
  const sources = [
    ...pages().map(([, text]) => text),
    ...readdirSync(join(root, "examples"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(join(root, "examples", name), "utf8")),
  ];
  for (const text of sources) {
    // Source text, read in one pass: `\\` is one backslash and `\r` ends a segment.
    const code = text.replace(/\\([\\r])/gu, (_, c: string) => (c === "r" ? "\n" : "\\"));
    for (const m of code.matchAll(SEGMENT_IN_SOURCE)) readSegment(m[0], out);
    for (const m of code.matchAll(XML_FREE_TEXT)) {
      const value = (m[1] ?? "")
        .replace(/&lt;/gu, "<")
        .replace(/&gt;/gu, ">")
        .replace(/&amp;/gu, "&");
      freeTextRuns(value).forEach((r) => out.literals.add(r));
    }
  }
  return out;
}

/** A birth date in the forms a page can show it: HL7, ISO, both slash orders, and its parts. */
function datePatterns(yyyymmdd: string): RegExp[] {
  const [y, mm, dd] = [yyyymmdd.slice(0, 4), yyyymmdd.slice(4, 6), yyyymmdd.slice(6, 8)];
  const [m, d] = [String(Number(mm)), String(Number(dd))];
  return [
    new RegExp(`(?<!\\d)${yyyymmdd}`, "u"),
    new RegExp(`(?<!\\d)${y}-${mm}-${dd}(?!\\d)`, "u"),
    new RegExp(`(?<!\\d)0?${m}/0?${d}/${y}(?!\\d)`, "u"),
    new RegExp(`(?<!\\d)0?${d}/0?${m}/${y}(?!\\d)`, "u"),
    new RegExp(`(?<!\\d)${y}\\s*,\\s*0?${m}\\s*,\\s*0?${d}(?!\\d)`, "u"),
    new RegExp(`year:\\s*${y},\\s*month:\\s*${m},\\s*day:\\s*${d}(?!\\d)`, "u"),
  ];
}

/**
 * Synthetic names that are also ordinary words a page uses in another sense: "Test canine" is a
 * species, "one" a lookup outcome, `PID (patient identification)` a diagram. A shown value holding
 * one of these as a name is still caught by the record number beside it, by the segment check, or
 * by the accessor check above (`"PID.5"`, `fullName`).
 */
const ORDINARY_WORDS = new Set(["test", "patient", "one", "two"]);

/**
 * Whether `value` holds `token` with no word character either side: a provider id `ORDER` is not
 * found inside the code `STRUCTURE_SEGMENT_OUT_OF_ORDER`.
 */
function holdsToken(value: string, token: string): boolean {
  for (let i = value.indexOf(token); i !== -1; i = value.indexOf(token, i + 1)) {
    const before = value[i - 1] ?? "";
    const after = value[i + token.length] ?? "";
    if (!/\w/u.test(before) && !/\w/u.test(after)) return true;
  }
  return false;
}

/** What in a shown value identifies a person, or `[]` when nothing does. */
function findIdentifying(value: string, ids: Identifying, patterns: RegExp[]): string[] {
  const found: string[] = [];
  // A word is a run of letters; `SEGMENT_CASE`, a code, is one word and not the name "Case".
  for (const word of value.toLowerCase().match(/[\p{L}_]+/gu) ?? []) {
    if (ids.words.has(word) && !ORDINARY_WORDS.has(word)) found.push(word);
  }
  // A shown value is source text: `\\` is one backslash, and free text is matched with its escapes out.
  const words = withoutEscapes(value.replace(/\\\\/gu, "\\"));
  for (const literal of ids.literals) {
    if (holdsToken(value, literal) || holdsToken(words, literal)) found.push(literal);
  }
  for (const p of patterns) if (p.test(value)) found.push(p.source);
  if (/[\w.+-]+@[\w-]+\.[\w.]+/u.test(value)) found.push("email");
  return found;
}

/** A whole segment in a shown value: an HL7 segment line or a v2 XML segment element. */
const SHOWN_SEGMENT = /(?:^|[^A-Za-z0-9])[A-Z][A-Z0-9]{2}\||<([A-Z][A-Z0-9]{2})>.*<\/\1>/u;

/** Info strings of a fence that shows output rather than code. */
const OUTPUT_FENCE = /^(?:|text|xml|console|output)$/u;

/**
 * A plain trailing comment that shows a value after code: `parse(x); // "1988-07-05"`. A comment
 * on a line of its own is prose, and `https://` is not a comment.
 */
const TRAILING_VALUE = /\S\s+\/\/\s+(["[{].*)$/u;

/**
 * Every shown value on the pages, as `[where, value]`: `// =>` annotations, plain trailing comments
 * that show a value, and output blocks.
 */
function shownValues(): [string, string][] {
  const out: [string, string][] = [];
  for (const [label, text] of pages()) {
    let fence: string | undefined;
    text.split("\n").forEach((line, i) => {
      const where = `${label}:${String(i + 1)}`;
      const open = /^\s*```(.*)$/u.exec(line);
      if (open) {
        fence = fence === undefined ? ((open[1] ?? "").trim().split(/\s/u)[0] ?? "") : undefined;
        return;
      }
      const at = line.indexOf("// =>");
      const trailing = TRAILING_VALUE.exec(line);
      if (at !== -1 && fence !== undefined && !OUTPUT_FENCE.test(fence)) {
        out.push([where, line.slice(at + "// =>".length).trim()]);
      } else if (trailing && fence !== undefined && !OUTPUT_FENCE.test(fence)) {
        out.push([where, (trailing[1] ?? "").trim()]);
      } else if (fence !== undefined && OUTPUT_FENCE.test(fence) && line.trim() !== "") {
        out.push([where, line.trim()]);
      }
    });
  }
  return out;
}

describe("a shown value holding the synthetic data's identifying values", () => {
  const ids = identifying();
  const patterns = [...ids.dates].flatMap(datePatterns);
  const shown = shownValues();

  it("reads the data and the pages, so it cannot pass on nothing", () => {
    expect(ids.words.has("doe")).toBe(true);
    expect(ids.literals.has("MRN12345")).toBe(true);
    expect(ids.literals.has("Specimen slightly hemolyzed")).toBe(true);
    expect(ids.dates.has("19880705")).toBe(true);
    expect(shown.length).toBeGreaterThan(400);
  });

  it("finds a birth date in each written form and a planted segment", () => {
    const dob = datePatterns("19880705");
    for (const form of [
      '"19880705"',
      '"1988-07-05"',
      '"07/05/1988"',
      "[1988, 7, 5]",
      "{ year: 1988, month: 7, day: 5 }",
      '"Smith"',
      '"Specimen slightly hemolyzed"',
      '"Critical \\\\H\\\\value\\\\N\\\\ and A"',
    ]) {
      expect(findIdentifying(form, ids, dob)).not.toEqual([]);
    }
    expect(findIdentifying("[1988, 7, 50]", ids, dob)).toEqual([]);
    expect(findIdentifying('["SEGMENT_CASE"]', ids, dob)).toEqual([]);
    expect(shown.some(([where]) => where === "read-dates-and-times.md:163")).toBe(true);
    expect(SHOWN_SEGMENT.test('"PID|||TESTID01^^^TESTLAB^MR||Test^Patient"')).toBe(true);
    expect(SHOWN_SEGMENT.test('"<PID><PID.3>TESTID01</PID.3></PID>"')).toBe(true);
    expect(SHOWN_SEGMENT.test('"ADT^A01^ADT_A01"')).toBe(false);
  });

  it("carries the synthetic mark", () => {
    const unmarked = shown
      .filter(([, value]) => !/(?:\/\* synthetic \*\/|, synthetic)$/u.test(value))
      .filter(([, value]) => findIdentifying(value, ids, patterns).length > 0)
      .map(([where, value]) => `${where} ${value}`);
    expect(unmarked).toEqual([]);
  });

  it("is never a whole segment: a page shows its segment names or one field instead", () => {
    const segments = shown
      .filter(([, value]) => SHOWN_SEGMENT.test(value))
      .filter(([, value]) => findIdentifying(value, ids, patterns).length > 0)
      .map(([where, value]) => `${where} ${value}`);
    expect(segments).toEqual([]);
  });
});
