/**
 * Segment-name case tolerance: `pid` / `Pid` / `obx` resolve as the segments
 * they name, and the deviation is reported as `SEGMENT_CASE`.
 *
 * Why this file exists rather than a line in the warnings suite: the defect it
 * pins was not a missing warning, it was **silent clinical data loss**. A
 * sender shipping `obx` produced an `observations()` of `[]`, so a haemoglobin
 * of 7.1 g/dL flagged `L` disappeared from a result feed with nothing but an
 * `UNKNOWN_SEGMENT` warning that said `OBX` was not in the HL7 standard. It
 * is, and the message sent the integrator looking for the wrong cause. The
 * assertions below are therefore about the recovered VALUE, not only the code.
 *
 * Every message here is synthetic.
 */

import { describe, expect, it } from "vitest";

import { WARNING_CODES, defineProfile, parseHL7 } from "../src/index.js";
import { canonicalSegmentName } from "../src/parser/known-segments.js";

const MSH = "MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|SEGCASE1|P|2.5";

/** An ORU carrying one flagged-low haemoglobin, with caller-chosen spellings. */
function oru(pidName: string, obrName: string, obxName: string): string {
  return [
    MSH,
    `${pidName}|1||MRN12345^^^HOSP^MR||DOE^JANE||19800101|F`,
    `${obrName}|1||ACC1|CBC^Complete Blood Count^L`,
    `${obxName}|1|NM|718-7^Hemoglobin^LN||7.1|g/dL|13.0-17.0|L|||F`,
  ].join("\r");
}

function codes(raw: string): readonly string[] {
  return parseHL7(raw).warnings.map((w) => w.code);
}

