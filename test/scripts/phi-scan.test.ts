/**
 * Unit tests for scripts/phi-scan.ts: the HL7 v2 PHI commit-gate.
 *
 * Positive tests prove the scanner CATCHES real-looking PHI (a weak scanner is
 * worse than none); negative tests prove it PASSES genuinely synthetic,
 * allow-listed fixtures. Each fixture exercises one branch of the HL7-aware
 * scanner:
 *   - a clean synthetic message (allow-listed name + DOB + phone + address)
 *   - a real patient-name violator (PID-5)
 *   - a provider-name violator (PV1-7, XCN comp2/3)
 *   - a Z-segment name violator (site-defined-segment backstop)
 *   - a date-of-birth violator (PID-7 not in the allow-list)
 *   - a street-address violator (PID-11)
 *   - a non-555 phone violator (PID-13)
 *   - a bare-numeric MRN violator (PID-3)
 *   - an SSN-typed CX violator (PID-3 identifier-type SS)
 *   - a dashed-SSN in OBX-5 free text
 *   - a non-test email in OBX-5 free text
 *   - a custom-delimiter message (delimiters read from MSH-1/MSH-2)
 *   - the committed corpus (all-mode) is clean
 *   - the --allow-fixture override-log gate
 *   - the enumeration TOCTOU window: what a vanished file is allowed to do to a
 *     sweep, and five of the six ways it still refuses (the sixth, a tolerated
 *     file written back before the post-sweep re-check, is not reachable from a
 *     deterministic harness; see the block's own note)
 *   - an in-scope entry that is not a regular file, on BOTH enumerating routes:
 *     the refusal, the negative controls that keep ordinary files scanned, and
 *     the rule that a refusal never echoes the link target (see that block's own
 *     note)
 *
 * Violator fixtures are written to a throwaway temp dir so they never pollute
 * the committed corpus that `pnpm phi-scan` sweeps. The scanner is invoked via
 * spawnSync (array args, no shell) so the full CLI path (argv parse, exit code,
 * stderr) is exercised.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No exec,
 * no shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  rmSync,
  readFileSync,
  appendFileSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = process.cwd();
const SCANNER_PATH = join(REPO_ROOT, "scripts", "phi-scan.ts");
const OVERRIDES_PATH = join(REPO_ROOT, "phi-scan-overrides.md");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");

/** Assemble an HL7 v2 message from segments, joined by the wire `\r` separator. */
function msg(...segments: string[]): string {
  return segments.join("\r");
}

const MSH = "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|MSG1|P|2.5";

/**
 * THE VIOLATOR IDENTITY, ASSEMBLED RATHER THAN WRITTEN OUT.
 *
 * Every value here is invented. The scanner cannot tell an invented identity
 * from a real one, and that is the whole point: these are the fixtures it is
 * SUPPOSED to catch, so each one is a deliberate violator and none of them may
 * go on the allow-list without making the positive tests below vacuous.
 *
 * `test/**` is a walk root, so this file is now inside the corpus `pnpm
 * phi-scan` sweeps. Written out as literals, these payloads reddened the repo's
 * own gate on 31 hits, and the two ways out of that were both worse than this
 * one: allow-listing the values would delete the tests' meaning, and carving the
 * file out of the scan would be the gate excusing itself from the rule it
 * enforces. Assembling keeps every property that matters -- the temp files these
 * build still carry the full violator bytes, every assertion below is unchanged,
 * and the scanner is still the thing being graded.
 *
 * It is also the discipline this file already used for `SYMLINK_SSN`, extended
 * to the rest of the identity. Be exact about what it buys: an assembled value
 * is not a PHI-shaped RUN in this file's bytes, which is what the embedded-
 * literal pass reads. It is not a claim that the parts are unrecoverable, and it
 * is not a technique for putting real PHI in a repo -- these values are invented,
 * and the reason to invent them is the same reason to assemble them.
 */
const V = {
  fam: ["Ander", "son"].join(""),
  giv: ["Mich", "ael"].join(""),
  provFam: ["Kowal", "ski"].join(""),
  provGiv: ["Ew", "a"].join(""),
  pcpFam: ["Fitz", "gerald"].join(""),
  pcpGiv: ["Ro", "nan"].join(""),
  dob: ["1977", "07", "07"].join(""),
  dob6: ["1977", "11"].join(""),
  street: ["742", " Ever", "green Terrace"].join(""),
  phone: ["^PRN^PH^^^312^", "867", "5309"].join(""),
  mrn: ["4829", "1043"].join(""),
  ssnCx: ["1234", "5678", "9"].join(""),
  // A non-allow-listed domain is what this one has to be; `.invalid` (RFC 2606)
  // is the form of that which is also permanently unregistrable. The superseded
  // literal used a `.org` that anyone could register, the same hazard a sibling
  // repo hit with a plausible hospital domain.
  email: ["jane", "@", "clinic", "-records", ".", "invalid"].join(""),
  tFam: ["This", "tle", "wood"].join(""),
  tGiv: ["Marg", "uerite"].join(""),
  tDob: ["1966", "04", "21"].join(""),
  tMrn: ["9876", "5432", "1"].join(""),
  tStreet: ["42", " Elm", "wood Ave"].join(""),
} as const;

