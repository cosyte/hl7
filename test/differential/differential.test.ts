/**
 * Differential harness (HL7-J Part D): parses the canonical corpus
 * (`test/fixtures/canonical/*.hl7`) through BOTH `@cosyte/hl7` and an
 * external Python HL7 v2 oracle, then compares segment count and
 * per-segment field extraction, reporting parity or divergences.
 *
 * Oracle: **python-hl7** (PyPI distribution name `hl7`, BSD license,
 * https://github.com/johnpaulett/python-hl7) — pure-Python, `import hl7`.
 * See `docs-content/spec-notes-differential.md` for the full writeup
 * (approach, licensing, known/justified divergences, how to run).
 *
 * **Oracle-gated, not a hard requirement.** If no Python interpreter with
 * `hl7` importable is found at runtime, every test in this file
 * `it.skip`s — `verify.sh` stays green with zero Python in the
 * environment. Detection order:
 *
 *   1. `.difftools/bin/python` (a local venv at the worktree root, created
 *      via `python3 -m venv .difftools && .difftools/bin/pip install hl7`
 *      — never committed, see `.gitignore`);
 *   2. the `python3` on `PATH`, if `import hl7` succeeds there.
 *
 * Field indexing is identical between the two parsers by construction (see
 * `src/parser/tokenize.ts`'s module JSDoc): `fields[0]`/`seg[0]` is the
 * segment-name-or-MSH-1-separator placeholder; `fields[N]`/`seg[N]` for
 * N >= 1 is the HL7 N-th field, including for MSH. Per-field comparison
 * uses `Field.text` (canonical re-serialized wire text) against
 * `str(field)` (python-hl7's reconstruction) — the two libraries' analogous
 * "give me this field's full wire text" accessors.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { parseHL7 } from "../../src/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.join(HERE, "..", "..");
const FIXTURE_DIR = path.join(HERE, "..", "fixtures", "canonical");
const ORACLE_SCRIPT = path.join(HERE, "oracle_python_hl7.py");

interface OracleSegment {
  readonly name: string;
  readonly fields: readonly string[];
}
interface OracleResult {
  readonly segments?: readonly OracleSegment[];
  readonly error?: string;
}

/**
 * A single documented, JUSTIFIED divergence pattern between `@cosyte/hl7`
 * and the oracle. Each entry is a real behavior difference observed while
 * building this harness (not a hypothetical) — see
 * `docs-content/spec-notes-differential.md` for the full narrative. A
 * mismatch that matches one of these predicates is reported (not silently
 * dropped) but does not fail the suite; anything that matches NONE of them
 * is an unclassified divergence and DOES fail — the harness must not let a
 * real regression hide behind an overly-broad tolerance.
 */
interface KnownDivergence {
  readonly id: string;
  readonly description: string;
  readonly matches: (ours: string, theirs: string) => boolean;
}

const KNOWN_DIVERGENCES: readonly KnownDivergence[] = [
  {
    id: "D02-trailing-empty-canonicalization",
    description:
      "@cosyte/hl7's Field.text strips trailing empty components/subcomponents (D-02, " +
      "src/serialize/emit-field.ts) on its canonical wire-text output; python-hl7's str(field) " +
      "preserves the raw substring verbatim, trailing empties included.",
    matches: (ours, theirs) =>
      theirs.startsWith(ours) && /^[\^&]*$/u.test(theirs.slice(ours.length)) && ours !== theirs,
  },
];

function classifyFieldMismatch(ours: string, theirs: string): KnownDivergence | undefined {
  return KNOWN_DIVERGENCES.find((d) => d.matches(ours, theirs));
}

/**
 * Find a Python interpreter with `hl7` importable. Tries the local
 * `.difftools` venv first (the one `pip install hl7` was asked to create
 * for this exact repo), then falls back to whatever `python3` is on PATH.
 * Returns `undefined` if neither works — the caller treats that as
 * "oracle unavailable" and skips.
 */
function findOraclePython(): string | undefined {
  const candidates = [path.join(WORKTREE_ROOT, ".difftools", "bin", "python"), "python3"];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-c", "import hl7"], { stdio: "pipe" });
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

/** Run the oracle adapter script against one fixture file; parses its JSON stdout. */
function runOracle(pythonBin: string, fixturePath: string): OracleResult {
  const stdout = execFileSync(pythonBin, [ORACLE_SCRIPT, fixturePath], { encoding: "utf8" });
  return JSON.parse(stdout) as OracleResult;
}

/**
 * Build the same {name, fields[]} shape from `@cosyte/hl7` for one
 * fixture's raw text, aligned to the oracle's `seg[1..N]` = "every field
 * after the segment-identifying slot" convention.
 *
 * Non-MSH: `RawSegment.fields[0]` is the segment-name placeholder (not a
 * data field, matches the oracle's `seg[0]`) — comparison starts at
 * `fields[1]` (HL7's first data field), using `Field.text` (canonical
 * re-serialized wire text).
 *
 * MSH: `RawSegment.fields[0]` is MSH-1 (the field separator itself) and
 * `fields[1]` is MSH-2 (encoding characters) — BOTH are data the oracle
 * includes (its `seg[1]`/`seg[2]`), so comparison starts at `fields[0]`.
 * Those two positions are read literally from the raw tokenizer tree
 * (bypassing `Field.text`, which the JSDoc documents as re-escaping MSH-1/
 * MSH-2 into garbage since they hold delimiter-definition characters, not
 * escapable content).
 */
function parseWithHl7(raw: string): readonly OracleSegment[] {
  const msg = parseHL7(raw);
  return msg.rawSegments.map((seg) => {
    const wrapped = msg.allSegments().find((s) => s.absoluteIndex === msg.rawSegments.indexOf(seg));
    const fields: string[] = [];
    if (wrapped !== undefined) {
      // HL7 1-indexed positions to compare: for MSH, positions 1..(fields.length)
      // (fields[0]=MSH-1 .. fields[last]=MSH-N); for non-MSH, positions
      // 1..(fields.length - 1) (fields[0] is the segment-name placeholder,
      // not a data field, so it's excluded — matches the oracle's seg[0]).
      const isMsh = seg.name === "MSH";
      const lastPosition = isMsh ? seg.fields.length : seg.fields.length - 1;
      for (let hl7Position = 1; hl7Position <= lastPosition; hl7Position++) {
        if (isMsh && (hl7Position === 1 || hl7Position === 2)) {
          // MSH-1/MSH-2 caveat (Field.text JSDoc): those two positions hold
          // the raw delimiter-definition characters, not escapable content.
          // Read them literally instead of calling `.field(n).text` (which
          // would re-escape them into garbage per the documented caveat).
          const sub = seg.fields[hl7Position - 1]?.repetitions[0]?.components[0]?.subcomponents[0];
          fields.push(sub ?? "");
          continue;
        }
        fields.push(wrapped.field(hl7Position).text);
      }
    }
    return { name: seg.name, fields };
  });
}

const FIXTURE_FILES = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".hl7"));

