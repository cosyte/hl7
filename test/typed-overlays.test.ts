/**
 * Typed message overlays: `msg.is("ADT^A01")` answers at run time from the pair
 * the parser extracted and narrows the message for the compiler.
 *
 * The file carries both halves of the contract, deliberately in one place:
 *
 *   - RUNTIME behaviour, including every unhappy path (an unpublished key, the
 *     three-component MSH-9 string, a code-only string for a trigger-keyed
 *     type, an empty string, a value computed at run time, a message with no
 *     usable message type, and a recognized message that is missing a segment
 *     its published structure requires).
 *   - TYPE-LEVEL behaviour, asserted with `@ts-expect-error`. `tsconfig.json`
 *     includes `test/**\/*.ts`, so every one of those is enforced by
 *     `pnpm typecheck`: the line must be an error, and a line that stops being
 *     an error fails the check just as loudly.
 *
 * PUBLISHED below is the compile-time table's fixture. `satisfies
 * OverlayStructures` proves the interface and the fixture agree at compile time
 * (a missing key or a changed segment list is a type error; an EXTRA key is
 * not, because `as const` costs the literal its freshness, which is what the
 * key comparison below is for), and the support-claim tests prove the fixture
 * and the derived structure registry agree in both directions. Transitively,
 * the type the compiler uses cannot drift from the registry the runtime answers
 * from.
 */

import { describe, expect, it } from "vitest";

import {
  MESSAGE_STRUCTURE_DEFINITIONS,
  SUPPORTED_OVERLAY_MESSAGES,
  WARNING_CODES,
  findMessageStructureDefinition,
  parseHL7,
} from "../src/index.js";
import type { OverlayStructures } from "../src/index.js";
import type { Segment } from "../src/model/segment.js";

// ---------------------------------------------------------------------------
// Fixtures. Structural only: no names, no dates of birth, no identifiers beyond
// a single digit, because these messages exist to exercise message-type
// narrowing and nothing else.
// ---------------------------------------------------------------------------

const ADT_A01 = [
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ADT^A01|MSG001|P|2.5",
  "EVN|A01|20250101120000",
  "PID|||1",
  "PV1||I",
].join("\r");

/** The same message with the three-component MSH-9 form. */
const ADT_A01_THREE_COMPONENT = [
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ADT^A01^ADT_A01|MSG001|P|2.5",
  "EVN|A01|20250101120000",
  "PID|||1",
  "PV1||I",
].join("\r");

/** A recognized ADT^A01 that carries no PID: the truncated-feed shape. */
const ADT_A01_NO_PID = [
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ADT^A01|MSG001|P|2.5",
  "EVN|A01|20250101120000",
  "PV1||I",
].join("\r");

/** Two OBR segments, so `parts` has more than one occurrence to return. */
const ORU_R01_TWO_OBR = [
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ORU^R01|MSG002|P|2.5",
  "PID|||1",
  "OBR|1||FILL1|PANEL1",
  "OBX|1|NM|GLU||5.5",
  "OBR|2||FILL2|PANEL2",
].join("\r");

/** MSH-9.2 carries the ACKNOWLEDGED message's trigger event, not the ACK's. */
const ACK_A01 = [
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ACK^A01^ACK|MSG003|P|2.5",
  "MSA|AA|MSG001",
].join("\r");

/** The same acknowledgment with a different acknowledged trigger event. */
const ACK_R01 = [
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ACK^R01|MSG004|P|2.5",
  "MSA|AA|MSG002",
].join("\r");

/** An acknowledgment whose MSH-9 carries the message code alone. */
const ACK_CODE_ONLY = [
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ACK|MSG005|P|2.5",
  "MSA|AA|MSG003",
].join("\r");

/** MSH-9 holds a message code and no trigger event. */
const ADT_NO_TRIGGER = [
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ADT|MSG006|P|2.5",
  "PID|||1",
].join("\r");

/** MSH-9 is empty: the message declares no type at all. */
const NO_MESSAGE_TYPE = ["MSH|^~\\&|APP|FAC|APP|FAC|20250101120000|||MSG007|P|2.5", "PID|||1"].join(
  "\r",
);

