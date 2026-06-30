import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import {
  parseHL7,
  Hl7Message,
  Hl7ParseError,
  WARNING_CODES,
  FATAL_CODES,
  DEFAULT_ENCODING_CHARACTERS,
  type Hl7ParseWarning,
  type ParseOptions,
  type Profile,
} from "../src/index.js";

const VALID_MSG =
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123\rEVN|A01|20250101\rPV1||I";

describe("parseHL7: happy paths", () => {
  it("parses a well-formed v2.5 message and exposes encodingCharacters + version + segments + warnings", () => {
    const msg = parseHL7(VALID_MSG);
    expect(msg).toBeInstanceOf(Hl7Message);
    expect(msg.encodingCharacters).toEqual(DEFAULT_ENCODING_CHARACTERS);
    expect(msg.version).toBe("2.5");
    expect(msg.rawSegments).toHaveLength(4);
    expect(msg.warnings).toHaveLength(0);
    expect(msg.profile).toBeUndefined();
  });

  it("parses a Buffer input equivalently to its string counterpart", () => {
    const fromString = parseHL7(VALID_MSG);
    const fromBuffer = parseHL7(Buffer.from(VALID_MSG, "utf-8"));
    expect(fromBuffer.version).toBe(fromString.version);
    expect(fromBuffer.rawSegments.length).toBe(fromString.rawSegments.length);
  });

  it("freezes msg.warnings so consumers cannot mutate parser output", () => {
    const msg = parseHL7(VALID_MSG);
    expect(Object.isFrozen(msg.warnings)).toBe(true);
  });
});

describe("parseHL7: Tier-3 fatal errors (thrown even in lenient mode)", () => {
  it("throws Hl7ParseError with code EMPTY_INPUT on empty input", () => {
    let caught: unknown;
    try {
      parseHL7("");
      expect.fail("should throw");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Hl7ParseError);
    if (caught instanceof Hl7ParseError) {
      expect(caught.code).toBe(FATAL_CODES.EMPTY_INPUT);
    }
  });

  it("throws EMPTY_INPUT when only MLLP framing bytes were provided", () => {
    let caught: unknown;
    try {
      parseHL7("\u000B\u001C\u000D");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Hl7ParseError);
    if (caught instanceof Hl7ParseError) {
      expect(caught.code).toBe(FATAL_CODES.EMPTY_INPUT);
    }
  });

  it("throws NO_MSH_SEGMENT on input not starting with MSH", () => {
    let caught: unknown;
    try {
      parseHL7("PID|1");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Hl7ParseError);
    if (caught instanceof Hl7ParseError) {
      expect(caught.code).toBe(FATAL_CODES.NO_MSH_SEGMENT);
    }
  });

  it("throws MSH_TOO_SHORT on a truncated MSH", () => {
    let caught: unknown;
    try {
      parseHL7("MSH|^");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Hl7ParseError);
    if (caught instanceof Hl7ParseError) {
      expect(caught.code).toBe(FATAL_CODES.MSH_TOO_SHORT);
    }
  });

  it("throws INVALID_ENCODING_CHARACTERS on malformed MSH-2", () => {
    let caught: unknown;
    try {
      parseHL7("MSH|^^^^|APP|FAC");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Hl7ParseError);
    if (caught instanceof Hl7ParseError) {
      expect(caught.code).toBe(FATAL_CODES.INVALID_ENCODING_CHARACTERS);
    }
  });

  it("fatal errors carry populated message, position, snippet fields (TOL-02 shape)", () => {
    let caught: unknown;
    try {
      parseHL7("PID|1");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Hl7ParseError);
    if (caught instanceof Hl7ParseError) {
      expect(caught.message.length).toBeGreaterThan(0);
      expect(caught.position.segmentIndex).toBe(0);
      expect(caught.snippet.length).toBeGreaterThan(0);
    }
  });
});

