/**
 * Unit tests for `src/serialize/to-json.ts::emitJson` (SER-03). Organised by
 * decision block per the Phase 5 Plan 03 contract:
 *
 * - D-17 raw-tree mirror (encodingCharacters + segments + isNull + verbatim subs).
 * - D-17 + Claude's-Discretion: `repetitions` is ALWAYS `[]` when empty (never omitted).
 * - D-19 warnings array always present.
 * - D-20 profile conditional — when present, exactly `{name, lineage}` keys.
 * - D-18 `JSON.stringify(msg)` auto-invokes `toJSON` and produces the same string.
 * - D-07 / D-30 purity + no caching (new reference each call; never throws;
 *   non-mutating; deterministic).
 * - D-21 `SerializedMessage` type annotation compiles (smoke: one annotated const).
 * - W5 top-level boundary freeze; inner arrays NOT deep-frozen (D-30 cost doctrine).
 */

import { describe, expect, it } from "vitest";

import { parseHL7, type SerializedMessage } from "../src/index.js";

// Fixtures — CR-terminated HL7 messages. MSH-1 = "|", MSH-2 = "^~\\&".
const CLEAN_FIXTURE =
  "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419101500||ADT^A01|MSG001|P|2.5\r" +
  "EVN|A01|20260419101500\r" +
  'PID|1||MRN001^^^HOSP^MR||Doe^John^A||19800101|M|||123 Main St^^Springfield^IL^62704\r' +
  "PV1|1|I|ICU^101^A||||ATT001^Smith^Jane\r";

// Fixture with explicit HL7 null (`""`) on PID-2.
const NULL_FIELD_FIXTURE =
  "MSH|^~\\&|A|B|C|D|20260419|||ADT^A01|M1|P|2.5\r" +
  'PID|1|""|MRN001\r';

// Fixture with an absent (empty) field: `||` around position PID-2.
const ABSENT_FIELD_FIXTURE =
  "MSH|^~\\&|A|B|C|D|20260419|||ADT^A01|M1|P|2.5\r" +
  "PID|1||MRN001\r";

// Fixture with embedded delimiters in subcomponent — raw tree holds DECODED
// strings per the shared Phase 2 invariant (Plan 02).
const ESCAPED_FIXTURE =
  "MSH|^~\\&|A|B|C|D|20260419|||ADT^A01|M1|P|2.5\r" +
  "PID|1||MRN001||Smith\\F\\Jones^John\r";

// MLLP-framed fixture — Phase 2 emits MLLP_FRAMING_STRIPPED warning by default.
const MLLP_FRAMED = `\u000BMSH|^~\\&|A|B|C|D|20260419|||ADT^A01|M1|P|2.5\rPID|1||MRN001\r\u001C\u000D`;