// ---------------------------------------------------------------------------
// The compile-time table's fixture. `satisfies` refuses a missing key and a
// changed segment list; the support-claim tests below tie it to the registry at
// run time, which is also what catches an extra key.
// ---------------------------------------------------------------------------

const PUBLISHED = {
  ACK: ["MSA", "MSH"],
  "ADT^A01": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A02": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A03": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A04": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A05": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A06": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A07": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A08": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A09": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A10": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A11": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A12": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A13": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A14": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A15": ["EVN", "MSH", "PID", "PRT", "PV1"],
  "ADT^A16": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A17": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A20": ["EVN", "MSH", "NPU"],
  "ADT^A21": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A22": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A23": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A24": ["EVN", "MSH", "PID"],
  "ADT^A25": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A26": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A27": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A28": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A29": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A31": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A32": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A33": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A37": ["EVN", "MSH", "PID"],
  "ADT^A38": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A40": ["EVN", "MRG", "MSH", "PID"],
  "ADT^A41": ["EVN", "MRG", "MSH", "PID"],
  "ADT^A42": ["EVN", "MRG", "MSH", "PID"],
  "ADT^A43": ["EVN", "MRG", "MSH", "PID"],
  "ADT^A44": ["EVN", "MRG", "MSH", "PID"],
  "ADT^A45": ["EVN", "MRG", "MSH", "PID", "PV1"],
  "ADT^A47": ["EVN", "MRG", "MSH", "PID"],
  "ADT^A49": ["EVN", "MRG", "MSH", "PID"],
  "ADT^A50": ["EVN", "MRG", "MSH", "PID", "PV1"],
  "ADT^A51": ["EVN", "MRG", "MSH", "PID", "PV1"],
  "ADT^A52": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A53": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A54": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A55": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A60": ["EVN", "MSH", "PID"],
  "ADT^A61": ["EVN", "MSH", "PID", "PV1"],
  "ADT^A62": ["EVN", "MSH", "PID", "PV1"],
  "DFT^P03": ["EVN", "FT1", "MSH", "PID"],
  "DFT^P11": ["EVN", "FT1", "MSH", "PID"],
  "MDM^T01": ["EVN", "MSH", "PID", "PV1", "TXA"],
  "MDM^T02": ["EVN", "MSH", "OBX", "PID", "PV1", "TXA"],
  "MDM^T03": ["EVN", "MSH", "PID", "PV1", "TXA"],
  "MDM^T04": ["EVN", "MSH", "OBX", "PID", "PV1", "TXA"],
  "MDM^T05": ["EVN", "MSH", "PID", "PV1", "TXA"],
  "MDM^T06": ["EVN", "MSH", "OBX", "PID", "PV1", "TXA"],
  "MDM^T07": ["EVN", "MSH", "PID", "PV1", "TXA"],
  "MDM^T08": ["EVN", "MSH", "OBX", "PID", "PV1", "TXA"],
  "MDM^T09": ["EVN", "MSH", "PID", "PV1", "TXA"],
  "MDM^T10": ["EVN", "MSH", "OBX", "PID", "PV1", "TXA"],
  "MDM^T11": ["EVN", "MSH", "PID", "PV1", "TXA"],
  "OMG^O19": ["MSH", "OBR", "ORC"],
  "OMI^O23": ["IPC", "MSH", "OBR", "ORC"],
  "OML^O21": ["MSH", "ORC"],
  "OML^O33": ["MSH", "ORC", "SPM"],
  "OML^O35": ["MSH", "ORC", "SAC", "SPM"],
  "OML^O39": ["MSH", "ORC"],
  "OML^O59_A": ["MSH", "ORC"],
  "OMP^O09": ["MSH", "ORC", "RXO", "RXR"],
  "ORM^O01": ["ORC"],
  "ORU^R01": ["MSH", "OBR"],
  "ORU^R30": ["MSH", "OBR", "OBX", "ORC", "PID"],
  "ORU^R31": ["MSH", "OBR", "OBX", "ORC", "PID"],
  "ORU^R32": ["MSH", "OBR", "OBX", "ORC", "PID"],
  "ORU^R40": ["MSH", "OBR"],
  "ORU^R42": ["MSH", "OBR"],
  "ORU^R43": ["MSH", "OBR"],
  "SIU^S12": ["MSH", "RGS", "SCH"],
  "SIU^S13": ["MSH", "RGS", "SCH"],
  "SIU^S14": ["MSH", "RGS", "SCH"],
  "SIU^S15": ["MSH", "RGS", "SCH"],
  "SIU^S16": ["MSH", "RGS", "SCH"],
  "SIU^S17": ["MSH", "RGS", "SCH"],
  "SIU^S18": ["MSH", "RGS", "SCH"],
  "SIU^S19": ["MSH", "RGS", "SCH"],
  "SIU^S20": ["MSH", "RGS", "SCH"],
  "SIU^S21": ["MSH", "RGS", "SCH"],
  "SIU^S22": ["MSH", "RGS", "SCH"],
  "SIU^S23": ["MSH", "RGS", "SCH"],
  "SIU^S24": ["MSH", "RGS", "SCH"],
  "SIU^S26": ["MSH", "RGS", "SCH"],
  "SIU^S27": ["MSH", "RGS", "SCH"],
  "VXU^V04": ["MSH", "PID"],
} as const satisfies OverlayStructures;

