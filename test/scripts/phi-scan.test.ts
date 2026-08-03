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
    const r = scan("name.hl7", msg(MSH, "PID|1||MRN1^^^HOSP^MR||Anderson^Michael||19800115|M"));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-5/);
    expect(r.stderr).toMatch(/Anderson/);
    expect(r.stderr).toMatch(/Michael/);
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
        "PV1|1|I|W^1^A||||ATTEND^Kowalski^Ewa^^^^MD",
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PV1-7/);
    expect(r.stderr).toMatch(/Kowalski/);
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
    const r = scan("dob.hl7", msg(MSH, "PID|1||MRN1^^^HOSP^MR||Doe^John||19770707|M"));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-7/);
    expect(r.stderr).toMatch(/19770707/);
  });
});

describe("phi-scan: address (PID-11)", () => {
  it("catches a real street address", () => {
    const r = scan(
      "addr.hl7",
      msg(
        MSH,
        "PID|1||MRN1^^^HOSP^MR||Doe^John||19800115|M|||742 Evergreen Terrace^^Springfield^IL^62704",
      ),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-11/);
    expect(r.stderr).toMatch(/Evergreen/);
  });
});

describe("phi-scan: phone (PID-13)", () => {
  it("catches a phone without the 555 fake-exchange convention", () => {
    const r = scan(
      "phone.hl7",
      msg(MSH, "PID|1||MRN1^^^HOSP^MR||Doe^John||19800115|M|||||^PRN^PH^^^312^8675309"),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-13/);
  });
});

describe("phi-scan: identifiers", () => {
  it("catches a bare-numeric MRN in PID-3", () => {
    const r = scan("mrn.hl7", msg(MSH, "PID|1||48291043^^^HOSP^MR||Doe^John||19800115|M"));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-3/);
    expect(r.stderr).toMatch(/48291043/);
  });

  it("catches an SSN-typed CX identifier (PID-3 type SS)", () => {
    const r = scan(
      "ssn-cx.hl7",
      msg(MSH, "PID|1||MRN1^^^HOSP^MR~123456789^^^USA^SS||Doe^John||19800115|M"),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-3/);
    expect(r.stderr).toMatch(/123456789/);
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
        "OBX|1|TX|N^Note^L||reach jane@realhospital.org||||||F",
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
      "MSH@~&#\\@A@B@C@D@20260101@@ADT~A01@M1@P@2.5\rPID@1@@MRN1~~~HOSP~MR@@Anderson~Michael@@19800115@M",
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Anderson/);
  });
});

