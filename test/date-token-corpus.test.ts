/**
 * Executes the shared date-token grammar corpus
 * (`test/fixtures/date-tokens/corpus.json`) against this repository's
 * implementation of the grammar.
 *
 * The corpus is portable data, so the whole of the repo-specific part is in
 * this one file: read the JSON, map each case kind onto a call, assert the
 * stated expectation. A sibling parser adopting the grammar writes its own
 * version of this file and nothing else.
 *
 * A case this runner does not understand FAILS. It is never skipped, and the
 * shape validation below is deliberately exhaustive rather than defensive: a
 * corpus that silently ignores what it cannot read proves nothing, and a
 * skipped case in a green suite is indistinguishable from a passing one.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { matchDateFormat, SUPPORTED_DATE_TOKENS } from "../src/parser/date-tokens.js";
import { defineProfile } from "../src/index.js";
import { ProfileDefinitionError } from "../src/parser/errors.js";
import { parseDtm, parseDtmCascade } from "../src/parser/dates.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = join(__dirname, "fixtures/date-tokens/corpus.json");

/** The recovered-field bag a corpus `accept` case states. */
const FIELD_KEYS = [
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
  "fractionalSeconds",
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

interface AcceptCase {
  readonly id: string;
  readonly kind: "accept";
  readonly format: string;
  readonly tokens: readonly string[];
  readonly input: string;
  readonly precision: string | null;
  readonly expect: Readonly<Partial<Record<FieldKey, number | string>>>;
  readonly note: string;
}

interface RejectCase {
  readonly id: string;
  readonly kind: "reject-format";
  readonly format: string;
  readonly rule: string;
  readonly note: string;
}

interface NoMatchCase {
  readonly id: string;
  readonly kind: "no-match";
  readonly format: string;
  readonly input: string;
  readonly reason: string;
  readonly note: string;
}

type CorpusCase = AcceptCase | RejectCase | NoMatchCase;

interface Corpus {
  readonly grammar: string;
  readonly revision: number;
  readonly description: string;
  readonly tokens: readonly string[];
  readonly refusalRules: readonly string[];
  readonly precisionLevels: readonly string[];
  readonly noMatchReasons: readonly string[];
  readonly cases: readonly CorpusCase[];
}

const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8")) as Corpus;

/**
 * Names the fields a case kind requires. A case missing one of them, or
 * carrying a kind that is not here, is a corpus the runner cannot execute,
 * which is a failure and not a skip.
 */
const REQUIRED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  accept: ["id", "kind", "format", "tokens", "input", "precision", "expect", "note"],
  "reject-format": ["id", "kind", "format", "rule", "note"],
  "no-match": ["id", "kind", "format", "input", "reason", "note"],
};

/**
 * Why a case cannot be executed, or `undefined` when it can. Split out so the
 * refusal is itself testable: the corpus is green today, so a check that only
 * ran over the corpus would pass whether or not it still worked.
 */
function caseShapeProblem(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return "case is not an object";
  const record = value as Record<string, unknown>;
  const kind = record["kind"];
  if (typeof kind !== "string") return "case has no kind";
  const required = REQUIRED_FIELDS[kind];
  if (required === undefined) {
    return `kind '${kind}' is not one this runner executes, so the case states no expectation it can check`;
  }
  for (const field of required) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      return `case of kind '${kind}' is missing required field '${field}'`;
    }
  }
  return undefined;
}

describe("date-token corpus: a case with no expectation FAILS rather than being skipped", () => {
  it.each([
    ["an unknown kind", { id: "x", kind: "sometimes", format: "YYYY", note: "n" }],
    ["no kind at all", { id: "x", format: "YYYY", note: "n" }],
    ["an accept case with no expectation", { id: "x", kind: "accept", format: "YYYY", note: "n" }],
    [
      "an accept case with no stated precision",
      {
        id: "x",
        kind: "accept",
        format: "YYYY",
        tokens: ["YYYY"],
        input: "1988",
        expect: { year: 1988 },
        note: "n",
      },
    ],
    ["a reject case naming no rule", { id: "x", kind: "reject-format", format: "YY", note: "n" }],
    [
      "a no-match case naming no reason",
      { id: "x", kind: "no-match", format: "YYYY", input: "zz", note: "n" },
    ],
    ["a case that is not an object", "YYYY"],
  ])("refuses %s", (_label, badCase) => {
    expect(caseShapeProblem(badCase)).toBeDefined();
  });

  it("accepts every case the shipped corpus actually carries", () => {
    for (const c of corpus.cases) expect(caseShapeProblem(c)).toBeUndefined();
  });
});

