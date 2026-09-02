/**
 * The opt-in published-structure validator.
 *
 * Three properties carry the weight here, and each is tested from the outside,
 * through a parsed message, because that is how a consumer meets it:
 *
 *  1. A CONFORMANT MESSAGE IS SILENT. A checker that reports something on a
 *     message HL7's own publication permits is worse than no checker: it trains
 *     the reader to ignore it. So the conformant cases come first, and they
 *     include the ones a naive "segments must appear in the published order"
 *     rule gets wrong, namely a repeating group.
 *  2. WHAT IT CANNOT ANSWER, IT SAYS IT CANNOT ANSWER. An unmodelled message
 *     type, a retained transcription and a message with no readable type each
 *     come back not-validated with a reason and no findings. "The publication
 *     is silent" and "the message is fine" are different answers and are never
 *     collapsed into an empty findings list.
 *  3. NOTHING IT RETURNS CARRIES PHI, AND NOTHING IT DOES CHANGES THE MESSAGE.
 *     The PHI case plants distinctive values in every field a finding could
 *     reach and greps the whole result for them; the read-only case compares
 *     the serialization and the warning list either side of a validation.
 *
 * The messages below carry no patient content on purpose: this validator reads
 * segment names and nothing else, so a fixture that carried a name would be
 * inventing PHI to prove a point about segments. The one exception is the PHI
 * case itself, whose planted values are obvious non-clinical markers.
 */

import { describe, expect, it } from "vitest";

import {
  FATAL_CODES,
  Hl7ParseError,
  STRUCTURE_FINDING_CODES,
  STRUCTURE_NOT_VALIDATED_REASONS,
  WARNING_CODES,
  parseHL7,
  validateMessageStructure,
  type StructureFinding,
} from "../src/index.js";
import { validateSegmentSequence } from "../src/structure/validate.js";
import { findPublishedStructureSchema } from "../src/structure/schemas.js";
import { findingsForSchema } from "../src/structure/walk.js";

/** Every fixture shares one header; only MSH-9 changes. */
function message(messageType: string, ...segments: readonly string[]): string {
  return [`MSH|^~\\&|SEND|FAC|RECV|FAC|20250102||${messageType}|MSGID1|P|2.5.1`, ...segments].join(
    "\r",
  );
}

/** Parse and validate in one step: every case here starts from a parsed message. */
function validate(raw: string): ReturnType<typeof validateMessageStructure> {
  return validateMessageStructure(parseHL7(raw));
}

/** Codes only, for the cases that care about which checks fired. */
function codes(findings: readonly StructureFinding[]): readonly string[] {
  return findings.map((finding) => finding.code);
}

const CONFORMANT_A01 = message("ADT^A01", "EVN||20250102", "PID|||", "PV1||I");

