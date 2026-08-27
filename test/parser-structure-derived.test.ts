/**
 * The observable behaviour of the DERIVED structure registry.
 *
 * Every assertion here is anchored to what HL7's published, machine-readable
 * message structures actually say, read out of the vendored snapshot rather
 * than restated from memory: the optional-group rule, the variant-family
 * intersection, the retained pair the publication does not carry, and the
 * bounds on what a warning is allowed to say.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MESSAGE_STRUCTURE_DEFINITIONS,
  WARNING_CODES,
  analyzeMessageStructure,
  findMessageStructureDefinition,
  parseHL7,
} from "../src/index.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = path.join(REPO_ROOT, "vendor", "hl7-v2ig");

/** Read one vendored structure definition's element list. */
function vendoredElements(
  structureId: string,
): readonly { id: string; min: number; type?: readonly { code?: string }[] }[] {
  const file = path.join(VENDOR_DIR, "message-structure", `${structureId}.json`);
  const doc: unknown = JSON.parse(readFileSync(file, "utf8"));
  const differential = (doc as { differential?: { element?: unknown } }).differential;
  const elements = differential?.element;
  if (!Array.isArray(elements)) throw new Error(`no differential.element in ${structureId}`);
  return elements as readonly { id: string; min: number; type?: readonly { code?: string }[] }[];
}

/** The structural warnings a raw message produces. */
function structural(raw: string): readonly { readonly message: string }[] {
  return parseHL7(raw).warnings.filter((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP);
}

/** A minimal message of a given type carrying exactly the named segments. */
function message(type: string, segments: readonly string[]): string {
  const lines = [`MSH|^~\\&|APP|FAC|APP2|FAC2|20250102||${type}|MSGID1|P|2.5.1`];
  for (const seg of segments) lines.push(`${seg}|1`);
  return `${lines.join("\r")}\r`;
}

describe("AC1: a missing published-required segment warns, naming that segment", () => {
  it("ORU^R01 with no OBR names OBR", () => {
    const ws = structural(message("ORU^R01", ["PID"]));
    expect(ws).toHaveLength(1);
    expect(ws[0]?.message).toContain('is missing segment "OBR"');
  });

  it("SIU^S12 with no RGS names RGS, an expectation the transcription lacked", () => {
    const ws = structural(message("SIU^S12", ["SCH"]));
    expect(ws.map((w) => w.message).join(" ")).toContain('is missing segment "RGS"');
  });

  it("OMG^O19 with no OBR names OBR, an expectation the transcription lacked", () => {
    const ws = structural(message("OMG^O19", ["ORC"]));
    expect(ws).toHaveLength(1);
    expect(ws[0]?.message).toContain('is missing segment "OBR"');
  });

  it("the warning is Tier-2 and additive: the message still parses", () => {
    const msg = parseHL7(message("ORU^R01", ["PID"]));
    expect(msg.get("MSH.9.1")).toBe("ORU");
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP)).toBe(true);
  });
});

describe("AC2: an optional group's absence never warns", () => {
  it("a conformant OBX-free ORU^R01 stays warning-free", () => {
    // The published ORU_R01 nests every OBX inside a group with min 0.
    expect(structural(message("ORU^R01", ["PID", "OBR"]))).toHaveLength(0);
  });

  it("OBX is genuinely inside an optional group in the published ORU_R01", () => {
    const obx = vendoredElements("ORU_R01-A").filter((e) => e.id.endsWith("-OBX"));
    expect(obx.length).toBeGreaterThan(0);
    // Every OBX occurrence sits under a group; none is a top-level child of
    // the structure root, which is what the derivation relies on.
    for (const el of obx) expect(el.id.split(".").length).toBeGreaterThan(2);
  });

  it("a VXU^V04 with no RXA stays warning-free", () => {
    expect(structural(message("VXU^V04", ["PID"]))).toHaveLength(0);
  });
});

describe("AC6: a family must agree before a segment counts as required", () => {
  it("ORU_R01 variants disagree about NTE, so NTE is not required", () => {
    const nteMin = (id: string): number => {
      const el = vendoredElements(id).find(
        (e) =>
          e.id.endsWith("-ORDER_OBSERVATION.3-NTE") || e.id.endsWith("2-ORDER_OBSERVATION.3-NTE"),
      );
      return el?.min ?? -1;
    };
    // Read straight out of the snapshot: A and B give it 0, C and D give it 1.
    expect(nteMin("ORU_R01-A")).toBe(0);
    expect(nteMin("ORU_R01-C")).toBe(1);

    const def = findMessageStructureDefinition("ORU", "R01");
    expect(def?.structureIds).toEqual(["ORU_R01-A", "ORU_R01-B", "ORU_R01-C", "ORU_R01-D"]);
    expect(def?.requiredSegments).not.toContain("NTE");
    expect(structural(message("ORU^R01", ["PID", "OBR"]))).toHaveLength(0);
  });

  it("ACK-Scheduling is NOT folded into the ACK family (one letter, not a word)", () => {
    const ack = findMessageStructureDefinition("ACK", "");
    expect(ack?.structureIds).toEqual(["ACK"]);
  });
});

