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

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
import { GENERATED_STRUCTURE_SCHEMAS } from "../src/parser/generated/message-structure-schemas.js";
import type {
  PublishedStructureSchema,
  StructureExpectationNode,
} from "../src/parser/structure-types.js";
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

/** Pair each segment name with its 0-indexed occurrence, as the validator does. */
function withOccurrences(names: readonly string[]): { name: string; occurrence: number }[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const occurrence = seen.get(name) ?? 0;
    seen.set(name, occurrence + 1);
    return { name, occurrence };
  });
}

/**
 * One segment sequence a published structure permits, expanded from its
 * committed nodes alone: every node repeated its published minimum times, or
 * `atLeast` times where that is more and its published maximum allows it.
 */
function conformantSequence(
  nodes: readonly StructureExpectationNode[],
  atLeast: number,
): readonly string[] {
  const children = new Map<number, number[]>();
  nodes.forEach((node, index) => {
    const siblings = children.get(node.parent);
    if (siblings === undefined) children.set(node.parent, [index]);
    else siblings.push(index);
  });
  const expand = (parent: number): string[] => {
    const sequence: string[] = [];
    for (const index of children.get(parent) ?? []) {
      const node = nodes[index];
      if (node === undefined) continue;
      const wanted = Math.max(node.min, atLeast);
      const count = node.max === "*" ? wanted : Math.min(wanted, node.max);
      for (let copy = 0; copy < count; copy += 1) {
        if (node.kind === "segment") sequence.push(node.name);
        else sequence.push(...expand(index));
      }
    }
    return sequence;
  };
  return expand(-1);
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

  /**
   * Every published structure that names `PV1` before `PV2` inside a group the
   * publication bounds at ONE occurrence. Each row is the same segments twice:
   * in the published order, where the message is conformant and silent, and
   * with that one pair transposed, where it is not derivable from the published
   * order at all. The multiset is identical either way, so no count question is
   * in play and an ordering finding is the only thing that can report it.
   *
   * The finding names `PV1` in every row, including the OML family, whose
   * structures name a SECOND patient-visit group later in the prior-result
   * section: no occurrence of either group may begin with `PV2`, because `PV1`
   * leads both, so the sequence parts company with the publication where `PV2`
   * arrives and `PV1` is the segment that belonged there.
   */
  const maxOneGroupOrder: readonly {
    readonly structureId: string;
    readonly messageType: string;
    readonly published: readonly string[];
    readonly transposed: readonly string[];
    readonly locus: string;
  }[] = [
    {
      structureId: "VXU_V04",
      messageType: "VXU^V04",
      published: ["PID|||", "PV1||I", "PV2|||"],
      transposed: ["PID|||", "PV2|||", "PV1||I"],
      locus: "PV1",
    },
    {
      structureId: "ADT_A60",
      messageType: "ADT^A60",
      published: ["EVN||20250102", "PID|||", "PV1||I", "PV2|||"],
      transposed: ["EVN||20250102", "PID|||", "PV2|||", "PV1||I"],
      locus: "PV1",
    },
    {
      structureId: "OML_O39",
      messageType: "OML^O39",
      published: ["PID|||", "PV1||I", "PV2|||", "ORC|NW|"],
      transposed: ["PID|||", "PV2|||", "PV1||I", "ORC|NW|"],
      locus: "PV1",
    },
    {
      structureId: "OML_O21",
      messageType: "OML^O21",
      published: ["PID|||", "PV1||I", "PV2|||", "IN1|1|", "ORC|NW|"],
      transposed: ["PID|||", "PV2|||", "PV1||I", "IN1|1|", "ORC|NW|"],
      locus: "PV1",
    },
    {
      structureId: "OML_O33",
      messageType: "OML^O33",
      published: ["PID|||", "PV1||I", "PV2|||", "IN1|1|", "SPM|1|", "ORC|NW|"],
      transposed: ["PID|||", "PV2|||", "PV1||I", "IN1|1|", "SPM|1|", "ORC|NW|"],
      locus: "PV1",
    },
    {
      structureId: "OML_O35",
      messageType: "OML^O35",
      published: ["PID|||", "PV1||I", "PV2|||", "IN1|1|", "SPM|1|", "SAC|1|", "ORC|NW|"],
      transposed: ["PID|||", "PV2|||", "PV1||I", "IN1|1|", "SPM|1|", "SAC|1|", "ORC|NW|"],
      locus: "PV1",
    },
    {
      structureId: "OML_O59",
      messageType: "OML^O59_A",
      published: ["PID|||", "PV1||I", "PV2|||", "IN1|1|", "ORC|NW|"],
      transposed: ["PID|||", "PV2|||", "PV1||I", "IN1|1|", "ORC|NW|"],
      locus: "PV1",
    },
  ];

  it.each(maxOneGroupOrder)(
    "reports a pair transposed inside a group $structureId bounds at one occurrence",
    ({ structureId, messageType, published, transposed, locus }) => {
      const clean = validate(message(messageType, ...published));
      expect(clean.validated).toBe(true);
      expect(clean.structureId).toBe(structureId);
      expect(clean.findings).toEqual([]);

      const result = validate(message(messageType, ...transposed));
      expect(result.validated).toBe(true);
      expect(result.structureId).toBe(structureId);
      const ordering = result.findings.filter(
        (finding) => finding.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER,
      );
      expect(ordering).toHaveLength(1);
      expect(ordering[0]?.locus).toEqual({ segment: locus, occurrence: 0, structureId });
      expect(ordering[0]?.severity).toBe("error");
    },
  );

  it("holds a group's published minimum whether or not the group repeats", () => {
    // The same two segments, the same transposition, one published bound apart:
    // `AAA` leads a group and `BBB` follows it. Neither `[0..1]` nor `[0..*]`
    // lets an occurrence of that group begin with `BBB`, because `AAA` carries
    // a published minimum of one INSIDE it, so `BBB, AAA` is derivable from
    // neither. Reading a repeating group as "any child, any order, any number
    // of times" is what let the repeating row through, and it is exactly what
    // the publication does not say.
    const schema = (max: 1 | "*"): PublishedStructureSchema => ({
      structureId: "SYNTHETIC",
      nodes: [
        { name: "GRP", kind: "group", position: 1, min: 0, max, parent: -1 },
        { name: "AAA", kind: "segment", position: 1, min: 1, max: 1, parent: 0 },
        { name: "BBB", kind: "segment", position: 2, min: 0, max: 1, parent: 0 },
      ],
    });
    const transposed = [
      { name: "BBB", occurrence: 0 },
      { name: "AAA", occurrence: 0 },
    ];
    for (const max of [1, "*"] as const) {
      const findings = findingsForSchema(schema(max), transposed);
      expect(codes(findings)).toEqual([STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER]);
      expect(findings[0]?.locus).toEqual({
        segment: "AAA",
        occurrence: 0,
        structureId: "SYNTHETIC",
      });
    }

    // And the published order itself is silent under either bound.
    const asPublished = [
      { name: "AAA", occurrence: 0 },
      { name: "BBB", occurrence: 0 },
    ];
    expect(findingsForSchema(schema(1), asPublished)).toEqual([]);
    expect(findingsForSchema(schema("*"), asPublished)).toEqual([]);

    // What the repeat DOES buy: a second complete occurrence of the group,
    // which the bounded structure has no room for.
    const twice = [
      { name: "AAA", occurrence: 0 },
      { name: "BBB", occurrence: 0 },
      { name: "AAA", occurrence: 1 },
      { name: "BBB", occurrence: 1 },
    ];
    expect(findingsForSchema(schema("*"), twice)).toEqual([]);
    expect(codes(findingsForSchema(schema(1), twice))).toContain(
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY,
    );
  });

  it("still lets a bounded group's own segment repeat where it stands", () => {
    // The relaxation that survives, and it survives BECAUSE the count check
    // reports it: how often PV1 occurs is that check's question, so the order
    // walk drops the bound it already reported and the repeat is one finding.
    const result = validate(message("VXU^V04", "PID|||", "PV1||I", "PV1||I", "PV2|||"));
    expect(codes(result.findings)).toEqual([STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY]);
    expect(result.findings[0]?.locus.segment).toBe("PV1");
  });
});