/** Every (message code, trigger event) pair the registry recognizes, as keys. */
function registryKeys(): readonly string[] {
  const keys: string[] = [];
  for (const def of MESSAGE_STRUCTURE_DEFINITIONS) {
    if (def.triggerEvents.length === 0) {
      keys.push(def.messageCode);
      continue;
    }
    for (const event of def.triggerEvents) keys.push(`${def.messageCode}^${event}`);
  }
  return keys;
}

describe("typed overlays: the published support claim", () => {
  it("carries one key per registry pair and no key the registry does not recognize", () => {
    const claimed = SUPPORTED_OVERLAY_MESSAGES.map((m) => m.key);
    const fromRegistry = registryKeys();

    // Both directions, and no duplicates: set equality plus a length check.
    expect([...claimed].sort()).toEqual([...fromRegistry].sort());
    expect(new Set(claimed).size).toBe(claimed.length);

    // Every claimed key resolves through the registry's own lookup, and the
    // segments it publishes are the registry's, not a second transcription.
    for (const entry of SUPPORTED_OVERLAY_MESSAGES) {
      const def = findMessageStructureDefinition(entry.messageCode, entry.triggerEvent);
      expect(def, `registry recognizes ${entry.key}`).toBeDefined();
      expect([...entry.requiredSegments]).toEqual([...(def?.requiredSegments ?? [])]);
    }
  });

  it("agrees with the compile-time table in both directions", () => {
    const declared = Object.keys(PUBLISHED);
    const claimed = SUPPORTED_OVERLAY_MESSAGES.map((m) => m.key);
    expect([...declared].sort()).toEqual([...claimed].sort());

    const byKey = new Map(SUPPORTED_OVERLAY_MESSAGES.map((m) => [m.key, m]));
    for (const [key, segments] of Object.entries(PUBLISHED)) {
      expect([...segments], `required segments for ${key}`).toEqual([
        ...(byKey.get(key)?.requiredSegments ?? []),
      ]);
    }
  });

  it("is frozen, and marks a code-only entry with an empty trigger event", () => {
    expect(Object.isFrozen(SUPPORTED_OVERLAY_MESSAGES)).toBe(true);
    const ack = SUPPORTED_OVERLAY_MESSAGES.find((m) => m.key === "ACK");
    expect(ack?.messageCode).toBe("ACK");
    expect(ack?.triggerEvent).toBe("");
    expect(SUPPORTED_OVERLAY_MESSAGES.every((m) => Object.isFrozen(m))).toBe(true);
  });
});