describe("canonicalSegmentName: ASCII-only folding", () => {
  it("folds ASCII lowercase and leaves an already-canonical name untouched", () => {
    expect(canonicalSegmentName("pid")).toBe("PID");
    expect(canonicalSegmentName("Obx")).toBe("OBX");
    expect(canonicalSegmentName("PID")).toBe("PID");
    expect(canonicalSegmentName("")).toBe("");
    expect(canonicalSegmentName("Z01")).toBe("Z01");
  });

  it("NEVER folds a non-ASCII lookalike into an HL7 segment identifier", () => {
    // `"pıd".toUpperCase()` is "PID" under Unicode default casing, so a bare
    // `.toUpperCase()` here would let a dotless Turkish i forge a PID and the
    // demographics of a segment the sender never sent would read as real.
    expect("pıd".toUpperCase()).toBe("PID"); // the trap, pinned
    expect(canonicalSegmentName("pıd")).not.toBe("PID");
    expect(canonicalSegmentName("ı")).toBe("ı"); // dotless i
    expect(canonicalSegmentName("K")).toBe("K"); // Kelvin sign
  });

  it("a dotless-i lookalike resolves as no segment at all, and says so", () => {
    const msg = parseHL7(`${MSH}\rpıd|1||MRN999^^^HOSP^MR||DOE^JANE`);
    expect(msg.segments("PID")).toHaveLength(0);
    expect(msg.patient).toBeUndefined();
    expect(msg.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });
});

describe("SEGMENT_CASE: the positive control", () => {
  // Half one: the detector fires on the deviation it claims to detect. A
  // detector that reports zero can be a gap rather than a clearance.
  it("FIRES on a lowercase segment name", () => {
    expect(codes(oru("pid", "OBR", "OBX"))).toContain(WARNING_CODES.SEGMENT_CASE);
    expect(codes(oru("PID", "OBR", "obx"))).toContain(WARNING_CODES.SEGMENT_CASE);
  });

  it("FIRES on a mixed-case segment name", () => {
    expect(codes(oru("Pid", "OBR", "OBX"))).toContain(WARNING_CODES.SEGMENT_CASE);
  });

  it("fires once per miscased segment, positioned on that segment", () => {
    const msg = parseHL7(oru("pid", "OBR", "obx"));
    const cased = msg.warnings.filter((w) => w.code === WARNING_CODES.SEGMENT_CASE);
    expect(cased.map((w) => w.position.segmentIndex)).toEqual([1, 3]);
  });

  // Half two: an already-conforming message gains NO spurious warning.
  it("does NOT fire on an all-uppercase message", () => {
    const msg = parseHL7(oru("PID", "OBR", "OBX"));
    expect(msg.warnings).toEqual([]);
  });

  it("does NOT fire on a digit-bearing or Z segment that is already uppercase", () => {
    const profile = defineProfile({ name: "zc", customSegments: { ZPI: { fields: { a: 1 } } } });
    const msg = parseHL7(`${MSH}\rPID|1||M\rOBR|1||A|C^C^L\rOBX|1|NM|X^Y^LN||1|u||N|||F\rZPI|v`, {
      profile,
    });
    expect(msg.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.SEGMENT_CASE);
  });
});

describe("case-folded lookup recovers the data that used to vanish", () => {
  it("a lowercase obx no longer drops a flagged-low haemoglobin", () => {
    const msg = parseHL7(oru("PID", "OBR", "obx"));
    const obs = msg.observations();
    expect(obs).toHaveLength(1);
    expect(obs[0]?.value).toBe(7.1);
    expect(obs[0]?.units?.identifier).toBe("g/dL");
    expect(obs[0]?.abnormalFlags).toBe("L");
    expect(obs[0]?.referenceRange).toBe("13.0-17.0");
  });

  it("a lowercase or mixed-case pid still yields the patient and the MRN", () => {
    for (const spelling of ["pid", "Pid", "pID"]) {
      const msg = parseHL7(oru(spelling, "OBR", "OBX"));
      expect(msg.patient?.mrn).toBe("MRN12345");
      expect(msg.segments("PID")).toHaveLength(1);
    }
  });

  it("resolves through segments() and getAll()", () => {
    const msg = parseHL7(oru("PID", "OBR", "obx"));
    expect(msg.segments("OBX")).toHaveLength(1);
    expect(msg.getAll("OBX")).toHaveLength(1);
  });

  it("the dot-path resolver agrees with the typed accessors", () => {
    const msg = parseHL7(oru("pid", "OBR", "obx"));
    expect(msg.get("PID.5.1")).toBe("DOE");
    expect(msg.get("OBX.5")).toBe("7.1");
  });

  it("the structure safety net counts a miscased anchor as present", () => {
    const msg = parseHL7(oru("PID", "obr", "obx"));
    expect(msg.structure.missingGroups).toEqual([]);
    expect(msg.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.MISSING_EXPECTED_GROUP);
  });

  it("a profile claims a miscased custom Z-segment and its field names resolve", () => {
    const profile = defineProfile({ name: "zt", customSegments: { ZPI: { fields: { foo: 1 } } } });
    const msg = parseHL7(`${MSH}\rzpi|BAR`, { profile });
    expect(msg.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.UNKNOWN_SEGMENT);
    expect(msg.segments("ZPI")[0]?.get("foo")?.value).toBe("BAR");
  });
});

describe("the original spelling survives the fold", () => {
  it("RawSegment.name keeps what arrived, while Segment.type is canonical", () => {
    const msg = parseHL7(oru("pid", "OBR", "obx"));
    expect(msg.rawSegments.map((s) => s.name)).toEqual(["MSH", "pid", "OBR", "obx"]);
    expect(msg.allSegments().map((s) => s.type)).toEqual(["MSH", "PID", "OBR", "OBX"]);
    expect(msg.allSegments()[1]?.raw.name).toBe("pid");
  });

  it("serialization re-emits the wire spelling, so the round-trip is byte-exact", () => {
    const raw = oru("pid", "OBR", "obx");
    const msg = parseHL7(raw);
    expect(msg.toString()).toContain("\rpid|");
    expect(msg.toString()).toContain("\robx|");
    expect(parseHL7(msg.toString()).rawSegments).toEqual(msg.rawSegments);
  });

  it("a write through a canonical path leaves the wire spelling alone", () => {
    const msg = parseHL7(oru("pid", "OBR", "OBX"));
    msg.setField("PID.5.1", "SMITH");
    expect(msg.get("PID.5.1")).toBe("SMITH");
    expect(msg.rawSegments[1]?.name).toBe("pid");
  });

  it("removeSegment removes the miscased segment segments() reported present", () => {
    const msg = parseHL7(oru("PID", "OBR", "obx"));
    expect(msg.segments("OBX")).toHaveLength(1);
    msg.removeSegment("OBX");
    expect(msg.segments("OBX")).toHaveLength(0);
    expect(msg.rawSegments.map((s) => s.name)).toEqual(["MSH", "PID", "OBR"]);
  });
});

describe("strict mode keeps throwing, and accepts nothing new", () => {
  it("throws on a miscased segment (it threw before this fix too)", () => {
    expect(() => parseHL7(oru("pid", "OBR", "OBX"), { strict: true })).toThrow();
    expect(() => parseHL7(oru("PID", "OBR", "obx"), { strict: true })).toThrow();
  });

  it("still throws UNKNOWN_SEGMENT for a genuinely unrecognized segment", () => {
    // Emission order is load-bearing: UNKNOWN_SEGMENT precedes SEGMENT_CASE so
    // an unknown segment reports the same code under strict as it always did.
    expect(() => parseHL7(`${MSH}\rZZZ|1`, { strict: true })).toThrow(/Unknown segment "ZZZ"/u);
    expect(() => parseHL7(`${MSH}\rzzz|1`, { strict: true })).toThrow(/Unknown segment "zzz"/u);
  });

  it("a lowercase msh is still the NO_MSH_SEGMENT fatal, in lenient mode too", () => {
    // Deliberately NOT widened: MSH detection gates delimiter discovery, so
    // folding it would change what the parser accepts as a message at all.
    expect(() => parseHL7("msh|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rPID|||1")).toThrow(
      /must begin with an MSH segment/u,
    );
  });

  it("an all-uppercase message still parses clean under strict", () => {
    expect(() => parseHL7(oru("PID", "OBR", "OBX"), { strict: true })).not.toThrow();
  });
});

describe("a forged segment name cannot amplify work or claim it resolved", () => {
  /**
   * A segment name is whatever precedes the first field separator, so an
   * unescaped line break inside a narrative field, which HL7 requires to be
   * sent as `\.br\` and which real senders send raw anyway, hands the parser
   * a whole clinical report as a "segment name". Folding one character at a
   * time is O(len) work a sender sizes, on a path that runs per segment per
   * lookup.
   */
  const forged = "a narrative line a sender never escaped, repeated ".repeat(2000);

  it("folds nothing that is not exactly three characters", () => {
    expect(canonicalSegmentName(forged)).toBe(forged);
    expect(canonicalSegmentName("ab")).toBe("ab");
    expect(canonicalSegmentName("zpix")).toBe("zpix");
  });

  it("a huge forged name does not slow a repeated lookup to a crawl", () => {
    const msg = parseHL7(`${MSH}\rPID|1||MRN1^^^H^MR\r${forged}\rOBX|1|ST|X||v`);
    const started = performance.now();
    for (let i = 0; i < 2000; i++) msg.get("OBX.5");
    const elapsed = performance.now() - started;
    // Base cost is sub-millisecond; the unbounded fold measured ~1.5 ms per
    // comparison on a 100 KB name, i.e. seconds for this loop. A generous
    // ceiling still separates the two by orders of magnitude.
    expect(elapsed).toBeLessThan(1000);
  });

  it("does NOT report SEGMENT_CASE for a name that resolved to nothing", () => {
    const msg = parseHL7(`${MSH}\rPID|1||M\r${forged}`);
    const codes2 = msg.warnings.map((w) => w.code);
    expect(codes2).toContain(WARNING_CODES.UNKNOWN_SEGMENT);
    expect(codes2).not.toContain(WARNING_CODES.SEGMENT_CASE);
  });

  it("SEGMENT_CASE and UNKNOWN_SEGMENT never both fire for one segment", () => {
    for (const name of ["zzz", "ZZZ", "pid", "PID", "q9", forged]) {
      const msg = parseHL7(`${MSH}\r${name}|1`);
      const perSegment = msg.warnings.filter(
        (w) =>
          w.position.segmentIndex === 1 &&
          (w.code === WARNING_CODES.SEGMENT_CASE || w.code === WARNING_CODES.UNKNOWN_SEGMENT),
      );
      expect(perSegment.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("a hand-rolled Profile literal keeps its lowercase claim", () => {
  // `parseHL7` accepts a bare Profile object with no runtime key validation,
  // and `defineProfile` rejects a lowercase key, so a literal was the only way
  // to claim a lowercase Z-feed. Folding the lookup must not unclaim it.
  const literal = {
    name: "vendor",
    customSegments: { zpi: { fields: { encounterId: 1 } } },
  } as const;

  it("suppresses UNKNOWN_SEGMENT and still resolves the declared field name", () => {
    const msg = parseHL7(`${MSH}\rzpi|ENC42`, { profile: literal });
    expect(msg.warnings.map((w) => w.code)).not.toContain(WARNING_CODES.UNKNOWN_SEGMENT);
    expect(msg.segments("ZPI")[0]?.get("encounterId")?.value).toBe("ENC42");
  });
});

describe("the fold applies to the wire, not to the caller's query", () => {
  // The tolerance this parser owes is to the sender, who picks the wire
  // spelling. A query is the caller's own source text, so every accessor keeps
  // asking for a segment the same canonical way it always has: uniform, and
  // unchanged from before this fix.
  it("a lowercase QUERY is still a miss, consistently across accessors", () => {
    const msg = parseHL7(oru("PID", "OBR", "obx"));
    expect(msg.segments("obx")).toHaveLength(0);
    expect(() => msg.get("obx.5")).toThrow(TypeError);
    expect(() => msg.setField("obx.5", "x")).toThrow(TypeError);
    expect(() => msg.removeSegment("obx")).toThrow(TypeError);
  });

  it("but the canonical query reaches the miscased segment on the wire", () => {
    const msg = parseHL7(oru("pid", "OBR", "obx"));
    expect(msg.segments("OBX")).toHaveLength(1);
    expect(msg.get("OBX.5")).toBe("7.1");
    msg.setField("PID.5.1", "SMITH");
    expect(msg.get("PID.5.1")).toBe("SMITH");
    expect(msg.rawSegments[1]?.name).toBe("pid");
  });
});

describe("UNKNOWN_SEGMENT no longer misdirects", () => {
  it("does not fire for a miscased segment that IS in the HL7 standard", () => {
    expect(codes(oru("pid", "OBR", "obx"))).not.toContain(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("still fires for a name no case-folding can recognize, and says case was tried", () => {
    const msg = parseHL7(`${MSH}\rzzz|1`);
    const unknown = msg.warnings.find((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT);
    expect(unknown?.message).toMatch(/ignoring case/u);
    expect(unknown?.message).not.toMatch(/not in HL7 spec/u);
  });
});