/**
 * The order check reads the publication's bounds as the publication states
 * them, at every locus and for every node, not only for a group it bounds at one
 * occurrence. A group it lets REPEAT is the case that makes the difference: its
 * required leading segment may not be skipped on one occurrence and consumed on
 * the next, because no occurrence of that group may begin without it.
 *
 * Two sweeps back the individual cases, and both read their ground truth off the
 * committed expectation rather than off the walk: one says every leader
 * transposition the snapshot admits is reported, the other says every structure
 * still accepts its own conformant instances. A checker that fired on messages
 * the publication permits would be worse than no checker at all.
 */
describe("AC7: the published order is read with every published bound honoured", () => {
  it("reports a repeating group's required leader arriving after a later child", () => {
    // Every ADT_A01 variant names IN1 as the required first child of an
    // INSURANCE group bounded [0..*], and IN2 as a later child, so no
    // occurrence of it can begin with IN2 and no variant derives this message.
    const published = ["EVN||20250102", "PID|||", "PV1||I", "IN1|1|", "IN2|1|"];
    expect(validate(message("ADT^A01", ...published)).findings).toEqual([]);

    const transposed = ["EVN||20250102", "PID|||", "PV1||I", "IN2|1|", "IN1|1|"];
    const result = validate(message("ADT^A01", ...transposed));
    expect(result.validated).toBe(true);
    expect(codes(result.findings)).toEqual([
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER,
    ]);
    expect(result.findings[0]?.locus).toEqual({
      segment: "IN1",
      occurrence: 0,
      structureId: "ADT_A01-A",
    });
  });

  it("reports every leader transposition the published structures admit", () => {
    // The same shape, swept across all 81 committed expectations: a repeating
    // group whose first child is a required segment, paired with each later
    // segment child of that group, both names at exactly one locus in the
    // structure so no alternative placement exists. Such a sequence is
    // derivable from that structure under no reading of it.
    const silent: string[] = [];
    let considered = 0;
    for (const schema of GENERATED_STRUCTURE_SCHEMAS) {
      const nodes = schema.nodes;
      const loci = new Map<string, number>();
      for (const node of nodes) {
        if (node.kind === "segment") loci.set(node.name, (loci.get(node.name) ?? 0) + 1);
      }
      const spine = nodes
        .filter((node) => node.parent === -1 && node.kind === "segment" && node.min >= 1)
        .map((node) => node.name);
      nodes.forEach((group, groupIndex) => {
        if (group.kind !== "group" || !(group.max === "*" || group.max > 1)) return;
        const children = nodes.filter((node) => node.parent === groupIndex);
        const leader = children[0];
        if (leader === undefined || leader.kind !== "segment" || leader.min < 1) return;
        if (loci.get(leader.name) !== 1) return;
        for (const child of children.slice(1)) {
          if (child.kind !== "segment" || loci.get(child.name) !== 1) continue;
          considered += 1;
          const sequence = [...spine, child.name, leader.name];
          if (findingsForSchema(schema, withOccurrences(sequence)).length === 0) {
            silent.push(`${schema.structureId}: ${child.name} before ${leader.name}`);
          }
        }
      });
    }
    expect(considered).toBeGreaterThan(100);
    expect(silent).toEqual([]);
  });

  it("stays silent on every published structure's own conformant instances", () => {
    // Two instances per structure, expanded from the committed nodes alone:
    // every node at its published minimum, and every node once (bounded by its
    // published maximum). Both are messages the publication permits.
    const noisy: string[] = [];
    for (const schema of GENERATED_STRUCTURE_SCHEMAS) {
      for (const [label, atLeast] of [
        ["minimum", 0],
        ["once", 1],
      ] as const) {
        const findings = findingsForSchema(
          schema,
          withOccurrences(conformantSequence(schema.nodes, atLeast)),
        );
        if (findings.length > 0) {
          noisy.push(`${schema.structureId} (${label}): ${codes(findings).join(", ")}`);
        }
      }
    }
    expect(noisy).toEqual([]);
  });

  it("reports a transposition even where another segment's count is already reported", () => {
    // EVN is missing, which the count check reports, so the order walk drops
    // EVN's minimum and nothing else: the transposed insurance pair further
    // down is still reported. The relaxation is per segment name, not a blanket
    // "some count was wrong, so say nothing about the order".
    const result = validate(message("ADT^A01", "PID|||", "PV1||I", "IN2|1|", "IN1|1|"));
    expect(codes(result.findings)).toEqual([
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER,
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY,
    ]);
    expect(result.findings[0]?.locus).toEqual({
      segment: "IN1",
      occurrence: 0,
      structureId: "ADT_A01-A",
    });
    expect(result.findings[1]?.locus.segment).toBe("EVN");
  });

  it("names the segment that could not be placed when nothing later explains it", () => {
    // BBB alone inside a group whose required leader AAA never arrives: there
    // is no later occurrence of an allowed name to blame, so the finding names
    // the segment the published order could not place. AAA draws no cardinality
    // finding of its own, because its minimum along the path from the structure
    // root is zero.
    const schema: PublishedStructureSchema = {
      structureId: "SYNTHETIC",
      nodes: [
        { name: "GRP", kind: "group", position: 1, min: 0, max: "*", parent: -1 },
        { name: "AAA", kind: "segment", position: 1, min: 1, max: 1, parent: 0 },
        { name: "BBB", kind: "segment", position: 2, min: 0, max: 1, parent: 0 },
      ],
    };
    const findings = findingsForSchema(schema, [{ name: "BBB", occurrence: 0 }]);
    expect(codes(findings)).toEqual([STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER]);
    expect(findings[0]?.locus).toEqual({
      segment: "BBB",
      occurrence: 0,
      structureId: "SYNTHETIC",
    });
  });

  it("honours a bound above one, and an unbounded node with a minimum above one", () => {
    // Nothing in the vendored snapshot carries these bounds today, but the
    // derivation preserves whatever the publication states, so the walk reads
    // them rather than assuming zero-or-one and unbounded.
    const bounded: PublishedStructureSchema = {
      structureId: "SYNTHETIC",
      nodes: [
        { name: "AAA", kind: "segment", position: 1, min: 2, max: 3, parent: -1 },
        { name: "BBB", kind: "segment", position: 2, min: 0, max: 1, parent: -1 },
      ],
    };
    const runOf = (count: number): readonly string[] => Array.from({ length: count }, () => "AAA");
    expect(findingsForSchema(bounded, withOccurrences(runOf(2)))).toEqual([]);
    expect(findingsForSchema(bounded, withOccurrences(runOf(3)))).toEqual([]);
    // Four occurrences break the maximum, which the count check reports and the
    // order walk therefore does not repeat.
    expect(codes(findingsForSchema(bounded, withOccurrences(runOf(4))))).toEqual([
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY,
    ]);
    // One occurrence is short of the minimum, and BBB after it is still placed.
    expect(codes(findingsForSchema(bounded, withOccurrences(["AAA", "BBB"])))).toEqual([
      STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_CARDINALITY,
    ]);

    const unbounded: PublishedStructureSchema = {
      structureId: "SYNTHETIC",
      nodes: [
        { name: "GRP", kind: "group", position: 1, min: 2, max: "*", parent: -1 },
        { name: "AAA", kind: "segment", position: 1, min: 1, max: 1, parent: 0 },
        { name: "BBB", kind: "segment", position: 2, min: 0, max: 1, parent: 0 },
      ],
    };
    expect(findingsForSchema(unbounded, withOccurrences(["AAA", "AAA", "BBB", "AAA"]))).toEqual([]);
    // The second occurrence may not begin with BBB, whatever the group's
    // minimum, and AAA arriving after it is what the finding names.
    expect(
      codes(findingsForSchema(unbounded, withOccurrences(["AAA", "BBB", "BBB", "AAA"]))),
    ).toEqual([STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER]);
  });
});