describe("date-token corpus: the corpus itself is executable", () => {
  it("declares the grammar it belongs to", () => {
    expect(corpus.grammar).toBe("date-token-grammar");
    expect(corpus.revision).toBeGreaterThanOrEqual(1);
    expect(corpus.cases.length).toBeGreaterThan(0);
  });

  it("declares exactly the token vocabulary this package publishes", () => {
    expect([...corpus.tokens]).toEqual([...SUPPORTED_DATE_TOKENS]);
  });

  it("carries no two-digit-year and no timezone token", () => {
    expect(corpus.tokens).not.toContain("YY");
    for (const token of corpus.tokens) expect(token).not.toMatch(/^[Zz]+$/u);
  });

  it("every case has a kind this runner executes and every field that kind needs", () => {
    for (const c of corpus.cases) {
      expect(
        caseShapeProblem(c),
        `case '${String((c as { id?: string }).id)}' cannot be executed. A case with no expectation must fail, not be skipped.`,
      ).toBeUndefined();
    }
  });

  it("every case id is unique", () => {
    const ids = corpus.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every token in the vocabulary with at least one accepted case", () => {
    const covered = new Set<string>();
    for (const c of corpus.cases) if (c.kind === "accept") for (const t of c.tokens) covered.add(t);
    for (const token of corpus.tokens) {
      expect(covered.has(token), `no accepted case exercises token '${token}'`).toBe(true);
    }
  });

  it("covers every refusal rule with at least one rejected-at-definition case", () => {
    const covered = new Set<string>();
    for (const c of corpus.cases) if (c.kind === "reject-format") covered.add(c.rule);
    for (const rule of corpus.refusalRules) {
      expect(covered.has(rule), `no rejected case exercises refusal rule '${rule}'`).toBe(true);
    }
    for (const rule of covered) expect(corpus.refusalRules).toContain(rule);
  });

  it("covers every stated precision level with at least one accepted case", () => {
    const covered = new Set<string>();
    for (const c of corpus.cases) {
      if (c.kind === "accept" && c.precision !== null) covered.add(c.precision);
    }
    for (const level of corpus.precisionLevels) {
      expect(covered.has(level), `no accepted case reaches precision '${level}'`).toBe(true);
    }
  });

  it("covers every no-match reason with at least one no-match case", () => {
    const covered = new Set<string>();
    for (const c of corpus.cases) if (c.kind === "no-match") covered.add(c.reason);
    for (const reason of corpus.noMatchReasons) {
      expect(covered.has(reason), `no case exercises no-match reason '${reason}'`).toBe(true);
    }
    for (const reason of covered) expect(corpus.noMatchReasons).toContain(reason);
  });

  it("every accepted case declares only tokens the vocabulary holds", () => {
    for (const c of corpus.cases) {
      if (c.kind !== "accept") continue;
      for (const token of c.tokens) {
        expect(corpus.tokens, `case '${c.id}' declares unknown token '${token}'`).toContain(token);
      }
    }
  });
});

const acceptCases = corpus.cases.filter((c): c is AcceptCase => c.kind === "accept");
const rejectCases = corpus.cases.filter((c): c is RejectCase => c.kind === "reject-format");
const noMatchCases = corpus.cases.filter((c): c is NoMatchCase => c.kind === "no-match");

describe("date-token corpus: accepted formats parse to the stated fields", () => {
  it.each(acceptCases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    // A corpus `accept` case asserts the format is well formed, so the
    // definition-time validator must take it.
    expect(() => defineProfile({ name: "corpus", dateFormats: [c.format] })).not.toThrow();

    const matched = matchDateFormat(c.input, c.format);
    expect(matched, `${c.id}: ${c.note}`).toBeDefined();
    if (matched === undefined) return;

    for (const key of FIELD_KEYS) {
      const expected = Object.prototype.hasOwnProperty.call(c.expect, key)
        ? c.expect[key]
        : undefined;
      expect(matched[key], `${c.id}: field '${key}'`).toStrictEqual(expected);
    }

    // The stated precision is only observable on a value that carries a year,
    // because a DTM value is a date.
    const parts = parseDtmCascade(c.input, { userFormats: [c.format] });
    if (c.precision === null) {
      expect(parts.valid, `${c.id}: a year-less format cannot yield a DTM value`).toBe(false);
    } else {
      expect(parts.valid, `${c.id}: expected a DTM value`).toBe(true);
      expect(parts.precision, `${c.id}: stated precision`).toBe(c.precision);
      // The cascade prefers a strict HL7 DTM, so a corpus input that IS one
      // (a bare digit run) is claimed there and records no matched format.
      if (!parseDtm(c.input).valid) expect(parts.matchedFormat).toBe(c.format);
    }
  });
});

describe("date-token corpus: malformed formats are refused at definition time", () => {
  it.each(rejectCases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    let thrown: unknown;
    try {
      defineProfile({ name: "corpus", dateFormats: [c.format] });
    } catch (err) {
      thrown = err;
    }
    expect(thrown, `${c.id}: ${c.note}`).toBeInstanceOf(ProfileDefinitionError);
    if (!(thrown instanceof Error)) return;
    // An unactionable refusal is a defect of its own: the message names the
    // offending format and the entry it came from.
    expect(thrown.message).toContain(JSON.stringify(c.format));
    expect(thrown.message).toContain("dateFormats[0]");
  });
});

describe("date-token corpus: well-formed formats report no match, never a guess", () => {
  it.each(noMatchCases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    expect(() => defineProfile({ name: "corpus", dateFormats: [c.format] })).not.toThrow();
    expect(matchDateFormat(c.input, c.format), `${c.id}: ${c.note}`).toBeUndefined();
    // Nothing throws on the no-match path, and no parts are emitted.
    const parts = parseDtmCascade(c.input, { userFormats: [c.format] });
    expect(parts.matchedFormat).not.toBe(c.format);
  });
});