describe("AC7: a required segment inside an optional group is not required", () => {
  it("an ORU^R01 with no top-level PID stays warning-free", () => {
    expect(structural(message("ORU^R01", ["OBR"]))).toHaveLength(0);
  });

  it("PID really is min 1 inside a min 0 PATIENT group in the publication", () => {
    const els = vendoredElements("ORU_R01-A");
    const patient = els.find((e) => e.id === "ORU_R01-A.5-PATIENT_RESULT.1-PATIENT");
    const pid = els.find((e) => e.id === "ORU_R01-A.5-PATIENT_RESULT.1-PATIENT.1-PID");
    expect(patient?.min).toBe(0);
    expect(pid?.min).toBe(1);
    expect(findMessageStructureDefinition("ORU", "R01")?.requiredSegments).not.toContain("PID");
  });
});

describe("AC8: the EVN leniency is retired", () => {
  it("an ADT^A01 with PID and PV1 but no EVN warns naming EVN", () => {
    const ws = structural(message("ADT^A01", ["PID", "PV1"]));
    expect(ws).toHaveLength(1);
    expect(ws[0]?.message).toContain('is missing segment "EVN"');
  });

  it("all four published ADT_A01 variants give EVN a minimum of one", () => {
    for (const variant of ["ADT_A01-A", "ADT_A01-B", "ADT_A01-C", "ADT_A01-D"]) {
      const evn = vendoredElements(variant).find((e) => e.id === `${variant}.5-EVN`);
      expect(evn?.min).toBe(1);
    }
  });

  it("no leniency or suppression list survives: every entry is derived or retained", () => {
    for (const def of MESSAGE_STRUCTURE_DEFINITIONS) {
      expect(["published", "retained-transcription"]).toContain(def.derivation);
      if (def.derivation === "published") {
        expect(def.structureIds.length).toBeGreaterThan(0);
        expect(def.retainedReason).toBe("");
      }
    }
  });
});

/**
 * Every (message code, trigger event) pair the registry recognized before it
 * was re-sourced. Transcribed from the table at that commit: ADT's eight
 * events, ORU^R01, the five order pairs, SIU's fourteen, MDM's two, DFT^P03,
 * VXU^V04, and ACK on the code alone.
 */
const PREVIOUSLY_RECOGNIZED: readonly (readonly [string, string])[] = [
  ["ADT", "A01"],
  ["ADT", "A02"],
  ["ADT", "A03"],
  ["ADT", "A04"],
  ["ADT", "A05"],
  ["ADT", "A08"],
  ["ADT", "A11"],
  ["ADT", "A13"],
  ["ORU", "R01"],
  ["ORM", "O01"],
  ["OML", "O21"],
  ["OMG", "O19"],
  ["OMP", "O09"],
  ["OMI", "O23"],
  ["SIU", "S12"],
  ["SIU", "S13"],
  ["SIU", "S14"],
  ["SIU", "S15"],
  ["SIU", "S16"],
  ["SIU", "S17"],
  ["SIU", "S18"],
  ["SIU", "S19"],
  ["SIU", "S20"],
  ["SIU", "S21"],
  ["SIU", "S22"],
  ["SIU", "S23"],
  ["SIU", "S24"],
  ["SIU", "S26"],
  ["MDM", "T02"],
  ["MDM", "T06"],
  ["DFT", "P03"],
  ["VXU", "V04"],
  ["ACK", ""],
  ["ACK", "A01"],
  ["ACK", "R01"],
  ["ACK", "ZZ9"],
];

describe("AC9: no pair loses recognition", () => {
  it.each(PREVIOUSLY_RECOGNIZED)("%s^%s is still recognized", (code, trigger) => {
    expect(analyzeMessageStructure(code, trigger, new Set(["MSH"])).recognized).toBe(true);
  });

  it("the twelve covered message codes are all still present", () => {
    const codes = new Set(MESSAGE_STRUCTURE_DEFINITIONS.map((d) => d.messageCode));
    expect([...codes].sort()).toEqual([
      "ACK",
      "ADT",
      "DFT",
      "MDM",
      "OMG",
      "OMI",
      "OML",
      "OMP",
      "ORM",
      "ORU",
      "SIU",
      "VXU",
    ]);
  });

  it("recognition WIDENED: ADT trigger events the transcription froze out now resolve", () => {
    for (const trigger of ["A06", "A07", "A12", "A15", "A21", "A40", "A54", "A61"]) {
      expect(analyzeMessageStructure("ADT", trigger, new Set(["MSH"])).recognized).toBe(true);
    }
  });
});