describe("emitJson — Block 1: raw-tree mirror shape (D-17)", () => {
  it("encodingCharacters mirrors msg.encodingCharacters", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    const snap = msg.toJSON();
    expect(snap.encodingCharacters.field).toBe(msg.encodingCharacters.field);
    expect(snap.encodingCharacters.component).toBe(msg.encodingCharacters.component);
    expect(snap.encodingCharacters.repetition).toBe(msg.encodingCharacters.repetition);
    expect(snap.encodingCharacters.escape).toBe(msg.encodingCharacters.escape);
    expect(snap.encodingCharacters.subcomponent).toBe(msg.encodingCharacters.subcomponent);
  });

  it("segments array mirrors rawSegments 1-for-1 (length + names)", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    const snap = msg.toJSON();
    expect(snap.segments).toHaveLength(msg.rawSegments.length);
    for (let i = 0; i < msg.rawSegments.length; i++) {
      expect(snap.segments[i]?.name).toBe(msg.rawSegments[i]?.name);
    }
  });

  it("field count per segment matches rawSegments", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    const snap = msg.toJSON();
    for (let i = 0; i < msg.rawSegments.length; i++) {
      expect(snap.segments[i]?.fields.length).toBe(msg.rawSegments[i]?.fields.length);
    }
  });

  it("repetitions/components/subcomponents mirror raw tree (deep equal on PID)", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    const snap = msg.toJSON();
    const pidIdx = msg.rawSegments.findIndex((s) => s.name === "PID");
    expect(pidIdx).toBeGreaterThanOrEqual(0);
    const rawPid = msg.rawSegments[pidIdx];
    const snapPid = snap.segments[pidIdx];
    expect(rawPid).toBeDefined();
    expect(snapPid).toBeDefined();
    // Deep structural comparison of the PID segment subtree.
    expect(snapPid).toEqual(rawPid);
  });

  it("isNull flag preserved on explicit null field", () => {
    const msg = parseHL7(NULL_FIELD_FIXTURE);
    const snap = msg.toJSON();
    const pidIdx = msg.rawSegments.findIndex((s) => s.name === "PID");
    const snapPid = snap.segments[pidIdx];
    expect(snapPid).toBeDefined();
    // PID-2 is the null field ("").
    expect(snapPid?.fields[2]?.isNull).toBe(true);
  });

  it("subcomponents verbatim (decoded — NOT re-escaped)", () => {
    // Plan 02 shared invariant: tokenize unescapes on parse. The raw tree
    // stores `Smith|Jones` (decoded), NOT `Smith\F\Jones`. emitJson mirrors
    // the decoded raw tree directly — no re-escape.
    const msg = parseHL7(ESCAPED_FIXTURE);
    const snap = msg.toJSON();
    const pidIdx = msg.rawSegments.findIndex((s) => s.name === "PID");
    const snapPid = snap.segments[pidIdx];
    expect(snapPid).toBeDefined();
    // PID-5.1 holds the decoded family-name subcomponent.
    const familyNameSub = snapPid?.fields[5]?.repetitions[0]?.components[0]?.subcomponents[0];
    expect(familyNameSub).toBe("Smith|Jones");
  });
});

describe("emitJson — Block 2: repetitions always present as [] (D-17 + discretion)", () => {
  it("empty-field repetitions === []", () => {
    const msg = parseHL7(ABSENT_FIELD_FIXTURE);
    const snap = msg.toJSON();
    const pidIdx = msg.rawSegments.findIndex((s) => s.name === "PID");
    const snapPid = snap.segments[pidIdx];
    expect(snapPid).toBeDefined();
    const pid2 = snapPid?.fields[2];
    expect(pid2).toBeDefined();
    expect(Array.isArray(pid2?.repetitions)).toBe(true);
    expect(pid2?.repetitions).toHaveLength(0);
    expect(pid2?.isNull).toBe(false);
  });

  it("null-field repetitions === []", () => {
    const msg = parseHL7(NULL_FIELD_FIXTURE);
    const snap = msg.toJSON();
    const pidIdx = msg.rawSegments.findIndex((s) => s.name === "PID");
    const snapPid = snap.segments[pidIdx];
    const pid2 = snapPid?.fields[2];
    expect(pid2).toBeDefined();
    expect(Array.isArray(pid2?.repetitions)).toBe(true);
    expect(pid2?.repetitions).toHaveLength(0);
    expect(pid2?.isNull).toBe(true);
  });
});

describe("emitJson — Block 3: warnings (D-19)", () => {
  it("warnings === [] on clean message", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    const snap = msg.toJSON();
    expect(Array.isArray(snap.warnings)).toBe(true);
    expect(snap.warnings).toHaveLength(0);
  });

  it("warnings pass-through on dirty (MLLP-framed) message", () => {
    const msg = parseHL7(MLLP_FRAMED);
    expect(msg.warnings.length).toBeGreaterThan(0);
    const snap = msg.toJSON();
    expect(snap.warnings.length).toBe(msg.warnings.length);
    for (let i = 0; i < msg.warnings.length; i++) {
      expect(snap.warnings[i]).toEqual(msg.warnings[i]);
    }
  });

  it("warnings is always an array (clean + dirty)", () => {
    expect(Array.isArray(parseHL7(CLEAN_FIXTURE).toJSON().warnings)).toBe(true);
    expect(Array.isArray(parseHL7(MLLP_FRAMED).toJSON().warnings)).toBe(true);
  });
});