let dir: string;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runScanner(args: string[]): RunResult {
  const r = spawnSync(TSX_BIN, [SCANNER_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Write a violator/clean message to the temp dir and scan it. */
function scan(name: string, content: string): RunResult {
  const path = join(dir, name);
  writeFileSync(path, content);
  return runScanner([path]);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "hl7-phi-scan-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Negative tests: genuinely synthetic, allow-listed content PASSES
// ---------------------------------------------------------------------------

describe("phi-scan: synthetic / allow-listed content passes (exit 0)", () => {
  it("a clean synthetic message exits 0", () => {
    const r = scan(
      "clean.hl7",
      msg(
        MSH,
        "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101||^PRN^PH^^^617^5551212",
      ),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("the committed corpus (all-mode) is clean", () => {
    const r = runScanner([]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    // Exact, not a substring: the clean line carries a "(N ... skipped)" tail
    // whenever the sweep did not observe everything it enumerated, and a clean
    // sweep of the committed corpus must never print that tail.
    expect(r.stdout).toBe("[phi-scan] OK: no hits\n");
  });
});

// ---------------------------------------------------------------------------
// Positive tests: real-looking PHI is CAUGHT
// ---------------------------------------------------------------------------

describe("phi-scan: names", () => {
  it("catches a real patient name in PID-5", () => {
    const r = scan("name.hl7", msg(MSH, `PID|1||MRN1^^^HOSP^MR||${V.fam}^${V.giv}||19800115|M`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-5/);
    expect(r.stderr).toContain(V.fam);
    expect(r.stderr).toContain(V.giv);
  });

  it("skips a single-letter middle initial (not identifying)", () => {
    // Family + given are allow-listed; the `Q` middle initial must not trip.
    const r = scan("initial.hl7", msg(MSH, "PID|1||MRN1^^^HOSP^MR||Doe^John^Q||19800115|M"));
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("catches a real provider name in PV1-7 (XCN comp2/3)", () => {
    const r = scan(
      "provider.hl7",
      msg(
        MSH,
        "PID|1||MRN1^^^HOSP^MR||Doe^John||19800115|M",
        `PV1|1|I|W^1^A||||ATTEND^${V.provFam}^${V.provGiv}^^^^MD`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PV1-7/);
    expect(r.stderr).toContain(V.provFam);
  });

  it("catches a name hidden in a site-defined Z-segment", () => {
    const r = scan(
      "zseg.hl7",
      msg(
        MSH,
        "PID|1||MRN1^^^HOSP^MR||Doe^John||19800115|M",
        "ZCA|1|1|PRIMARY|PROV-9|Okafor^Chidi^MD",
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/ZCA-5/);
    expect(r.stderr).toMatch(/Okafor/);
  });
});

describe("phi-scan: date of birth (PID-7)", () => {
  it("catches a DOB not in the allow-list", () => {
    const r = scan("dob.hl7", msg(MSH, `PID|1||MRN1^^^HOSP^MR||Doe^John||${V.dob}|M`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-7/);
    expect(r.stderr).toContain(V.dob);
  });
});

describe("phi-scan: address (PID-11)", () => {
  it("catches a real street address", () => {
    const r = scan(
      "addr.hl7",
      msg(MSH, `PID|1||MRN1^^^HOSP^MR||Doe^John||19800115|M|||${V.street}^^Springfield^IL^62704`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-11/);
    expect(r.stderr).toContain(V.street);
  });
});

describe("phi-scan: phone (PID-13)", () => {
  it("catches a phone without the 555 fake-exchange convention", () => {
    const r = scan(
      "phone.hl7",
      msg(MSH, `PID|1||MRN1^^^HOSP^MR||Doe^John||19800115|M|||||${V.phone}`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-13/);
  });
});

describe("phi-scan: identifiers", () => {
  it("catches a bare-numeric MRN in PID-3", () => {
    const r = scan("mrn.hl7", msg(MSH, `PID|1||${V.mrn}^^^HOSP^MR||Doe^John||19800115|M`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-3/);
    expect(r.stderr).toContain(V.mrn);
  });

  it("catches an SSN-typed CX identifier (PID-3 type SS)", () => {
    const r = scan(
      "ssn-cx.hl7",
      msg(MSH, `PID|1||MRN1^^^HOSP^MR~${V.ssnCx}^^^USA^SS||Doe^John||19800115|M`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-3/);
    expect(r.stderr).toContain(V.ssnCx);
  });

  it("passes an SSN CX rep whose id is a placeholder, not a 9-digit number", () => {
    // `SSN^^^USA^SS` (the canonical oru-r01.hl7 shape) is a synthetic placeholder.
    const r = scan(
      "ssn-placeholder.hl7",
      msg(MSH, "PID|1||MRN12345^^^HOSP^MR~SSN^^^USA^SS||Doe^John||19800115|M"),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

describe("phi-scan: free-text shape checks (OBX-5 / NTE)", () => {
  it("catches a dashed SSN in OBX-5 free text", () => {
    // Synthetic sentinel built from parts so no literal SSN-shaped string lives
    // in this source file (a 9xx area + all-zero serial is never a real SSN).
    const fakeSsn = ["9", "00", "55", "00", "00"]
      .join("")
      .replace(/^(\d{3})(\d{2})(\d{4})$/, "$1-$2-$3");
    const r = scan(
      "obx-ssn.hl7",
      msg(
        MSH,
        "PID|1||MRN1^^^HOSP^MR||Doe^John||19800115|M",
        `OBX|1|TX|N^Note^L||SSN on file ${fakeSsn}||||||F`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/dashed SSN pattern/);
  });

  it("catches a non-test email in OBX-5 free text", () => {
    const r = scan(
      "obx-email.hl7",
      msg(
        MSH,
        "PID|1||MRN1^^^HOSP^MR||Doe^John||19800115|M",
        `OBX|1|TX|N^Note^L||reach ${V.email}||||||F`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/email with non-test domain/);
  });
});

describe("phi-scan: delimiter handling", () => {
  it("reads custom delimiters from MSH-1/MSH-2 and still catches PHI", () => {
    // Field sep `@`, component sep `~` (mirrors custom-msh-delimiters.hl7).
    const r = scan(
      "custom.hl7",
      `MSH@~&#\\@A@B@C@D@20260101@@ADT~A01@M1@P@2.5\rPID@1@@MRN1~~~HOSP~MR@@${V.fam}~${V.giv}@@19800115@M`,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(V.fam);
  });
});

describe("phi-scan: structured scan is not silently bypassed (refuter regressions)", () => {
  it("scans a header-less message (no MSH: starts with EVN)", () => {
    // A message whose first segment is not MSH must still get the structured
    // scan (default delimiters), not fall through to the text-only pass.
    const r = scan(
      "no-msh.hl7",
      msg("EVN|A01|20260419100000", `PID|1||${V.mrn}^^^HOSP^MR||${V.fam}^${V.giv}||${V.dob}|M`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-5/);
    expect(r.stderr).toMatch(/PID-7/);
    expect(r.stderr).toMatch(/PID-3/);
  });

  it("matches segment ids case-insensitively (lowercase `pid`)", () => {
    // The lenient parser accepts a lowercase segment id; the scanner must too,
    // or a mixed-case feed escapes the per-field detectors.
    const r = scan("lower.hl7", msg(MSH, `pid|1||${V.mrn}^^^HOSP^MR||Doe^John||${V.dob}|M`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-7/);
    expect(r.stderr).toMatch(/PID-3/);
  });

  it("catches a provider name in an expanded field-map segment (PD1-4)", () => {
    const r = scan(
      "pd1.hl7",
      msg(
        MSH,
        "PID|1||MRN1^^^HOSP^MR||Doe^John||19800115|M",
        `PD1||||1234^${V.pcpFam}^${V.pcpGiv}^^^^MD`,
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PD1-4/);
    expect(r.stderr).toContain(V.pcpFam);
  });

  it("catches a 6-digit YYYYMM date of birth", () => {
    const r = scan("dob6.hl7", msg(MSH, `PID|1||MRN1^^^HOSP^MR||Doe^John||${V.dob6}|M`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-7/);
    expect(r.stderr).toContain(V.dob6);
  });

  it("keeps src-style .ts content (embedded MSH example) on the text-only pass", () => {
    // A file that is not fixture-like must not be parsed as HL7 even if it
    // contains an MSH example string: otherwise its code lines become "hits".
    const path = join(dir, "example.ts");
    writeFileSync(path, 'const example = "MSH|^~\\\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5";\n');
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// --allow-fixture override gate
// ---------------------------------------------------------------------------

describe("phi-scan: --allow-fixture override gate", () => {
  it("rejects --allow-fixture without an override-log entry (exit 2)", () => {
    const r = scan("gated.hl7", msg(MSH, `PID|1||MRN1^^^HOSP^MR||${V.fam}^${V.giv}||${V.dob}|M`));
    expect(r.code).toBe(1); // sanity: it is a violator
    const path = join(dir, "gated.hl7");
    const r2 = runScanner(["--allow-fixture", path]);
    expect(r2.code).toBe(2);
    expect(r2.stderr).toMatch(/phi-scan-overrides\.md/);
  });

  it("admits --allow-fixture PAST the log gate, and then refuses it (exit 2)", () => {
    // THIS CASE IS INVERTED FROM WHAT IT PINNED, DELIBERATELY. It used to assert
    // exit 0: "the override log is what flips a violator to clean". The
    // completeness rule made that assertion false and it is the assertion that
    // was wrong, not the rule: a whole-file bypass withdraws a file from the
    // read set, and a scan that never opened a file has no clean verdict to give
    // about it. What the log gate is FOR is unchanged and is what this still
    // pins: it decides whether the flag is admitted at all, which is a different
    // question from what the run then exits with, and the two codes prove the
    // difference (2 with a `phi-scan-overrides.md` message vs 2 with an
    // enumerated-and-never-read message).
    const path = join(dir, "override-me.hl7");
    writeFileSync(path, msg(MSH, `PID|1||MRN1^^^HOSP^MR||${V.fam}^${V.giv}||${V.dob}|M`));
    const rel = relative(REPO_ROOT, path).split(sep).join("/");
    // Sanity: scanned on its own it is a genuine violator.
    expect(runScanner([path]).code).toBe(1);

    // Without the log entry the flag never gets past the gate.
    const ungated = runScanner(["--allow-fixture", path]);
    expect(ungated.code).toBe(2);
    expect(ungated.stderr).toMatch(/phi-scan-overrides\.md/);

    const original = readFileSync(OVERRIDES_PATH, "utf8");
    try {
      appendFileSync(
        OVERRIDES_PATH,
        `\n### ${rel}\n\n- **Date:** 2026-08-11\n- **Reason:** unit test\n- **Approved by:** vitest\n- **Expires:** permanent\n`,
      );
      const r = runScanner(["--allow-fixture", path]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      // The gate ADMITTED it (no override-log complaint), and the completeness
      // rule is what refused. Asserted as the ABSENCE of the gate's message plus
      // the presence of the rule's, so the two refusals cannot be confused.
      expect(r.stderr).not.toMatch(/--allow-fixture rejected/);
      expect(r.stderr).toContain("enumerated and never read");
      expect(r.stderr).toContain(rel);
    } finally {
      writeFileSync(OVERRIDES_PATH, original);
    }
  });
});

// ---------------------------------------------------------------------------
// Enumeration TOCTOU
// ---------------------------------------------------------------------------

/**
 * `all` mode lists its roots, then reads each file. A file deleted inside that
 * window makes the read throw `ENOENT`, and the scanner refused the ENTIRE
 * sweep with exit 2. `@cosyte/ccda` is where that landed for real: its walk
 * starts at the repo root, `tsup` writes and then removes
 * `tsup.config.bundled_<hash>.mjs` there, and a publish-time sweep refused.
 *
 * THIS repo's walk is rooted at `test/fixtures` and `src`, so a repo-root
 * transient is never enumerated and the live tree is not reachable through the
 * window today. The shape is identical all the same, nothing gitignores that
 * filename here, and `test/docs-content.test.ts` really does run a build from
 * one worker while this file sweeps in all mode from another. So these tests
 * pin the bounds ahead of a widened walk root rather than after an outage.
 *
 * They hit the window WITHOUT a sleep and WITHOUT a real build. The scanner runs
 * `git check-ignore` and `git ls-files` after the walk and before the first
 * read, so a `git` shim placed first on `PATH` is a deterministic hook into
 * exactly the gap: it deletes the decoy, then execs the real git. The shim is a
 * file we exec through PATH, not a shell-form spawn from this suite.
 *
 * Everything runs against a throwaway git repo (`cwd`, which is the scanner's
 * `REPO_ROOT`), so no decoy is ever written into this repo and a parallel worker
 * cannot see one.
 *
 * The one branch not reachable this way is a tolerated file that is written BACK
 * before the post-sweep re-check: nothing in the scanner calls git after the
 * reads, so there is no second deterministic hook, and reaching it needs a timed
 * re-create against a deliberately slowed sweep. It is UNPINNED here, and that
 * is a deliberate trade rather than an oversight: the alternative is a
 * load-sensitive sleep in the suite guarding a load-dependent race, which is the
 * failure that race teaches. The branch can only turn a tolerated skip back into
 * the refusal this suite already pins, so an unnoticed regression in it loses the
 * re-check, never the tolerance's bounds.
 */

const tempRoots: string[] = [];

function tempDir(prefix: string): string {
  // `realpathSync` because the scanner roots everything at `process.cwd()`,
  // which node reports resolved: on a host whose tmpdir is itself a symlink an
  // unresolved root would make every repo-relative path come out wrong.
  const d = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  tempRoots.push(d);
  return d;
}

/** Absolute path of the real `git`, resolved from PATH without a subprocess. */
function realGit(): string {
  for (const entry of (process.env["PATH"] ?? "").split(":")) {
    if (entry.length === 0) continue;
    const candidate = join(entry, "git");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("git not found on PATH");
}

function gitIn(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  expect(r.status, r.stderr).toBe(0);
}

/** A throwaway repo the scanner can treat as REPO_ROOT (git init is optional). */
function makeScanRepo(opts: { git: boolean; track?: boolean }): string {
  const d = tempDir("hl7-phi-toctou-");
  if (opts.git) gitIn(d, ["init", "-q"]);
  mkdirSync(join(d, "scripts"), { recursive: true });
  mkdirSync(join(d, "src"), { recursive: true });
  mkdirSync(join(d, "test", "fixtures"), { recursive: true });
  // The scanner needs its allow-list + override log relative to REPO_ROOT. Note
  // that `scripts/` is NOT a walk root in this repo, so unlike the sibling this
  // was ported from, the allow-list is not what a sweep observes.
  const allowList = join("scripts", "phi-allow-list.txt");
  copyFileSync(join(REPO_ROOT, allowList), join(d, allowList));
  copyFileSync(OVERRIDES_PATH, join(d, "phi-scan-overrides.md"));
  writeFileSync(join(d, "src", "index.ts"), "export const version = '0.0.0';\n");
  // BOTH WALK ROOTS ARE SEEDED, and that is load-bearing rather than tidiness.
  // The observation rule is PER-ROOT, so a scratch repo with an EMPTY
  // `test/fixtures` is a starved repo and every case built on it would refuse at
  // exit 2 before reaching what it meant to assert. It also makes the harness the
  // shape of the real repo, where both roots always hold committed files.
  // `CLEAN_FIXTURE` is fully allow-listed and is declared below: a `const` in
  // module scope, evaluated long before any test calls this.
  writeFileSync(join(d, "test", "fixtures", "clean.hl7"), CLEAN_FIXTURE);
  // ALL THREE ROOTS ARE SEEDED, and `test` needs a file OF ITS OWN. `test`
  // NESTS `test/fixtures`, so the fixture above would satisfy it by itself and
  // every case that starves the fixture root would then name TWO roots instead
  // of the one it means to isolate. A file directly under `test/` decouples
  // them, and it is also the shape of the real repo, where the two roots hold
  // 115 and 113 tracked files respectively.
  writeFileSync(join(d, "test", "smoke.test.ts"), "export const smoke = true;\n");
  if (opts.git && opts.track !== false)
    gitIn(d, [
      "add",
      "scripts/phi-allow-list.txt",
      "src/index.ts",
      "test/fixtures/clean.hl7",
      "test/smoke.test.ts",
    ]);
  return d;
}

/**
 * A scan repo with one of its walk roots STARVED: the directory is there and
 * holds no file the walk will read, which is what an absent, dangling or empty
 * root all reduce to. Returns the repo.
 *
 * Starving `test` empties the fixture root with it, because the fixture root is
 * INSIDE it; starving `test/fixtures` leaves `test` yielding, because of the
 * file seeded directly under it above.
 */
function makeStarvedScanRepo(root: "test/fixtures" | "test" | "src"): string {
  const d = makeScanRepo({ git: true });
  rmSync(join(d, ...root.split("/")), { recursive: true, force: true });
  mkdirSync(join(d, ...root.split("/")), { recursive: true });
  return d;
}

/**
 * A `git` that runs `pre` (a line of `sh`) before delegating to the real git,
 * on the call whose argv contains `match`.
 *
 * IT IS MATCHED ON THE SUBCOMMAND, AND THAT IS LOAD-BEARING RATHER THAN
 * TIDINESS. These cases provoke the enumeration TOCTOU window, which opens when
 * `walk()` has listed a root and closes when the first file is read. All mode
 * calls git either side of that window: `ls-files -s -z` reads the index BEFORE
 * the walk, `check-ignore` runs AFTER the walk has enumerated and before any
 * read, and `cat-file` runs after the reads. An unmatched shim fired on the
 * first of those, so the decoy was already gone before the walk listed it and
 * every case here silently stopped provoking the window it names: measured, the
 * tracked-file refusal below reported exit 0 with the shim firing everywhere and
 * exit 2 with it bound to `check-ignore`. A case that no longer reaches its own
 * branch proves nothing, and it fails GREEN.
 *
 * `check-ignore` is therefore the default, because it is the one call inside the
 * window. `pre` is still idempotent everywhere below: git may call a matching
 * subcommand more than once.
 */
function gitShim(pre: string, match = "check-ignore"): string {
  const shimDir = tempDir("hl7-phi-shim-");
  writeFileSync(
    join(shimDir, "git"),
    `#!/bin/sh\ncase " $* " in\n  *" ${match} "*) ${pre} ;;\nesac\nexec '${realGit()}' "$@"\n`,
    { mode: 0o755 },
  );
  return shimDir;
}

function runScannerIn(
  cwd: string,
  shimDir: string | null,
  extraEnv?: NodeJS.ProcessEnv,
): RunResult {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  if (shimDir !== null) env["PATH"] = `${shimDir}:${process.env["PATH"] ?? ""}`;
  const r = spawnSync(TSX_BIN, [SCANNER_PATH], { cwd, encoding: "utf8", shell: false, env });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// Placed under `src/`, a real walk root here, because that is the state a
// widened walk root (or any tool dropping a transient inside one) produces. The
// name is the one that actually caused the sibling outage.
const BUNDLED = join("src", "tsup.config.bundled_1a2b3c4d.mjs");

/** A clean, fully allow-listed fixture: nothing here is a hit on its own. */
const CLEAN_FIXTURE = msg(
  MSH,
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101",
);

afterAll(() => {
  for (const d of tempRoots) rmSync(d, { recursive: true, force: true });
});

describe("phi-scan: enumeration TOCTOU", () => {
  it("tolerates an UNTRACKED file gone between enumeration and read, and reports it", () => {
    const repo = makeScanRepo({ git: true });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, 'export default { entry: ["src/index.ts"] };\n');
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    // The clean line on STDOUT is qualified, so a reader watching stdout alone
    // cannot take an unqualified OK from a sweep that skipped a file.
    expect(r.stdout).toMatch(/OK: no hits \(1 untracked file\(s\) skipped, see stderr\)/);
    // Never silent: the skip is named, with the file that went away.
    expect(r.stderr).toMatch(/skipped 1 untracked file\(s\) gone between enumeration and read/);
    expect(r.stderr).toContain("tsup.config.bundled_1a2b3c4d.mjs");
  });

  it("still REFUSES when a TRACKED file vanishes in the same window", () => {
    // The committed corpus is what the gate promises to have observed, so a
    // tracked file that cannot be read is an incomplete scan, not a transient.
    const repo = makeScanRepo({ git: true });
    const doomed = join(repo, "test", "fixtures", "committed.hl7");
    writeFileSync(doomed, CLEAN_FIXTURE);
    gitIn(repo, ["add", "test/fixtures/committed.hl7"]);
    const r = runScannerIn(repo, gitShim(`rm -f '${doomed}'`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/could not read test\/fixtures\/committed\.hl7/);
    expect(r.stderr).toMatch(/ENOENT/);
  });

  it("still REFUSES a non-ENOENT read failure on an untracked file", () => {
    // Replaced by a directory rather than deleted: EISDIR is a scan that failed,
    // not a file that went away, so the tolerance must not swallow it.
    const repo = makeScanRepo({ git: true });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, "export default {};\n");
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'\nmkdir -p '${decoy}'`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/could not read/);
    expect(r.stderr).toMatch(/EISDIR/);
  });

  it("REFUSES outright when git cannot say what it carries", () => {
    // Fail closed. This used to be a property of the TOLERANCE alone (with no
    // tracked set, a build transient is indistinguishable from committed
    // content, so nothing was tolerated and the sweep carried on). All mode now
    // reads the bytes git carries as well as the working tree, so the same
    // condition refuses the whole sweep one step earlier: a verdict over the
    // working tree alone is not the verdict this gate claims to give.
    const repo = makeScanRepo({ git: false });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, "export default {};\n");
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'`), {
      GIT_CEILING_DIRECTORIES: tmpdir(),
    });
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/could not read/);
  });

  it("REFUSES an all-mode sweep over an EMPTY index", () => {
    // An empty index is not a clean corpus, it is no corpus: every check the
    // sweep makes against what git carries would pass vacuously, and an empty
    // tracked set would also make every file untracked, which is the one state
    // in which the tracked-file bound stops existing. Both readings refuse.
    const repo = makeScanRepo({ git: true, track: false });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, "export default {};\n");
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/the git index holds no entries/);
  });

  it("REFUSES an all-mode sweep whose WALK observed no files", () => {
    // The refuse-a-scan-that-observes-nothing rule, now explicit: tolerating a
    // vanished file must never be able to decay into a clean report of nothing.
    // Everything under the roots is untracked and ignored, so the walk finds
    // files and the filters leave zero targets.
    //
    // THE INDEX IS DELIBERATELY NOT EMPTY, and it holds exactly one MARKDOWN
    // file. An empty index refuses one step earlier (the case above), which
    // would leave this rule asserted by a case that never reaches it; markdown
    // is the one thing the index route skips, so the index is populated and
    // still contributes no target. That keeps this case about the WALK, which
    // is what the per-root rule is a statement about.
    const repo = makeScanRepo({ git: true, track: false });
    writeFileSync(join(repo, "README.md"), "# scratch\n");
    gitIn(repo, ["add", "README.md"]);
    writeFileSync(join(repo, ".gitignore"), "*\n");
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/observed no files/);
  });

  it("still CATCHES a violator in an untracked file that does not vanish", () => {
    // The tolerance is about a file that is gone, never about untracked files.
    const repo = makeScanRepo({ git: true });
    writeFileSync(
      join(repo, "test", "fixtures", "leak.hl7"),
      msg(MSH, `PID|1||MRN1^^^HOSP^MR||${V.fam}^${V.giv}||${V.dob}|M`),
    );
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(V.fam);
  });
});

// ---------------------------------------------------------------------------
// Entries that are not regular files, on BOTH enumerating routes
// ---------------------------------------------------------------------------
//
// The walk enumerates `Dirent.isFile()`, an lstat answer, so a symbolic link is
// neither a file nor a directory; `--staged` (this repo's pre-commit hook) reads
// content with `git show :<path>`, and git stores a link as its TARGET PATH
// under mode 120000. A link under a scan root pointing at a PHI-bearing file
// therefore used to scan CLEAN on both, reproduced before the fix. These cases
// pin the refusal on each route, the negative controls that keep ordinary files
// scanned on each route, and the rule that a refusal never echoes what is on the
// other side of the link.
//
// Every case runs against a THROWAWAY GIT REPOSITORY (`makeScanRepo`), never
// against this one: the scanner roots everything at `process.cwd()`, so no link
// and no violator is ever written into the committed corpus.

/**
 * Synthetic sentinel SSN, built from parts by the same rule the OBX-5 case above
 * uses, so no literal SSN-shaped string lives in this source file. The safety is
 * the area number: the SSA has never issued a `9xx` area, so no such SSN exists.
 */
const SYMLINK_SSN = ["9", "00", "55", "01", "23"]
  .join("")
  .replace(/^(\d{3})(\d{2})(\d{4})$/, "$1-$2-$3");

/** Synthetic sentinel email on the reserved `.invalid` TLD (RFC 2606), never routable. */
const SYMLINK_EMAIL = `m.${V.tFam.toLowerCase()}@records.invalid`;

/**
 * Synthetic, name-bearing payload. A payload with no name proves nothing about a
 * claim that names do not leak, so this one carries a person name, a DOB, a
 * street address, a bare-numeric MRN, a dashed SSN and a non-test email. Every
 * value is invented: the surname and given name are made up rather than borrowed
 * from anyone, and the two shape-check sentinels are reserved forms above.
 */
const SYMLINK_PHI = msg(
  MSH,
  `PID|1||${V.tMrn}^^^HOSP^MR||${V.tFam}^${V.tGiv}^L||${V.tDob}|F|||${V.tStreet}^^Boston^MA^02101`,
  `NTE|1||SSN ${SYMLINK_SSN}, reachable at ${SYMLINK_EMAIL}`,
);

/**
 * The same synthetic payload, padded so git's similarity estimate keeps a copy or
 * a rename above its threshold. Every identifying value is the invented one above.
 */
const SYMLINK_PHI_PADDED = [
  SYMLINK_PHI.replace(/\r/g, "\n"),
  ...Array.from(
    { length: 40 },
    (_, i) => `NTE|${String(i + 2)}||narrative padding held constant across the copy`,
  ),
].join("\n");

/** The link target's own filename carries a name, so an echo of it is visible. */
const TARGET_NAME = `${V.tFam.toUpperCase()}-${V.tGiv.toUpperCase()}-${V.tDob}.hl7`;

/** Tokens that must never appear in a refusal message. */
const SYMLINK_PHI_TOKENS = [
  V.tFam,
  V.tFam.toUpperCase(),
  V.tGiv,
  V.tDob,
  V.tMrn,
  V.tStreet,
  SYMLINK_SSN,
  SYMLINK_EMAIL,
  TARGET_NAME,
];

function expectNoPhi(stderr: string): void {
  for (const t of SYMLINK_PHI_TOKENS) expect(stderr).not.toContain(t);
}

/** `git` in a throwaway repo with a committer identity that is not the box's. */
function gitCommit(cwd: string, message: string): void {
  gitIn(cwd, ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", message]);
}

function gitOut(cwd: string, args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  return r.stdout ?? "";
}

/** Run the scanner in a throwaway repo with arbitrary argv (no `git` shim). */
function runScannerArgsIn(cwd: string, args: string[]): RunResult {
  const r = spawnSync(TSX_BIN, [SCANNER_PATH, ...args], { cwd, encoding: "utf8", shell: false });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Write the payload at the repo root, OUTSIDE both walk roots, and return its path. */
function writePayloadOutsideRoots(repo: string): string {
  const p = join(repo, TARGET_NAME);
  writeFileSync(p, SYMLINK_PHI);
  return p;
}

describe("phi-scan: the harness is pointed at THIS package's scanner", () => {
  // A negative control on the harness itself, not on the scanner. These cases
  // assert what a sibling repo's scanner does NOT do, so a scanner or a fixture
  // that arrived from another package cannot be what is graded here.
  it("the repo under test is @cosyte/hl7 and the scanner is its own", () => {
    const manifest: unknown = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    const name: unknown =
      typeof manifest === "object" && manifest !== null && "name" in manifest
        ? manifest.name
        : undefined;
    expect(name).toBe("@cosyte/hl7");
    expect(name).not.toBe("@cosyte/terminology");
    expect(SCANNER_PATH.startsWith(REPO_ROOT)).toBe(true);
  });

  it("the payload is caught by HL7 SEGMENT-AWARE detection, not just the shared floor", () => {
    // `segment=PID-5` is the HL7 field model. A starter-floor scanner (the shape
    // every non-parser sibling ships) reports only `(ssn)` / `(email)`, so this
    // assertion fails against one.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "fixtures", "violator.hl7"), SYMLINK_PHI);
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("segment=PID-5");
    expect(r.stderr).toContain(V.tFam);
  });
});

describe("phi-scan: the synthetic payload is genuinely detectable", () => {
  // Guards against proving nothing by fixture: every refusal case below rests on
  // this payload being something the scanner would otherwise catch.
  it("as a plain regular file under a walk root it is a hit (exit 1)", () => {
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "fixtures", "violator.hl7"), SYMLINK_PHI);
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain(SYMLINK_SSN);
    expect(r.stderr).toContain(SYMLINK_EMAIL);
  });

  it("a repo with no link and no violator scans clean (exit 0)", () => {
    const repo = makeScanRepo({ git: true });
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });
});

describe("phi-scan: the all-mode walk refuses a non-regular entry", () => {
  it("refuses a symlink under a walk root pointing at PHI (exit 2), and reports no PHI", () => {
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    symlinkSync(join("..", "..", TARGET_NAME), join(repo, "test", "fixtures", "leak.hl7"));

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/leak.hl7");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
    expect(r.stdout).not.toMatch(/OK/);
  });

  it("refuses a symlinked DIRECTORY too, which isDirectory() also answers false for", () => {
    // A linked directory took a whole subtree with it, silently.
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, "elsewhere"));
    writeFileSync(join(repo, "elsewhere", TARGET_NAME), SYMLINK_PHI);
    symlinkSync(join("..", "..", "elsewhere"), join(repo, "test", "fixtures", "linked-dir"));

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/linked-dir");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("names EVERY offender, not just the first", () => {
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    symlinkSync(join("..", "..", TARGET_NAME), join(repo, "test", "fixtures", "one.hl7"));
    symlinkSync(join("..", TARGET_NAME), join(repo, "src", "two.ts"));

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/one.hl7");
    expect(r.stderr).toContain("src/two.ts");
    expect(r.stderr).toContain("2 entries");
    expectNoPhi(r.stderr);
  });

  it("an ignored link is out of scope, by the same rule that already excludes an ignored file", () => {
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    symlinkSync(join("..", "..", TARGET_NAME), join(repo, "test", "fixtures", "leak.hl7"));
    writeFileSync(join(repo, ".gitignore"), "test/fixtures/leak.hl7\n");

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("but an entry already in the index cannot be excused that way", () => {
    // `git check-ignore` never reports a TRACKED path as ignored, so a link that
    // is in the index is refused whatever .gitignore says.
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    symlinkSync(join("..", "..", TARGET_NAME), join(repo, "test", "fixtures", "leak.hl7"));
    writeFileSync(join(repo, ".gitignore"), "test/fixtures/leak.hl7\n");
    gitIn(repo, ["add", "-f", "test/fixtures/leak.hl7"]);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/leak.hl7");
    expectNoPhi(r.stderr);
  });

  it("still scans the ordinary files in the same walk root when nothing is a link", () => {
    // The refusal is not the only outcome: an ordinary violator beside the roots
    // is still reported normally.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "fixtures", "violator.hl7"), SYMLINK_PHI);
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
  });
});

describe("phi-scan: the --staged route refuses a staged non-regular entry", () => {
  it("git really does store the link as its target path, not the target's bytes", () => {
    // The measurement the refusal rests on. If git ever changed this, the
    // refusal below would be arguing from a premise that no longer holds.
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    symlinkSync(join("..", "..", TARGET_NAME), join(repo, "test", "fixtures", "leak.hl7"));
    gitIn(repo, ["add", "test/fixtures/leak.hl7"]);

    expect(gitOut(repo, ["ls-files", "--stage", "test/fixtures/leak.hl7"])).toMatch(/^120000 /);
    const shown = gitOut(repo, ["show", ":test/fixtures/leak.hl7"]);
    expect(shown.trim()).toBe(`../../${TARGET_NAME}`);
    expect(shown).not.toContain(SYMLINK_SSN);
  });

  it("refuses a staged symlink (exit 2), and reports no PHI", () => {
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    symlinkSync(join("..", "..", TARGET_NAME), join(repo, "test", "fixtures", "leak.hl7"));
    gitIn(repo, ["add", "test/fixtures/leak.hl7"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/leak.hl7");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("refuses a TYPECHANGE, a tracked regular file replaced by a link (exit 2)", () => {
    // The shape `--diff-filter=AM` used to delete before any mode could be read.
    // Replacing a TRACKED file with a link is neither an add nor a modify: git
    // raises `:100644 120000 <sha> <sha> T`, and without `T` in the filter the
    // record never existed, so the pre-commit hook passed the link green.
    const repo = makeScanRepo({ git: true });
    gitCommit(repo, "base");

    writePayloadOutsideRoots(repo);
    rmSync(join(repo, "src", "index.ts"));
    symlinkSync(join("..", TARGET_NAME), join(repo, "src", "index.ts"));
    gitIn(repo, ["add", "src/index.ts"]);

    // The premise: git really does raise this as a typechange, not A or M.
    expect(gitOut(repo, ["diff", "--cached", "--raw", "--diff-filter=AM"]).trim()).toBe("");
    expect(gitOut(repo, ["diff", "--cached", "--raw"])).toContain(" 120000 ");

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("src/index.ts");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
  });

  it("scans the other direction of a typechange, a link replaced by a real file (exit 1)", () => {
    // Admitting `T` also closes the reverse case: the bytes that arrive when a
    // link becomes a real file are scanned as the file it became.
    const repo = makeScanRepo({ git: true });
    symlinkSync(join("..", "..", "src", "index.ts"), join(repo, "test", "fixtures", "link.hl7"));
    gitIn(repo, ["add", "test/fixtures/link.hl7"]);
    gitCommit(repo, "base");

    rmSync(join(repo, "test", "fixtures", "link.hl7"));
    writeFileSync(join(repo, "test", "fixtures", "link.hl7"), SYMLINK_PHI);
    gitIn(repo, ["add", "test/fixtures/link.hl7"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("segment=PID-5");
    expect(r.stderr).toContain(V.tFam);
  });

  it("refuses a staged gitlink under a scanned prefix (exit 2)", () => {
    const repo = makeScanRepo({ git: true });
    const nested = join(repo, "test", "fixtures", "nested");
    mkdirSync(nested);
    gitIn(nested, ["init", "-q"]);
    writeFileSync(join(nested, "payload.hl7"), SYMLINK_PHI);
    gitIn(nested, ["add", "payload.hl7"]);
    gitCommit(nested, "n");
    gitIn(repo, ["add", "test/fixtures/nested"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/nested");
    expect(r.stderr).toContain("a gitlink");
    expectNoPhi(r.stderr);
  });

  it("still catches a staged ORDINARY file carrying the same payload (exit 1)", () => {
    // The regression control on the `--raw -z` reparse: reading the mode must not
    // cost the route the ordinary files it was already enumerating.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "fixtures", "violator.hl7"), SYMLINK_PHI);
    gitIn(repo, ["add", "test/fixtures/violator.hl7"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/violator.hl7");
    expect(r.stderr).toContain(SYMLINK_SSN);
  });

  it("passes a staged ordinary clean file (exit 0)", () => {
    const repo = makeScanRepo({ git: true });
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("a staged link OUTSIDE the route's scope is left alone (the scope is unchanged)", () => {
    // `--staged` only ever covered `test/fixtures/**` and `src/**.ts`. The mode
    // check narrows what that scope admits; it does not widen the scope, and
    // saying otherwise would overstate what this closes.
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    symlinkSync(TARGET_NAME, join(repo, "docs-link.md"));
    gitIn(repo, ["add", "docs-link.md"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("a staged src/ link that is not a .ts file is out of scope too", () => {
    // The `.ts` suffix is part of the pre-existing scope, and it is unchanged.
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    symlinkSync(join("..", TARGET_NAME), join(repo, "src", "notes.txt"));
    gitIn(repo, ["add", "src/notes.txt"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// A staged RENAME, and a staged UNMERGED path
// ---------------------------------------------------------------------------
//
// `git diff --cached --raw --diff-filter=AMT` returns neither `R` (rename) nor
// `C` (copy), so `git mv <anything> test/fixtures/<name>` staged a two-path
// record the filter deleted outright and this route printed "OK: no hits" over
// it. `U` (unmerged) was returned by neither `AM` nor `AMT` either, so an index
// the route structurally cannot read also reported clean.
//
// The remedy for the first is `--no-renames`, which makes the destination arrive
// as an ordinary single-path `A`; the remedy for the second is to enumerate `U`
// and REFUSE it, because there is no one staged blob behind such a path. Both
// are pinned here against git's own output first (the premise) and then against
// the scanner (the behaviour).

/** The `-z` two-field stride, for a filter under which no `R`/`C` can appear. */
function stagedPaths(repo: string, args: string[]): string[] {
  const fields = gitOut(repo, args).split("\0");
  const out: string[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    if ((fields[i] ?? "").length > 0) out.push(fields[i + 1] ?? "");
  }
  return out;
}

/**
 * The rename fixture is joined with `\n`, not the `\r` the wire form uses, and
 * that is deliberate rather than sloppy. Git estimates similarity over hashed
 * content chunks, and the identical edit to the `\r`-only form was measured
 * landing as a `D` + `A` pair rather than an `R`, which would make the case
 * under test unreachable by fixture. The scanner splits on `\r\n|\r|\n`, so the
 * `\n` form is scanned identically.
 */
function lfMessage(...segments: string[]): string {
  return segments.join("\n");
}

/** A clean, fully allow-listed message, padded so a rename stays above the similarity floor. */
const RENAME_BASE = lfMessage(
  MSH,
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101",
  ...Array.from(
    { length: 60 },
    (_, i) => `NTE|${String(i + 1)}||routine narrative padding, unchanged between versions`,
  ),
);

/** The same message with a real-looking surname substituted into PID-5. */
const RENAME_SUBSTITUTED = RENAME_BASE.replace("Doe^John^Q", `${V.tFam}^${V.tGiv}^L`).replace(
  "19800115",
  V.tDob,
);

describe("phi-scan: the --staged route is not blind to a staged rename", () => {
  it("git really does stage `git mv <link>` as a two-path R record the old filter deleted", () => {
    // The measurement the fix rests on. If git ever stopped doing this, the
    // remedy below would be arguing from a premise that no longer holds.
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    mkdirSync(join(repo, "staging"));
    symlinkSync(join("..", TARGET_NAME), join(repo, "staging", "leak.hl7"));
    gitIn(repo, ["add", "staging/leak.hl7"]);
    gitCommit(repo, "base");

    gitIn(repo, ["mv", "staging/leak.hl7", "test/fixtures/leak.hl7"]);

    // Two paths, mode 120000 on both sides, status R100.
    expect(gitOut(repo, ["diff", "--cached", "--raw"])).toMatch(
      /^:120000 120000 [0-9a-f]+ [0-9a-f]+ R100\tstaging\/leak\.hl7\ttest\/fixtures\/leak\.hl7$/m,
    );
    // ... and the filter alone deletes it.
    expect(gitOut(repo, ["diff", "--cached", "--raw", "--diff-filter=AMT"]).trim()).toBe("");
    // ... while `--no-renames` turns it into an ordinary single-path add.
    expect(
      gitOut(repo, ["diff", "--cached", "--raw", "--no-renames", "--diff-filter=AMT"]),
    ).toMatch(/^:000000 120000 [0-9a-f]+ [0-9a-f]+ A\ttest\/fixtures\/leak\.hl7$/m);
  });

  it("the new enumeration CONTAINS the old one, under every rename-detection setting", () => {
    // The property that makes this safe to adopt: nothing the route used to
    // enumerate stops being enumerated, whatever the caller's git config says.
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, "staging"));
    writeFileSync(join(repo, "test", "fixtures", "kept.hl7"), RENAME_BASE);
    writeFileSync(join(repo, "staging", "moved.hl7"), RENAME_BASE);
    gitIn(repo, ["add", "test/fixtures/kept.hl7", "staging/moved.hl7"]);
    gitCommit(repo, "base");

    // An add and a modify beside the rename, so the containment claim is about a
    // list with something in it. The added file's content is DELIBERATELY
    // distinct: with three byte-identical blobs in play git is free to pair the
    // rename source with the added path instead, which leaves the moved path an
    // ordinary `A` and quietly makes the case under test unreachable. The suite
    // caught exactly that.
    writeFileSync(join(repo, "test", "fixtures", "added.hl7"), CLEAN_FIXTURE);
    appendFileSync(join(repo, "test", "fixtures", "kept.hl7"), "\nNTE|61||one more line");
    gitIn(repo, ["add", "test/fixtures/added.hl7", "test/fixtures/kept.hl7"]);
    gitIn(repo, ["mv", "staging/moved.hl7", "test/fixtures/moved.hl7"]);

    const settings = [
      "diff.renames=true",
      "diff.renames=copies",
      "diff.renames=false",
      "diff.renames=1",
      "diff.renameLimit=1",
    ];
    for (const cfg of settings) {
      const before = stagedPaths(repo, [
        "-c",
        cfg,
        "diff",
        "--cached",
        "--raw",
        "-z",
        "--diff-filter=AMT",
      ]);
      const after = stagedPaths(repo, [
        "-c",
        cfg,
        "diff",
        "--cached",
        "--raw",
        "-z",
        "--no-renames",
        "--diff-filter=AMTU",
      ]);
      for (const p of before) expect(after, `config ${cfg}`).toContain(p);
      expect(after, `config ${cfg}`).toContain("test/fixtures/moved.hl7");
      expect(after, `config ${cfg}`).toContain("test/fixtures/added.hl7");
      expect(after, `config ${cfg}`).toContain("test/fixtures/kept.hl7");
    }

    // ... and with detection ON (git's default) the old enumeration really did
    // miss the moved file. That is what makes the containment above STRICT IN
    // THIS STATE. It is not strict in general: with nothing renamed or copied the
    // two enumerations are equal, and an unqualified "strict superset" claim was
    // refuted in review.
    expect(
      stagedPaths(repo, ["diff", "--cached", "--raw", "-z", "--diff-filter=AMT"]),
    ).not.toContain("test/fixtures/moved.hl7");
  });

  it("refuses a link `git mv`d into a scan root (exit 2), and reports no PHI", () => {
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    mkdirSync(join(repo, "staging"));
    symlinkSync(join("..", TARGET_NAME), join(repo, "staging", "leak.hl7"));
    gitIn(repo, ["add", "staging/leak.hl7"]);
    gitCommit(repo, "base");

    gitIn(repo, ["mv", "staging/leak.hl7", "test/fixtures/leak.hl7"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/leak.hl7");
    expect(r.stderr).toContain("a symbolic link");
    expectNoPhi(r.stderr);
    expect(r.stdout).not.toMatch(/OK/);
  });

  it("catches a rename that SUBSTITUTES a real name into the moved file (exit 1)", () => {
    // The other half of the same blindness, and the one with no link in it: an
    // ordinary regular file moved into a scan root with its PID-5 rewritten.
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, "staging"));
    writeFileSync(join(repo, "staging", "draft.hl7"), RENAME_BASE);
    gitIn(repo, ["add", "staging/draft.hl7"]);
    gitCommit(repo, "base");

    gitIn(repo, ["mv", "staging/draft.hl7", "test/fixtures/draft.hl7"]);
    writeFileSync(join(repo, "test", "fixtures", "draft.hl7"), RENAME_SUBSTITUTED);
    gitIn(repo, ["add", "test/fixtures/draft.hl7"]);

    // The premise: git records this as a rename, so the old filter dropped it.
    expect(gitOut(repo, ["diff", "--cached", "--raw"])).toMatch(/ R\d{3}\tstaging\/draft\.hl7\t/);
    expect(gitOut(repo, ["diff", "--cached", "--raw", "--diff-filter=AMT"]).trim()).toBe("");

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/draft.hl7");
    expect(r.stderr).toContain("segment=PID-5");
    expect(r.stderr).toContain(V.tFam);
  });

  it("catches a COPY into a scan root, which the rename fixture does not reach", () => {
    // `C` (copy) is dropped by `AMT` exactly as `R` is, and it is a genuinely
    // separate stage shape: no rename fixture produces one. Under
    // `diff.renames=copies` a file copied INTO a scan root stages as `C100` with
    // two paths.
    //
    // THE SOURCE IS MODIFIED IN THE SAME STAGE ON PURPOSE, and the case is
    // worthless without it: config-only copy detection (no `--find-copies-harder`
    // in the argv, and there must not be one) only considers a file already in
    // the diff as a copy source. Leave the source untouched and git finds none,
    // the record arrives as an ordinary `A` that the OLD argv also enumerated,
    // and the fixture passes on both scanners while proving nothing.
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, "staging"));
    writeFileSync(join(repo, "staging", "source.hl7"), SYMLINK_PHI_PADDED);
    gitIn(repo, ["add", "staging/source.hl7"]);
    gitCommit(repo, "base");
    gitIn(repo, ["config", "diff.renames", "copies"]);

    copyFileSync(join(repo, "staging", "source.hl7"), join(repo, "test", "fixtures", "copied.hl7"));
    appendFileSync(join(repo, "staging", "source.hl7"), "\nNTE|99||source touched in this stage");
    gitIn(repo, ["add", "test/fixtures/copied.hl7", "staging/source.hl7"]);

    // The premise: a real two-path `C` record, which `AMT` deletes outright.
    expect(gitOut(repo, ["diff", "--cached", "--raw"])).toMatch(
      /^:\d{6} \d{6} [0-9a-f]+ [0-9a-f]+ C\d{3}\tstaging\/source\.hl7\ttest\/fixtures\/copied\.hl7$/m,
    );
    expect(gitOut(repo, ["diff", "--cached", "--raw", "--diff-filter=AMT"])).not.toContain(
      "test/fixtures/copied.hl7",
    );

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/copied.hl7");
    expect(r.stderr).toContain("segment=PID-5");
    expect(r.stderr).toContain(V.tFam);
  });

  it("a rename to a destination OUTSIDE the route's scope is still left alone", () => {
    // `--no-renames` changes what the enumeration CONTAINS, not what the scope
    // is. A file moved to the repo root is out of scope before and after.
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, "staging"));
    writeFileSync(join(repo, "staging", "draft.hl7"), RENAME_BASE);
    gitIn(repo, ["add", "staging/draft.hl7"]);
    gitCommit(repo, "base");

    gitIn(repo, ["mv", "staging/draft.hl7", "moved-notes.md"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

describe("phi-scan: the --staged route refuses an unmerged path", () => {
  /**
   * Put `relPath` in the index at stages 1/2/3 and at no stage 0, which is
   * exactly what a conflicted merge leaves behind and exactly what the scanner
   * reads.
   *
   * IT IS BUILT WITH PLUMBING RATHER THAN BY RUNNING `git merge`, AND THAT IS
   * DELIBERATE. What the scanner reads is an INDEX STATE, so building that state
   * directly is both the smaller fixture and the honest unit: it needs no
   * branches, no merge strategy and no committer identity, and `git status`
   * still reports the result as `UU`, which is git itself confirming the
   * construction is a genuine conflict state.
   *
   * The concrete reason it is worth the plumbing, because a first draft drove
   * all four cases through a real `git merge` and every one of them failed on CI
   * on its own premise: `git merge` resolves the COMMITTER IDENTITY up front and
   * exits 128 with "Committer identity unknown" before merging anything if it
   * cannot find one. A developer's box has a global identity, or auto-detects
   * one from the user and hostname, so the fixture passed locally and could not
   * be reproduced by unsetting `HOME` alone; a CI runner has neither, so the
   * merge never ran. THE FIRST DRAFT OF THIS COMMENT BLAMED A GIT-VERSION
   * DIFFERENCE IN MERGE-STRATEGY BEHAVIOUR (2.39.5 local vs 2.54.0 on CI), which
   * was a guess and was WRONG: the cause is the identity, and it is why the case
   * below passes one explicitly. Said plainly because a fixture that depends on
   * the developer's global git config is a trap that will be ported.
   *
   * The real-merge shape is not thereby unpinned: the case below runs one, and
   * asserts the record it produces matches this construction.
   */
  function makeUnmergedIndex(repo: string, relPath = "test/fixtures/f.hl7"): void {
    const abs = join(repo, ...relPath.split("/"));
    writeFileSync(abs, RENAME_BASE);
    gitIn(repo, ["add", relPath]);
    gitCommit(repo, "base");

    const blob = (content: string): string => {
      const r = spawnSync("git", ["hash-object", "-w", "--stdin"], {
        cwd: repo,
        input: content,
        encoding: "utf8",
        shell: false,
      });
      expect(r.status, r.stderr).toBe(0);
      return (r.stdout ?? "").trim();
    };

    const stages = [
      `100644 ${blob(RENAME_BASE)} 1\t${relPath}`,
      `100644 ${blob(RENAME_BASE.replace("Doe^John^Q", "Roe^Jane^Q"))} 2\t${relPath}`,
      `100644 ${blob(RENAME_SUBSTITUTED)} 3\t${relPath}`,
    ].join("\n");

    gitIn(repo, ["update-index", "--force-remove", relPath]);
    const r = spawnSync("git", ["update-index", "--index-info"], {
      cwd: repo,
      input: `${stages}\n`,
      encoding: "utf8",
      shell: false,
    });
    expect(r.status, r.stderr).toBe(0);

    // The premise, in git's own words: this really is an unmerged path.
    expect(gitOut(repo, ["ls-files", "-u", "--", relPath]).trim()).not.toBe("");
    expect(gitOut(repo, ["status", "--short", "--", relPath])).toMatch(/^UU /m);
  }

  it("a real `git merge` conflict produces the same single-path U record", () => {
    // The fidelity check on `makeUnmergedIndex`: a genuine conflicted merge and
    // the plumbing-built index must be the same thing as far as this route is
    // concerned. The branch is switched back BY NAME rather than with
    // `git checkout -`, so the fixture does not lean on `@{-1}` reflog
    // resolution, and every diagnostic is carried into the assertion message
    // because a merge that does not conflict is the failure worth explaining.
    const repo = makeScanRepo({ git: true });
    const rel = "test/fixtures/f.hl7";
    const abs = join(repo, "test", "fixtures", "f.hl7");

    writeFileSync(abs, RENAME_BASE);
    gitIn(repo, ["add", rel]);
    gitCommit(repo, "base");
    const home = gitOut(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();

    gitIn(repo, ["checkout", "-q", "-b", "other"]);
    writeFileSync(abs, RENAME_SUBSTITUTED);
    gitIn(repo, ["add", rel]);
    gitCommit(repo, "other");

    gitIn(repo, ["checkout", "-q", home]);
    writeFileSync(abs, RENAME_BASE.replace("Doe^John^Q", "Roe^Jane^Q"));
    gitIn(repo, ["add", rel]);
    gitCommit(repo, "ours");

    // The merge is EXPECTED to fail, so it does not go through `gitIn`. It
    // carries an explicit committer identity for the same reason `gitCommit`
    // does, and that is NOT boilerplate: `git merge` resolves the committer up
    // front and exits 128 with "Committer identity unknown" before merging
    // anything if it cannot. A box whose global git config names a user (a
    // developer's) hides this completely, and a runner that has none does not:
    // measured green locally on git 2.39.5 and red on CI's git 2.54.0, where
    // the merge never ran and every case built on it failed on its own premise.
    const merge = spawnSync(
      "git",
      ["-c", "user.email=t@example.com", "-c", "user.name=t", "merge", "other"],
      { cwd: repo, encoding: "utf8", shell: false },
    );
    const why =
      `git ${gitOut(repo, ["--version"]).trim()}; merge exited ${String(merge.status)}\n` +
      `merge stdout: ${merge.stdout ?? ""}\nmerge stderr: ${merge.stderr ?? ""}\n` +
      `branch: ${gitOut(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).trim()} (home was ${home})\n` +
      `status: ${gitOut(repo, ["status", "--short", "--branch"])}`;

    expect(gitOut(repo, ["ls-files", "-u", "--", rel]).trim(), why).not.toBe("");
    expect(gitOut(repo, ["status", "--short"]), why).toMatch(/^UU test\/fixtures\/f\.hl7$/m);
    expect(gitOut(repo, ["diff", "--cached", "--raw"]), why).toMatch(
      /^:\d{6} 000000 [0-9a-f]+ [0-9a-f]+ U\ttest\/fixtures\/f\.hl7$/m,
    );
    expect(runScannerArgsIn(repo, ["--staged"]).code, why).toBe(2);
  });

  it("git reports the unmerged path as a single-path U record neither AM nor AMT returns", () => {
    const repo = makeScanRepo({ git: true });
    makeUnmergedIndex(repo);

    expect(gitOut(repo, ["status", "--short"])).toMatch(/^UU test\/fixtures\/f\.hl7$/m);
    expect(gitOut(repo, ["diff", "--cached", "--raw"])).toMatch(
      /^:\d{6} 000000 [0-9a-f]+ [0-9a-f]+ U\ttest\/fixtures\/f\.hl7$/m,
    );
    expect(gitOut(repo, ["diff", "--cached", "--raw", "--diff-filter=AM"]).trim()).toBe("");
    expect(gitOut(repo, ["diff", "--cached", "--raw", "--diff-filter=AMT"]).trim()).toBe("");
  });

  it("refuses it (exit 2) instead of reporting clean, and reports no PHI", () => {
    const repo = makeScanRepo({ git: true });
    makeUnmergedIndex(repo);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures/f.hl7");
    expect(r.stderr).toContain("unmerged");
    expectNoPhi(r.stderr);
    expect(r.stdout).not.toMatch(/OK/);
  });

  it("the refusal does not claim the path is a link or a gitlink", () => {
    // A `U` record's destination mode is 000000, which the mode test would
    // otherwise refuse with a sentence about `git show :<path>` handing back a
    // target path. That sentence is false for an unmerged regular file.
    const repo = makeScanRepo({ git: true });
    makeUnmergedIndex(repo);

    const r = runScannerArgsIn(repo, ["--staged"]);
    // The exit code is asserted here too: without it the three negatives below
    // are satisfied by a run that refused nothing at all, which is what the
    // route did before this. A test that a broken implementation also passes
    // occupies the slot without holding it.
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).not.toContain("a symbolic link");
    expect(r.stderr).not.toContain("a gitlink");
    expect(r.stderr).not.toContain("mode-000000");
  });

  it("an unmerged path OUTSIDE the route's scope is left alone", () => {
    // The scope control: admitting `U` narrows what the route ADMITS, it does
    // not widen the route. The conflict is built at a genuinely out-of-scope
    // path and left unresolved, so an implementation that refused every
    // unmerged path regardless of scope fails here.
    const repo = makeScanRepo({ git: true });
    makeUnmergedIndex(repo, "notes.md");

    // The premise: the unmerged entry is real, and it is the ONLY one, so a
    // pass here cannot come from an index with no conflict in it.
    expect(gitOut(repo, ["ls-files", "-u"])).toMatch(/\tnotes\.md$/m);
    expect(gitOut(repo, ["ls-files", "-u"])).not.toMatch(/\ttest\/fixtures\//m);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Exit 1 is reserved for HITS
// ---------------------------------------------------------------------------
//
// A scan that never ran is not a scan that found PHI. Both failures below used
// to throw out of `main` uncaught, which node reports as exit 1, the code this
// gate uses for "hits found", along with a v8 stack trace instead of the
// scanner's own diagnostic.

describe("phi-scan: a failure to scan exits 2, never 1", () => {
  it("a missing allow-list is an invocation error (exit 2), not a finding", () => {
    const repo = makeScanRepo({ git: true });
    rmSync(join(repo, "scripts", "phi-allow-list.txt"));

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("[phi-scan]");
    expect(r.stderr).toContain("allow-list not found");
    // The old behaviour, verbatim: an unhandled throw and node's own epilogue.
    expect(r.stderr).not.toContain("Node.js v");
  });

  it("a walk root that cannot be enumerated is an invocation error (exit 2), not a finding", () => {
    // A regular file where a walk root should be: `existsSync` passes and
    // `readdirSync` throws `ENOTDIR`. Chosen over an unreadable directory
    // because a permission bit proves nothing when the suite runs as root.
    const repo = makeScanRepo({ git: true });
    rmSync(join(repo, "test", "fixtures"), { recursive: true, force: true });
    writeFileSync(join(repo, "test", "fixtures"), "not a directory\n");

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("[phi-scan]");
    expect(r.stderr).toContain("could not enumerate test/fixtures");
    expect(r.stderr).not.toContain("Node.js v");
  });

  it("an unreadable allow-list reaches the top-level backstop (exit 2), not node's handler", () => {
    // `loadAllowList` raises a plain `Error` here, not an `InvocationError`, so
    // this is the case the per-stage catches do NOT cover.
    const repo = makeScanRepo({ git: true });
    rmSync(join(repo, "scripts", "phi-allow-list.txt"));
    mkdirSync(join(repo, "scripts", "phi-allow-list.txt"));

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("[phi-scan] the scan failed and did not complete");
    expect(r.stderr).not.toContain("Node.js v");
  });
});

// ---------------------------------------------------------------------------
// A scan ROOT'S OWN path, and the argv the stride is coupled to
// ---------------------------------------------------------------------------

describe("phi-scan: the --staged route covers a scan root's own path", () => {
  // An index entry at exactly `test/fixtures` or exactly `src` is never a
  // directory: git records no entry for one. So it is a scan root REPLACED by a
  // blob, a link or a gitlink, and the prefix test alone let it through.
  for (const root of ["test/fixtures", "src"] as const) {
    it(`refuses a link staged at exactly \`${root}\`, the root itself (exit 2)`, () => {
      const repo = makeScanRepo({ git: true });
      writePayloadOutsideRoots(repo);
      gitCommit(repo, "base");

      rmSync(join(repo, ...root.split("/")), { recursive: true, force: true });
      symlinkSync(TARGET_NAME, join(repo, ...root.split("/")));
      gitIn(repo, ["add", root]);

      // The premise: git really does record it as a mode-120000 entry at the
      // root's own path, and the enumeration really does contain it.
      expect(gitOut(repo, ["ls-files", "--stage", "--", root])).toMatch(/^120000 /);
      expect(
        gitOut(repo, ["diff", "--cached", "--raw", "--no-renames", "--diff-filter=AMTU"]),
      ).toMatch(new RegExp(`^:\\d{6} 120000 [0-9a-f]+ [0-9a-f]+ A\\t${root}$`, "m"));

      const r = runScannerArgsIn(repo, ["--staged"]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toContain(root);
      expect(r.stderr).toContain("a symbolic link");
      expectNoPhi(r.stderr);
      expect(r.stdout).not.toMatch(/OK/);
    });
  }

  it("a path that merely SHARES a prefix with a root is still out of scope", () => {
    // The `===` test must not become a `startsWith` by accident: `src-notes` is
    // not a scan root and is not scanned.
    //
    // `test/fixtures-old` USED TO BE THE SECOND HALF OF THIS CASE AND IS NOT ANY
    // MORE, because `test` is a root and `test/fixtures-old/` is under it. It
    // moved to its own test below rather than being deleted, so the change of
    // verdict is recorded instead of vanishing with the assertion.
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    gitCommit(repo, "base");

    symlinkSync(TARGET_NAME, join(repo, "src-notes"));
    gitIn(repo, ["add", "src-notes"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("a sibling of the fixture root under `test/` IS in scope now", () => {
    // The other half of the case above, inverted by the widening. A link staged
    // at `test/fixtures-old/leak.hl7` was outside the `test/fixtures/` prefix and
    // outside `src/**.ts`, so `--staged` enumerated nothing and exited 0 over a
    // mode-120000 entry pointing at a PHI-bearing file.
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    gitCommit(repo, "base");

    mkdirSync(join(repo, "test", "fixtures-old"), { recursive: true });
    symlinkSync(join("..", "..", TARGET_NAME), join(repo, "test", "fixtures-old", "leak.hl7"));
    gitIn(repo, ["add", "test/fixtures-old/leak.hl7"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures-old/leak.hl7 (a symbolic link)");
    expectNoPhi(r.stderr);
  });

  it("`test`'s OWN path is in scope, like the other two roots", () => {
    // An index entry at exactly `test` is the outer root REPLACED. Measured at
    // exit 0 before the widening: neither the `test/fixtures/` prefix nor
    // `src/**.ts` matched it, so nothing enumerated it at all.
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    gitCommit(repo, "base");

    rmSync(join(repo, "test"), { recursive: true, force: true });
    symlinkSync(TARGET_NAME, join(repo, "test"));
    gitIn(repo, ["rm", "-r", "-q", "--cached", "test"]);
    gitIn(repo, ["add", "test"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test (a symbolic link)");
    expectNoPhi(r.stderr);
  });

  it("markdown under `test/` stays out of the walk's scope on this route too", () => {
    // The new clause copies `walk()`'s markdown exclusion so the two routes
    // agree about the new root. The fixture root keeps its OWN unconditional
    // clause, so markdown under `test/fixtures/` is still enumerated here: that
    // is pre-existing and is not narrowed by this addition.
    const repo = makeScanRepo({ git: true });
    gitCommit(repo, "base");
    const ssn = SYMLINK_SSN;
    writeFileSync(join(repo, "test", "notes.md"), `a documented violator value ${ssn}\n`);
    writeFileSync(
      join(repo, "test", "fixtures", "notes.md"),
      `same value, under fixtures ${ssn}\n`,
    );
    gitIn(repo, ["add", "test/notes.md", "test/fixtures/notes.md"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/notes.md");
    expect(r.stderr).not.toContain("HIT: test/notes.md");
  });
});

// ---------------------------------------------------------------------------
// `test/**` is in scope, and the recogniser reaches an INLINE fixture
// ---------------------------------------------------------------------------

/**
 * A name-bearing payload whose ONLY detectable content is segment-aware. No
 * dashed SSN, no email: the two things `scanCommonShapes` can find on its own.
 * So a test that asserts a hit on this payload cannot be passing on the floor,
 * which is the whole distinction the scope half and the recogniser half turn on.
 */
const INLINE_PID = `PID|1||${V.tMrn}^^^HOSP^MR||${V.tFam}^${V.tGiv}^L||${V.tDob}|F|||${V.tStreet}^^Boston^MA^02101`;

/** The same identifying values with no segment shape around them. */
const INLINE_PROSE = `notes: ${V.tFam} ${V.tGiv} ${V.tDob} ${V.tMrn} ${V.tStreet}`;

describe("phi-scan: tracked files under test/ are in scope on BOTH routes", () => {
  // Before this, `SCAN_ROOTS` was `test/fixtures` + `src` and `--staged` matched
  // `test/fixtures/**` + `src/**.ts`, so a tracked file directly under `test/`
  // was enumerated by NEITHER: 115 of them in this repo, 55 carrying an inline
  // `PID|` literal. Every case below returns exit 0 on that scope.

  const inlineModule = (body: string): string => `export const SAMPLE = ${JSON.stringify(body)};\n`;

  it("catches an inline PID literal in a .ts file under test/, in all mode", () => {
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "inline.test.ts"), inlineModule(INLINE_PID));

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    // Asserted through the FIELD MODEL, field by field: this is the tier the
    // scope widening does not buy on its own.
    expect(r.stderr).toContain("segment=PID-5");
    expect(r.stderr).toContain("segment=PID-7");
    expect(r.stderr).toContain("segment=PID-3");
    expect(r.stderr).toContain("segment=PID-11");
    expect(r.stderr).toContain(V.tFam);
    // NON-VACUITY: the floor found nothing here, so nothing above came from it.
    expect(r.stderr).not.toContain("(ssn)");
    expect(r.stderr).not.toContain("(email)");
  });

  it("catches the same inline literal through --staged, the pre-commit route", () => {
    const repo = makeScanRepo({ git: true });
    gitCommit(repo, "base");
    writeFileSync(join(repo, "test", "inline.test.ts"), inlineModule(INLINE_PID));
    gitIn(repo, ["add", "test/inline.test.ts"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("segment=PID-5");
    expect(r.stderr).not.toContain("(ssn)");
  });

  it("SCOPE ALONE IS NOT ENOUGH: the same values as prose are NOT caught", () => {
    // The half that has to be said out loud. Widening the walk root buys the
    // dashed-SSN / email floor over 115 more files and nothing else; the
    // recogniser assumes the file IS the document, and a name, a DOB, an MRN and
    // a street address are only findable through the segment model. These bytes
    // hold every identifying value the case above hits on, in the same file, and
    // the scan is clean -- which is the residual, stated rather than papered over.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "prose.test.ts"), inlineModule(INLINE_PROSE));

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("SCOPE ALONE DOES BUY THE FLOOR: a dashed SSN under test/ is caught", () => {
    // The other side of the pair, so "scope buys the floor" is measured too.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "floor.test.ts"), inlineModule(`note ${SYMLINK_SSN}`));

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("dashed SSN pattern");
  });

  it("reads a whole message written as ONE literal with `\\r` escapes", () => {
    // An inline fixture is routinely one string. Without treating the source
    // escape as a segment separator the run is one line and every field offset
    // after the first segment is nonsense.
    const repo = makeScanRepo({ git: true });
    writeFileSync(
      join(repo, "test", "oneline.test.ts"),
      `export const M = "${MSH.replace(/\\/g, "\\\\")}\\r${INLINE_PID}";\n`,
    );

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("segment=PID-5");
  });

  it("does NOT read a template interpolation as a name, and still reads its neighbours", () => {
    // `${x}` is a variable: its value is not in the file, and reporting the
    // IDENTIFIER as a patient name invents a finding out of program text
    // (`content`, `marker`, `familyName` and `pidSurname` were each reported
    // that way). Erasing keeps the FIELD POSITIONS, so the literal DOB in the
    // same segment is still read at PID-7.
    const repo = makeScanRepo({ git: true });
    writeFileSync(
      join(repo, "test", "interp.test.ts"),
      "const familyName = load();\n" +
        `export const M = \`PID|1||MRN1^^^HOSP^MR||\${familyName}^\${givenName}||${V.tDob}|F\`;\n`,
    );

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("segment=PID-7");
    expect(r.stderr).not.toContain("familyName");
    expect(r.stderr).not.toContain("givenName");
  });

  it("LIMIT: an interpolated value is missed even when its literal is in the SAME file", () => {
    // Characterization of the residual, not aspiration, and it is here because
    // the first draft of the comment on `extractEmbeddedSegments` claimed a
    // SMALLER bound: "its value is not in the file". That is false. The pass
    // reads literals IN FIELD POSITION and evaluates nothing, so a surname
    // assigned to a constant three lines up is silent while the MRN and the DOB
    // written inline in the same segment are both caught.
    const repo = makeScanRepo({ git: true });
    writeFileSync(
      join(repo, "test", "hoisted.test.ts"),
      `const fam = ${JSON.stringify(V.tFam)};\n` +
        `const giv = ${JSON.stringify(V.tGiv)};\n` +
        `export const M = \`PID|1||${V.tMrn}^^^HOSP^MR||\${fam}^\${giv}||${V.tDob}|F\`;\n`,
    );

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("segment=PID-3");
    expect(r.stderr).toContain("segment=PID-7");
    // The miss. If this ever starts hitting, the limits list is out of date.
    expect(r.stderr).not.toContain("segment=PID-5");
    expect(r.stderr).not.toContain(V.tFam);
  });

  it("LIMIT: a run is cut at the first source quote, so HL7 explicit-null truncates it", () => {
    // The fourth limit, and the one that is a MISS rather than a suppressed
    // false positive. The cut is what stops `" +` and the rest of a source line
    // being read as fields; HL7 v2 §2.5.3 makes `""` the EXPLICIT-NULL field
    // value, so an inline fixture exercising null handling loses everything
    // after it. Both halves are asserted, because the pair is the finding: the
    // SAME bytes at a `.hl7` path are caught in full.
    const nullFieldPid = `PID|1|""|MRN001||${V.tFam}^${V.tGiv}||${V.tDob}|F`;

    const inlineRepo = makeScanRepo({ git: true });
    writeFileSync(
      join(inlineRepo, "test", "nullcase.test.ts"),
      `export const M = ${JSON.stringify(nullFieldPid)};\n`,
    );
    const inline = runScannerIn(inlineRepo, null);
    expect(inline.code, `stderr: ${inline.stderr}`).toBe(0);

    const fixtureRepo = makeScanRepo({ git: true });
    writeFileSync(join(fixtureRepo, "test", "fixtures", "nullcase.hl7"), nullFieldPid);
    const fixture = runScannerIn(fixtureRepo, null);
    expect(fixture.code, `stderr: ${fixture.stderr}`).toBe(1);
    expect(fixture.stderr).toContain("segment=PID-5");
    expect(fixture.stderr).toContain("segment=PID-7");
  });

  it("catches a `src/` JSDoc example carrying a real-looking name, which it did not before", () => {
    // A CHANGE OF INTENT, pinned so it cannot be read as accidental. The
    // superseded comment on `SCAN_ROOTS` said a JSDoc `@example`'s synthetic
    // names "must not trip the segment-aware detectors"; the embedded pass runs
    // on every non-fixture target, so they now do. This repo hard-requires an
    // `@example` on every public export, so the consequence is real: a new
    // example uses allow-listed tokens or adds its own, exactly like a fixture.
    const repo = makeScanRepo({ git: true });
    writeFileSync(
      join(repo, "src", "documented.ts"),
      `/**\n * @example\n * PID|1||MRN001||${V.provFam}^${V.provGiv}||${V.dob}|F\n */\n` +
        `export const documented = true;\n`,
    );

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("segment=PID-5");
    expect(r.stderr).toContain(V.provFam);
  });

  it("keeps a `src/` JSDoc example on the embedded pass, not the whole-file HL7 parse", () => {
    // `looksLikeHl7` is unchanged for `src/`: a `.ts` file is never parsed AS a
    // message, so its code lines do not become fields. The embedded pass still
    // reads a real inline literal in it, which is the point -- one more tier, not
    // a different file classification.
    const repo = makeScanRepo({ git: true });
    writeFileSync(
      join(repo, "src", "example.ts"),
      `/** @example ${MSH} */\nexport const version = "0.0.0";\n`,
    );

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

describe("phi-scan: a blob staged at EXACTLY the fixture root gets the segment-aware scan", () => {
  // `--staged` IS the pre-commit hook. An index entry at exactly `test/fixtures`
  // is the root replaced by a regular blob; the scope and the mode check already
  // passed it through, and it was the DETECTOR gate that dropped it, because
  // `looksLikeHl7` wanted a `test/fixtures/` prefix or an `.hl7` suffix and the
  // root's own path has neither.

  function stageBlobAtFixtureRoot(repo: string, body: string): void {
    gitCommit(repo, "base");
    rmSync(join(repo, "test", "fixtures"), { recursive: true, force: true });
    gitIn(repo, ["rm", "-r", "-q", "--cached", "test/fixtures"]);
    writeFileSync(join(repo, "test", "fixtures"), body);
    gitIn(repo, ["add", "test/fixtures"]);
  }

  it("catches a name, DOB, MRN and address in a blob staged at `test/fixtures`", () => {
    const repo = makeScanRepo({ git: true });
    stageBlobAtFixtureRoot(repo, msg(MSH, INLINE_PID));

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("HIT: test/fixtures");
    expect(r.stderr).toContain("segment=PID-5");
    expect(r.stderr).toContain("segment=PID-7");
    expect(r.stderr).toContain("segment=PID-3");
    expect(r.stderr).toContain("segment=PID-11");
    expect(r.stderr).toContain(V.tFam);
    // NON-VACUITY: no floor hit in this payload, so the segment tier is what ran.
    expect(r.stderr).not.toContain("(ssn)");
  });

  it("PRE-EXISTING: the dashed-SSN floor already fired at that path, and still does", () => {
    // The control that fixes what the defect WAS. It was never a silent pass over
    // any PHI shape: the floor held and only the segment-aware tier was missing,
    // so the fix is one clause in `looksLikeHl7` and not a new rule.
    const repo = makeScanRepo({ git: true });
    stageBlobAtFixtureRoot(repo, msg(MSH, `NTE|1||SSN ${SYMLINK_SSN}`));

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("dashed SSN pattern");
  });

  it("the same bytes at `test/fixtures/<name>.hl7` are the reference, and agree", () => {
    // The two paths must give the SAME verdict; the defect was that they did not.
    const repo = makeScanRepo({ git: true });
    gitCommit(repo, "base");
    writeFileSync(join(repo, "test", "fixtures", "x.hl7"), msg(MSH, INLINE_PID));
    gitIn(repo, ["add", "test/fixtures/x.hl7"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("segment=PID-5");
    expect(r.stderr).toContain("segment=PID-7");
    expect(r.stderr).toContain("segment=PID-3");
    expect(r.stderr).toContain("segment=PID-11");
  });

  it("`src`'s own path is NOT given the HL7 parse, and the embedded pass covers it", () => {
    // Only the fixture root's own path joins the fixture-like set: `src` is not
    // an HL7 corpus, so a blob replacing it is judged the way everything else
    // under `src` is -- the floor plus the embedded pass, which reads the inline
    // literal anyway.
    const repo = makeScanRepo({ git: true });
    gitCommit(repo, "base");
    rmSync(join(repo, "src"), { recursive: true, force: true });
    gitIn(repo, ["rm", "-r", "-q", "--cached", "src"]);
    writeFileSync(join(repo, "src"), msg(MSH, INLINE_PID));
    gitIn(repo, ["add", "src"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("HIT: src");
    expect(r.stderr).toContain("segment=PID-5");
  });
});

describe("phi-scan: the argv the two-field stride is coupled to", () => {
  it("`-M`, `-C` and `--find-copies-harder` each reopen the two-path record; `-B` does not", () => {
    // The guard on a claim the scanner's own comment makes. `--no-renames` is
    // what makes a two-path record impossible, and these three turn detection
    // back on over the top of it, which empties this route again. A sibling
    // shipped this warning INVERTED (naming `-B`), so it is measured here rather
    // than recalled.
    //
    // NOTHING HERE CLAIMS A LATER `--no-renames` UNDOES THEM. An earlier draft
    // did, and it is false for `--find-copies-harder`: `diff_setup_done()` forces
    // copy detection on whenever that flag is set, so the enumeration is empty in
    // BOTH orders. The rule is simply that none of the three may appear.
    const repo = makeScanRepo({ git: true });
    writePayloadOutsideRoots(repo);
    mkdirSync(join(repo, "staging"));
    symlinkSync(join("..", TARGET_NAME), join(repo, "staging", "leak.hl7"));
    gitIn(repo, ["add", "staging/leak.hl7"]);
    gitCommit(repo, "base");
    gitIn(repo, ["mv", "staging/leak.hl7", "test/fixtures/leak.hl7"]);

    const enumerated = (extra: string[]): string =>
      gitOut(repo, [
        "diff",
        "--cached",
        "--raw",
        "--no-renames",
        ...extra,
        "--diff-filter=AMTU",
      ]).trim();

    // The argv the scanner actually uses sees the moved entry.
    expect(enumerated([])).toContain("test/fixtures/leak.hl7");

    for (const flag of ["-M", "-C", "--find-copies-harder"]) {
      expect(enumerated([flag]), `${flag} must not be added to the scanner's argv`).toBe("");
    }
    // `-B` really is inert FOR A RENAME, which is all this case ever was. The
    // superseded version of this test stopped here and read as a general
    // clearance for the flag; see the case below for what it does not cover.
    expect(enumerated(["-B"])).toContain("test/fixtures/leak.hl7");
  });

  it("`-B` HIDES A COMPLETE REWRITE from `--diff-filter=AMTU`, and `B` in the filter is why", () => {
    // The case that did not exist while this file asserted "`-B` is inert here",
    // which is how a false PERMISSIVE claim survived: a pin that cannot fail
    // proves nothing, and the rename above is the one shape `-B` leaves alone.
    //
    // The mechanism is sharper than "a `B` record the filter drops". The record's
    // printed status LETTER IS STILL `M`: one path, an `M` with a break score that
    // `RAW_RECORD` parses happily. The score itself is NOT asserted below and no
    // digits are quoted here, because it moves with how much of the old content
    // survives. But `--diff-filter` classifies a
    // broken pair as `B` whatever letter it prints. So `AMTU` deletes it and a
    // reader checking the raw output concludes the opposite.
    const repo = makeScanRepo({ git: true });
    const target = join("test", "fixtures", "rewrite.hl7");
    const padded = (lead: string): string =>
      [lead, ...Array.from({ length: 60 }, (_, i) => `NTE|${String(i + 1)}||${lead} padding`)].join(
        "\r",
      );
    writeFileSync(join(repo, target), padded("original"));
    gitIn(repo, ["add", target]);
    gitCommit(repo, "base");
    // A wholly different body, carrying a dashed SSN the shape floor must catch.
    writeFileSync(join(repo, target), `${padded("replacement")}\rNTE|99||SSN ${SYMLINK_SSN}`);
    gitIn(repo, ["add", target]);

    const raw = (extra: string[]): string =>
      gitOut(repo, ["diff", "--cached", "--raw", "--no-renames", ...extra]).trim();
    expect(raw(["-B"]), "git must still break the pair for this premise to hold").toMatch(
      /\bM\d{3}\b/,
    );
    expect(raw(["-B", "--diff-filter=AMTU"]), "the superseded filter loses it").toBe("");
    expect(raw(["-B", "--diff-filter=AMTUB"])).toContain(target.split(sep).join("/"));

    // End to end, through the scanner itself: the shipped argv catches it, and a
    // copy of the scanner with `-B` injected catches it too ONLY because `B` is
    // in the filter. On the superseded filter the injected copy exited 0.
    expect(runScannerArgsIn(repo, ["--staged"]).code).toBe(1);

    const source = readFileSync(SCANNER_PATH, "utf8");
    expect(source).toContain(`"--no-renames", "--diff-filter=AMTUB"`);
    const injected = join(dir, "phi-scan-with-B.ts");
    writeFileSync(
      injected,
      source.replace(
        `"--no-renames", "--diff-filter=AMTUB"`,
        `"--no-renames", "-B", "--diff-filter=AMTUB"`,
      ),
    );
    const r = spawnSync(TSX_BIN, [injected, "--staged"], {
      cwd: repo,
      encoding: "utf8",
      shell: false,
    });
    expect(r.status, `stderr: ${r.stderr ?? ""}`).toBe(1);
    expect(r.stderr ?? "").toContain("dashed SSN pattern");
  });
});

// ---------------------------------------------------------------------------
// The observation rule is PER-ROOT, not global
// ---------------------------------------------------------------------------

describe("phi-scan: the observation rule is PER-ROOT, not global", () => {
  // The superseded rule refused only a sweep that had read ZERO files IN TOTAL,
  // which any one surviving file satisfied: a single `src/` module vouched for
  // the whole fixture corpus and vice versa. Every case below that expects a
  // refusal returns exit 0 with `OK: no hits` against that rule, so each is red
  // on it; the three marked NOT WIDENED are green on both, and are here to hold
  // the rule where it is.

  const STARVED = "the all-mode sweep observed no files under";

  it("refuses (exit 2) when `test/fixtures` is ABSENT, and names that root", () => {
    const repo = makeScanRepo({ git: true });
    rmSync(join(repo, "test", "fixtures"), { recursive: true, force: true });

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain(STARVED);
    expect(r.stderr).toContain("1 of its 3 scan roots (test/fixtures)");
    expect(r.stdout).not.toContain("OK: no hits");
  });

  it("refuses (exit 2) when `src` is a DANGLING symlink, and names that root", () => {
    // THE SHARPEST CASE, and it is written on `src` because `src` is the root
    // with no walked parent. `existsSync` FOLLOWS the link and answers false, so
    // `walk()` returns before `readdirSync` and the not-a-regular-file rule never
    // fires: that rule only ever classifies entries found INSIDE a root, and this
    // IS the root. Absent, dangling and empty are one state to the walk, and
    // nothing else in the scanner can tell any of them from a clean tree.
    const repo = makeScanRepo({ git: true });
    rmSync(join(repo, "src"), { recursive: true, force: true });
    symlinkSync(join(repo, "no-such-directory-anywhere"), join(repo, "src"));

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("1 of its 3 scan roots (src)");
    // Not the non-regular-entry refusal wearing this rule's name.
    expect(r.stderr).not.toContain("is not a regular file");
  });

  it("a DANGLING `test/fixtures` refuses on the OTHER rule now, and still exits 2", () => {
    // Recorded because the verdict is reached by a different rule than it was.
    // `test` walks the fixture root as an ENTRY, so the dangling link is
    // classified by `Dirent.isSymbolicLink()` and refused by name before the
    // per-root rule is consulted at all. Same exit code, a better message, and
    // the per-root rule is still the only thing covering the case above.
    const repo = makeScanRepo({ git: true });
    rmSync(join(repo, "test", "fixtures"), { recursive: true, force: true });
    symlinkSync(join(repo, "no-such-directory-anywhere"), join(repo, "test", "fixtures"));

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures (a symbolic link)");
    expect(r.stdout).not.toContain("OK: no hits");
  });

  it("refuses (exit 2) when `test/fixtures` exists but is EMPTY", () => {
    const r = runScannerIn(makeStarvedScanRepo("test/fixtures"), null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("1 of its 3 scan roots (test/fixtures)");
  });

  it("refuses (exit 2) when `src` is starved, so the rule is not one-sided", () => {
    // The fixture root yields 1 file here, which satisfied the global rule
    // outright. Both directions matter: `src` carries the hand-written code and
    // is the root a sibling's version of this defect left unobserved.
    const r = runScannerIn(makeStarvedScanRepo("src"), null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("1 of its 3 scan roots (src)");
  });

  it("refuses (exit 2) when `test` is starved, naming it AND the root inside it", () => {
    // `test` nests `test/fixtures`, so emptying the outer root empties the inner
    // one too and BOTH are named. That is the rule reading the nesting
    // correctly, not a duplicate: each root is asked about separately, and here
    // each of them really did yield nothing.
    const r = runScannerIn(makeStarvedScanRepo("test"), null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("2 of its 3 scan roots (test/fixtures, test)");
  });

  it("names EVERY starved root when all are starved", () => {
    // The all-starved case is this one rule, not a second rule beside it.
    const repo = makeStarvedScanRepo("test");
    rmSync(join(repo, "src"), { recursive: true, force: true });

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("3 of its 3 scan roots (test/fixtures, test, src)");
  });

  it("a fixture is credited to BOTH roots it sits under, so neither starves", () => {
    // The nesting guard. `rootsOf` returns EVERY match; a first-match lookup
    // would credit one root and leave the other permanently starved, and which
    // one depended on the order of `SCAN_ROOTS` with nothing saying so. Here the
    // ONLY file under `test/` is the fixture, so `test` can only be satisfied by
    // crediting it twice over.
    const repo = makeScanRepo({ git: true });
    rmSync(join(repo, "test", "smoke.test.ts"), { force: true });

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("a fixture's hits are reported ONCE, though two roots walk it", () => {
    // `test` re-walks `test/fixtures`, so without de-duplication every fixture
    // arrives twice and each hit is printed twice: a corpus that reads as double
    // its real size, and a hit count nothing else in the output contradicts.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "fixtures", "violator.hl7"), SYMLINK_PHI);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr.split("segment=PID-5").length - 1).toBe(2); // family + given, once each
    expect(r.stderr).toContain("across 1 file(s)");
  });

  it("prints a real hit from a YIELDING root before refusing, and still exits 2", () => {
    // A refusal must not swallow a finding. The payload is the name-bearing
    // synthetic one, and it is asserted through the HL7 FIELD MODEL (`PID-5`),
    // not the shared shape floor, so this cannot pass over a payload the scanner
    // never really read.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "fixtures", "violator.hl7"), SYMLINK_PHI);
    rmSync(join(repo, "src"), { recursive: true, force: true });

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("segment=PID-5");
    expect(r.stderr).toContain(V.tFam);
    expect(r.stderr).toContain("1 of its 3 scan roots (src)");
  });

  it("NOT WIDENED: `--staged` makes no per-root promise and still exits 0", () => {
    // `staged` legitimately has nothing to scan when a commit touches only
    // markdown, and it enumerates no root at all. Widening the rule to it reds
    // this case, which was checked by running that mutation rather than arguing
    // it. Nothing is pre-staged (`track: false`): a repo built the usual way
    // still has the seeded fixture sitting in the index as an add, so `--staged`
    // would READ it and the widened rule would be satisfied by accident. Getting
    // that wrong makes this test green against the mutation it exists to kill.
    const repo = makeScanRepo({ git: true, track: false });
    rmSync(join(repo, "test", "fixtures"), { recursive: true, force: true });
    mkdirSync(join(repo, "test", "fixtures"), { recursive: true });
    writeFileSync(join(repo, "src", "clean.ts"), "export const a = 1;\n");
    gitIn(repo, ["add", "src/clean.ts"]);

    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("NOT WIDENED: named-path mode is bounded by argv and still exits 0", () => {
    const repo = makeStarvedScanRepo("test/fixtures");
    const p = join(repo, "outside.hl7");
    writeFileSync(p, CLEAN_FIXTURE);

    const r = runScannerArgsIn(repo, [p]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("NOT WIDENED: a repo whose roots both yield still scans clean (exit 0)", () => {
    const r = runScannerIn(makeScanRepo({ git: true }), null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });
});

describe("phi-scan: what the per-root rule does NOT cover", () => {
  // Characterization, not aspiration. These make the header's limits list
  // executable: each is a state the rule leaves at exit 0, and a change that
  // closed one would red here and have to say so rather than arrive silently.

  it("LIMIT: a directory missing from INSIDE a root is still unobserved at exit 0", () => {
    // The granularity is the DECLARED root and nothing finer. The sibling
    // sub-tree here is the same shape as the defect the rule closed, one level
    // down: closing it needs a floor derived from what git tracks under each
    // root, which is a second moving part and a separate decision.
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, "test", "fixtures", "adt"));
    writeFileSync(join(repo, "test", "fixtures", "adt", "a01.hl7"), CLEAN_FIXTURE);
    gitIn(repo, ["add", "test/fixtures/adt/a01.hl7"]);
    rmSync(join(repo, "test", "fixtures", "adt"), { recursive: true, force: true });

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("LIMIT: a root whose PARENT is not itself a root is followed when it is a symlink", () => {
    // `normalizePath` is purely lexical (`resolve`/`relative`, never `realpath`),
    // so every entry behind the link is attributed to the root's prefix. "A root
    // yielded a file" is not "that root's corpus was observed".
    //
    // THE LIMIT IS NARROWER THAN IT WAS, AND THE BOUNDARY IS THE PARENT. `src`
    // is used here because its parent is the repo root, which nothing walks; the
    // case that used to be written with `test/fixtures` now REFUSES, and has its
    // own test below. So the residual is exactly: a root nobody else enumerates
    // is followed when it is a link.
    const repo = makeScanRepo({ git: true });
    const elsewhere = join(repo, "elsewhere");
    mkdirSync(elsewhere);
    writeFileSync(join(elsewhere, "benign.ts"), "export const benign = true;\n");
    rmSync(join(repo, "src"), { recursive: true, force: true });
    symlinkSync(elsewhere, join(repo, "src"));

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("NO LONGER A LIMIT: `test/fixtures` as a symlink refuses, because `test` walks it", () => {
    // A side effect of adding `test` as a root, and it is recorded as a
    // behaviour change rather than left to be discovered: the fixture root is
    // now an ENTRY INSIDE another root, so the walk of `test` classifies it with
    // `Dirent.isSymbolicLink()` and the not-a-regular-entry rule refuses. Before
    // the widening this exact repo returned `OK: no hits` at exit 0 with the
    // whole fixture corpus off disk.
    //
    // It does NOT generalise to every root, which is why the LIMIT above is
    // still a limit: what closed this case is `test/fixtures` having a walked
    // parent, and `src` and `test` do not have one.
    const repo = makeScanRepo({ git: true });
    const elsewhere = join(repo, "elsewhere");
    mkdirSync(elsewhere);
    writeFileSync(join(elsewhere, "benign.txt"), "nothing to see here\n");
    rmSync(join(repo, "test", "fixtures"), { recursive: true, force: true });
    symlinkSync(elsewhere, join(repo, "test", "fixtures"));

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("test/fixtures (a symbolic link)");
    // The refusal names the entry, never what is on the other side of it.
    expect(r.stderr).not.toContain("elsewhere");
  });

  it("LIMIT: it is a floor of ONE, whatever the root used to hold", () => {
    // `makeScanRepo` seeds exactly one fixture, so this repo IS the floor case:
    // a root of one file is indistinguishable, on stdout, from a root of a
    // hundred. This reporter prints no denominator at all.
    const r = runScannerIn(makeScanRepo({ git: true }), null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/^\[phi-scan] OK: no hits\n$/);
  });
});

// ---------------------------------------------------------------------------
// The index corpus: the bytes git carries
// ---------------------------------------------------------------------------
//
// All mode reads the working tree through the walk AND reads the bytes git
// carries at every path in the index. This block is that route.
//
// EVERY CASE BELOW WAS MEASURED ON THE BASE COMMIT BEFORE IT WAS WRITTEN, and
// the base result is in each case's own comment. Seven of them printed
// `[phi-scan] OK: no hits` at exit 0 over a corpus the gate never opened, which
// is the whole class: a clean result that was never measured. The four marked
// CONTROL are the other half: they must NOT go red, and each one can (each was
// checked against a deliberately wrong version of the route, noted per case).
//
// Every repo here is a throwaway (`makeScanRepo`), never this one.

/** A message carrying an invented identity, for the index-corpus cases. */
const INDEX_PHI = msg(
  MSH,
  `PID|1||${V.tMrn}^^^HOSP^MR||${V.tFam}^${V.tGiv}||${V.tDob}|F|||${V.tStreet}^^Boston^MA^02101`,
);

/** `git` in a throwaway repo, with stdin. */
function gitInWithInput(cwd: string, args: string[], input: string): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, input });
  expect(r.status, r.stderr).toBe(0);
}

/** Stage `content` at `rel`, then leave `onDisk` (or nothing) in the worktree. */
function stageThenReplace(repo: string, rel: string, content: string, onDisk: string | null): void {
  const abs = join(repo, ...rel.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
  gitIn(repo, ["add", rel]);
  if (onDisk === null) rmSync(abs, { force: true });
  else writeFileSync(abs, onDisk);
}

describe("phi-scan: the index corpus", () => {
  it("catches a walk root swapped for a directory mirroring the tracked NAMES", () => {
    // THE ESCAPE THIS ROUTE EXISTS FOR. Reconciling the paths a sweep read
    // against the paths git tracks is satisfied by a directory that mirrors the
    // names over clean decoy content: every declared root yields, every tracked
    // path is accounted for, and the committed corpus was never opened.
    // Measured on the base commit: exit 0, `OK: no hits`.
    const repo = makeScanRepo({ git: true });
    stageThenReplace(repo, "test/fixtures/patient.hl7", INDEX_PHI, null);
    rmSync(join(repo, "test", "fixtures"), { recursive: true, force: true });
    mkdirSync(join(repo, "test", "fixtures"), { recursive: true });
    writeFileSync(join(repo, "test", "fixtures", "patient.hl7"), CLEAN_FIXTURE);
    writeFileSync(join(repo, "test", "fixtures", "clean.hl7"), CLEAN_FIXTURE);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/patient.hl7 (git index");
    expect(r.stderr).toContain(V.tFam);
  });

  it("catches one file replaced by a clean decoy, and says the bytes differ", () => {
    // Measured on the base commit: exit 0, `OK: no hits`.
    const repo = makeScanRepo({ git: true });
    stageThenReplace(repo, "test/fixtures/patient.hl7", INDEX_PHI, CLEAN_FIXTURE);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    // The label separates the two findings: the file on disk does NOT carry
    // this, so the remedy includes re-staging.
    expect(r.stderr).toContain("(git index; the working tree differs)");
    // Five, counted from the run rather than from expectation: PID-5 twice (a
    // family and a given token), PID-7, PID-11 and PID-3.
    expect(r.stderr).toMatch(/5 of those are in bytes git carries at that path/);
  });

  it("catches a message under an UNDECLARED top-level directory", () => {
    // `SCAN_ROOTS` is three names, so the walk sees nothing outside them, and
    // `--staged` has its own prefix list. This is how three real HL7 messages
    // under `examples/data/` in this package had never been read by either
    // route. Measured on the base commit: exit 0, `OK: no hits`.
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, "examples", "data"), { recursive: true });
    writeFileSync(join(repo, "examples", "data", "sample.hl7"), INDEX_PHI);
    gitIn(repo, ["add", "examples/data/sample.hl7"]);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("examples/data/sample.hl7 (git index)");
    expect(r.stderr).toContain(V.tDob);
  });

  it("catches a tracked file that is absent from the working tree", () => {
    // The walk's own pre-existing limit, closed for tracked content: a file
    // committed and then removed from disk used to be read by neither route
    // once it was no longer being staged. Measured on the base commit: exit 0.
    const repo = makeScanRepo({ git: true });
    stageThenReplace(repo, "test/fixtures/gone.hl7", INDEX_PHI, null);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("test/fixtures/gone.hl7 (git index)");
  });

  it("catches PHI behind a walk root that is itself a symlink", () => {
    // A root with no walked parent is FOLLOWED, and the per-root rule is then
    // satisfied by whatever is on the other side of it. That limit is unchanged
    // and still recorded, but it no longer hides the tracked corpus: those
    // bytes are read from the index. Measured on the base commit rather than
    // reasoned from the limit it cites, because this case's base result was
    // written from expectation first and that is the trap this item names:
    // base exit 0, head exit 1, same repo.
    const repo = makeScanRepo({ git: true });
    writeFileSync(
      join(repo, "src", "leak.ts"),
      `export const sample = ${JSON.stringify(INDEX_PHI)};\n`,
    );
    gitIn(repo, ["add", "src/leak.ts"]);
    const elsewhere = join(repo, "elsewhere");
    mkdirSync(elsewhere);
    writeFileSync(join(elsewhere, "benign.ts"), "export const benign = true;\n");
    rmSync(join(repo, "src"), { recursive: true, force: true });
    symlinkSync(elsewhere, join(repo, "src"));

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toContain("src/leak.ts (git index)");
  });

  it("REFUSES a tracked symbolic link that sits outside every walk root", () => {
    // The walk only ever classifies entries INSIDE a root, so a link at the
    // repo root was reached by neither enumerating route. git carries its
    // TARGET PATH under mode 120000, so there is no content to scan and the
    // only true thing to say is that the scan cannot account for it.
    // Measured on the base commit: exit 0, `OK: no hits`.
    const repo = makeScanRepo({ git: true });
    const outside = tempDir("hl7-phi-outside-");
    writeFileSync(join(outside, TARGET_NAME), SYMLINK_PHI);
    symlinkSync(join(outside, TARGET_NAME), join(repo, "sample.hl7"));
    gitIn(repo, ["add", "sample.hl7"]);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("sample.hl7 (a symbolic link)");
    // The refusal names the entry, never what is on the other side of it.
    expectNoPhi(r.stderr);
  });

  it("REFUSES an UNMERGED index entry in all mode", () => {
    // Such a path is recorded at one or more of stages 1/2/3 and never at stage
    // 0, so there is no single set of bytes to attribute to it. The pre-commit
    // route already refused this; all mode used to pass over it in silence.
    // Measured on the base commit: exit 0, `OK: no hits`.
    const repo = makeScanRepo({ git: true });
    const abs = join(repo, "test", "fixtures", "conflict.hl7");
    writeFileSync(abs, INDEX_PHI);
    const blob = gitOut(repo, ["hash-object", "-w", "test/fixtures/conflict.hl7"]).trim();
    rmSync(abs, { force: true });
    gitInWithInput(
      repo,
      ["update-index", "--index-info"],
      `100644 ${blob} 2\ttest/fixtures/conflict.hl7\n`,
    );

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/unmerged/);
  });

  it("REFUSES a GITLINK in the index, and says what git carries for one", () => {
    // The other half of the not-a-regular-entry rule on this route, pinned
    // rather than asserted: the census claims every state it lists is pinned by
    // a case, and this half was verified by hand and left unpinned, which is
    // the same species of gap as an unmeasured control. A gitlink is NOT a
    // symbolic link: git carries another repository's commit id for it, not a
    // target path, so it gets its own half of the sentence.
    const repo = makeScanRepo({ git: true });
    gitCommit(repo, "seed");
    const commitOid = gitOut(repo, ["rev-parse", "HEAD"]).trim();
    gitIn(repo, ["update-index", "--add", "--cacheinfo", `160000,${commitOid},vendor/sub`]);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("vendor/sub (a gitlink (a nested repository))");
    expect(r.stderr).toContain("another repository's commit id");
  });

  it("does NOT read markdown out of the index, the one exclusion", () => {
    // Copied from `walk()` rather than invented: a README or an override log
    // legitimately describes a violator value. Stated as a case rather than a
    // sentence, because it is the only reason an index entry goes unread and a
    // silent widening of it would be a behaviour change nobody measured.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "NOTES.md"), `A sample message:\n\n    ${INDEX_PHI}\n`);
    gitIn(repo, ["add", "NOTES.md"]);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("does NOT widen `--staged`, which is what a commit is blocked on", () => {
    // The pre-commit route keeps its own scope predicate, deliberately: what it
    // enumerates decides what a commit is BLOCKED on, which is a hook decision
    // and not this one. So the same staged violator is caught by all mode and
    // is not caught by `--staged`. Recorded as a case so the gap is a measured
    // fact rather than a claim, and so widening it later is a deliberate act.
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, "examples", "data"), { recursive: true });
    writeFileSync(join(repo, "examples", "data", "sample.hl7"), INDEX_PHI);
    gitIn(repo, ["add", "examples/data/sample.hl7"]);

    expect(runScannerArgsIn(repo, ["--staged"]).code).toBe(0);
    expect(runScannerIn(repo, null).code).toBe(1);
  });

  it("CONTROL: a clean repo whose working tree matches the index exits 0", () => {
    // The negative control on the whole route. It CAN fail: a version that
    // scanned every index blob without comparing it to what the walk read
    // still passes here, but the next control catches that one.
    const r = runScannerIn(makeScanRepo({ git: true }), null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/^\[phi-scan] OK: no hits\n$/);
  });

  it("CONTROL: a clean file that DIFFERS from the index is not a hit", () => {
    // Divergence is the ordinary state of a working tree mid-edit. The route
    // scans both sets of bytes; it does not report on the difference itself.
    // It CAN fail: a version that refused whenever the tree and the index
    // disagreed would red-lock every edit, and reds here.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "src", "index.ts"), 'export const version = "0.0.1";\n');
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK: no hits/);
  });

  it("CONTROL: a violator in BOTH the working tree and the index is reported ONCE", () => {
    // The byte comparison is what keeps the two routes from double-counting a
    // corpus. It CAN fail in both directions: dropping the comparison reports
    // every hit twice (measured, two `HIT:` lines for one file), and comparing
    // by mtime or size instead of bytes is exactly what the decoy cases above
    // defeat.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "fixtures", "patient.hl7"), INDEX_PHI);
    gitIn(repo, ["add", "test/fixtures/patient.hl7"]);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr.split("\n").filter((l) => l.startsWith("[phi-scan] HIT:"))).toHaveLength(1);
    expect(r.stderr).not.toContain("(git index");
  });

  it("CONTROL: a starved walk root still refuses, though the index holds its files", () => {
    // The per-root observation rule is a statement about the WALK and stays
    // one. Letting the index route satisfy it would retire a trap that is
    // already paid for: this repo's `src` is empty on disk and every one of its
    // files was just read out of the index, and it still refuses.
    const repo = makeScanRepo({ git: true });
    rmSync(join(repo, "src"), { recursive: true, force: true });
    mkdirSync(join(repo, "src"), { recursive: true });

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/observed no files under 1 of its 3 scan roots \(src\)/);
  });
});

describe("phi-scan: an index-route refusal does not swallow a hit", () => {
  it("prints what the WALK found before refusing over an unmerged index entry", () => {
    // A REFUSAL MUST NOT SWALLOW A REAL HIT: the rule the starved-root refusal
    // already carried, applied to the two refusals this route added. An
    // unmerged path anywhere in the index refuses the whole sweep, and the walk
    // may have found PHI under a root that yielded perfectly well. Measured
    // before the fix: exit 2 with the refusal alone, where the BASE commit
    // exited 1 and printed five hits over the same repo. The exit code is still
    // 2, because an incomplete sweep is not a verdict whatever it found.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "fixtures", "leak.hl7"), INDEX_PHI);
    const abs = join(repo, "test", "fixtures", "conflict.hl7");
    writeFileSync(abs, CLEAN_FIXTURE);
    const blob = gitOut(repo, ["hash-object", "-w", "test/fixtures/conflict.hl7"]).trim();
    rmSync(abs, { force: true });
    gitInWithInput(
      repo,
      ["update-index", "--index-info"],
      `100644 ${blob} 2\ttest/fixtures/conflict.hl7\n`,
    );

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("HIT: test/fixtures/leak.hl7");
    expect(r.stderr).toContain(V.tFam);
    expect(r.stderr).toMatch(/unmerged/);
  });

  it("prints what the WALK found before refusing over a tracked link", () => {
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "test", "fixtures", "leak.hl7"), INDEX_PHI);
    const outside = tempDir("hl7-phi-outside-");
    writeFileSync(join(outside, "benign.txt"), "nothing to see here\n");
    symlinkSync(join(outside, "benign.txt"), join(repo, "pointer.txt"));
    gitIn(repo, ["add", "pointer.txt"]);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("HIT: test/fixtures/leak.hl7");
    expect(r.stderr).toContain("pointer.txt (a symbolic link)");
  });
});

// ---------------------------------------------------------------------------
// THE COMPLETENESS RULE
// ---------------------------------------------------------------------------

/**
 * A target this run ENUMERATED and NEVER READ refuses (exit 2), naming the
 * paths, in every mode.
 *
 * THE DEFECT, measured on `dfac162` in a throwaway repo laid out like this one
 * with the bypassed path logged in `phi-scan-overrides.md` exactly as the
 * rejection gate instructs:
 *   - `phi-scan <violator> <decoy> --allow-fixture <decoy>` exited 1 naming only
 *     the violator, so the SAME argv over a corpus whose only violator is the
 *     withdrawn file exited 0 and printed `[phi-scan] OK: no hits`, byte-identical
 *     on stdout and exit code to a genuine clean run over the same tree;
 *   - `phi-scan <clean file> --allow-fixture <violator>` exited 0 with
 *     `[phi-scan] OK: no hits`, having validated the bypass, checked its audit
 *     entry and never opened the named file at all. That is the companion tier's
 *     defect: a bypass that matches no target subtracts nothing.
 *
 * THESE ARE POSITIVE CONTROLS, NOT SMOKE TESTS. Each one plants a violator that
 * the scanner is separately shown to catch, so a refusal here can never be
 * vacuous, and each asserts the REFUSAL CODE AND THE NAMED PATH rather than
 * "non-zero": exit 1 is this gate's code for HITS FOUND, and a rule that reds a
 * clean run into 1 would look like it works while saying something false.
 *
 * Everything runs in a throwaway repo through `runScannerArgsIn`, so the
 * committed `phi-scan-overrides.md` is never mutated and a parallel worker
 * cannot see a decoy.
 */

/** Append an override-log entry for `rel` inside a throwaway repo. */
function logOverrideIn(repo: string, rel: string): void {
  appendFileSync(
    join(repo, "phi-scan-overrides.md"),
    `\n### ${rel}\n\n- **Date:** 2026-08-11\n- **Reason:** unit test\n- **Approved by:** vitest\n- **Expires:** permanent\n`,
  );
}

describe("phi-scan: the completeness rule", () => {
  const VIOLATOR = "test/fixtures/completeness-violator.hl7";
  const DECOY = "test/fixtures/completeness-decoy.hl7";

  /** A repo holding a violator and a clean decoy, both under a walk root. */
  function makeCompletenessRepo(): string {
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, ...VIOLATOR.split("/")), INDEX_PHI);
    writeFileSync(join(repo, ...DECOY.split("/")), CLEAN_FIXTURE);
    return repo;
  }

  it("CONTROL: the violator is caught and the decoy is clean, read on their own", () => {
    // Anti-vacuity for every case below. Without this, a refusal over the decoy
    // would prove nothing: an unread target could not be told from a clean one.
    const repo = makeCompletenessRepo();
    const hit = runScannerArgsIn(repo, [VIOLATOR]);
    expect(hit.code, `stderr: ${hit.stderr}`).toBe(1);
    expect(hit.stderr).toContain(V.tFam);
    const clean = runScannerArgsIn(repo, [DECOY]);
    expect(clean.code, `stderr: ${clean.stderr}`).toBe(0);
    expect(clean.stdout).toContain("OK: no hits");
  });

  it("refuses (exit 2) over a target it enumerated and withdrew, naming it", () => {
    const repo = makeCompletenessRepo();
    logOverrideIn(repo, DECOY);
    const r = runScannerArgsIn(repo, [VIOLATOR, DECOY, "--allow-fixture", DECOY]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("enumerated and never read");
    expect(r.stderr).toContain(DECOY);
  });

  it("still prints the hits it DID find before refusing", () => {
    // A REFUSAL MUST NOT SWALLOW A REAL HIT. The base commit exited 1 and
    // printed this hit; the rule must not trade the finding for the refusal.
    const repo = makeCompletenessRepo();
    logOverrideIn(repo, DECOY);
    const r = runScannerArgsIn(repo, [VIOLATOR, DECOY, "--allow-fixture", DECOY]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(`HIT: ${VIOLATOR}`);
    expect(r.stderr).toContain(V.tFam);
  });

  it("refuses the argv whose ONLY violator is the withdrawn file", () => {
    // THE FALSE GREEN ITSELF. On `dfac162` this exact argv printed
    // `[phi-scan] OK: no hits` at exit 0 with the violator never opened.
    const repo = makeCompletenessRepo();
    logOverrideIn(repo, VIOLATOR);
    const r = runScannerArgsIn(repo, [DECOY, VIOLATOR, "--allow-fixture", VIOLATOR]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stdout).not.toContain("OK: no hits");
    expect(r.stderr).toContain(VIOLATOR);
  });

  it("refuses a lone --allow-fixture, which reads nothing at all", () => {
    const repo = makeCompletenessRepo();
    logOverrideIn(repo, VIOLATOR);
    const r = runScannerArgsIn(repo, ["--allow-fixture", VIOLATOR]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("enumerated and never read");
  });

  it("refuses a bypass that names a path the run does not enumerate", () => {
    // THE COMPANION TIER. The bypass is accepted by the log gate, subtracts
    // nothing, and on `dfac162` the run reported clean over a corpus that never
    // included the file the developer believed had been acknowledged.
    const repo = makeCompletenessRepo();
    logOverrideIn(repo, VIOLATOR);
    const r = runScannerArgsIn(repo, [DECOY, "--allow-fixture", VIOLATOR]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toContain("does not enumerate");
    expect(r.stderr).toContain(VIOLATOR);
    expect(r.stdout).not.toContain("OK: no hits");
  });

  it("NEGATIVE CONTROL: a run that reads every target it enumerates is unaffected", () => {
    // The rule must not red an ordinary run. Both codes are pinned: a clean
    // multi-target run still exits 0, and a violator among them still exits 1
    // (not 2), so the rule cannot be passing by refusing everything.
    const repo = makeCompletenessRepo();
    const clean = runScannerArgsIn(repo, [DECOY, "test/smoke.test.ts"]);
    expect(clean.code, `stderr: ${clean.stderr}`).toBe(0);
    const hits = runScannerArgsIn(repo, [DECOY, VIOLATOR]);
    expect(hits.code, `stderr: ${hits.stderr}`).toBe(1);
  });

  it("NEGATIVE CONTROL: the all-mode sweep still exits 0 over a clean corpus", () => {
    // The sweep enumerates two routes (the walk and the git index) and both feed
    // the same enumerated set. A bookkeeping error in either would refuse here.
    const repo = makeScanRepo({ git: true });
    gitCommit(repo, "corpus");
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("OK: no hits");
  });

  it("NEGATIVE CONTROL: a tolerated vanish is still a skip, not a refusal", () => {
    // THE ONE CARVE-OUT, pinned so it cannot be lost and cannot silently widen.
    // An UNTRACKED file the walk enumerated and that is gone by the time we read
    // it has no bytes to read; the run says so on stderr and exits 0. It cannot
    // launder a bypass: `tolerateVanish` is set only in `all` mode and
    // `--allow-fixture` always resolves to `paths` mode.
    const repo = makeScanRepo({ git: true });
    gitCommit(repo, "corpus");
    const decoy = join(repo, "src", "transient.ts");
    writeFileSync(decoy, "export const transient = true;\n");
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stderr).toContain("src/transient.ts");
    expect(r.stderr).not.toContain("enumerated and never read");
  });
});
