/**
 * Segments that later HL7 v2 versions introduced are recognized, not reported
 * as `UNKNOWN_SEGMENT`.
 *
 * The registry once stopped at v2.5.1, so a valid v2.7 ADT carrying a `PRT`
 * (participation, introduced in v2.7) or a v2.8 message carrying an `ARV`
 * (access restrictions, introduced in v2.6) drew a warning saying the segment
 * was not in the HL7 standard. It is, and a warning that is wrong teaches an
 * integrator to ignore the warning that is right.
 *
 * Every message here is synthetic.
 */

import { describe, expect, it } from "vitest";

import { KNOWN_SEGMENTS, WARNING_CODES, parseHL7 } from "../src/index.js";

function unknownSegmentWarnings(raw: string): number {
  return parseHL7(raw).warnings.filter((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT).length;
}

const ADT_V27_WITH_PRT = [
  "MSH|^~\\&|ADMIT|SENDFAC|EHR|RECVFAC|20260101120000||ADT^A01^ADT_A01|LATERSEG27|P|2.7",
  "EVN||20260101120000",
  "PID|1||MRN12345^^^HOSP^MR||DOE^JANE||19800101|F",
  "PV1|1|I|WARD^101^A",
  "PRT||UC||AT^Attending Provider^HL70912|1234^PROVIDER^TEST",
].join("\r");

const ADT_V28_WITH_ARV = [
  "MSH|^~\\&|ADMIT|SENDFAC|EHR|RECVFAC|20260101120000||ADT^A04^ADT_A01|LATERSEG28|P|2.8",
  "EVN||20260101120000",
  "PID|1||MRN12345^^^HOSP^MR||DOE^JANE||19800101|F",
  "ARV|1|A|PRI^Privacy^HL70717",
  "PV1|1|O",
].join("\r");

const ADT_V29_WITH_OH1 = [
  "MSH|^~\\&|ADMIT|SENDFAC|EHR|RECVFAC|20260101120000||ADT^A04^ADT_A01|LATERSEG29|P|2.9",
  "EVN||20260101120000",
  "PID|1||MRN12345^^^HOSP^MR||DOE^JANE||19800101|F",
  "PV1|1|O",
  "OH1|1|A|EMP^Employed^HL70066",
].join("\r");

describe("segments introduced after v2.5.1 parse without UNKNOWN_SEGMENT", () => {
  it("a v2.7 ADT carrying PRT raises no UNKNOWN_SEGMENT", () => {
    expect(unknownSegmentWarnings(ADT_V27_WITH_PRT)).toBe(0);
    expect(parseHL7(ADT_V27_WITH_PRT).segments("PRT")).toHaveLength(1);
  });

  it("a v2.8 message carrying ARV raises no UNKNOWN_SEGMENT", () => {
    expect(unknownSegmentWarnings(ADT_V28_WITH_ARV)).toBe(0);
    expect(parseHL7(ADT_V28_WITH_ARV).segments("ARV")).toHaveLength(1);
  });

  it("a v2.9 message carrying OH1 raises no UNKNOWN_SEGMENT", () => {
    expect(unknownSegmentWarnings(ADT_V29_WITH_OH1)).toBe(0);
  });

  it.each([
    "PRT",
    "ARV",
    "OH1",
    "OH2",
    "OH3",
    "OH4",
    "NPU",
    "PCR",
    "PTH",
    "VAR",
    "BLG",
    "RCP",
    "UAC",
    "INV",
    "SAC",
    "PSH",
    "AFF",
    "RF1",
    "URD",
    "ECD",
    "EQP",
  ])("%s is a known segment", (name) => {
    expect(KNOWN_SEGMENTS.has(name)).toBe(true);
  });

  it("v2.9 components past the modeled CX and XPN are read by position", () => {
    const raw = [
      "MSH|^~\\&|ADMIT|SENDFAC|EHR|RECVFAC|20260101120000||ADT^A04^ADT_A01|LATERSEG29B|P|2.9",
      "PID|1||MRN12345^^^HOSP^MR^^^^^^CHK1^ISO||DOE^JANE^^^^^L^^^^^^^^JJ||19800101|F",
    ].join("\r");
    const msg = parseHL7(raw);
    expect(msg.get("PID.3.11")).toBe("CHK1");
    expect(msg.get("PID.3.12")).toBe("ISO");
    expect(msg.get("PID.5.15")).toBe("JJ");
    expect(msg.segments("PID")[0]?.field(3)?.asCx().idNumber).toBe("MRN12345");
  });

  it("the positive control still fires: a segment no version defines is reported", () => {
    const raw = ADT_V27_WITH_PRT.replace("PRT|", "QQQ|");
    expect(unknownSegmentWarnings(raw)).toBe(1);
  });
});