describe("AC7: the ordering finding names the segment that arrived late", () => {
  /**
   * Where the EARLIER member of the pair is optional at its locus, the
   * publication skips it and takes the other, so the sequence parts company on
   * the LATE member rather than on the early one. Each row is checked three
   * ways, all of them through a parsed message: the published order of the same
   * segments is silent; deleting the late member leaves a message that is also
   * silent, which is what proves every other segment is in its published place;
   * and the transposition names the late member.
   */
  const lateArrival: readonly {
    readonly label: string;
    readonly structureId: string;
    readonly messageType: string;
    readonly published: readonly string[];
    readonly transposed: readonly string[];
    readonly withoutLate: readonly string[];
    readonly locus: string;
  }[] = [
    {
      label: "an optional segment delivered after the one the publication puts behind it",
      structureId: "ADT_A01-A",
      messageType: "ADT^A01",
      published: ["EVN||20250102", "PID|||", "PD1|||", "GSP|||", "PV1||I"],
      transposed: ["EVN||20250102", "PID|||", "GSP|||", "PD1|||", "PV1||I"],
      withoutLate: ["EVN||20250102", "PID|||", "GSP|||", "PV1||I"],
      locus: "PD1",
    },
    {
      label: "two optional header segments delivered the other way round",
      structureId: "ORU_R01-A",
      messageType: "ORU^R01",
      published: ["SFT|||", "UAC|||", "PID|||", "OBR|1|", "OBX|1|"],
      transposed: ["UAC|||", "SFT|||", "PID|||", "OBR|1|", "OBX|1|"],
      withoutLate: ["UAC|||", "PID|||", "OBR|1|", "OBX|1|"],
      locus: "SFT",
    },
    {
      label: "a pair the message carries last, where nothing follows to blame",
      structureId: "ADT_A01-A",
      messageType: "ADT^A01",
      published: ["EVN||20250102", "PID|||", "PV1||I", "PV2|||", "DB1|||"],
      transposed: ["EVN||20250102", "PID|||", "PV1||I", "DB1|||", "PV2|||"],
      withoutLate: ["EVN||20250102", "PID|||", "PV1||I", "DB1|||"],
      locus: "PV2",
    },
  ];

  it.each(lateArrival)(
    "names the late member, not a healthy neighbour: $label",
    ({ structureId, messageType, published, transposed, withoutLate, locus }) => {
      const clean = validate(message(messageType, ...published));
      expect(clean.structureId).toBe(structureId);
      expect(clean.findings).toEqual([]);

      const repaired = validate(message(messageType, ...withoutLate));
      expect(repaired.findings).toEqual([]);

      const result = validate(message(messageType, ...transposed));
      const ordering = result.findings.filter(
        (finding) => finding.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER,
      );
      expect(ordering).toHaveLength(1);
      expect(ordering[0]?.locus).toEqual({ segment: locus, occurrence: 0, structureId });
    },
  );

  it("names one of the two exchanged segments for every transposition, in every structure", () => {
    // Every published structure's own once-each instance, with each adjacent
    // pair of distinct names exchanged in turn. The instance itself is silent,
    // so the pair is the only thing about the sequence that changed and the
    // segment AC7 calls out of place can only be one of those two names. This is
    // the guard on WHICH segment the finding names, at the breadth of the
    // snapshot: the sweep above guards that it fires at all.
    const wrong: string[] = [];
    let considered = 0;
    for (const schema of GENERATED_STRUCTURE_SCHEMAS) {
      const canonical = conformantSequence(schema.nodes, 1);
      if (findingsForSchema(schema, withOccurrences(canonical)).length > 0) continue;
      for (let index = 0; index + 1 < canonical.length; index += 1) {
        const left = canonical[index];
        const right = canonical[index + 1];
        if (left === undefined || right === undefined || left === right) continue;
        const exchanged = [...canonical];
        exchanged[index] = right;
        exchanged[index + 1] = left;
        const named = findingsForSchema(schema, withOccurrences(exchanged)).find(
          (finding) => finding.code === STRUCTURE_FINDING_CODES.STRUCTURE_SEGMENT_OUT_OF_ORDER,
        )?.locus.segment;
        // Whether every such sequence draws a finding at all is the sweep above.
        if (named === undefined) continue;
        considered += 1;
        if (named !== left && named !== right) {
          wrong.push(`${schema.structureId}: ${left} before ${right} named ${named}`);
        }
      }
    }
    expect(considered).toBeGreaterThan(2000);
    expect(wrong).toEqual([]);
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

  it("says nothing about a line carrying no segment name at all", () => {
    // A message ending with a segment terminator parses as a trailing segment
    // whose type is the empty string. The publication names segments, not
    // blank lines, and a locus naming "" is one no caller could act on. The
    // parse still reports the line, under the warning it always did.
    const parsed = parseHL7(message("ADT^A02", "EVN||20250102", "PID|||", "PV1||I") + "\r\r");
    expect(parsed.allSegments().map((segment) => segment.type)).toContain("");
    expect(parsed.warnings.map((warning) => warning.code)).toContain(WARNING_CODES.UNKNOWN_SEGMENT);

    const result = validateMessageStructure(parsed);
    expect(result.validated).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("reports nothing on this package's own builder output", () => {
    // The golden files the builder suite pins are this package's own emitted
    // HL7, and they end with a terminator. Reporting their trailing blank line
    // as an unexpected segment would have this validator disagree with the
    // serializer that wrote it.
    const goldenDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "build");
    const goldens = readdirSync(goldenDir).filter((name) => name.endsWith(".golden.hl7"));
    expect(goldens.length).toBeGreaterThan(0);
    for (const name of goldens) {
      const result = validateMessageStructure(
        parseHL7(readFileSync(path.join(goldenDir, name), "utf8")),
      );
      expect(result.findings.map((finding) => finding.locus.segment)).not.toContain("");
    }
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

describe("AC11: the family a result reports is the family, sorted", () => {
  it("sorts the variants it considered, whatever order it read them in", () => {
    // The result type states that the family comes back sorted. It is sorted
    // where the result is built rather than inherited from the order the
    // registry happens to hold, so a future change to that order cannot
    // falsify a published promise with nothing to catch it.
    const nodes: readonly StructureExpectationNode[] = [
      { name: "PID", kind: "segment", position: 1, min: 1, max: 1, parent: -1 },
    ];
    const labels = new Map([
      ["ADT_A01-A", "SYNTHETIC-Z"],
      ["ADT_A01-B", "SYNTHETIC-M"],
      ["ADT_A01-C", "SYNTHETIC-A"],
    ]);
    const result = validateSegmentSequence("ADT", "A01", ["PID"], (structureId) => {
      const label = labels.get(structureId);
      return label === undefined ? undefined : { structureId: label, nodes };
    });
    expect(result.structureIds).toEqual(["SYNTHETIC-A", "SYNTHETIC-M", "SYNTHETIC-Z"]);
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
