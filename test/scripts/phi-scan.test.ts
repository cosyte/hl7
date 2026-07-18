/**
 * Unit tests for scripts/phi-scan.ts — the HL7 v2 PHI commit-gate.
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
import { writeFileSync, mkdtempSync, rmSync, readFileSync, appendFileSync } from "node:fs";
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
// Negative tests — genuinely synthetic, allow-listed content PASSES
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
    expect(r.stdout).toMatch(/OK — no hits/);
  });
});

// ---------------------------------------------------------------------------
// Positive tests — real-looking PHI is CAUGHT
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
    expect(r.stderr).toMatch(/realhospital\.org/);
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
  it("scans a header-less message (no MSH — starts with EVN)", () => {
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
    // contains an MSH example string — otherwise its code lines become "hits".
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
    // Sanity: scanned on its own it is a genuine violator — so the override, not
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
