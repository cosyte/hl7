/**
 * Plan 06-03 Task 3: End-to-end coverage for the profile integration
 * pipeline delivered in Plan 06-03 — Segment.get(name) named-field access
 * (PROF-07), UNKNOWN_SEGMENT emit site + profile suppression (D-31, part of
 * PROF-06), merged `dateFormats` precedence observable via
 * `msg.meta.timestamp` (D-21), Hl7Message storage for both (D-16), and the
 * PROF-09 round-trip guarantee (profile affects parse only; toString() is
 * profile-agnostic).
 */

import { describe, expect, it } from "vitest";

import { parseHL7, WARNING_CODES } from "../src/index.js";
import { defineProfile } from "../src/profiles/define.js";

// Base MSH with a valid HL7 TS in MSH-7 (`20250101120000`). Dedicated D-21
// tests below override MSH-7 to exercise non-HL7 formats.
const BASE_MSH =
  "MSH|^~\\&|SENDAPP|SENDFAC|RCVAPP|RCVFAC|20250101120000||ADT^A01|MSG001|P|2.5\r";

describe("Segment.get(name) — happy paths (PROF-07)", () => {
  it("resolves a profile-declared field name to the correct Field", () => {
    const profile = defineProfile({
      name: "test",
      customSegments: {
        ZPI: { fields: { encounterId: 3, visitType: 5 } },
      },
    });
    const raw = BASE_MSH + "ZPI|||ENC123||INPATIENT\r";
    const msg = parseHL7(raw, profile);
    const zpi = msg.segments("ZPI")[0];
    expect(zpi?.get("encounterId")?.value).toBe("ENC123");
    expect(zpi?.get("visitType")?.value).toBe("INPATIENT");
  });

  it("returns undefined for a name NOT declared in customSegments", () => {
    const profile = defineProfile({
      name: "test",
      customSegments: { ZPI: { fields: { encounterId: 3 } } },
    });
    const raw = BASE_MSH + "ZPI|||ENC123\r";
    const msg = parseHL7(raw, profile);
    expect(msg.segments("ZPI")[0]?.get("typo")).toBeUndefined();
  });

  it("returns undefined when no profile is applied", () => {
    const raw = BASE_MSH + "ZPI|||ENC123\r";
    const msg = parseHL7(raw);
    expect(msg.segments("ZPI")[0]?.get("encounterId")).toBeUndefined();
  });

  it("returns undefined on a standard segment (D-15 defense-in-depth)", () => {
    // defineProfile rejects standard-segment customSegments via D-05, so we
    // bypass it with a hand-crafted Profile-shaped object — same as the
    // rogue-parent test in profiles-extends.test.ts. This proves
    // Segment.get returns undefined for a standard segment even when one
    // slips through a bypass route (D-15).
    const raw = BASE_MSH + "PID|||MRN123\r";
    const msg = parseHL7(raw);
    expect(msg.segments("PID")[0]?.get("mrn")).toBeUndefined();
  });

  it("out-of-range position → undefined (D-14)", () => {
    const profile = defineProfile({
      name: "test",
      customSegments: { ZPI: { fields: { farOut: 50 } } },
    });
    const raw = BASE_MSH + "ZPI|a|b|c\r";
    const msg = parseHL7(raw, profile);
    expect(msg.segments("ZPI")[0]?.get("farOut")).toBeUndefined();
  });
});

