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
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123\rEVN|A01|20250101";

describe("parseHL7: happy paths", () => {
  it("parses a well-formed v2.5 message and exposes encodingCharacters + version + segments + warnings", () => {
    const msg = parseHL7(VALID_MSG);
    expect(msg).toBeInstanceOf(Hl7Message);
    expect(msg.encodingCharacters).toEqual(DEFAULT_ENCODING_CHARACTERS);
    expect(msg.version).toBe("2.5");
    expect(msg.segments).toHaveLength(3);
    expect(msg.warnings).toHaveLength(0);
    expect(msg.profile).toBeUndefined();
  });

  it("parses a Buffer input equivalently to its string counterpart", () => {
    const fromString = parseHL7(VALID_MSG);
    const fromBuffer = parseHL7(Buffer.from(VALID_MSG, "utf-8"));
    expect(fromBuffer.version).toBe(fromString.version);
    expect(fromBuffer.segments.length).toBe(fromString.segments.length);
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
    const withSpaces =
      "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|  hi  |";
    const msg = parseHL7(withSpaces);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.FIELD_WHITESPACE_TRIMMED)).toBe(true);
  });

  it("suppresses FIELD_WHITESPACE_TRIMMED when trimFields is explicitly false", () => {
    const withSpaces =
      "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|  hi  |";
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
    const msg = parseHL7(
      "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.3\rPID|||123",
    );
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
    expect(msg.segments.map((s) => s.name)).toEqual(["MSH", "PID", "NK1", "NK1", "ZPI"]);
  });

  it("returns version as empty string when MSH-12 is absent", () => {
    const msg = parseHL7("MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P\rPID|||1");
    expect(msg.version).toBe("");
  });
});
