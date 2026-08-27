/**
 * The public surface survived the re-sourcing.
 *
 * Re-sourcing the structure registry from HL7's publication changed what the
 * registry SAYS. It must not have changed what the package EXPORTS: every
 * value the entry point exported before the change is still exported, and no
 * exported type lost a field. The list below is the value surface transcribed
 * from the entry point at the commit this work started from, so this test
 * fails loudly if a symbol is dropped rather than quietly at a consumer.
 *
 * The type half is enforced at compile time. Each assignment below reads a
 * field that existed before the change off the type that carries it, so a
 * removed or renamed field is a typecheck failure, not a runtime one.
 */

import { describe, expect, it } from "vitest";

import * as hl7 from "../src/index.js";
import type {
  ExpectedSegmentGroup,
  MessageStructure,
  MessageStructureDefinition,
  StructureGroup,
} from "../src/index.js";

/** Every VALUE the entry point exported before the registry was re-sourced. */
const PREVIOUS_VALUE_EXPORTS: readonly string[] = [
  "ACK_CODES",
  "ACK_CONDITIONS",
  "BUILTIN_DATE_FALLBACKS",
  "DEFAULT_ENCODING_CHARACTERS",
  "ERR_CONDITION_CODES",
  "ERR_CONDITION_CODE_SYSTEM",
  "ERR_SEVERITIES",
  "FATAL_CODES",
  "FINDING_CODES",
  "Field",
  "HL7",
  "Hl7Message",
  "Hl7ParseError",
  "KNOWN_CODING_SYSTEMS",
  "KNOWN_SEGMENTS",
  "MESSAGE_STRUCTURE_DEFINITIONS",
  "PREDICATE_CONNECTORS",
  "PREDICATE_VERBS",
  "PROFILE_LEVELS",
  "ProfileDefinitionError",
  "SUPPORTED_DATE_TOKENS",
  "Segment",
  "USAGE_CODES",
  "VERSION",
  "WARNING_CODES",
  "ackNoCorrelationId",
  "alternateCodingSystemOf",
  "analyzeMessageStructure",
  "batchCountMismatch",
  "batchMissingTrailer",
  "buildAck",
  "buildAdt",
  "buildMessage",
  "buildOru",
  "canonicalCharset",
  "codingSystem",
  "codingSystemOf",
  "conformance",
  "decodeText",
  "defineConformanceProfile",
  "defineProfile",
  "detectAckMode",
  "downgradePositiveAck",
  "dtmToDate",
  "duplicateRequiredSegment",
  "encodeCe",
  "encodeComposite",
  "encodeCompositeReps",
  "encodeCwe",
  "encodeCx",
  "encodeHd",
  "encodeNm",
  "encodePl",
  "encodeText",
  "encodeTs",
  "encodeXad",
  "encodeXcn",
  "encodeXpn",
  "encodeXtn",
  "encodingMismatch",
  "extraFields",
  "fieldWhitespaceTrimmed",
  "formatDtm",
  "getDefaultProfile",
  "interpretAck",
  "isPositiveAck",
  "mergeMissingPriorOrSurvivor",
  "missingExpectedGroup",
  "missingRequiredField",
  "mllpFramingStripped",
  "outOfOrderSegment",
  "parseCe",
  "parseCwe",
  "parseCx",
  "parseDtm",
  "parseHL7",
  "parseHd",
  "parseNm",
  "parsePath",
  "parsePl",
  "parseSn",
  "parseStream",
  "parseTs",
  "parseXad",
  "parseXcn",
  "parseXpn",
  "parseXtn",
  "pickMrn",
  "profiles",
  "reescape",
  "renderText",
  "resolveCharset",
  "resolvePath",
  "segmentCase",
  "setDefaultProfile",
  "splitBatch",
  "text",
  "timestampFallbackFormat",
  "unescape",
  "unknownCharset",
  "unknownEscapeSequence",
  "unknownSegment",
  "unsupportedCharset",
  "unterminatedEscapeSequence",
  "unterminatedStreamMessage",
  "usageOutcomes",
  "validateAgainstProfile",
  "versionMismatch",
];

