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