describe("AC6: a conformant message validates clean and names the structure it used", () => {
  it("returns zero findings and the published variant for a conformant ADT^A01", () => {
    const result = validate(CONFORMANT_A01);
    expect(result.validated).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.structureId).toBe("ADT_A01-A");
    expect(result.structureIds).toEqual(["ADT_A01-A", "ADT_A01-B", "ADT_A01-C", "ADT_A01-D"]);
    expect(result.reason).toBe("");
  });

  it("accepts a repeating group rather than reading it as an ordering violation", () => {
    // A published ORU_R01 repeats ORDER_OBSERVATION, so OBR may follow an OBX
    // that followed an earlier OBR. A rule that only compared published
    // positions would report this conformant report.
    const result = validate(
      message("ORU^R01", "PID|||", "OBR|1|", "OBX|1|", "OBR|2|", "OBX|2|", "OBX|3|"),
    );
    expect(result.validated).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("accepts a message code the registry matches on the code alone", () => {
    const result = validate(message("ACK^A01", "MSA|AA|MSGID1"));
    expect(result.validated).toBe(true);
    expect(result.structureId).toBe("ACK");
    expect(result.findings).toEqual([]);
  });
});

describe("AC7: a segment out of the published order is reported, with its occurrence", () => {
  it("names the segment the published order cannot place", () => {
    const result = validate(message("ADT^A01", "EVN||20250102", "PV1||I", "PID|||"));
    expect(result.validated).toBe(true);
    const ordering = result.findings.filter(
      (finding) => finding.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER,
    );
    expect(ordering).toHaveLength(1);
    expect(ordering[0]?.locus).toEqual({
      segment: "PID",
      occurrence: 0,
      structureId: "ADT_A01-A",
    });
    expect(ordering[0]?.severity).toBe("error");
  });

  it("names the second occurrence when it is the one that cannot be placed", () => {
    const result = validate(message("ADT^A02", "EVN||20250102", "PID|||", "PV1||I", "PID|||"));
    const ordering = result.findings.filter(
      (finding) => finding.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER,
    );
    expect(ordering).toHaveLength(1);
    expect(ordering[0]?.locus.segment).toBe("PID");
    expect(ordering[0]?.locus.occurrence).toBe(1);
  });
});

describe("AC8: too few occurrences of a required segment are reported", () => {
  it("names the segment, the published minimum and the observed count", () => {
    const result = validate(message("ADT^A02", "PID|||", "PV1||I"));
    const cardinality = result.findings.filter(
      (finding) => finding.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY,
    );
    expect(cardinality).toHaveLength(1);
    expect(cardinality[0]?.locus).toEqual({ segment: "EVN", structureId: "ADT_A02" });
    expect(cardinality[0]?.message).toContain("occurs 0 times");
    expect(cardinality[0]?.message).toContain("minimum of 1");
  });

  it("leaves a segment required only inside an optional group alone", () => {
    // NK1 carries a published minimum of one inside a group with a minimum of
    // zero, so a message with no next of kin is conformant, not deficient.
    const result = validate(CONFORMANT_A01);
    expect(codes(result.findings)).not.toContain(
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY,
    );
  });
});

describe("AC9: too many occurrences of a bounded segment are reported", () => {
  it("names the segment, the published maximum and the observed count", () => {
    const result = validate(
      message("ADT^A02", "EVN||20250102", "EVN||20250103", "PID|||", "PV1||I"),
    );
    const cardinality = result.findings.filter(
      (finding) => finding.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY,
    );
    expect(cardinality).toHaveLength(1);
    expect(cardinality[0]?.locus).toEqual({
      segment: "EVN",
      occurrence: 1,
      structureId: "ADT_A02",
    });
    expect(cardinality[0]?.message).toContain("occurs 2 times");
    expect(cardinality[0]?.message).toContain("maximum of 1");
  });

  it("never reports an upper bound for a segment the publication lets repeat", () => {
    const result = validate(
      message("ADT^A02", "EVN||20250102", "PID|||", "ROL|1|", "ROL|2|", "ROL|3|", "PV1||I"),
    );
    expect(result.findings).toEqual([]);
  });
});

describe("AC10: a segment the published structure does not name is reported under its own code", () => {
  it("reports a Z segment, once per occurrence, under a distinct code", () => {
    const result = validate(
      message("ADT^A02", "EVN||20250102", "PID|||", "PV1||I", "ZPI|1|", "ZPI|2|"),
    );
    expect(codes(result.findings)).toEqual([
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_UNEXPECTED,
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_UNEXPECTED,
    ]);
    expect(result.findings.map((finding) => finding.locus.occurrence)).toEqual([0, 1]);
    expect(STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_UNEXPECTED).not.toBe(
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER,
    );
    expect(STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_UNEXPECTED).not.toBe(
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY,
    );
  });

  it("reports a standard segment the structure does not name, not only a Z segment", () => {
    // RGS belongs to the scheduling structures; an ADT^A02 never names it.
    const result = validate(message("ADT^A02", "EVN||20250102", "PID|||", "PV1||I", "RGS|1|"));
    expect(codes(result.findings)).toEqual([STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_UNEXPECTED]);
  });

  it("does not let an unexpected segment also stop the ordering walk", () => {
    const result = validate(message("ADT^A02", "EVN||20250102", "ZPI|1|", "PID|||", "PV1||I"));
    expect(codes(result.findings)).toEqual([STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_UNEXPECTED]);
  });
});

describe("AC11: a variant family is violated only when every variant is", () => {
  it("stays silent when one variant accepts the message and others do not", () => {
    // ORU_R01-C and ORU_R01-D give the order-observation NTE a minimum of one;
    // -A and -B give it zero. A report with no NTE conforms to the family.
    const raw = message("ORU^R01", "PID|||", "OBR|1|");
    const perVariant = ["ORU_R01-A", "ORU_R01-B", "ORU_R01-C", "ORU_R01-D"].map((structureId) => {
      const schema = findPublishedStructureSchema(structureId);
      return schema === undefined
        ? -1
        : findingsForSchema(schema, [
            { name: "MSH", occurrence: 0 },
            { name: "PID", occurrence: 0 },
            { name: "OBR", occurrence: 0 },
          ]).length;
    });
    expect(perVariant).toEqual([0, 0, 1, 1]);

    const result = validate(raw);
    expect(result.validated).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.structureId).toBe("ORU_R01-A");
  });

  it("returns exactly one named variant's findings when every variant is violated", () => {
    const result = validate(message("ADT^A01", "EVN||20250102", "PV1||I", "PID|||"));
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.structureId).toBe("ADT_A01-A");
    for (const finding of result.findings) {
      expect(finding.locus.structureId).toBe(result.structureId);
    }
    expect(result.structureIds).toContain("ADT_A01-D");
  });

  it("takes the variant with the fewest findings when every variant is violated", () => {
    // Synthetic variants over the real four-member ADT_A01 family: the second
    // one alone accepts DG1, so it is the closest reading of the message and
    // the one whose findings come back, ahead of the first in family order.
    const strict = {
      name: "PID",
      kind: "segment",
      position: 1,
      min: 1,
      max: 1,
      parent: -1,
    } as const;
    const result = validateSegmentSequence("ADT", "A01", ["PID", "DG1", "DG1"], (structureId) =>
      structureId === "ADT_A01-B"
        ? {
            structureId,
            nodes: [
              strict,
              { name: "DG1", kind: "segment", position: 2, min: 0, max: "*", parent: -1 },
            ],
          }
        : { structureId, nodes: [strict] },
    );
    expect(result.validated).toBe(true);
    expect(result.structureId).toBe("ADT_A01-B");
    expect(result.findings).toEqual([]);

    // And with nothing clean anywhere, the fewest findings still decide.
    const violated = validateSegmentSequence("ADT", "A01", ["PID", "DG1", "DG1", "ZPI"], (id) =>
      id === "ADT_A01-B"
        ? {
            structureId: id,
            nodes: [
              strict,
              { name: "DG1", kind: "segment", position: 2, min: 0, max: "*", parent: -1 },
            ],
          }
        : { structureId: id, nodes: [strict] },
    );
    expect(violated.structureId).toBe("ADT_A01-B");
    expect(codes(violated.findings)).toEqual([
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_UNEXPECTED,
    ]);
  });
});