describe("AC10: ORM^O01 is retained, marked, and carries its reason", () => {
  it("the publication carries no ORM_O01 at all", () => {
    const manifest: unknown = JSON.parse(
      readFileSync(path.join(VENDOR_DIR, "control-manifests", "message_structures.json"), "utf8"),
    );
    const entries = (manifest as { entry?: { item?: { display?: string } }[] }).entry ?? [];
    expect(entries).toHaveLength(305);
    expect(entries.some((e) => e.item?.display === "ORM_O01")).toBe(false);

    const messages: unknown = JSON.parse(
      readFileSync(path.join(VENDOR_DIR, "control-manifests", "messages.json"), "utf8"),
    );
    const msgEntries = (messages as { entry?: { item?: { display?: string } }[] }).entry ?? [];
    expect(msgEntries.some((e) => e.item?.display?.startsWith("ORM^O01"))).toBe(false);
  });

  it("the pair stays recognized with its previous expectation (ORC)", () => {
    const def = findMessageStructureDefinition("ORM", "O01");
    expect(def?.requiredSegments).toEqual(["ORC"]);
    expect(structural(message("ORM^O01", ["PID", "ORC", "OBR"]))).toHaveLength(0);
    const ws = structural(message("ORM^O01", ["PID"]));
    expect(ws).toHaveLength(1);
    expect(ws[0]?.message).toContain('is missing segment "ORC"');
  });

  it("it is marked as a retained transcription carrying the reason", () => {
    const def = findMessageStructureDefinition("ORM", "O01");
    expect(def?.derivation).toBe("retained-transcription");
    expect(def?.structureId).toBe("");
    expect(def?.structureIds).toEqual([]);
    expect(def?.retainedReason).toContain("no ORM_O01");
    expect(def?.retainedReason).toContain("404");
  });

  it("it is the ONLY retained transcription", () => {
    const retained = MESSAGE_STRUCTURE_DEFINITIONS.filter(
      (d) => d.derivation === "retained-transcription",
    );
    expect(retained.map((d) => `${d.messageCode}^${d.triggerEvents.join(",")}`)).toEqual([
      "ORM^O01",
    ]);
  });
});

describe("AC15: an unrecognized pair is silent and bounded exactly as before", () => {
  it("emits no structural warning and reports recognized:false", () => {
    const s = parseHL7(message("QRY^A19", ["QRD"])).structure;
    expect(s.recognized).toBe(false);
    expect(structural(message("QRY^A19", ["QRD"]))).toHaveLength(0);
  });

  it("an identifier-shaped MSH-9 is echoed verbatim", () => {
    const s = parseHL7(message("QRY^A19", [])).structure;
    expect(s.messageCode).toBe("QRY");
    expect(s.triggerEvent).toBe("A19");
  });

  it("a non-identifier-shaped MSH-9 is withheld, not truncated", () => {
    const raw =
      "MSH|^~\\&|APP|FAC|APP2|FAC2|20250102||PATIENT COMPLAINS OF CHEST PAIN^SEVERE|MSGID1|P|2.5.1\r";
    const s = parseHL7(raw).structure;
    expect(s.messageCode).toBe("<withheld>");
    expect(s.triggerEvent).toBe("<withheld>");
    expect(s.messageCode).not.toContain("PATIENT");
  });

  it("an absent MSH-9 stays the empty string rather than becoming withheld", () => {
    const raw = "MSH|^~\\&|APP|FAC|APP2|FAC2|20250102|||MSGID1|P|2.5.1\r";
    const s = parseHL7(raw).structure;
    expect(s.messageCode).toBe("");
    expect(s.triggerEvent).toBe("");
    expect(s.recognized).toBe(false);
  });
});

describe("AC16: a structural warning carries no field value", () => {
  it("only the type, the segment and the structure id reach the message", () => {
    const raw =
      "MSH|^~\\&|APP|FAC|APP2|FAC2|20250102||ADT^A01|MSGID1|P|2.5.1\r" +
      "EVN||20250102\r" +
      "PID|1||MRN-SECRET-001^^^FAC^MR||DOE^JANE||19700101|F|||123 Main St^^Springfield^IL^62701\r";
    const ws = structural(raw);
    expect(ws).toHaveLength(1);
    const text = ws[0]?.message ?? "";
    expect(text).toContain('"PV1"');
    expect(text).toContain("ADT_A01");
    for (const value of [
      "MRN-SECRET-001",
      "DOE",
      "JANE",
      "19700101",
      "Main St",
      "Springfield",
      "62701",
      "MSGID1",
    ]) {
      expect(text).not.toContain(value);
    }
  });

  it("a forged message type is shape-checked before it is interpolated", () => {
    // A recognized ACK matches on message code alone, so MSH-9.2 reaches the
    // message type. A narrative MSH-9.2 fails the shape test and is withheld
    // wholesale rather than truncated.
    const raw =
      "MSH|^~\\&|APP|FAC|APP2|FAC2|20250102||ACK^COMPLAINS OF CHEST PAIN|MSGID1|P|2.5.1\r";
    const ws = structural(raw);
    expect(ws).toHaveLength(1);
    expect(ws[0]?.message).toContain("<withheld>");
    expect(ws[0]?.message).not.toContain("CHEST PAIN");
    expect(ws[0]?.message).toContain('is missing segment "MSA"');
  });
});