describe("typed overlays: is() matches the pair the parser extracted", () => {
  it("answers true for the message's own key", () => {
    expect(parseHL7(ADT_A01).is("ADT^A01")).toBe(true);
    expect(parseHL7(ORU_R01_TWO_OBR).is("ORU^R01")).toBe(true);
  });

  it("answers true when MSH-9 carries the three-component form", () => {
    const msg = parseHL7(ADT_A01_THREE_COMPONENT);
    expect(msg.meta.type).toBe("ADT^A01^ADT_A01");
    expect(msg.is("ADT^A01")).toBe(true);
  });

  it("answers false for a published key the message does not match", () => {
    const msg = parseHL7(ADT_A01);
    expect(msg.is("ORU^R01")).toBe(false);
    expect(msg.is("ADT^A02")).toBe(false);
    expect(msg.is("ACK")).toBe(false);
  });

  it("leaves the message un-narrowed on the false branch", () => {
    const msg = parseHL7(ADT_A01);
    if (msg.is("ORU^R01")) {
      throw new Error("an ADT^A01 must not match ORU^R01");
    }
    const wide: string | undefined = msg.meta.messageCode;
    expect(wide).toBe("ADT");
    // @ts-expect-error the false branch narrows nothing: messageCode is still `string | undefined`
    const narrowed: "ADT" = msg.meta.messageCode;
    expect(narrowed).toBe("ADT");
  });

  it("answers false, and never throws, for every string that is not a key", () => {
    const msg = parseHL7(ADT_A01);
    // An unregistered message type.
    expect(msg.is("ZZZ^Z99")).toBe(false);
    // The three-component MSH-9 form: `is` compares the extracted pair, and
    // does not parse its own argument.
    expect(msg.is("ADT^A01^ADT_A01")).toBe(false);
    // A code-only string for a message code the registry keys by trigger event.
    expect(msg.is("ADT")).toBe(false);
    // Empty and whitespace-only.
    expect(msg.is("")).toBe(false);
    expect(msg.is("   ")).toBe(false);
    expect(msg.is("ADT^")).toBe(false);
    expect(msg.is("^A01")).toBe(false);
    // A value computed at run time is a plain `string`: it answers, and it
    // narrows nothing.
    const computed: string = ["ADT", "A01"].join("^");
    const answer: boolean = msg.is(computed);
    expect(answer).toBe(true);
    const missing: boolean = msg.is(["ZZZ", "Z99"].join("^"));
    expect(missing).toBe(false);
  });

  it("answers false for every published key when the message declares no usable type", () => {
    for (const raw of [NO_MESSAGE_TYPE, ADT_NO_TRIGGER]) {
      const msg = parseHL7(raw);
      for (const entry of SUPPORTED_OVERLAY_MESSAGES) {
        expect(msg.is(entry.key), `${entry.key} on a message with no usable type`).toBe(false);
      }
    }
  });

  it("matches a code-only key on message code alone, whatever MSH-9.2 carries", () => {
    // The registry keys ACK on the message code alone, because its MSH-9.2
    // carries the ACKNOWLEDGED message's trigger event. `is` follows it, the
    // same way `supportsBuilderMessage` does, including the acknowledgment
    // whose MSH-9 is the message code by itself: that message is an ACK, and
    // `msg.structure` already recognizes it as one.
    expect(parseHL7(ACK_A01).is("ACK")).toBe(true);
    expect(parseHL7(ACK_R01).is("ACK")).toBe(true);
    expect(parseHL7(ACK_CODE_ONLY).is("ACK")).toBe(true);
    expect(parseHL7(ACK_CODE_ONLY).structure.recognized).toBe(true);
    // A code-only key still keys on the code: another type never matches it.
    expect(parseHL7(ADT_A01).is("ACK")).toBe(false);
  });
});

