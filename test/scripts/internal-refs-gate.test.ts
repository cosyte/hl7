/**
 * THE DIFFERENTIAL CORPUS for the public-surface gate: one input and one expected verdict
 * per case, run against whatever `pnpm check:no-internal-refs` invokes.
 *
 * WHY THIS FILE EXISTS. `check-no-internal-refs: OK` reads exactly the same whether the gate
 * scanned 26 files against 6 rules or 0 files against 0. This repository is replacing its own
 * 1044-line `scripts/check-no-internal-refs.sh` with the published `./internal-refs` subpath of
 * `@cosyte/script-utils` (S0340), and no amount of reading the new caller shows that the
 * replacement still sees what the shell script saw. Only a corpus proved GREEN AGAINST THE OLD
 * IMPLEMENTATION FIRST, and then run unchanged against the new one, shows it.
 *
 * THE CORPUS IS THE REFEREE AND IS NEVER THE VARIABLE. If a case reds after the swap, the swap
 * is wrong; the case is not "updated to match". A refusal that became an acceptance is the
 * finding this file exists to produce, and the two that matter most in a clinical parser are
 * opposite failures:
 *
 *   * A GATE THAT SEES LESS ships internal identifiers, meta-repo paths and process commentary
 *     inside a published clinical toolkit and inside the JSDoc that renders in every consumer's
 *     editor. A published tarball cannot be recalled.
 *   * A GATE THAT SEES MORE tells a remediator to rewrite `MSH-2`, `PID-3`, `PKG-1`,
 *     `ICD-10-CM P00-P96` or `CSP-2 Study Phase Start Date/Time`, which is the reference
 *     material an HL7 parser's documentation exists to provide. When the collision is with
 *     clinical reference material, the reference material wins.
 *
 * WHAT IS GRADED, and by which criterion of S0340:
 *
 *   AC-9  the six named refusals and the named acceptance set, including the hard-wrapped
 *         indented-continuation shape that made the first version of the local gate print OK,
 *         in `docs-content/` and again inside a `src/` doc comment.
 *   AC-11 every state in which the gate must refuse rather than report clean: an untracked
 *         surface path, a `files` entry the configuration does not cover, a tracked entry that
 *         is not a regular file, an empty scan list, an empty doc-comment extraction from a
 *         non-empty source tree, and an input a text matcher classifies as binary.
 *   AC-12 the stream and exit-code discipline: one confirmation line on stdout and nothing on
 *         stderr when clean, everything on stderr and nothing on stdout when not, and no third
 *         exit code given a new meaning.
 *   AC-13 the gate run the way the `Public-surface gate` workflow runs it, against a fresh
 *         clone of the branch head, including the state where the shared implementation cannot
 *         be reached at all.
 *   AC-8  the self-check over this file: every case asserts something, and the case count
 *         cannot fall below the count recorded when this corpus first went green.
 *   Plus one positive and one negative case per rule per surface, per pass, drawn from the
 *   local gate's own POSITIVE and NEGATIVE self-test samples.
 *
 * HOW THE INVOCATION IS FOUND, WHICH IS ITSELF GRADED (AC-13). Nothing here hardcodes a
 * command. The command is read from `package.json`'s `check:no-internal-refs` script, which is
 * the one tracked file the `Public-surface gate` workflow also uses: that workflow is a thin
 * caller of a reusable workflow which prepares the tree and runs the package script. So a
 * change to what the gate IS reaches this corpus automatically, and a change to the WORKFLOW
 * that moved the invocation out of the package script would leave the corpus exercising a
 * command the workflow no longer runs. That is why one case below reads
 * `.github/workflows/no-internal-refs.yml` and refuses a caller that carries an invocation of
 * its own: a workflow change this corpus cannot see must FAIL it rather than pass silently.
 *
 * WHAT IS ASSERTED ON THE OUTPUT, AND WHAT IS NOT. Rule names are asserted, because a hit has
 * to name the rule it broke and the rule names are part of the shared contract. Sentence
 * wording is not: two implementations of the same rule set word a refusal differently, and a
 * corpus that pinned the prose would have to be rewritten by the swap it exists to grade. Each
 * case therefore asserts the verdict, the stream, the rule name, and the file or field named.
 *
 * Every case builds a throwaway git repository in a temp directory and runs the gate there.
 * Nothing here writes into this repository, and every subprocess call uses `spawnSync` with
 * array arguments: no shell form, no interpolation into a command line.
 */

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const MANIFEST_PATH = join(REPO_ROOT, "package.json");
const WORKFLOW_PATH = join(REPO_ROOT, ".github", "workflows", "no-internal-refs.yml");
const CORPUS_PATH = join(REPO_ROOT, "test", "scripts", "internal-refs-gate.test.ts");
const SCRIPT_KEY = "check:no-internal-refs";

