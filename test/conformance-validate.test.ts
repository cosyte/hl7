/**
 * Conformance-profile engine tests (roadmap Phase U — `validateAgainstProfile`).
 *
 * Covers the four acceptance invariants directly:
 *   - **Never throws** — malformed profile / message yields findings, not an error.
 *   - **Valid ⇒ zero findings** (and the documented "not an attestation").
 *   - **No PHI in findings** — a finding names the locus + rule, never the value.
 *   - **Read-only** — validation never mutates the message.
 * plus the per-usage-code semantics, cardinality, length, value-set, per-rule
 * severity, and the fail-fast `defineConformanceProfile` gate.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FINDING_CODES,
  ProfileDefinitionError,
  defineConformanceProfile,
  parseHL7,
  validateAgainstProfile,
  type ConformanceProfile,
} from "../src/index.js";

const FIX = join(import.meta.dirname, "fixtures", "conformance");
const readFix = (name: string): string => readFileSync(join(FIX, name), "utf8");
const readProfile = (name: string): ConformanceProfile =>
  JSON.parse(readFix(name)) as ConformanceProfile;

const MIN_PROFILE = readProfile("profile-adt-min.json");

describe("validateAgainstProfile — fixtures (roadmap accuracy bar)", () => {
  it("a conforming message produces ZERO findings", () => {
    const msg = parseHL7(readFix("adt-pass.hl7"));
    const result = validateAgainstProfile(msg, MIN_PROFILE);
    expect(result.profileName).toBe("example-adt-min");
    expect(result.findings).toEqual([]);
  });

  it("a missing Required field is one PROFILE_REQUIRED_ABSENT finding at the right locus", () => {
    const msg = parseHL7(readFix("adt-missing-required.hl7"));
    const { findings } = validateAgainstProfile(msg, MIN_PROFILE);
    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f?.code).toBe(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
    expect(f?.severity).toBe("error");
    expect(f?.locus).toMatchObject({ segment: "PID", field: 3 });
  });

  it("too many repetitions is a PROFILE_CARDINALITY finding", () => {
    const msg = parseHL7(readFix("adt-cardinality.hl7"));
    const { findings } = validateAgainstProfile(msg, MIN_PROFILE);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_CARDINALITY);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 3 });
  });

  it("a code outside the supplied value set is a PROFILE_VALUE_NOT_IN_SET finding", () => {
    const msg = parseHL7(readFix("adt-value-not-in-set.hl7"));
    const { findings } = validateAgainstProfile(msg, MIN_PROFILE);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_VALUE_NOT_IN_SET);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 8, component: 1 });
  });
});

describe("validateAgainstProfile — usage-code semantics", () => {
  const raw =
    "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5\rEVN|A01|20260101\r" +
    "PID|1||MRN12345^^^H^MR||Doe^John||19800101|M";

  it("RE absent is NOT a violation; O absent is NOT a violation", () => {
    const msg = parseHL7(raw);
    const profile: ConformanceProfile = {
      name: "re-o",
      segments: [
        {
          segment: "PID",
          usage: "R",
          fields: [
            { field: 6, name: "Mother's Maiden Name", usage: "RE" },
            { field: 10, name: "Race", usage: "O" },
          ],
        },
      ],
    };
    expect(validateAgainstProfile(msg, profile).findings).toEqual([]);
  });

  it("C / CE presence is NOT evaluated (no predicate language) — absent conditional is clean", () => {
    const msg = parseHL7(raw);
    const profile: ConformanceProfile = {
      name: "conditional",
      segments: [
        {
          segment: "PID",
          usage: "R",
          fields: [
            { field: 6, usage: "C" },
            { field: 10, usage: "CE" },
          ],
        },
      ],
    };
    expect(validateAgainstProfile(msg, profile).findings).toEqual([]);
  });

  it("X field present is PROFILE_NOT_PERMITTED", () => {
    const msg = parseHL7(raw);
    const profile: ConformanceProfile = {
      name: "x-field",
      segments: [{ segment: "PID", fields: [{ field: 8, name: "Sex", usage: "X" }] }],
    };
    const { findings } = validateAgainstProfile(msg, profile);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_NOT_PERMITTED);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 8 });
  });

  it("R segment absent, X segment present, and segment cardinality all fire at segment level", () => {
    const msg = parseHL7(raw); // has MSH, EVN, PID — no PV1, no OBX
    const profile: ConformanceProfile = {
      name: "seg-level",
      segments: [
        { segment: "PV1", usage: "R" }, // absent → required-absent
        { segment: "PID", usage: "X" }, // present → not-permitted
        { segment: "EVN", cardinality: { min: 2, max: 3 } }, // 1 present, min 2 → cardinality
      ],
    };
    const { findings } = validateAgainstProfile(msg, profile);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain(FINDING_CODES.PROFILE_REQUIRED_ABSENT);
    expect(codes).toContain(FINDING_CODES.PROFILE_NOT_PERMITTED);
    expect(codes).toContain(FINDING_CODES.PROFILE_CARDINALITY);
    // segment-level findings carry no `field`
    for (const f of findings) expect(f.locus.field).toBeUndefined();
  });

  it("a length overflow is a PROFILE_LENGTH finding; per-rule severity downgrades it", () => {
    const msg = parseHL7(raw); // MSH-10 control id = "MSG1" (length 4)
    const profile: ConformanceProfile = {
      name: "length",
      segments: [
        {
          segment: "MSH",
          fields: [{ field: 10, name: "Control ID", length: 2, severity: "warning" }],
        },
      ],
    };
    const { findings } = validateAgainstProfile(msg, profile);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_LENGTH);
    expect(findings[0]?.severity).toBe("warning");
  });

  it("value-set membership honours a non-default component", () => {
    const msg = parseHL7(raw); // PID-3.5 (identifier type code) = "MR"
    const profile: ConformanceProfile = {
      name: "component-vs",
      segments: [
        {
          segment: "PID",
          fields: [{ field: 3, name: "ID type", component: 5, valueSet: ["PI", "PN"] }],
        },
      ],
    };
    const { findings } = validateAgainstProfile(msg, profile);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(FINDING_CODES.PROFILE_VALUE_NOT_IN_SET);
    expect(findings[0]?.locus).toMatchObject({ segment: "PID", field: 3, component: 5 });
  });
});

describe("validateAgainstProfile — never throws, read-only, PHI-safe", () => {
  it("never throws on a malformed profile — returns PROFILE_MALFORMED findings", () => {
    const msg = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|M1|P|2.5");
    // A deliberately broken profile passed through `any` — the engine must not throw.
    const broken = {
      name: "",
      segments: [{ segment: "pid", usage: "NOPE", fields: [{ field: 0 }] }],
    };
    const result = validateAgainstProfile(msg, broken as unknown as ConformanceProfile);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.every((f) => f.code === FINDING_CODES.PROFILE_MALFORMED)).toBe(true);
    expect(result.profileName).toBe("(unnamed profile)");
  });

  it("never throws when handed a non-object profile", () => {
    const msg = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|M1|P|2.5");
    for (const junk of [null, undefined, 42, "x", []]) {
      const result = validateAgainstProfile(msg, junk as unknown as ConformanceProfile);
      expect(result.findings[0]?.code).toBe(FINDING_CODES.PROFILE_MALFORMED);
    }
  });

  it("validation does not mutate the message (round-trip stable)", () => {
    const msg = parseHL7(readFix("adt-value-not-in-set.hl7"));
    const before = msg.toString();
    validateAgainstProfile(msg, MIN_PROFILE);
    expect(msg.toString()).toBe(before);
  });

  it("no finding message contains the offending field value (PHI safety)", () => {
    // The offending PID-8 value is "Q"; the MRN is "MRN12345". Neither the code
    // value nor the identifier may appear in any finding message.
    const msg = parseHL7(readFix("adt-value-not-in-set.hl7"));
    const wide: ConformanceProfile = {
      name: "wide",
      segments: [
        {
          segment: "PID",
          usage: "R",
          fields: [
            { field: 3, name: "MRN", usage: "R", length: 3, valueSet: ["MRN00000^^^H^MR"] },
            { field: 8, name: "Sex", valueSet: ["M", "F"] },
          ],
        },
      ],
    };
    const { findings } = validateAgainstProfile(msg, wide);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.message).not.toContain("MRN12345");
      // the bare code value "Q" must not be echoed
      expect(f.message).not.toMatch(/\bQ\b/u);
    }
  });
});

describe("defineConformanceProfile — fail-fast authoring gate", () => {
  it("returns the profile unchanged when well-formed", () => {
    const p = defineConformanceProfile(MIN_PROFILE);
    expect(p).toBe(MIN_PROFILE);
  });

  it("throws ProfileDefinitionError listing the defects when malformed", () => {
    expect(() => defineConformanceProfile({ name: "x", segments: [{ segment: "pid" }] })).toThrow(
      ProfileDefinitionError,
    );
  });

  it("the throw names the shape defect, never any message value", () => {
    try {
      defineConformanceProfile({
        name: "",
        segments: [{ segment: "PID", fields: [{ field: -1 }] }],
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileDefinitionError);
      expect((err as ProfileDefinitionError).message).toContain("must be a positive");
    }
  });
});