describe("typed overlays: the narrowed view", () => {
  it("exposes the message code and trigger event at literal types", () => {
    const msg = parseHL7(ADT_A01);
    if (!msg.is("ADT^A01")) throw new Error("expected ADT^A01");

    const code: "ADT" = msg.meta.messageCode;
    const event: "A01" = msg.meta.triggerEvent;
    expect(code).toBe("ADT");
    expect(event).toBe("A01");

    // @ts-expect-error the narrowed message code is the literal "ADT"
    const wrongCode: "ORU" = msg.meta.messageCode;
    expect(wrongCode).toBe("ADT");
    // @ts-expect-error the narrowed trigger event is the literal "A01"
    const wrongEvent: "A02" = msg.meta.triggerEvent;
    expect(wrongEvent).toBe("A01");
    // @ts-expect-error comparing the narrowed trigger event to another literal cannot be true
    expect(msg.meta.triggerEvent === "A02").toBe(false);

    // Everything else on `meta` keeps the shape it had: narrowing the message
    // type says nothing about whether the sender populated MSH-10.
    const controlId: string | undefined = msg.meta.controlId;
    expect(controlId).toBe("MSG001");
  });

  it("keeps the base members callable, with their own wide types", () => {
    const msg = parseHL7(ADT_A01);
    if (!msg.is("ADT^A01")) throw new Error("expected ADT^A01");
    // The base accessor takes any name, so no caller is forced into a cast to
    // reach a segment outside the published required set.
    expect(msg.segments("OBX")).toEqual([]);
    expect(msg.getAll("NTE")).toEqual([]);
    expect(msg.get("PID.3")).toBe("1");
    expect(msg.allSegments()).toHaveLength(4);
    expect(msg.structure.recognized).toBe(true);
  });

  it("scopes part/parts to the pair's published required segments", () => {
    const msg = parseHL7(ADT_A01);
    if (!msg.is("ADT^A01")) throw new Error("expected ADT^A01");

    const pid: Segment | undefined = msg.part("PID");
    expect(pid?.type).toBe("PID");
    expect(pid).toBe(msg.segments("PID")[0]);
    expect(msg.parts("PV1")).toBe(msg.segments("PV1"));
    expect(msg.part("EVN")?.type).toBe("EVN");
    expect(msg.part("MSH")?.type).toBe("MSH");

    // @ts-expect-error OBX is not in the published required set for ADT^A01
    const outOfScope = msg.part("OBX");
    expect(outOfScope).toBeUndefined();
    // @ts-expect-error same rule for the plural accessor
    const outOfScopeAll = msg.parts("OBX");
    expect(outOfScopeAll).toEqual([]);
    // @ts-expect-error a segment name the published structure does not carry at all
    const unknownName = msg.part("ZZZ");
    expect(unknownName).toBeUndefined();
  });

  it("returns every occurrence from parts, in document order", () => {
    const msg = parseHL7(ORU_R01_TWO_OBR);
    if (!msg.is("ORU^R01")) throw new Error("expected ORU^R01");
    const obrs = msg.parts("OBR");
    expect(obrs).toHaveLength(2);
    expect(obrs[0]?.field(3).value).toBe("FILL1");
    expect(obrs[1]?.field(3).value).toBe("FILL2");
    expect(msg.part("OBR")).toBe(obrs[0]);
    expect(obrs).toBe(msg.segments("OBR"));
    // PID is not required for ORU^R01 (the published structure gives it a
    // minimum of zero at the top level), so it is out of scope for the
    // narrowed accessor even though this message carries one.
    // @ts-expect-error PID is not in the published required set for ORU^R01
    const pid = msg.part("PID");
    expect(pid?.type).toBe("PID");
    expect(msg.segments("PID")).toHaveLength(1);
  });

  it("scopes a code-only key to its own published required segments", () => {
    const msg = parseHL7(ACK_A01);
    if (!msg.is("ACK")) throw new Error("expected ACK");
    const code: "ACK" = msg.meta.messageCode;
    expect(code).toBe("ACK");
    // A code-only key constrains MSH-9.2 to nothing, so the trigger event keeps
    // its base type: it carries the ACKNOWLEDGED message's trigger event.
    const event: string | undefined = msg.meta.triggerEvent;
    expect(event).toBe("A01");
    expect(msg.part("MSA")?.field(1).value).toBe("AA");
    // @ts-expect-error PID is not in the published required set for ACK
    const pid = msg.part("PID");
    expect(pid).toBeUndefined();
  });
});

