/**
 * The structure check for the laboratory acknowledgment (ORL), unsolicited
 * laboratory observation (OUL), pharmacy administration (RAS) and pharmacy
 * encoded order (RDE) families.
 *
 * Their structures are vendored byte for byte at the same publication commit
 * as the rest of the snapshot, and the registry is re-derived from them. Each
 * published pair gets two messages: a conformant one that raises no
 * structural warning and validates with no finding, and one missing a
 * segment the publication requires, which warns naming that segment.
 *
 * The messages carry segment names and a placeholder sequence number only:
 * the check reads segment names and nothing else, so a patient value here
 * would be inventing PHI to prove a point about segments.
 */

import { describe, expect, it } from "vitest";

import {
  WARNING_CODES,
  findMessageStructureDefinition,
  parseHL7,
  validateMessageStructure,
} from "../src/index.js";

/** A message of a given type carrying exactly the named segments after MSH. */
function message(type: string, segments: readonly string[]): string {
  const lines = [`MSH|^~\\&|SEND|FAC|RECV|FAC|20250102||${type}|MSGID1|P|2.5.1`];
  for (const seg of segments) lines.push(`${seg}|1`);
  return `${lines.join("\r")}\r`;
}

/** The structural warnings a raw message produces. */
function structural(raw: string): readonly string[] {
  return parseHL7(raw)
    .warnings.filter((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP)
    .map((w) => w.message);
}

/** One published pair: a conformant body, and a body missing one required segment. */
interface PairCase {
  readonly type: string;
  readonly structureIds: readonly string[];
  readonly required: readonly string[];
  readonly conformant: readonly string[];
  readonly missing: string;
}

const ORL_ACK = ["MSA", "PID", "ORC", "OBR"];

const CASES: readonly PairCase[] = [
  ...(["O22", "O40", "O53", "O54", "O55", "O56"] as const).map((event) => ({
    type: `ORL^${event}`,
    structureIds: [`ORL_${event}`],
    required: ["MSA", "MSH"],
    conformant: event === "O54" || event === "O55" || event === "O56" ? ["MSA"] : ORL_ACK,
    missing: "MSA",
  })),
  {
    type: "ORL^O34",
    structureIds: ["ORL_O34"],
    required: ["MSA", "MSH"],
    conformant: ["MSA", "PID", "SPM", "ORC", "OBR"],
    missing: "MSA",
  },
  {
    type: "ORL^O36",
    structureIds: ["ORL_O36"],
    required: ["MSA", "MSH"],
    conformant: ["MSA", "PID", "SPM", "SAC", "ORC", "OBR"],
    missing: "MSA",
  },
  {
    type: "OUL^R22",
    structureIds: ["OUL_R22"],
    required: ["MSH", "OBR", "SPM"],
    conformant: ["PID", "SPM", "OBR", "OBX"],
    missing: "SPM",
  },
  {
    type: "OUL^R23",
    structureIds: ["OUL_R23"],
    required: ["MSH", "OBR", "SAC", "SPM"],
    conformant: ["PID", "SPM", "SAC", "OBR", "OBX"],
    missing: "SAC",
  },
  {
    type: "OUL^R24",
    structureIds: ["OUL_R24"],
    required: ["MSH", "OBR"],
    conformant: ["PID", "OBR", "OBX"],
    missing: "OBR",
  },
  {
    type: "RAS^O17",
    structureIds: ["RAS_O17"],
    required: ["MSH", "ORC", "RXA", "RXR"],
    conformant: ["PID", "PD1", "ORC", "RXA", "RXR"],
    missing: "RXA",
  },
  ...(["O11", "O25"] as const).map((event) => ({
    type: `RDE^${event}`,
    structureIds: ["RDE_O11-A", "RDE_O11-B"],
    required: ["MSH", "ORC", "RXE", "RXR", "TQ1"],
    conformant: ["PID", "ORC", "RXE", "TQ1", "RXR"],
    missing: "RXE",
  })),
  {
    type: "RDE^O49",
    structureIds: ["RDE_O49"],
    required: ["MSH", "ORC", "RXE", "RXR", "TQ1"],
    conformant: ["PID", "ORC", "RXE", "TQ1", "RXR"],
    missing: "TQ1",
  },
];

describe("ORL, OUL, RAS and RDE are derived from their published structures", () => {
  it.each(CASES)("$type resolves to its published structure family", (c) => {
    const [code = "", event = ""] = c.type.split("^");
    const def = findMessageStructureDefinition(code, event);
    expect(def?.derivation).toBe("published");
    expect(def?.structureIds).toEqual(c.structureIds);
    expect(def?.requiredSegments).toEqual(c.required);
  });

  it("OUL^R21 stays unrecognized: the publication names no structure for it", () => {
    expect(findMessageStructureDefinition("OUL", "R21")).toBeUndefined();
    expect(structural(message("OUL^R21", []))).toHaveLength(0);
  });
});

describe("a conformant message of each new pair is silent", () => {
  it.each(CASES)("$type raises no structural warning", (c) => {
    const msg = parseHL7(message(c.type, c.conformant));
    expect(msg.structure.recognized).toBe(true);
    expect(structural(message(c.type, c.conformant))).toEqual([]);
  });

  it.each(CASES)("$type validates against the publication with no finding", (c) => {
    const result = validateMessageStructure(parseHL7(message(c.type, c.conformant)));
    expect(result.validated).toBe(true);
    expect(result.findings).toEqual([]);
  });
});

describe("a message missing a published-required segment warns, naming it", () => {
  it.each(CASES)("$type with no $missing warns once", (c) => {
    const body = c.conformant.filter((seg) => seg !== c.missing);
    const ws = structural(message(c.type, body));
    expect(ws).toHaveLength(1);
    expect(ws[0]).toContain(`is missing segment "${c.missing}"`);
  });
});