describe("AC17: the entry point still exports everything it used to", () => {
  it("exports all 108 previously exported values", () => {
    expect(PREVIOUS_VALUE_EXPORTS).toHaveLength(108);
    const surface = new Set(Object.keys(hl7));
    const missing = PREVIOUS_VALUE_EXPORTS.filter((name) => !surface.has(name));
    expect(missing).toEqual([]);
  });

  it("the retired warning factory is retained and still usable", () => {
    // The parser no longer calls it, but it is public API a consumer may hold.
    const w = hl7.missingExpectedGroup({ segmentIndex: 0, fieldIndex: 9 }, "ORU^R01", "result", [
      "OBR",
      "OBX",
    ]);
    expect(w.code).toBe(hl7.WARNING_CODES.MISSING_EXPECTED_GROUP);
    expect(w.message).toContain("result");
    expect(w.message).toContain("OBR/OBX");
  });

  it("the warning code set is unchanged (no code added, renamed or removed)", () => {
    expect(Object.keys(hl7.WARNING_CODES)).toHaveLength(20);
    expect(hl7.WARNING_CODES.MISSING_EXPECTED_GROUP).toBe("MISSING_EXPECTED_GROUP");
  });
});

describe("AC17: no exported structure type lost a field", () => {
  it("ExpectedSegmentGroup still carries name and anchorSegments", () => {
    const def = hl7.MESSAGE_STRUCTURE_DEFINITIONS[0];
    expect(def).toBeDefined();
    const group = def?.expectedGroups[0];
    expect(group).toBeDefined();
    if (group === undefined) return;
    const typed: ExpectedSegmentGroup = group;
    const name: string = typed.name;
    const anchors: readonly string[] = typed.anchorSegments;
    expect(typeof name).toBe("string");
    expect(anchors.length).toBeGreaterThan(0);
  });

  it("MessageStructureDefinition still carries messageCode, triggerEvents, expectedGroups", () => {
    const def: MessageStructureDefinition | undefined = hl7.MESSAGE_STRUCTURE_DEFINITIONS[0];
    expect(def).toBeDefined();
    if (def === undefined) return;
    const messageCode: string = def.messageCode;
    const triggerEvents: readonly string[] = def.triggerEvents;
    const expectedGroups: readonly ExpectedSegmentGroup[] = def.expectedGroups;
    expect(typeof messageCode).toBe("string");
    expect(Array.isArray(triggerEvents)).toBe(true);
    expect(Array.isArray(expectedGroups)).toBe(true);
  });

  it("MessageStructure still carries every field it did, including missingGroups", () => {
    const s: MessageStructure = hl7.analyzeMessageStructure("ORU", "R01", new Set(["MSH"]));
    const recognized: boolean = s.recognized;
    const messageCode: string = s.messageCode;
    const triggerEvent: string = s.triggerEvent;
    const expectedGroups: readonly StructureGroup[] = s.expectedGroups;
    const missingGroups: readonly string[] = s.missingGroups;
    expect(recognized).toBe(true);
    expect(messageCode).toBe("ORU");
    expect(triggerEvent).toBe("R01");
    expect(expectedGroups.length).toBeGreaterThan(0);
    expect(missingGroups).toEqual(["OBR"]);
  });

  it("StructureGroup still carries name, anchorSegments and present", () => {
    const s = hl7.analyzeMessageStructure("ACK", "", new Set(["MSH"]));
    const g: StructureGroup | undefined = s.expectedGroups[0];
    expect(g).toBeDefined();
    if (g === undefined) return;
    const name: string = g.name;
    const anchors: readonly string[] = g.anchorSegments;
    const present: boolean = g.present;
    expect(typeof name).toBe("string");
    expect(anchors.length).toBe(1);
    expect(typeof present).toBe("boolean");
  });

  it("a consumer reading missingGroups keeps getting a list of names", () => {
    // The names are segment ids now rather than hand-picked group labels, but
    // the field's shape and its meaning ("what is absent") are unchanged.
    const s = hl7.analyzeMessageStructure("ADT", "A01", new Set(["MSH", "PID"]));
    expect(s.missingGroups).toEqual(["EVN", "PV1"]);
    expect(s.missingGroups).toEqual([...s.missingSegments]);
  });
});