describe("phi-scan: structured scan is not silently bypassed (refuter regressions)", () => {
  it("scans a header-less message (no MSH: starts with EVN)", () => {
    // A message whose first segment is not MSH must still get the structured
    // scan (default delimiters), not fall through to the text-only pass.
    const r = scan(
      "no-msh.hl7",
      msg("EVN|A01|20260419100000", "PID|1||48291043^^^HOSP^MR||Anderson^Michael||19770707|M"),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-5/);
    expect(r.stderr).toMatch(/PID-7/);
    expect(r.stderr).toMatch(/PID-3/);
  });

  it("matches segment ids case-insensitively (lowercase `pid`)", () => {
    // The lenient parser accepts a lowercase segment id; the scanner must too,
    // or a mixed-case feed escapes the per-field detectors.
    const r = scan("lower.hl7", msg(MSH, "pid|1||48291043^^^HOSP^MR||Doe^John||19770707|M"));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-7/);
    expect(r.stderr).toMatch(/PID-3/);
  });

  it("catches a provider name in an expanded field-map segment (PD1-4)", () => {
    const r = scan(
      "pd1.hl7",
      msg(MSH, "PID|1||MRN1^^^HOSP^MR||Doe^John||19800115|M", "PD1||||1234^Fitzgerald^Ronan^^^^MD"),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PD1-4/);
    expect(r.stderr).toMatch(/Fitzgerald/);
  });

  it("catches a 6-digit YYYYMM date of birth", () => {
    const r = scan("dob6.hl7", msg(MSH, "PID|1||MRN1^^^HOSP^MR||Doe^John||197711|M"));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/PID-7/);
    expect(r.stderr).toMatch(/197711/);
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
    const r = scan("gated.hl7", msg(MSH, "PID|1||MRN1^^^HOSP^MR||Anderson^Michael||19770707|M"));
    expect(r.code).toBe(1); // sanity: it is a violator
    const path = join(dir, "gated.hl7");
    const r2 = runScanner(["--allow-fixture", path]);
    expect(r2.code).toBe(2);
    expect(r2.stderr).toMatch(/phi-scan-overrides\.md/);
  });

  it("honors --allow-fixture WITH an override-log entry (exit 0)", () => {
    const path = join(dir, "override-me.hl7");
    writeFileSync(path, msg(MSH, "PID|1||MRN1^^^HOSP^MR||Anderson^Michael||19770707|M"));
    const rel = relative(REPO_ROOT, path).split(sep).join("/");
    // Sanity: scanned on its own it is a genuine violator: so the override, not
    // an empty target set, is what flips the next run to clean.
    expect(runScanner([path]).code).toBe(1);

    const original = readFileSync(OVERRIDES_PATH, "utf8");
    try {
      appendFileSync(
        OVERRIDES_PATH,
        `\n### ${rel}\n\n- **Date:** 2026-07-18\n- **Reason:** unit test\n- **Approved by:** vitest\n- **Expires:** permanent\n`,
      );
      const r = runScanner(["--allow-fixture", path]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
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
  // was ported from, the allow-list is not what a sweep observes: `src/index.ts`
  // below is, and it is what keeps "observed nothing" from firing by accident.
  const allowList = join("scripts", "phi-allow-list.txt");
  copyFileSync(join(REPO_ROOT, allowList), join(d, allowList));
  copyFileSync(OVERRIDES_PATH, join(d, "phi-scan-overrides.md"));
  writeFileSync(join(d, "src", "index.ts"), "export const version = '0.0.0';\n");
  if (opts.git && opts.track !== false)
    gitIn(d, ["add", "scripts/phi-allow-list.txt", "src/index.ts"]);
  return d;
}

/**
 * A `git` that runs `pre` (a line of `sh`) before delegating to the real git.
 *
 * `pre` runs on EVERY git call the scanner makes, which in `all` mode is
 * `check-ignore` and then `ls-files`, both before the first read. Every `pre`
 * used below is therefore idempotent (`rm -f`, `mkdir -p`) on purpose: a
 * non-idempotent one would behave differently on the second call.
 */
function gitShim(pre: string): string {
  const shimDir = tempDir("hl7-phi-shim-");
  writeFileSync(join(shimDir, "git"), `#!/bin/sh\n${pre}\nexec '${realGit()}' "$@"\n`, {
    mode: 0o755,
  });
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

  it("REFUSES the tolerance outright when git cannot say what is tracked", () => {
    // Fail closed: with no tracked set there is no way to tell a build transient
    // from committed content, so nothing is tolerated.
    const repo = makeScanRepo({ git: false });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, "export default {};\n");
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'`), {
      GIT_CEILING_DIRECTORIES: tmpdir(),
    });
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/could not read/);
  });

  it("REFUSES the tolerance when git answers with an EMPTY tracked set", () => {
    // An empty index would make every file untracked, which is the one state in
    // which the tracked-file bound stops existing, so it counts as no answer.
    const repo = makeScanRepo({ git: true, track: false });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, "export default {};\n");
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/could not read/);
  });

  it("REFUSES an all-mode sweep that observed no files", () => {
    // The refuse-a-scan-that-observes-nothing rule, now explicit: tolerating a
    // vanished file must never be able to decay into a clean report of nothing.
    // Nothing tracked and everything ignored, so the walk finds files and the
    // filters leave zero targets. (`git check-ignore` never reports a TRACKED
    // path as ignored, which is why nothing is staged here.)
    const repo = makeScanRepo({ git: true, track: false });
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
      msg(MSH, "PID|1||MRN1^^^HOSP^MR||Anderson^Michael||19770707|M"),
    );
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Anderson/);
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
const SYMLINK_EMAIL = "m.thistlewood@records.invalid";

/**
 * Synthetic, name-bearing payload. A payload with no name proves nothing about a
 * claim that names do not leak, so this one carries a person name, a DOB, a
 * street address, a bare-numeric MRN, a dashed SSN and a non-test email. Every
 * value is invented: the surname and given name are made up rather than borrowed
 * from anyone, and the two shape-check sentinels are reserved forms above.
 */
const SYMLINK_PHI = msg(
  MSH,
  "PID|1||987654321^^^HOSP^MR||Thistlewood^Marguerite^L||19660421|F|||42 Elmwood Ave^^Boston^MA^02101",
  `NTE|1||SSN ${SYMLINK_SSN}, reachable at ${SYMLINK_EMAIL}`,
);

/** The link target's own filename carries a name, so an echo of it is visible. */
const TARGET_NAME = "THISTLEWOOD-MARGUERITE-19660421.hl7";

/** Tokens that must never appear in a refusal message. */
const SYMLINK_PHI_TOKENS = [
  "Thistlewood",
  "THISTLEWOOD",
  "Marguerite",
  "19660421",
  "987654321",
  "42 Elmwood Ave",
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
    expect(r.stderr).toContain("Thistlewood");
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
    expect(r.stderr).toContain("Thistlewood");
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