describe("parseHL7: Tier-2 warnings (lenient mode) + onWarning callback", () => {
  const MLLP_WRAPPED = `\u000B${VALID_MSG}\u001C\u000D`;

  it("strips MLLP framing and emits a single MLLP_FRAMING_STRIPPED warning", () => {
    const msg = parseHL7(MLLP_WRAPPED);
    expect(msg.warnings).toHaveLength(1);
    expect(msg.warnings[0]?.code).toBe(WARNING_CODES.MLLP_FRAMING_STRIPPED);
  });

  it("invokes options.onWarning with the same warning reference that lands in msg.warnings", () => {
    const seen: Hl7ParseWarning[] = [];
    const msg = parseHL7(MLLP_WRAPPED, { onWarning: (w) => seen.push(w) });
    expect(seen).toHaveLength(1);
    expect(msg.warnings[0]).toBe(seen[0]);
  });

  it("emits FIELD_WHITESPACE_TRIMMED when trimFields is true (default)", () => {
    const withSpaces = "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|  hi  |";
    const msg = parseHL7(withSpaces);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.FIELD_WHITESPACE_TRIMMED)).toBe(true);
  });

  it("suppresses FIELD_WHITESPACE_TRIMMED when trimFields is explicitly false", () => {
    const withSpaces = "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|  hi  |";
    const msg = parseHL7(withSpaces, { trimFields: false } satisfies ParseOptions);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.FIELD_WHITESPACE_TRIMMED)).toBe(false);
  });

  it("suppresses MLLP_FRAMING_STRIPPED warning when stripMllpFraming is explicitly false, but still strips the bytes", () => {
    const msg = parseHL7(MLLP_WRAPPED, { stripMllpFraming: false });
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED)).toBe(false);
    // Bytes were still stripped — otherwise segment splitting would have produced garbage.
    expect(msg.version).toBe("2.5");
  });
});

describe("parseHL7: strict-mode escalation (TOL-01)", () => {
  const MLLP_WRAPPED = `\u000B${VALID_MSG}\u001C\u000D`;

  it("throws Hl7ParseError instead of pushing MLLP_FRAMING_STRIPPED under strict: true", () => {
    let caught: unknown;
    try {
      parseHL7(MLLP_WRAPPED, { strict: true });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Hl7ParseError);
    if (caught instanceof Hl7ParseError) {
      expect(caught.code).toBe("MLLP_FRAMING_STRIPPED");
      expect(caught.message.length).toBeGreaterThan(0);
      expect(caught.position.segmentIndex).toBe(0);
    }
  });

  it("does NOT invoke onWarning under strict mode (the warning becomes a throw)", () => {
    const seen: Hl7ParseWarning[] = [];
    try {
      parseHL7(MLLP_WRAPPED, { strict: true, onWarning: (w) => seen.push(w) });
    } catch {
      // expected
    }
    expect(seen).toHaveLength(0);
  });

  it("does NOT escalate Tier-1 silent events (BOM, line endings) even under strict mode", () => {
    const bomInput = `\uFEFF${VALID_MSG.replace(/\r/g, "\r\n")}`;
    // \uFEFF BOM (Tier 1 silent) + \r\n line endings (Tier 1 silent) → no throw under strict.
    const msg = parseHL7(bomInput, { strict: true });
    expect(msg.warnings).toHaveLength(0);
  });

  it("still throws EMPTY_INPUT with the same code under strict mode (Tier-3 already fatal)", () => {
    let caught: unknown;
    try {
      parseHL7("", { strict: true });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Hl7ParseError);
    if (caught instanceof Hl7ParseError) {
      expect(caught.code).toBe(FATAL_CODES.EMPTY_INPUT);
    }
  });
});

describe("parseHL7: argument discrimination (D-06)", () => {
  const epicProfile: Profile = { name: "epic", lineage: ["base", "epic"] };

  it("treats a Profile-shaped argument as the profile overload", () => {
    const msg = parseHL7(VALID_MSG, epicProfile);
    expect(msg.profile?.name).toBe("epic");
    expect(msg.profile?.lineage).toEqual(["base", "epic"]);
  });

  it("treats ParseOptions with a nested profile field as options (not the profile overload)", () => {
    const msg = parseHL7(VALID_MSG, { profile: epicProfile, strict: false });
    expect(msg.profile?.name).toBe("epic");
  });

  it("honors PROF-08 opt-out: { profile: null } yields msg.profile === undefined", () => {
    const msg = parseHL7(VALID_MSG, { profile: null });
    expect(msg.profile).toBeUndefined();
  });

  it("defaults lineage to [profile.name] when profile.lineage is absent", () => {
    const msg = parseHL7(VALID_MSG, { name: "custom" } satisfies Profile);
    expect(msg.profile?.lineage).toEqual(["custom"]);
  });
});