/** Accumulates a human-readable divergence report across the whole run. */
const divergenceLog: string[] = [];

describe("differential: @cosyte/hl7 vs python-hl7 oracle", () => {
  let oraclePython: string | undefined;

  beforeAll(() => {
    oraclePython = findOraclePython();
    if (oraclePython === undefined) {
      // eslint-disable-next-line no-console -- test-runner diagnostic, not library code
      console.log(
        "[differential] No Python + `hl7` package found (tried .difftools venv and PATH python3) " +
          "— skipping the differential suite. See docs-content/spec-notes-differential.md to set one up.",
      );
    }
  });

  it("sanity: canonical corpus is non-empty", () => {
    expect(FIXTURE_FILES.length).toBeGreaterThan(0);
  });

  for (const file of FIXTURE_FILES) {
    it(`${file}: segment count + per-segment field extraction parity`, (ctx) => {
      if (oraclePython === undefined) {
        ctx.skip();
        return;
      }

      const fixturePath = path.join(FIXTURE_DIR, file);
      const raw = readFileSync(fixturePath, "utf8");

      const oracle = runOracle(oraclePython, fixturePath);
      if (oracle.error !== undefined) {
        // The oracle itself failed to parse (or import) — report it as a
        // visible skip reason rather than a silent pass, but don't fail
        // the suite: an oracle-side parse failure on a specific fixture is
        // a documented divergence candidate, not a bug in this harness.
        divergenceLog.push(`${file}: oracle error — ${oracle.error}`);
        ctx.skip();
        return;
      }

      const ours = parseWithHl7(raw);
      const theirs = oracle.segments ?? [];

      // 1. Segment count parity — always a hard assertion. A segment-count
      // mismatch means one parser saw a fundamentally different message
      // shape, which is never a "known/justified" divergence.
      expect(
        ours.length,
        `segment count mismatch for ${file}: hl7=${String(ours.length)} oracle=${String(theirs.length)}`,
      ).toBe(theirs.length);

      // 2. Per-segment name + field-count + field-text parity, with known
      // divergences (see KNOWN_DIVERGENCES) reported but not failed.
      for (let i = 0; i < ours.length; i++) {
        const ourSeg = ours[i];
        const theirSeg = theirs[i];
        if (ourSeg === undefined || theirSeg === undefined) continue;

        expect(ourSeg.name, `segment[${String(i)}] name mismatch in ${file}`).toBe(theirSeg.name);
        expect(
          ourSeg.fields.length,
          `segment[${String(i)}] (${ourSeg.name}) field count mismatch in ${file}: ` +
            `hl7=${String(ourSeg.fields.length)} oracle=${String(theirSeg.fields.length)}`,
        ).toBe(theirSeg.fields.length);

        for (let f = 0; f < ourSeg.fields.length; f++) {
          const ourField = ourSeg.fields[f] ?? "";
          const theirField = theirSeg.fields[f] ?? "";
          if (ourField === theirField) continue;

          const divergence = classifyFieldMismatch(ourField, theirField);
          if (divergence !== undefined) {
            divergenceLog.push(
              `${file} segment[${String(i)}] (${ourSeg.name}) field[${String(f + 1)}]: ` +
                `KNOWN divergence (${divergence.id}) — hl7=${JSON.stringify(ourField)} ` +
                `oracle=${JSON.stringify(theirField)}`,
            );
            continue;
          }

          expect(
            ourField,
            `segment[${String(i)}] (${ourSeg.name}) field[${String(f + 1)}] text mismatch in ${file} ` +
              `(UNCLASSIFIED — does not match any KNOWN_DIVERGENCES entry)`,
          ).toBe(theirField);
        }
      }
    });
  }

  it("reports the accumulated divergence log (visible in test output, not a pass/fail gate)", () => {
    if (oraclePython === undefined) return;
    if (divergenceLog.length > 0) {
      // eslint-disable-next-line no-console -- intentional differential-report output
      console.log(
        `[differential] ${String(divergenceLog.length)} known divergence(s) observed:\n` +
          divergenceLog.map((l) => `  - ${l}`).join("\n"),
      );
    }
    // This test always "passes" — it's a reporting step, not a gate. The
    // gate is: every mismatch above was either exact parity or matched a
    // documented KNOWN_DIVERGENCES entry.
    expect(true).toBe(true);
  });
});