describe("AC12: two validations of one message agree, down to the variant", () => {
  it("returns identical findings, in identical order, and the same variant", () => {
    const raw = message("ADT^A01", "EVN||20250102", "PV1||I", "PID|||", "ZPI|1|");
    const first = validate(raw);
    const second = validate(raw);
    expect(second).toEqual(first);
    expect(second.structureId).toBe(first.structureId);
    expect(codes(second.findings)).toEqual(codes(first.findings));

    // The same message object twice, not merely the same bytes twice.
    const parsed = parseHL7(raw);
    expect(validateMessageStructure(parsed)).toEqual(validateMessageStructure(parsed));
  });
});

describe("AC13: every finding carries a registered code, a severity and a structural locus", () => {
  it("draws every code from the published registry and every locus from three keys", () => {
    const registry = new Set<string>(Object.values(STRUCTURE_FINDING_CODES));
    const result = validate(message("ADT^A02", "PV1||I", "PID|||", "PID|||", "ZPI|1|"));
    expect(result.findings.length).toBeGreaterThan(2);
    for (const finding of result.findings) {
      expect(registry.has(finding.code)).toBe(true);
      expect(["error", "warning", "info"]).toContain(finding.severity);
      expect(Object.keys(finding.locus).sort()).not.toContain("field");
      for (const key of Object.keys(finding.locus)) {
        expect(["segment", "occurrence", "structureId"]).toContain(key);
      }
      expect(finding.locus.segment).toMatch(/^[A-Z][A-Z0-9]{2}$/);
      expect(finding.locus.structureId).toBe("ADT_A02");
      expect(finding.message.length).toBeGreaterThan(0);
    }
  });

  it("freezes what it hands back", () => {
    const result = validate(message("ADT^A02", "PID|||", "PV1||I"));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.findings)).toBe(true);
    expect(Object.isFrozen(result.findings[0])).toBe(true);
    expect(Object.isFrozen(result.findings[0]?.locus)).toBe(true);
  });
});