describe("parseHL7: PARSE-01 end-to-end — well-formed v2.x messages parse correctly", () => {
  it("parses v2.3 message", () => {
    const msg = parseHL7("MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.3\rPID|||123");
    expect(msg.version).toBe("2.3");
  });

  it("parses v2.8 message with custom encoding chars", () => {
    const msg = parseHL7("MSH#$%*@#APP#FAC#APP#FAC#20250101##ADT$A01#1#P#2.8\rPID#1##XXX");
    expect(msg.version).toBe("2.8");
    expect(msg.encodingCharacters.field).toBe("#");
    expect(msg.encodingCharacters.component).toBe("$");
  });

  it("preserves segment order including repeating and Z-segments (PARSE-04)", () => {
    const msg = parseHL7(
      "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||1\rNK1|1\rNK1|2\rZPI|custom",
    );
    expect(msg.rawSegments.map((s) => s.name)).toEqual(["MSH", "PID", "NK1", "NK1", "ZPI"]);
  });

  it("returns version as empty string when MSH-12 is absent", () => {
    const msg = parseHL7("MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P\rPID|||1");
    expect(msg.version).toBe("");
  });
});

describe("PARSE-09 — MSH-18 charset wiring", () => {
  // Build a message whose MSH-18 declares the supplied charset. PID-5 carries
  // the supplied patient-surname token (which may be a single non-ASCII
  // character that round-trips only under the declared charset). Fields are
  // laid out so that MSH-18 sits at the 18th HL7 field position.
  //
  // HL7 MSH numbering: MSH-1 is the field separator character itself; MSH-2
  // is the first value after the first `|` (encoding chars). So the MSH-18
  // value is at index 17 when splitting "MSH|a|b|..." on `|` (because
  // parts[0]="MSH", parts[1]=MSH-2, ..., parts[17]=MSH-18). Concretely the
  // message below places the charset token 16 fields after the encoding
  // chars:
  //   parts[0]=MSH, [1]=^~\&, [2]=APP, [3]=FAC, [4]=APP, [5]=FAC,
  //   [6]=20250101, [7]="", [8]=ADT^A01, [9]=1, [10]=P, [11]=2.5,
  //   [12]="", [13]="", [14]="", [15]="", [16]="", [17]=<charset>
  // After MSH-12 ("2.5") we need 5 empty fields (MSH-13..17) then MSH-18
  // = charset — i.e. six pipes: `2.5||||||<charset>`.
  const buildMessage = (charset: string, pidSurname: string, lineSep: string): string =>
    [
      `MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5||||||${charset}`,
      `PID|||123||${pidSurname}`,
    ].join(lineSep);

  // Single-byte Latin-1 character: Ü (U+00DC) — 0xDC in ISO-8859-1.
  const LATIN1_U_UMLAUT = "\u00DC";

  /** Walk the 1-indexed positional tree to pull PID-5's first subcomponent. */
  const readPid5 = (msg: {
    rawSegments: readonly {
      name: string;
      fields: readonly {
        repetitions: readonly { components: readonly { subcomponents: readonly string[] }[] }[];
      }[];
    }[];
  }): string => {
    const pid = msg.rawSegments[1];
    expect(pid?.name).toBe("PID");
    const field = pid?.fields[5];
    const rep = field?.repetitions[0];
    const comp = rep?.components[0];
    return comp?.subcomponents[0] ?? "";
  };

  it("1. auto-discovers MSH-18=ISO-8859-1 and decodes Latin-1 PID-5 correctly", () => {
    const raw = buildMessage("ISO-8859-1", LATIN1_U_UMLAUT, "\r");
    const buf = Buffer.from(raw, "latin1");
    const msg = parseHL7(buf);
    expect(readPid5(msg)).toBe(LATIN1_U_UMLAUT);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_CHARSET)).toBe(false);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.ENCODING_MISMATCH)).toBe(false);
  });

  it("2. honors options.charset when MSH-18 is empty (no mismatch warning)", () => {
    const raw = buildMessage("", LATIN1_U_UMLAUT, "\r");
    const buf = Buffer.from(raw, "latin1");
    const msg = parseHL7(buf, { charset: "ISO-8859-1" });
    expect(readPid5(msg)).toBe(LATIN1_U_UMLAUT);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.ENCODING_MISMATCH)).toBe(false);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_CHARSET)).toBe(false);
  });

  it("3. emits ENCODING_MISMATCH when options.charset disagrees with MSH-18 (override wins)", () => {
    // MSH-18 declares ISO-8859-1 but caller overrides with UTF-8.
    // Build payload as UTF-8 bytes so the override decode is meaningful
    // (decoded text should reflect UTF-8 semantics per the plan).
    const raw = buildMessage("ISO-8859-1", LATIN1_U_UMLAUT, "\r");
    const buf = Buffer.from(raw, "utf-8");
    const msg = parseHL7(buf, { charset: "UTF-8" });
    const mismatches = msg.warnings.filter((w) => w.code === WARNING_CODES.ENCODING_MISMATCH);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.message).toContain("UTF-8");
    expect(mismatches[0]?.message).toContain("ISO-8859-1");
    // Override won: UTF-8 decode of UTF-8 bytes yields the correct Ü.
    expect(readPid5(msg)).toBe(LATIN1_U_UMLAUT);
  });

  it("4. does NOT emit ENCODING_MISMATCH when options.charset and MSH-18 are alias synonyms", () => {
    // MSH-18 uses the legacy HL7 "UNICODE UTF-8" form; override uses "UTF-8".
    // Both normalize to "utf-8" via mapHl7Charset.
    const raw = buildMessage("UNICODE UTF-8", "Smith", "\r");
    const buf = Buffer.from(raw, "utf-8");
    const msg = parseHL7(buf, { charset: "UTF-8" });
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.ENCODING_MISMATCH)).toBe(false);
  });

  it("5. emits UNKNOWN_CHARSET on unknown MSH-18 label with no override (UTF-8 fallback)", () => {
    const raw = buildMessage("INVALID-CHARSET-XYZ", "Smith", "\r");
    const buf = Buffer.from(raw, "utf-8");
    const msg = parseHL7(buf);
    const unknowns = msg.warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_CHARSET);
    expect(unknowns).toHaveLength(1);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.ENCODING_MISMATCH)).toBe(false);
  });

  it("6. regression: Buffer without MSH-18 (empty field) decodes UTF-8 with no charset warnings", () => {
    const raw = buildMessage("", "Smith", "\r");
    const buf = Buffer.from(raw, "utf-8");
    const msg = parseHL7(buf);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_CHARSET)).toBe(false);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.ENCODING_MISMATCH)).toBe(false);
    expect(readPid5(msg)).toBe("Smith");
  });

  it("7. regression: string input path does not invoke charset resolution", () => {
    const msg = parseHL7(VALID_MSG, { charset: "ISO-8859-1" });
    // options.charset is silently ignored for string input — no warnings.
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.ENCODING_MISMATCH)).toBe(false);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_CHARSET)).toBe(false);
    expect(msg.version).toBe("2.5");
  });

  it("8. line-ending agnostic: \\n-only Buffer + MSH-18=ISO-8859-1 resolves correctly", () => {
    const raw = buildMessage("ISO-8859-1", LATIN1_U_UMLAUT, "\n");
    const buf = Buffer.from(raw, "latin1");
    const msg = parseHL7(buf);
    expect(readPid5(msg)).toBe(LATIN1_U_UMLAUT);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_CHARSET)).toBe(false);
  });

  it("9. MLLP-wrapped Buffer with non-UTF-8 MSH-18: documented fallback (no crash, no mismatch)", () => {
    const raw = buildMessage("ISO-8859-1", "Smith", "\r");
    const framed = `\u000B${raw}\u001C\u000D`;
    const buf = Buffer.from(framed, "latin1");
    // MLLP-ordered-before-decode: extractor sees \u000B first, returns
    // undefined, so MSH-18 is silently ignored and UTF-8 is used. This is
    // the pinned limitation (T-02-07-05). Asserting no-throw and that
    // parsing completes is the contract.
    expect(() => parseHL7(buf)).not.toThrow();
    const msg = parseHL7(buf);
    // No ENCODING_MISMATCH — no override was supplied.
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.ENCODING_MISMATCH)).toBe(false);
    // Version still parses (MLLP bytes were stripped downstream).
    expect(msg.version).toBe("2.5");
  });
});