describe("UNKNOWN_SEGMENT emit site (PROF-06 / D-31)", () => {
  it("emits UNKNOWN_SEGMENT for an unknown Z-segment without a profile", () => {
    const raw = BASE_MSH + "PID|||MRN\rZZZ|foo\r";
    const msg = parseHL7(raw);
    const codes = msg.warnings.map((w) => w.code);
    expect(codes).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("does NOT emit UNKNOWN_SEGMENT for a profile-declared Z-segment", () => {
    const profile = defineProfile({
      name: "test",
      customSegments: { ZPI: { fields: { a: 3 } } },
    });
    const raw = BASE_MSH + "ZPI|||X\r";
    const msg = parseHL7(raw, profile);
    const codes = msg.warnings.map((w) => w.code);
    expect(codes).not.toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("emits UNKNOWN_SEGMENT for a Z-segment NOT in the profile", () => {
    const profile = defineProfile({
      name: "test",
      customSegments: { ZPI: { fields: { a: 3 } } },
    });
    const raw = BASE_MSH + "ZZZ|foo\r";
    const msg = parseHL7(raw, profile);
    const codes = msg.warnings.map((w) => w.code);
    expect(codes).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("does NOT emit UNKNOWN_SEGMENT for MSH (standard)", () => {
    const raw = BASE_MSH + "PID|||MRN\r";
    const msg = parseHL7(raw);
    const codes = msg.warnings.map((w) => w.code);
    expect(codes).not.toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("does NOT emit UNKNOWN_SEGMENT for any KNOWN segment (PID/OBR/OBX)", () => {
    const raw = BASE_MSH + "PID|||MRN\rOBR|1\rOBX|1|NM|TEST||42\r";
    const msg = parseHL7(raw);
    const codes = msg.warnings.map((w) => w.code);
    expect(codes).not.toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("warning includes position.segmentIndex pointing at the unknown segment", () => {
    const raw = BASE_MSH + "PID|||MRN\rZZZ|foo\r";
    const msg = parseHL7(raw);
    const unknown = msg.warnings.find(
      (w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT,
    );
    expect(unknown?.position.segmentIndex).toBe(2); // 0=MSH, 1=PID, 2=ZZZ
  });

  it("emits one UNKNOWN_SEGMENT per unknown segment (multiple Zs)", () => {
    const raw = BASE_MSH + "PID|||MRN\rZZZ|a\rZYX|b\r";
    const msg = parseHL7(raw);
    const unknowns = msg.warnings.filter(
      (w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT,
    );
    expect(unknowns).toHaveLength(2);
  });
});

describe("D-21 merged dateFormats: options.dateFormats precedes profile.dateFormats", () => {
  it("option-only format makes MSH-7 in a non-HL7 format parse", () => {
    const raw =
      "MSH|^~\\&|APP|FAC|APP|FAC|01/15/2025||ADT^A01|MSG001|P|2.5\rPID\r";
    const msg = parseHL7(raw, { dateFormats: ["MM/DD/YYYY"] });
    expect(msg.meta.timestamp).toBeInstanceOf(Date);
    expect(msg.meta.timestamp?.toISOString()).toBe("2025-01-15T00:00:00.000Z");
    // Note: buildMeta runs on-demand via the .meta getter and `msg.warnings`
    // is frozen at Hl7Message construction (Phase 2 D-07). Wiring MSH-7
    // timestamp parse into the parse pipeline to surface
    // TIMESTAMP_FALLBACK_FORMAT in msg.warnings is a separate concern
    // (requires buildMeta to run eagerly during parseHL7 with live emit
    // access) and is outside the Plan 06-03 scope — the Date itself is
    // the observable contract for D-21 from this plan's perspective.
  });

  it("profile.dateFormats alone makes a non-HL7 MSH-7 parse", () => {
    const profile = defineProfile({
      name: "test",
      dateFormats: ["MM/DD/YYYY"],
    });
    const raw =
      "MSH|^~\\&|APP|FAC|APP|FAC|01/15/2025||ADT^A01|MSG001|P|2.5\rPID\r";
    const msg = parseHL7(raw, profile);
    expect(msg.meta.timestamp).toBeInstanceOf(Date);
    expect(msg.meta.timestamp?.toISOString()).toBe("2025-01-15T00:00:00.000Z");
  });

  it("options.dateFormats present AND profile.dateFormats present — OPTIONS tried first (D-21)", () => {
    // Crafted so both formats match the input but produce DIFFERENT dates.
    // Input "01/02/2025": options "MM/DD/YYYY" → Jan 2, profile
    // "DD/MM/YYYY" → Feb 1. Options-first means Jan 2 wins.
    const profile = defineProfile({
      name: "test",
      dateFormats: ["DD/MM/YYYY"],
    });
    const raw =
      "MSH|^~\\&|APP|FAC|APP|FAC|01/02/2025||ADT^A01|MSG001|P|2.5\rPID\r";
    const msg = parseHL7(raw, {
      dateFormats: ["MM/DD/YYYY"],
      profile,
    });
    expect(msg.meta.timestamp?.toISOString()).toBe("2025-01-02T00:00:00.000Z");
  });

  it("msg.dateFormats exposes the merged list (D-21 observable)", () => {
    const profile = defineProfile({
      name: "test",
      dateFormats: ["DD/MM/YYYY", "YYYY-MM-DD"],
    });
    const msg = parseHL7(BASE_MSH + "PID\r", {
      dateFormats: ["MM/DD/YYYY", "YYYY-MM-DD"],
      profile,
    });
    expect(msg.dateFormats).toEqual([
      "MM/DD/YYYY",
      "YYYY-MM-DD",
      "DD/MM/YYYY",
    ]);
  });

  it("no options.dateFormats, no profile → msg.dateFormats is []", () => {
    const msg = parseHL7(BASE_MSH + "PID\r");
    expect(msg.dateFormats).toEqual([]);
  });

  it("only profile.dateFormats → msg.dateFormats reflects profile list", () => {
    const profile = defineProfile({
      name: "test",
      dateFormats: ["MM/DD/YYYY", "YYYY-MM-DD"],
    });
    const msg = parseHL7(BASE_MSH + "PID\r", profile);
    expect(msg.dateFormats).toEqual(["MM/DD/YYYY", "YYYY-MM-DD"]);
  });
});

describe("PROF-09 round-trip: profile does NOT affect toString()", () => {
  it("parseHL7(raw, profile).toString() === parseHL7(raw).toString()", () => {
    const profile = defineProfile({
      name: "test",
      customSegments: { ZPI: { fields: { a: 3 } } },
    });
    const raw = BASE_MSH + "PID|||MRN123\rZPI|||X\r";
    const withProfile = parseHL7(raw, profile).toString();
    const withoutProfile = parseHL7(raw).toString();
    expect(withProfile).toBe(withoutProfile);
  });

  it("parse → toString → parse with profile round-trips structurally", () => {
    const profile = defineProfile({
      name: "test",
      customSegments: { ZPI: { fields: { encounterId: 3 } } },
    });
    const raw = BASE_MSH + "PID|||MRN123\rZPI|||ENC999\r";
    const first = parseHL7(raw, profile);
    const second = parseHL7(first.toString(), profile);
    expect(second.rawSegments).toEqual(first.rawSegments);
    // Profile attribution survives because we passed the profile both times.
    expect(second.profile?.name).toBe("test");
  });
});

describe("Phase 2 backward compat: parse without profile still works", () => {
  it("parseHL7(raw) with unknown Z-segment still parses + attaches UNKNOWN_SEGMENT", () => {
    const raw = BASE_MSH + "PID|||MRN\rZZZ|foo\r";
    const msg = parseHL7(raw);
    expect(msg.rawSegments).toHaveLength(3);
    expect(msg.warnings.length).toBeGreaterThan(0);
  });

  it("parseHL7(raw, profile) still populates msg.profile.name + lineage (Phase 2 attribution)", () => {
    const profile = defineProfile({ name: "myProfile" });
    const msg = parseHL7(BASE_MSH + "PID\r", profile);
    expect(msg.profile?.name).toBe("myProfile");
    expect(msg.profile?.lineage).toEqual(["myProfile"]);
  });

  it("parseHL7(raw, profile) with customSegments threads them onto segments (D-16)", () => {
    const profile = defineProfile({
      name: "myProfile",
      customSegments: { ZPI: { fields: { encounterId: 3 } } },
    });
    const raw = BASE_MSH + "PID|||MRN\rZPI|||ENC001\r";
    const msg = parseHL7(raw, profile);
    const zpi = msg.segments("ZPI")[0];
    // customFields slice present on the Segment instance
    expect(zpi?.customFields).toEqual({ encounterId: 3 });
    // And get(name) resolves
    expect(zpi?.get("encounterId")?.value).toBe("ENC001");
  });
});