describe("AC14: no finding message carries a value read out of the message", () => {
  it("keeps every planted field value out of the whole result", () => {
    const planted = [
      "ZZPLANTEDFAMILY",
      "ZZPLANTEDGIVEN",
      "ZZPLANTEDID",
      "ZZPLANTEDPLACE",
      "ZZPLANTEDEVENT",
    ];
    const raw = [
      `MSH|^~\\&|${planted[3] ?? ""}|FAC|RECV|FAC|20250102||ADT^A02|MSGID1|P|2.5.1`,
      `EVN|${planted[4] ?? ""}|20250102`,
      `PV1||I|${planted[3] ?? ""}`,
      `PID|||${planted[2] ?? ""}||${planted[0] ?? ""}^${planted[1] ?? ""}`,
      `ZPI|${planted[2] ?? ""}`,
    ].join("\r");

    const result = validate(raw);
    expect(result.findings.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(result);
    for (const value of planted) expect(serialized).not.toContain(value);
  });

  it("withholds a forged segment name rather than echoing it", () => {
    // The model bounds a segment id to its published shape before anything can
    // read it, so narrative arriving where a segment name belongs is withheld.
    const raw = message("ADT^A02", "EVN||20250102", "PID|||", "PV1||I", "NARRATIVELINE|x");
    const result = validate(raw);
    const unexpected = result.findings.filter(
      (finding) => finding.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_UNEXPECTED,
    );
    expect(unexpected).toHaveLength(1);
    expect(unexpected[0]?.locus.segment).toBe("<withheld>");
    expect(unexpected[0]?.message).not.toContain("NARRATIVELINE");
  });
});

describe("AC15: an unmodelled message type is reported as not validated", () => {
  it("selects no structure and returns no findings", () => {
    const result = validate(message("QRY^A19", "QRD|20250102"));
    expect(result.validated).toBe(false);
    expect(result.reason).toBe(STRUCTURE_NOT_VALIDATED_REASONS.UNRECOGNIZED_MESSAGE_TYPE);
    expect(result.structureId).toBe("");
    expect(result.structureIds).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.reasonMessage.length).toBeGreaterThan(0);
  });

  it("reports a modelled code with an unmodelled trigger event the same way", () => {
    const result = validate(message("ADT^A18", "EVN||20250102", "PID|||"));
    expect(result.validated).toBe(false);
    expect(result.reason).toBe(STRUCTURE_NOT_VALIDATED_REASONS.UNRECOGNIZED_MESSAGE_TYPE);
  });
});

