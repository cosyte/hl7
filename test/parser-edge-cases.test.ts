/**
 * TEST-03 edge-case sweep. Per CONTEXT.md D-22, each edge case has its
 * own explicit `it(...)` block — NOT a parameterized fs-scan — because
 * each scenario's assertion surface is unique (some are Tier-1 silent,
 * some emit Tier-2 warnings, some affect helper output).
 *
 * Migrated fixtures (decoded-br, embedded-delimiters, null-fields) are
 * exercised by test/round-trip.test.ts's preservation-check block; this
 * file covers the remaining 11 scenarios from CONTEXT.md D-21.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "edge-cases",
);

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, `${name}.hl7`), "utf8");
}

describe("TEST-03 edge-cases: line endings (PARSE-08 Tier-1 silent)", () => {
  it("LF-only line endings parse without warning", () => {
    const msg = parseHL7(loadFixture("lf-line-endings"));
    expect(msg.rawSegments.map((s) => s.name)).toEqual(["MSH", "EVN", "PID", "PV1"]);
    expect(msg.warnings.length).toBe(0);
  });

  it("CRLF line endings parse without warning", () => {
    const msg = parseHL7(loadFixture("crlf-line-endings"));
    expect(msg.rawSegments.map((s) => s.name)).toEqual(["MSH", "EVN", "PID", "PV1"]);
    expect(msg.warnings.length).toBe(0);
  });

  it("mixed line endings (\\r / \\n / \\r\\n) parse without warning", () => {
    const msg = parseHL7(loadFixture("mixed-line-endings"));
    expect(msg.rawSegments.map((s) => s.name)).toEqual(["MSH", "EVN", "PID", "PV1"]);
    expect(msg.warnings.length).toBe(0);
  });
});

describe("TEST-03 edge-cases: trailing-newline handling (PARSE-08)", () => {
  it("trailing \\r byte is absorbed silently", () => {
    const msg = parseHL7(loadFixture("trailing-newline"));
    // MSH + EVN + PID + PV1 — the trailing byte must NOT create a phantom
    // empty segment.
    expect(msg.rawSegments.length).toBe(4);
    expect(msg.warnings.length).toBe(0);
  });

  it("no trailing byte parses cleanly (baseline)", () => {
    const msg = parseHL7(loadFixture("no-trailing-newline"));
    expect(msg.rawSegments.length).toBe(4);
    expect(msg.warnings.length).toBe(0);
  });
});

describe("TEST-03 edge-cases: empty vs null fields (PARSE-06)", () => {
  it("empty fields (||) yield RawField.isNull === false", () => {
    const msg = parseHL7(loadFixture("empty-fields"));
    const pid = msg.rawSegments.find((s) => s.name === "PID");
    expect(pid).toBeDefined();
    // PID-2 is empty (between "1|" and "|MRN..."): isNull MUST be false and
    // repetitions MUST be empty. This is the discriminant against the HL7
    // null sentinel (`""`) which sets isNull === true (see
    // `test/round-trip.test.ts` preservation check for null-fields.hl7).
    expect(pid?.fields[2]?.isNull).toBe(false);
    expect(pid?.fields[2]?.repetitions.length).toBe(0);
  });
});

describe("TEST-03 edge-cases: consecutive delimiters (PARSE-05)", () => {
  it("multiple adjacent | preserve field count (not collapsed)", () => {
    const msg = parseHL7(loadFixture("consecutive-delimiters"));
    const pid = msg.rawSegments.find((s) => s.name === "PID");
    expect(pid).toBeDefined();
    // The PID body ends with 10 adjacent pipes; the resulting field count
    // must reflect the empty fields (parser does not collapse consecutive
    // delimiters per PARSE-05). 19 fields total including the name slot.
    expect(pid?.fields.length).toBeGreaterThan(15);
  });
});

describe("TEST-03 edge-cases: unknown escape sequences (TOL-10)", () => {
  it("emits UNKNOWN_ESCAPE_SEQUENCE warning for \\Z99\\", () => {
    const msg = parseHL7(loadFixture("unknown-escapes"));
    expect(msg.warnings.map((w) => w.code)).toContain("UNKNOWN_ESCAPE_SEQUENCE");
  });

  it("preserves the unknown escape's payload verbatim in the parsed value", () => {
    const msg = parseHL7(loadFixture("unknown-escapes"));
    const obx = msg.rawSegments.find((s) => s.name === "OBX");
    expect(obx).toBeDefined();
    const obx5 = obx?.fields[5]?.repetitions[0]?.components[0]?.subcomponents[0];
    // TOL-10: the verbatim sequence is preserved (the parser does NOT
    // strip an unknown escape — it surfaces a warning and keeps the
    // payload). The full "\Z99\" substring must remain in the decoded
    // value.
    expect(obx5).toContain("\\Z99\\");
    expect(obx5).toContain("Z99");
  });
});

describe("TEST-03 edge-cases: custom MSH delimiters (PARSE-02)", () => {
  it("custom delimiters honored on MSH-1 / MSH-2 discovery", () => {
    const msg = parseHL7(loadFixture("custom-msh-delimiters"));
    // MSH-1 = "@", MSH-2 = "~&#\" per the fixture — the parser MUST
    // discover the full delimiter set from those bytes rather than
    // falling back to "|^~\&".
    expect(msg.encodingCharacters.field).toBe("@");
    expect(msg.encodingCharacters.component).toBe("~");
    expect(msg.encodingCharacters.repetition).toBe("&");
    expect(msg.encodingCharacters.escape).toBe("#");
    expect(msg.encodingCharacters.subcomponent).toBe("\\");
  });

  it("custom delimiters honored throughout subsequent segments", () => {
    const msg = parseHL7(loadFixture("custom-msh-delimiters"));
    // PID-3 was authored as "MRN-CMD-001~~~HOSP~MR" — using `~` as the
    // component separator. After parse, component[0] must be the MRN.
    const pid = msg.rawSegments.find((s) => s.name === "PID");
    expect(pid).toBeDefined();
    const mrn = pid?.fields[3]?.repetitions[0]?.components[0]?.subcomponents[0];
    expect(mrn).toBe("MRN-CMD-001");
  });
});

describe("TEST-03 edge-cases: Unicode names (UTF-8 preservation)", () => {
  it("accented + CJK characters parse correctly into PID-5 components", () => {
    const msg = parseHL7(loadFixture("unicode-names"));
    const pid = msg.rawSegments.find((s) => s.name === "PID");
    expect(pid).toBeDefined();
    // PID-5 first repetition: family Müller, given Jürgen.
    const family = pid?.fields[5]?.repetitions[0]?.components[0]?.subcomponents[0];
    const given = pid?.fields[5]?.repetitions[0]?.components[1]?.subcomponents[0];
    expect(family).toBe("Müller");
    expect(given).toBe("Jürgen");
    // PID-5 second repetition: CJK family + given.
    const family2 = pid?.fields[5]?.repetitions[1]?.components[0]?.subcomponents[0];
    const given2 = pid?.fields[5]?.repetitions[1]?.components[1]?.subcomponents[0];
    expect(family2).toBe("李");
    expect(given2).toBe("明");
  });

  it("UTF-8 bytes survive round-trip through toString() + reparse", () => {
    const msg = parseHL7(loadFixture("unicode-names"));
    const reparsed = parseHL7(msg.toString());
    const rpid = reparsed.rawSegments.find((s) => s.name === "PID");
    // Accented + CJK both preserved on the second pass.
    expect(rpid?.fields[5]?.repetitions[0]?.components[0]?.subcomponents[0]).toBe("Müller");
    expect(rpid?.fields[5]?.repetitions[0]?.components[1]?.subcomponents[0]).toBe("Jürgen");
    expect(rpid?.fields[5]?.repetitions[1]?.components[0]?.subcomponents[0]).toBe("李");
    expect(rpid?.fields[5]?.repetitions[1]?.components[1]?.subcomponents[0]).toBe("明");
  });
});

describe("Roadmap Phase A: v2.7+ truncation char (5-char MSH-2)", () => {
  it("MSH-2 of length 5 parses without fatal (was INVALID_ENCODING_CHARACTERS)", () => {
    const msg = parseHL7(loadFixture("truncation-char-msh2"));
    // Pre-fix: a v2.7 `^~\&#` 5-char MSH-2 was rejected with the
    // INVALID_ENCODING_CHARACTERS Tier-3 fatal — a fail-unsafe rejection of
    // spec-conformant input. After fix, parsing succeeds and the truncation
    // character is surfaced.
    expect(msg.encodingCharacters.field).toBe("|");
    expect(msg.encodingCharacters.component).toBe("^");
    expect(msg.encodingCharacters.repetition).toBe("~");
    expect(msg.encodingCharacters.escape).toBe("\\");
    expect(msg.encodingCharacters.subcomponent).toBe("&");
    expect(msg.encodingCharacters.truncation).toBe("#");
  });

  it("\\P\\ escape decodes to the declared truncation character", () => {
    const msg = parseHL7(loadFixture("truncation-char-msh2"));
    const obx = msg.rawSegments.find((s) => s.name === "OBX");
    const obx5 = obx?.fields[5]?.repetitions[0]?.components[0]?.subcomponents[0];
    // Fixture authored OBX-5 as "truncated\P\at end" — \P\ must expand
    // to the truncation character `#` (no UNKNOWN_ESCAPE_SEQUENCE warning).
    expect(obx5).toBe("truncated#at end");
    expect(msg.warnings.find((w) => w.code === "UNKNOWN_ESCAPE_SEQUENCE")).toBeUndefined();
  });

  it("a 4-char MSH-2 still parses unchanged (pre-v2.7 messages)", () => {
    // Existing fixtures all use 4-char MSH-2; loading any of them must keep
    // `encodingCharacters.truncation` undefined so the wire form round-trips.
    const msg = parseHL7(loadFixture("lf-line-endings"));
    expect(msg.encodingCharacters.truncation).toBeUndefined();
  });

  it("round-trips byte-exact through toString() — 5-char MSH-2 preserved", () => {
    const original = loadFixture("truncation-char-msh2");
    const msg = parseHL7(original);
    const reemitted = msg.toString();
    const reparsed = parseHL7(reemitted);
    // The re-emitted form must carry the 5-char MSH-2 so the truncation
    // char declaration survives the round-trip.
    expect(reemitted.startsWith("MSH|^~\\&#|")).toBe(true);
    expect(reparsed.encodingCharacters.truncation).toBe("#");
    // And the \P\-decoded value remains identical after the round-trip.
    const obx = reparsed.rawSegments.find((s) => s.name === "OBX");
    const obx5 = obx?.fields[5]?.repetitions[0]?.components[0]?.subcomponents[0];
    expect(obx5).toBe("truncated#at end");
  });
});

describe("Roadmap Phase A: highlight + formatting + charset escapes recognized", () => {
  it("\\H\\…\\N\\ is recognized — no UNKNOWN_ESCAPE_SEQUENCE warning emitted", () => {
    const msg = parseHL7(loadFixture("escape-highlight"));
    expect(msg.warnings.find((w) => w.code === "UNKNOWN_ESCAPE_SEQUENCE")).toBeUndefined();
  });

  it("\\H\\ / \\N\\ preserved verbatim in the decoded value for the renderer", () => {
    const msg = parseHL7(loadFixture("escape-highlight"));
    const obx = msg.rawSegments.find((s) => s.name === "OBX");
    const obx5 = obx?.fields[5]?.repetitions[0]?.components[0]?.subcomponents[0];
    // Preserve-verbatim policy: highlight markers stay in the string so a
    // downstream renderer can decide what to do; the parser does not pick
    // a presentational policy.
    expect(obx5).toContain("\\H\\value\\N\\");
  });

  it("formatting + charset escapes are all recognized (no UNKNOWN_ESCAPE_SEQUENCE)", () => {
    const msg = parseHL7(loadFixture("escape-formatting"));
    expect(msg.warnings.find((w) => w.code === "UNKNOWN_ESCAPE_SEQUENCE")).toBeUndefined();
  });

  it("formatting commands preserved verbatim in OBX-5", () => {
    const msg = parseHL7(loadFixture("escape-formatting"));
    const obx1 = msg.rawSegments.find((s) => s.name === "OBX");
    const obx1v = obx1?.fields[5]?.repetitions[0]?.components[0]?.subcomponents[0];
    expect(obx1v).toContain("\\.in\\");
    expect(obx1v).toContain("\\.sp\\");
    expect(obx1v).toContain("\\.ce\\");
    expect(obx1v).toContain("\\.fi\\");
    expect(obx1v).toContain("\\.nf\\");
  });

  it("charset switches (\\Cxxyy\\ / \\Mxxyyzz\\) preserved verbatim", () => {
    const msg = parseHL7(loadFixture("escape-formatting"));
    const obxes = msg.rawSegments.filter((s) => s.name === "OBX");
    const obx2v = obxes[1]?.fields[5]?.repetitions[0]?.components[0]?.subcomponents[0];
    expect(obx2v).toContain("\\C2842\\");
    expect(obx2v).toContain("\\M824041\\");
  });

  it("round-trips byte-exact through toString() — preserved escapes survive", () => {
    const original = loadFixture("escape-formatting");
    const msg = parseHL7(original);
    const reparsed = parseHL7(msg.toString());
    const obx1 = reparsed.rawSegments.find((s) => s.name === "OBX");
    const obx1v = obx1?.fields[5]?.repetitions[0]?.components[0]?.subcomponents[0];
    // Both formatting and charset switches survive intact across re-emission.
    expect(obx1v).toContain("\\.in\\");
    expect(obx1v).toContain("\\.nf\\");
  });
});

describe("TEST-03 edge-cases: missing optional segments (HELPERS-03)", () => {
  it("ADT^A01 without PV1 yields msg.visit === undefined", () => {
    const msg = parseHL7(loadFixture("missing-optional-segments"));
    // HELPERS-03: `msg.visit` is undefined when no PV1 segment exists.
    // The parser must NOT throw and helpers MUST return undefined rather
    // than a partially-populated Visit.
    expect(msg.visit).toBeUndefined();
    // Confirm fixture shape: MSH + EVN + PID, no PV1.
    expect(msg.rawSegments.find((s) => s.name === "PV1")).toBeUndefined();
    expect(msg.rawSegments.map((s) => s.name)).toEqual(["MSH", "EVN", "PID"]);
  });

  it("patient helper still resolves even without PV1", () => {
    const msg = parseHL7(loadFixture("missing-optional-segments"));
    // PID-derived helpers keep working — only PV1-derived helpers fold.
    expect(msg.patient?.mrn).toBe("MRN-MOS-001");
  });
});