describe("emitJson — Block 4: profile (D-20 structural two-keys contract)", () => {
  it("profile key absent when msg.profile is undefined", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    expect(msg.profile).toBeUndefined();
    const snap = msg.toJSON();
    expect("profile" in snap).toBe(false);
  });

  it("profile present with {name, lineage} when msg.profile is truthy", () => {
    const msg = parseHL7(CLEAN_FIXTURE, {
      profile: { name: "epic", lineage: ["epic"] },
    });
    const snap = msg.toJSON();
    expect(snap.profile).toBeDefined();
    expect(snap.profile?.name).toBe("epic");
    expect(snap.profile?.lineage).toEqual(["epic"]);
  });

  it("profile contains EXACTLY the keys `name` and `lineage` (D-20 structural contract)", () => {
    const msg = parseHL7(CLEAN_FIXTURE, {
      profile: { name: "epic", lineage: ["epic"] },
    });
    const snap = msg.toJSON();
    // The upstream Hl7Message.profile field is already stripped to {name, lineage}
    // by the parser constructor (src/parser/index.ts ~line 385). emitJson
    // forwards those two keys verbatim. Assert the output shape structurally.
    expect(Object.keys(snap.profile ?? {}).sort()).toEqual(["lineage", "name"]);
  });
});

describe("emitJson — Block 5: JSON.stringify integration (D-18)", () => {
  it("JSON.stringify(msg) equals JSON.stringify(msg.toJSON())", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    expect(JSON.stringify(msg)).toBe(JSON.stringify(msg.toJSON()));
  });

  it("JSON.stringify(msg) round-trips via JSON.parse to same top-level structure", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    const parsed = JSON.parse(JSON.stringify(msg)) as SerializedMessage;
    expect(parsed.segments[0]?.name).toBe("MSH");
    expect(parsed.segments.length).toBe(msg.rawSegments.length);
  });
});

describe("emitJson — Block 6: purity + non-mutation + no caching (D-07, D-30)", () => {
  it("never throws on any parseable input (3 diverse fixtures)", () => {
    expect(() => parseHL7(CLEAN_FIXTURE).toJSON()).not.toThrow();
    expect(() => parseHL7(NULL_FIELD_FIXTURE).toJSON()).not.toThrow();
    expect(() => parseHL7(MLLP_FRAMED).toJSON()).not.toThrow();
  });

  it("does not mutate msg", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    const before = JSON.stringify(msg.rawSegments);
    msg.toJSON();
    const after = JSON.stringify(msg.rawSegments);
    expect(after).toBe(before);
  });

  it("two back-to-back calls return deeply equal objects", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    expect(msg.toJSON()).toEqual(msg.toJSON());
  });

  it("two calls return NEW references (D-30 no caching)", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    expect(msg.toJSON()).not.toBe(msg.toJSON());
  });
});

describe("emitJson — Block 7: SerializedMessage typing (D-21)", () => {
  it("SerializedMessage annotation typechecks + carries expected field types", () => {
    // This test is compile-time verified by `pnpm tsc --noEmit`; the runtime
    // assertions below just anchor the variable so the type annotation
    // is not discarded as dead code.
    const msg = parseHL7(CLEAN_FIXTURE);
    const snap: SerializedMessage = msg.toJSON();
    expect(typeof snap.encodingCharacters.field).toBe("string");
    expect(Array.isArray(snap.segments)).toBe(true);
    expect(Array.isArray(snap.warnings)).toBe(true);
    // Optional `profile` — undefined (absent) on this clean fixture.
    expect(snap.profile).toBeUndefined();
  });
});

describe("emitJson — Block 8: W5 boundary freeze", () => {
  it("top-level SerializedMessage is frozen", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    const snap = msg.toJSON();
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("inner arrays are NOT deep-frozen (D-30 cost doctrine — boundary-freeze only)", () => {
    const msg = parseHL7(CLEAN_FIXTURE);
    const snap = msg.toJSON();
    // Codifies the intentional runtime-mutability of inner arrays: TS readonly
    // type contract + top-level freeze is sufficient; runtime deep-freeze
    // rejected per D-30 (emit is hot-path; no observable benefit).
    expect(Object.isFrozen(snap.segments)).toBe(false);
  });
});