describe("AC16: a retained transcription and an empty expectation are reported, with the reason", () => {
  it("reports a retained transcription without calling its segments unexpected", () => {
    const result = validate(message("ORM^O01", "ORC|NW|", "OBR|1|", "ZPI|1|"));
    expect(result.validated).toBe(false);
    expect(result.reason).toBe(STRUCTURE_NOT_VALIDATED_REASONS.RETAINED_TRANSCRIPTION);
    expect(result.reasonMessage).toContain("retained transcription");
    expect(result.findings).toEqual([]);
    expect(result.structureId).toBe("");
  });

  it("reports an entry whose ordered expectation is empty rather than rejecting the message", () => {
    const empty = validateSegmentSequence("ADT", "A02", ["MSH", "PID", "ZPI"], () => ({
      structureId: "ADT_A02",
      nodes: [],
    }));
    expect(empty.validated).toBe(false);
    expect(empty.reason).toBe(STRUCTURE_NOT_VALIDATED_REASONS.EMPTY_EXPECTATION);
    expect(empty.findings).toEqual([]);

    const missing = validateSegmentSequence("ADT", "A02", ["MSH", "PID"], () => undefined);
    expect(missing.reason).toBe(STRUCTURE_NOT_VALIDATED_REASONS.EMPTY_EXPECTATION);
    expect(missing.findings).toEqual([]);
  });
});

describe("AC17: a message with no readable type comes back not validated, never thrown", () => {
  it("reports an absent message type", () => {
    const raw = "MSH|^~\\&|SEND|FAC|RECV|FAC|20250102|||MSGID1|P|2.5.1\rPID|||";
    const result = validate(raw);
    expect(result.validated).toBe(false);
    expect(result.reason).toBe(STRUCTURE_NOT_VALIDATED_REASONS.NO_MESSAGE_TYPE);
    expect(result.findings).toEqual([]);
  });

  it("reports a blank message type", () => {
    expect(validateSegmentSequence("   ", "", ["MSH"]).reason).toBe(
      STRUCTURE_NOT_VALIDATED_REASONS.NO_MESSAGE_TYPE,
    );
    expect(validateSegmentSequence("", "A01", ["MSH"]).reason).toBe(
      STRUCTURE_NOT_VALIDATED_REASONS.NO_MESSAGE_TYPE,
    );
  });

  it("validates a message carrying no segment beyond its header", () => {
    const result = validate(message("ADT^A02"));
    expect(result.validated).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(codes(result.findings)).toContain(STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY);
  });
});

describe("AC18: raw input the parser rejects fails exactly as it always did", () => {
  it("surfaces the existing fatal error, and produces no structural finding", () => {
    const raw = "EVN||20250102\rPID|||";
    let thrown: unknown;
    try {
      validate(raw);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Hl7ParseError);
    expect(thrown instanceof Hl7ParseError ? thrown.code : "").toBe(FATAL_CODES.NO_MSH_SEGMENT);

    // The same fatal error, from the parse alone: validation adds nothing to it.
    expect(() => parseHL7(raw)).toThrow(Hl7ParseError);
    expect(() => validate("")).toThrow(Hl7ParseError);
  });
});

describe("AC19: a leniently parsed message validates, and a tolerated deviation is not a finding", () => {
  it("returns a result for a message the parser warned about", () => {
    // A lowercase segment id and a trailing-whitespace field are both tolerated
    // deviations the parser records as Tier-2 warnings.
    const raw = message("ADT^A02", "evn||20250102  ", "PID|||", "PV1||I");
    const parsed = parseHL7(raw);
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.warnings.map((warning) => warning.code)).toContain(WARNING_CODES.SEGMENT_CASE);

    const result = validateMessageStructure(parsed);
    expect(result.validated).toBe(true);
    expect(result.findings).toEqual([]);
  });
});

describe("AC21: validating a message leaves the message exactly as it was", () => {
  it("changes neither the serialization nor the warning list", () => {
    const parsed = parseHL7(message("ADT^A02", "evn||20250102", "PV1||I", "PID|||", "ZPI|1|"));
    const before = parsed.toString();
    const warningsBefore = parsed.warnings.map((warning) => warning.code);
    const structureBefore = parsed.structure;

    const result = validateMessageStructure(parsed);
    expect(result.findings.length).toBeGreaterThan(0);

    expect(parsed.toString()).toBe(before);
    expect(parsed.warnings.map((warning) => warning.code)).toEqual(warningsBefore);
    expect(parsed.structure).toEqual(structureBefore);
    expect(parsed.warnings.some((warning) => warning.code.startsWith("STRUCTURE_SEGMENT"))).toBe(
      false,
    );
  });
});