describe("typed overlays: a message missing a segment its structure requires", () => {
  it("still matches, reports the same warning, and never pretends the segment is there", () => {
    const msg = parseHL7(ADT_A01_NO_PID);

    const warningsBefore = JSON.stringify(msg.warnings);
    const missingBefore = [...msg.structure.missingSegments];

    expect(msg.is("ADT^A01")).toBe(true);
    if (!msg.is("ADT^A01")) throw new Error("expected ADT^A01");

    // Possibly-absent, and typed that way: `Segment | undefined` for a segment
    // the published structure requires, exactly as for any other.
    const pid: Segment | undefined = msg.part("PID");
    expect(pid).toBeUndefined();
    expect(msg.parts("PID")).toEqual([]);
    // @ts-expect-error a required segment is never typed as guaranteed-present
    const guaranteed: Segment = msg.part("PID");
    expect(guaranteed).toBeUndefined();

    // The structural report is untouched by the overlay.
    expect(missingBefore).toEqual(["PID"]);
    expect([...msg.structure.missingSegments]).toEqual(missingBefore);
    expect(
      msg.warnings.filter((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP),
    ).toHaveLength(1);
    expect(
      msg.warnings.some(
        (w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP && w.message.includes("PID"),
      ),
    ).toBe(true);
    expect(JSON.stringify(msg.warnings)).toBe(warningsBefore);
  });
});

describe("typed overlays: the surface is read-only", () => {
  it("leaves segments, warnings and toString() byte-identical after any sequence of calls", () => {
    const msg = parseHL7(ORU_R01_TWO_OBR);

    const serializedBefore = msg.toString();
    const warningsBefore = JSON.stringify(msg.warnings);
    const jsonBefore = JSON.stringify(msg);
    const rawBefore = msg.rawSegments;
    const allBefore = msg.allSegments();

    for (let round = 0; round < 3; round++) {
      expect(msg.is("ORU^R01")).toBe(true);
      expect(msg.is("ADT^A01")).toBe(false);
      expect(msg.is("nonsense")).toBe(false);
      expect(msg.part("OBR")).toBeDefined();
      expect(msg.parts("MSH")).toHaveLength(1);
      expect(msg.parts("OBR")).toHaveLength(2);
      if (msg.is("ORU^R01")) {
        expect(msg.part("MSH")?.type).toBe("MSH");
        expect(msg.parts("OBR")).toHaveLength(2);
      }
    }

    expect(msg.toString()).toBe(serializedBefore);
    expect(JSON.stringify(msg.warnings)).toBe(warningsBefore);
    expect(JSON.stringify(msg)).toBe(jsonBefore);
    expect(msg.rawSegments).toBe(rawBefore);
    expect(msg.allSegments()).toBe(allBefore);
  });

  it("answers from the current tree after a mutation, without caching a stale verdict", () => {
    const msg = parseHL7(ADT_A01);
    expect(msg.is("ADT^A01")).toBe(true);
    expect(msg.part("PID")?.type).toBe("PID");
    msg.removeSegment("PID");
    expect(msg.is("ADT^A01")).toBe(true);
    expect(msg.part("PID")).toBeUndefined();
    msg.setField("MSH.9.2", "A02");
    expect(msg.is("ADT^A01")).toBe(false);
    expect(msg.is("ADT^A02")).toBe(true);
  });
});

describe("typed overlays: part/parts on an un-narrowed message", () => {
  it("take any segment name and mirror segments()", () => {
    const msg = parseHL7(ORU_R01_TWO_OBR);
    expect(msg.part("OBX")?.type).toBe("OBX");
    expect(msg.part("ZZZ")).toBeUndefined();
    expect(msg.parts("OBR")).toBe(msg.segments("OBR"));
    expect(msg.parts("ZZZ")).toEqual([]);
    // Case is folded on both sides, exactly as `segments` folds it.
    expect(msg.part("obr")).toBe(msg.part("OBR"));
  });
});