/**
 * The number of cases in this file when the corpus first went green against the local shell
 * gate, recorded in `pipeline/active/S0340-hl7-internal-refs-adoption/notes.md` for THE
 * LOCAL-GREEN COMMIT. The floor only ever moves UP: a case removed to make a swap pass is the
 * failure mode this number exists to catch.
 */
const CASE_FLOOR = 62;

/**
 * The confirmation line, as a property rather than as a string. Both implementations of this
 * gate print `<name>internal-refs: OK (<what was scanned>)` and nothing else on stdout; the
 * name in front of it belongs to whichever one is wired up.
 */
const OK_LINE = /internal-refs: OK \(/;

interface Manifest {
  scripts?: Record<string, string>;
}

/** The invocation of record, from the tracked file the workflow's reusable pipeline runs. */
function gateArgv(): string[] {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  const command = manifest.scripts?.[SCRIPT_KEY];
  if (command === undefined || command.trim() === "") {
    throw new Error(`package.json has no "${SCRIPT_KEY}" script, so there is no gate to grade.`);
  }
  return command.trim().split(/\s+/);
}

const GATE_ARGV = gateArgv();

interface GateRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Run the gate over a tree that is NOT this repository. Repo-relative operands in the
 * invocation are resolved against this checkout, because the scanner lives here while the tree
 * under test lives in a temp directory; the gate itself anchors on the git top level of its
 * working directory, so the tree it reads is the fixture's.
 */
function runGateOnFixture(root: string): GateRun {
  const [command, ...rest] = splitInvocation();
  const argv = rest.map((token) =>
    !token.startsWith("-") && existsSync(join(REPO_ROOT, token)) ? join(REPO_ROOT, token) : token,
  );
  return spawn(command, argv, root);
}

/** Run the gate the way the workflow does: the checkout's own copy, from its own root. */
function runGateInCheckout(root: string): GateRun {
  const [command, ...rest] = splitInvocation();
  return spawn(command, rest, root);
}

/** The invocation as a command and its operands, refusing an empty one rather than guessing. */
function splitInvocation(): [string, ...string[]] {
  const [command, ...rest] = GATE_ARGV;
  if (command === undefined) throw new Error("the gate invocation is empty");
  return [command, ...rest];
}

function spawn(command: string, argv: string[], cwd: string): GateRun {
  const result = spawnSync(command, argv, { cwd, encoding: "utf8" });
  return {
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

type Files = Record<string, string | Buffer>;

/** A clean public surface and a clean source tree, both built from real reference material. */
const BASE: Files = {
  "README.md": "# Fixture parser\n\nReads MSH-2 encoding characters and PID-3 identifier lists.\n",
  "TRADEMARKS.md": "# Trademarks\n\nCosyte is a trademark of Cosyte.\n",
  LICENSE: "MIT License\n\nPermission is hereby granted.\n",
  "docs-content/reference.md": "# Reference\n\nTQ1-7 start and NM1-03 name are field references.\n",
  "package.json":
    JSON.stringify(
      {
        name: "@cosyte/fixture",
        version: "0.0.0",
        description: "A fixture parser for HL7 v2 messages.",
        keywords: ["hl7", "parser"],
        files: ["dist", "README.md", "LICENSE", "TRADEMARKS.md", "CHANGELOG.md"],
      },
      null,
      2,
    ) + "\n",
  "src/index.ts": docComment(" * Reads an OBX-5 value from a segment."),
};

/** A markdown page with one body block, so a case supplies only the text it is about. */
function page(body: string): string {
  return `# Page\n\n${body}\n`;
}

/** A source file whose only doc comment carries the body, plus a `//` comment that must not. */
function docComment(body: string): string {
  return [
    "/**",
    " * Parse one segment.",
    " *",
    body,
    " *",
    " * @example",
    ' *   parse("OBX|1");',
    " */",
    "export const parse = (s: string): string => s;",
    "",
  ].join("\n");
}

/** Build a throwaway repository: every fixture is a git tree, because the gate enumerates one. */
function makeFixture(overrides: Files = {}): string {
  const root = mkdtempSync(join(tmpdir(), "hl7-internal-refs-"));
  roots.push(root);
  spawnSync("git", ["init", "-q"], { cwd: root });
  for (const [rel, body] of Object.entries({ ...BASE, ...overrides })) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  spawnSync("git", ["add", "-A"], { cwd: root });
  return root;
}

/** Build the fixture and run the gate over it, which is what nearly every case below does. */
function verdict(overrides: Files = {}): GateRun {
  return runGateOnFixture(makeFixture(overrides));
}

/** The local gate's own POSITIVE self-test samples, one per rule, carried across unchanged. */
const POSITIVE = {
  identifier: "Item HL7-N7 is done, and CCDA-P7 with it.",
  phase:
    "Phase 5b closes it (Phase W, Phase-L and the thirteenth slice landed earlier, in wave 2).",
  adr: "Decided in ADR 0015 and restated in ADR-0021.",
  jargon: "This slice adds the helper and the final slice removes it.",
  repoPath: "Roadmap operations/roadmaps/hl7.md and documentation/decisions/0015-x.md.",
  traceability: "Repeating [S-NTE], and Open-question #12 resolves the direction.",
};

/**
 * The local gate's own NEGATIVE self-test samples. Every entry is real reference material from
 * an HL7, X12, DICOM or FHIR context, or ordinary English that collides with our jargon. These
 * are the cases a rule widened into the `WORD-N` shape destroys.
 */
const NEGATIVE = {
  identifier:
    "MSH-2 encoding characters, PID-3 identifier list, OBX-5 value, SCH-11 timing, TQ1-7 start, NM1-03 name, PKG-1 and PKG-4 packaging, ICD-10-CM P00-P96, FHIR-bridge stability, docs-content/ layout, HL7-defined tables, HL7-0396 and HL7-0003 and HL7-396, HL7-V2 and HL7-CDA, FHIR-R4, DICOM-SR and DICOM-RT, NCPDP-SCRIPT and NCPDP-D.0, X12-837P and X12-005010, 835 remittance",
  phase:
    "CSP-1 Study Phase Identifier, CSP-2 Study Phase Start Date/Time, CSP-3 Study Phase End Date/Time, CSP-4 Study Phase Evaluability; a Phase III oncology trial and a Phase II study; the acute phase reactant; the adapter stays in phase with the source system and is out of phase",
  adr: "ADR is not a segment, and 0015 alone is a value",
  jargon:
    "The slice thickness and the number of slices are DICOM attributes, each slice location is too, and the phase of the clinical study, the phase of illness and each phase of the trial are the reader words this rule must not touch",
  repoPath:
    "Parser operations are documented in the README, and documentation for the API is generated",
  traceability:
    "A character range like [S-Z], a value set written [SNOMED], and open questions about the feed",
  typescript: "subcomponents.slice() and path.slice(4, 8) are TypeScript, not our unit of work",
  segments: "RXA-3 and RXE-25 and AL1-6 and DG1-5 and IN1-12 and TXA-4 and FT1-4",
};

/**
 * The same six samples hard-wrapped with an INDENTED continuation, which is the dominant wrap
 * shape in this repository's markdown and the shape that made the first version of the local
 * gate print OK over a live violation. Neither half matches on its own line.
 */
const WRAPPED = {
  identifier: "- The P3\n  safety follow-up is queued.",
  phase: "- A future phase\n  may add opt-in decode for the segment.",
  adr: "- Decided in ADR\n  0015 and restated later.",
  jargon: "- This\n  slice adds the helper.",
  traceability: "- Open-question\n  #12 resolves the direction.",
};

/** The same wraps as doc-comment continuation lines, which a tooltip reflows the same way. */
const DOC_WRAPPED = {
  identifier: " * The P3\n * safety follow-up is queued.",
  phase: " * A future phase\n * may add opt-in decode for the segment.",
  adr: " * Decided in ADR\n * 0015 and restated later.",
  jargon: " * This\n * slice adds the helper.",
  traceability: " * Open-question\n * #12 resolves the direction.",
};

const RULE_NAMES = {
  identifier: "internal project identifier",
  phase: "phase or wave language",
  adr: "ADR reference",
  jargon: 'internal jargon ("slice")',
  repoPath: "internal repo path",
  traceability: "internal traceability marker",
};

describe("AC-12 the exit and stream discipline", () => {
  it("AC-12 exits 0 on a clean tree with one confirmation line on stdout and nothing on stderr", () => {
    const run = verdict();
    expect(run.status).toBe(0);
    expect(run.stdout.split("\n")).toHaveLength(1);
    expect(run.stdout).toMatch(OK_LINE);
    expect(run.stderr).toBe("");
  });

  it("AC-12 exits non-zero on a violation with the hits and the guidance on stderr and nothing on stdout", () => {
    const run = verdict({ "README.md": page(POSITIVE.identifier) });
    expect(run.status).not.toBe(0);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain(RULE_NAMES.identifier);
    expect(run.stderr).toContain("README.md");
    expect(run.stderr).toContain("belong in the changeset");
  });

  it("AC-12 never prints the confirmation line on a run that found something", () => {
    const run = verdict({ "README.md": page(POSITIVE.adr) });
    expect(run.stdout).not.toMatch(OK_LINE);
    expect(run.stderr).not.toMatch(OK_LINE);
  });

  it("AC-12 keeps one exit vocabulary: 0 for clean, one non-zero code for a hit and a refusal alike", () => {
    const clean = verdict();
    const hit = verdict({ "README.md": page(POSITIVE.identifier) });
    const refusal = verdict({
      "package.json": manifestWith({
        files: ["dist", "README.md", "LICENSE", "TRADEMARKS.md", "CHANGELOG.md", "docs-extra"],
      }),
    });
    expect([clean.status, hit.status, refusal.status]).toEqual([0, 1, 1]);
  });
});

/** The fixture manifest with one field replaced, so a case supplies only what it is about. */
function manifestWith(overrides: Record<string, unknown>): string {
  const base = JSON.parse(String(BASE["package.json"])) as Record<string, unknown>;
  return JSON.stringify({ ...base, ...overrides }, null, 2) + "\n";
}

describe("AC-9 the named refusals and the named acceptances", () => {
  it("AC-9(a) refuses a violation split across a hard wrap with an indented continuation in docs-content", () => {
    const run = verdict({ "docs-content/reference.md": page(WRAPPED.phase) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.phase);
    expect(run.stderr).toContain("docs-content/reference.md");
  });

  it("AC-9(b) refuses the same wrapped shape inside a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(DOC_WRAPPED.phase) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.phase);
    expect(run.stderr).toContain("src/index.ts");
  });

  it("AC-9(c) refuses an internal identifier in the npm description", () => {
    const run = verdict({
      "package.json": manifestWith({ description: "Toolkit delivered by HL7-N7 for parsing." }),
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.identifier);
    expect(run.stderr).toContain("npm metadata");
  });

  it("AC-9(c) refuses an internal identifier in the npm keywords", () => {
    const run = verdict({ "package.json": manifestWith({ keywords: ["hl7", "ADR-0021"] }) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.adr);
    expect(run.stderr).toContain("npm metadata");
  });

  it("AC-9(d) accepts the segment-field, code-range and standards-designation set on a public page", () => {
    const run = verdict({
      "docs-content/reference.md": page(
        "MSH-2, PID-3, OBX-5, TQ1-7, NM1-03, PKG-1, PKG-4, ICD-10-CM P00-P96, HL7-V2, FHIR-R4,\nDICOM-SR, NCPDP-SCRIPT and X12-837P are reference material.",
      ),
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-9(d) accepts the same set inside a src doc comment", () => {
    const run = verdict({
      "src/index.ts": docComment(
        " * MSH-2, PID-3, OBX-5, TQ1-7, NM1-03, PKG-1, PKG-4, ICD-10-CM P00-P96, HL7-V2, FHIR-R4,\n * DICOM-SR, NCPDP-SCRIPT and X12-837P are reference material.",
      ),
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-9(e) accepts the clinical study-phase field names and the ordinary clinical senses on a public page", () => {
    const run = verdict({
      "docs-content/reference.md": page(
        "CSP-1 Study Phase Identifier and CSP-4 Study Phase Evaluability are field names.\nA Phase III oncology trial, the acute phase reactant, and an adapter in phase with the\nsource system are all ordinary reference material.",
      ),
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-9(e) accepts the same clinical vocabulary inside a src doc comment", () => {
    const run = verdict({
      "src/index.ts": docComment(
        " * CSP-1 Study Phase Identifier and CSP-4 Study Phase Evaluability are field names.\n * A Phase III oncology trial, the acute phase reactant, and an adapter in phase with the\n * source system are all ordinary reference material.",
      ),
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-9(f) accepts an internal identifier inside a // comment in src, which is internal by the rule itself", () => {
    const run = verdict({
      "src/index.ts": [
        "/**",
        " * Parse one segment.",
        " */",
        "export const parse = (s: string): string => {",
        "  // Item HL7-N7 and the thirteenth slice tracked this, in wave 2.",
        "  /* Decided in ADR-0021. */",
        "  return s;",
        "};",
        "",
      ].join("\n"),
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });
});

describe("rule 1, internal project identifier, on both surfaces and in both passes", () => {
  it("AC-5 refuses the identifier sample on a public page, line by line", () => {
    const run = verdict({ "docs-content/reference.md": page(POSITIVE.identifier) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.identifier);
  });

  it("AC-5 refuses the identifier sample in a src doc comment, line by line", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${POSITIVE.identifier}`) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.identifier);
  });

  it("AC-5 refuses the identifier sample split across a wrap on a public page", () => {
    const run = verdict({ "docs-content/reference.md": page(WRAPPED.identifier) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.identifier);
  });

  it("AC-5 refuses the identifier sample split across a wrap in a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(DOC_WRAPPED.identifier) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.identifier);
  });

  it("AC-5 accepts the segment-field and standards material this rule must never destroy, on a public page", () => {
    const run = verdict({ "docs-content/reference.md": page(NEGATIVE.identifier) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-5 accepts the same material in a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${NEGATIVE.identifier}`) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-5 accepts the wider segment-field set a parser's doc comments carry", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${NEGATIVE.segments}`) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });
});

describe("rule 2, phase and wave language, on both surfaces and in both passes", () => {
  it("AC-5 refuses the phase sample on a public page, line by line", () => {
    const run = verdict({ "docs-content/reference.md": page(POSITIVE.phase) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.phase);
  });

  it("AC-5 refuses the phase sample in a src doc comment, line by line", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${POSITIVE.phase}`) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.phase);
  });

  it("AC-5 refuses the phase sample split across a wrap on a public page", () => {
    const run = verdict({ "docs-content/reference.md": page(WRAPPED.phase) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.phase);
  });

  it("AC-5 refuses the phase sample split across a wrap in a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(DOC_WRAPPED.phase) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.phase);
  });

  it("AC-5 accepts the clinical study-phase field names and senses on a public page", () => {
    const run = verdict({ "docs-content/reference.md": page(NEGATIVE.phase) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-5 accepts the same clinical vocabulary in a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${NEGATIVE.phase}`) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });
});

describe("rule 3, ADR references, on both surfaces and in both passes", () => {
  it("AC-5 refuses the ADR sample on a public page, line by line", () => {
    const run = verdict({ "docs-content/reference.md": page(POSITIVE.adr) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.adr);
  });

  it("AC-5 refuses the ADR sample in a src doc comment, line by line", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${POSITIVE.adr}`) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.adr);
  });

  it("AC-5 refuses the ADR sample split across a wrap on a public page", () => {
    const run = verdict({ "docs-content/reference.md": page(WRAPPED.adr) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.adr);
  });

  it("AC-5 refuses the ADR sample split across a wrap in a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(DOC_WRAPPED.adr) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.adr);
  });

  it("AC-5 accepts a bare ADR word and a bare four-digit value on a public page", () => {
    const run = verdict({ "docs-content/reference.md": page(NEGATIVE.adr) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-5 accepts the same on a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${NEGATIVE.adr}`) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });
});

describe('rule 4, internal jargon ("slice"), on both surfaces and in both passes', () => {
  it("AC-5 refuses the jargon sample on a public page, line by line", () => {
    const run = verdict({ "docs-content/reference.md": page(POSITIVE.jargon) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.jargon);
  });

  it("AC-5 refuses the jargon sample in a src doc comment, line by line", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${POSITIVE.jargon}`) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.jargon);
  });

  it("AC-5 refuses the jargon sample split across a wrap on a public page", () => {
    const run = verdict({ "docs-content/reference.md": page(WRAPPED.jargon) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.jargon);
  });

  it("AC-5 refuses the jargon sample split across a wrap in a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(DOC_WRAPPED.jargon) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.jargon);
  });

  it("AC-5 accepts the DICOM imaging vocabulary and the reader's own senses on a public page", () => {
    const run = verdict({ "docs-content/reference.md": page(NEGATIVE.jargon) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-5 accepts the same imaging vocabulary in a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${NEGATIVE.jargon}`) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-5 accepts TypeScript that reads like the jargon, which only the source surface carries", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${NEGATIVE.typescript}`) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });
});

describe("rule 5, internal repo paths, on both surfaces", () => {
  it("AC-5 refuses the repo-path sample on a public page, line by line", () => {
    const run = verdict({ "docs-content/reference.md": page(POSITIVE.repoPath) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.repoPath);
  });

  it("AC-5 refuses the repo-path sample in a src doc comment, line by line", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${POSITIVE.repoPath}`) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.repoPath);
  });

  it("AC-5 accepts ordinary uses of the words operations and documentation on a public page", () => {
    const run = verdict({ "docs-content/reference.md": page(NEGATIVE.repoPath) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-5 accepts the same wording in a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${NEGATIVE.repoPath}`) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-8 carries the stated residual forward: a path split by a wrap rejoins in neither pass", () => {
    const run = verdict({
      "docs-content/reference.md": page("- Roadmap operations/\n  roadmaps/hl7.md is the source."),
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });
});

describe("rule 6, internal traceability markers, on both surfaces and in both passes", () => {
  it("AC-5 refuses the traceability sample on a public page, line by line", () => {
    const run = verdict({ "docs-content/reference.md": page(POSITIVE.traceability) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.traceability);
  });

  it("AC-5 refuses the traceability sample in a src doc comment, line by line", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${POSITIVE.traceability}`) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.traceability);
  });

  it("AC-5 refuses the traceability sample split across a wrap on a public page", () => {
    const run = verdict({ "docs-content/reference.md": page(WRAPPED.traceability) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.traceability);
  });

  it("AC-5 refuses the traceability sample split across a wrap in a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(DOC_WRAPPED.traceability) });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(RULE_NAMES.traceability);
  });

  it("AC-5 accepts a documented character range and a value set on a public page", () => {
    const run = verdict({ "docs-content/reference.md": page(NEGATIVE.traceability) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });

  it("AC-5 accepts the same delimiters in a src doc comment", () => {
    const run = verdict({ "src/index.ts": docComment(` * ${NEGATIVE.traceability}`) });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
  });
});

describe("AC-11 the states in which the gate must refuse rather than report clean", () => {
  it("AC-11 refuses when a named public-surface path is no longer tracked", () => {
    const root = makeFixture();
    spawnSync("git", ["rm", "-q", "--cached", "README.md"], { cwd: root });
    const run = runGateOnFixture(root);
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toMatch(OK_LINE);
    expect(run.stderr).toContain("README.md");
    expect(run.stderr).toContain("not tracked");
  });

  it("AC-11 refuses a files entry the configuration does not account for", () => {
    const run = verdict({
      "package.json": manifestWith({
        files: ["dist", "README.md", "LICENSE", "TRADEMARKS.md", "CHANGELOG.md", "docs-extra"],
      }),
    });
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toMatch(OK_LINE);
    expect(run.stderr).toContain("docs-extra");
    expect(run.stderr).toContain("files");
  });

  it("AC-11 refuses a tracked entry under the scan surface that is not a regular file", () => {
    const root = makeFixture();
    mkdirSync(join(root, "elsewhere"), { recursive: true });
    writeFileSync(join(root, "elsewhere", "page.md"), "# Elsewhere\n");
    symlinkSync("../elsewhere", join(root, "docs-content", "linked"));
    spawnSync("git", ["add", "-A"], { cwd: root });
    const run = runGateOnFixture(root);
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toMatch(OK_LINE);
    expect(run.stderr).toContain("docs-content/linked");
    expect(run.stderr).toContain("not a regular file");
  });

  it("AC-11 refuses an empty scan list rather than reporting a clean tree it never read", () => {
    const root = mkdtempSync(join(tmpdir(), "hl7-internal-refs-"));
    roots.push(root);
    spawnSync("git", ["init", "-q"], { cwd: root });
    for (const [rel, body] of Object.entries(BASE)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, body);
    }
    spawnSync("git", ["add", "package.json", "src"], { cwd: root });
    const run = runGateOnFixture(root);
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toMatch(OK_LINE);
    expect(run.stderr).toContain("not tracked");
  });

  it("AC-11 refuses an empty doc-comment extraction from a non-empty source tree", () => {
    const run = verdict({
      "src/index.ts":
        "// no doc comment here at all\nexport const parse = (s: string): string => s;\n",
    });
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toMatch(OK_LINE);
    expect(run.stderr).toContain("doc-comment");
  });

  it("AC-11 refuses an input a text matcher classifies as binary rather than skipping it", () => {
    const run = verdict({
      "docs-content/blob.md": Buffer.concat([
        Buffer.from("intro\n"),
        Buffer.from([0x00]),
        Buffer.from("\nItem HL7-N7 is done\n"),
      ]),
    });
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toMatch(OK_LINE);
    expect(run.stderr).toContain("docs-content/blob.md");
    expect(run.stderr.toLowerCase()).toContain("binary");
  });
});

describe("AC-13 the gate run the way the Public-surface gate workflow runs it", () => {
  it("AC-13 the workflow carries no invocation of its own, so package.json's script is the command of record", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    const body = workflow
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    expect(body).toContain("uses: cosyte/.github/.github/workflows/gate-no-internal-refs.yml@");
    expect(body).not.toMatch(/^\s*run:/m);
    expect(body).not.toMatch(/^\s*steps:/m);
    expect(body).not.toMatch(/^\s*with:/m);
    expect(GATE_ARGV.length).toBeGreaterThan(0);
  });

  it("AC-13 prints the confirmation line and exits 0 on a fresh clone of the branch head", () => {
    const checkout = freshCheckout({ withInstall: true });
    const run = runGateInCheckout(checkout);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(OK_LINE);
    expect(run.stderr).toBe("");
  });

  it("AC-13 exits non-zero on the same fresh clone carrying one seeded violation", () => {
    const checkout = freshCheckout({ withInstall: true });
    writeFileSync(join(checkout, "README.md"), page(POSITIVE.identifier));
    const run = runGateInCheckout(checkout);
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toMatch(OK_LINE);
    expect(run.stderr).toContain(RULE_NAMES.identifier);
  });

  it("AC-13 exits non-zero rather than reporting clean when the run starts with no dependency install", () => {
    const checkout = freshCheckout({ withInstall: false });
    writeFileSync(join(checkout, "README.md"), page(POSITIVE.identifier));
    const run = runGateInCheckout(checkout);
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toMatch(OK_LINE);
    expect(existsSync(join(checkout, "node_modules"))).toBe(false);
  });
});

/**
 * A fresh clone of the branch head, with nothing installed into it. `withInstall` links this
 * checkout's `node_modules` in, which is what the workflow's install step makes true of the
 * runner; without it the clone is in the state a runner is in before that step.
 */
function freshCheckout(opts: { withInstall: boolean }): string {
  const root = mkdtempSync(join(tmpdir(), "hl7-internal-refs-clone-"));
  roots.push(root);
  const checkout = join(root, "checkout");
  const cloned = spawnSync(
    "git",
    ["clone", "--local", "--quiet", "--no-hardlinks", REPO_ROOT, checkout],
    {
      encoding: "utf8",
    },
  );
  if (cloned.status !== 0) throw new Error(`could not clone the branch head: ${cloned.stderr}`);
  if (opts.withInstall)
    symlinkSync(join(REPO_ROOT, "node_modules"), join(checkout, "node_modules"));
  return checkout;
}

/**
 * Every case block in this file, as text. A case starts where its opener does and ends where
 * the next one starts, which is coarse and is meant to be: a block that swallowed a helper
 * still has to carry an assertion, and "asserts nothing" is what this is looking for.
 */
function caseBlocks(source: string): string[] {
  const opener = new RegExp(`^[ \\t]*(?:${["it", "test"].join("|")})\\(`, "gm");
  const starts = [...source.matchAll(opener)].map((match) => match.index);
  return starts.map((start, index) => source.slice(start, starts[index + 1] ?? source.length));
}

describe("AC-8 the corpus grades itself", () => {
  it("AC-8 every case in this file asserts something", () => {
    const blocks = caseBlocks(readFileSync(CORPUS_PATH, "utf8"));
    expect(blocks.length).toBeGreaterThan(0);
    const silent = blocks
      .filter((block) => !block.includes("expect("))
      .map((block) => (block.split("\n")[0] ?? "").trim());
    expect(silent).toEqual([]);
  });

  it("AC-8 the case count never falls below the count recorded when this corpus first went green", () => {
    const source = readFileSync(CORPUS_PATH, "utf8");
    expect(caseBlocks(source).length).toBeGreaterThanOrEqual(CASE_FLOOR);
    expect(source).not.toMatch(/^[ \t]*(?:it|test|describe)\.(?:skip|todo)\(/m);
  });
});
