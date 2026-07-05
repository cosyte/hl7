/**
 * Phase C — `buildAck` / `interpretAck` / `detectAckMode` coverage.
 *
 * Three concerns are exercised here:
 *
 * 1. **buildAck wire correctness** — sender/receiver swap, MSH-9 `ACK^…^ACK`,
 *    MSA-1 = the disposition told, MSA-2 echoes the inbound MSH-10, and ERR
 *    segments carry codes/locations only (Tables 0357/0516). Goldens normalize
 *    the two volatile MSH fields (MSH-7 timestamp, MSH-10 generated control id).
 * 2. **Fail-safe** — an inbound message with no MSH-10 cannot be correlated, so
 *    a requested positive `AA`/`CA` is downgraded to `AE`/`CE`, MSA-2 is empty,
 *    and an `ACK_NO_CORRELATION_ID` warning rides on the returned message.
 * 3. **interpretAck read-side** — the typed view of an inbound ACK, with the
 *    accept/error/reject disposition derived fail-safe from MSA-1.
 *
 * The corpus is synthetic — no PHI. ERR locations are structural paths
 * (`PID^1^5`), never data values.
 */

import { describe, expect, it } from "vitest";

import {
  buildAck,
  detectAckMode,
  downgradePositiveAck,
  dtmToDate,
  interpretAck,
  parseHL7,
} from "../src/index.js";

/** A minimal, well-formed inbound ADT^A01 with a correlatable MSH-10. */
const INBOUND = "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|MSG00001|P|2.5";

/** Same shape but in enhanced mode (MSH-15 = AL, MSH-16 = AL). */
const INBOUND_ENHANCED =
  "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|MSG00002|P|2.5|||AL|AL";

/** Inbound with no MSH-10 control id — the fail-safe trigger. */
const INBOUND_NO_CONTROL_ID =
  "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01||P|2.5";

/**
 * Replace the two volatile MSH fields (MSH-7 timestamp, MSH-10 control id) with
 * stable placeholders so a built ACK can be asserted against a golden string.
 */
function normalizeAck(wire: string): string {
  return wire
    .split("\r")
    .map((line) => {
      if (!line.startsWith("MSH")) return line;
      const parts = line.split("|");
      parts[6] = "<TS>"; // MSH-7
      parts[9] = "<CID>"; // MSH-10
      return parts.join("|");
    })
    .join("\r");
}

describe("buildAck — MSH construction", () => {
  it("swaps sender/receiver addressing (inbound 5/6 → ack 3/4, inbound 3/4 → ack 5/6)", () => {
    const ack = buildAck(parseHL7(INBOUND), { code: "AA" });
    expect(ack.meta.sendingApp).toBe("RECVAPP");
    expect(ack.meta.sendingFacility).toBe("RECVFAC");
    expect(ack.meta.receivingApp).toBe("SENDAPP");
    expect(ack.meta.receivingFacility).toBe("SENDFAC");
  });

  it("sets MSH-9 to ACK^<trigger>^ACK echoing the inbound trigger event", () => {
    const ack = buildAck(parseHL7(INBOUND), { code: "AA" });
    expect(ack.meta.type).toBe("ACK^A01^ACK");
    expect(ack.meta.messageCode).toBe("ACK");
    expect(ack.meta.triggerEvent).toBe("A01");
  });

  it("emits bare ACK in MSH-9 when the inbound carries no trigger event", () => {
    const noTrigger = "MSH|^~\\&|S|SF|R|RF|20260101120000||ADT|MSGX|P|2.5";
    const ack = buildAck(parseHL7(noTrigger), { code: "AA" });
    expect(ack.meta.messageCode).toBe("ACK");
    expect(ack.meta.triggerEvent).toBeUndefined();
  });

  it("generates a fresh MSH-10 (not the inbound control id) and a current MSH-7", () => {
    const ack = buildAck(parseHL7(INBOUND), { code: "AA" });
    expect(ack.meta.controlId).toMatch(/^[0-9]{17}[A-Za-z0-9]{6}$/);
    expect(ack.meta.controlId).not.toBe("MSG00001");
    // buildAck emits MSH-7 as UTC second-precision (no offset); read it back
    // by explicitly assuming UTC — the value it was written in.
    const ts = ack.meta.timestamp;
    const instant =
      ts === undefined ? 0 : (dtmToDate(ts, { assumeOffsetMinutes: 0 })?.getTime() ?? 0);
    expect(Date.now() - instant).toBeLessThan(5000);
  });

  it("echoes inbound processingId and version", () => {
    const ack = buildAck(parseHL7(INBOUND), { code: "AA" });
    expect(ack.meta.processingId).toBe("P");
    expect(ack.meta.version).toBe("2.5");
  });

  it("preserves multi-component addressing HDs (namespace^universalId^type) across the swap", () => {
    const inbound =
      "MSH|^~\\&|SENDAPP^1.2.3^ISO|SENDFAC^9.9^ISO|RECVAPP^4.5.6^ISO|RECVFAC^8.8^ISO|20260101120000||ADT^A01|MSGHD|P|2.5";
    const ack = buildAck(parseHL7(inbound), { code: "AA" });
    // Full HD survives: ACK MSH-3 = inbound MSH-5 (the receiver becomes sender).
    expect(ack.get("MSH.3")).toBe("RECVAPP");
    const ackMsh = ack.segments("MSH")[0];
    const msh3Components = ackMsh
      ?.field(3)
      .repetitions[0]?.components.map((c) => c.subcomponents[0]);
    expect(msh3Components).toEqual(["RECVAPP", "4.5.6", "ISO"]);
    const msh5Components = ackMsh
      ?.field(5)
      .repetitions[0]?.components.map((c) => c.subcomponents[0]);
    expect(msh5Components).toEqual(["SENDAPP", "1.2.3", "ISO"]);
  });

  it("falls back to default version/processingId and empty addressing when the inbound omits them", () => {
    // Sparse inbound: addressing + version + processingId all absent, but a
    // correlatable MSH-10 is present so the fail-safe stays out of the way.
    const sparse = "MSH|^~\\&|||||20260101120000||ADT^A01|MSGSPARSE";
    const ack = buildAck(parseHL7(sparse), { code: "AA" });
    expect(ack.meta.version).toBe("2.5");
    expect(ack.meta.processingId).toBe("P");
    expect(ack.meta.sendingApp).toBeUndefined();
    expect(ack.meta.receivingApp).toBeUndefined();
    expect(ack.get("MSA.2")).toBe("MSGSPARSE");
  });
});

describe("buildAck — MSA construction", () => {
  it("MSA-1 is the disposition told; MSA-2 echoes the inbound MSH-10", () => {
    const ack = buildAck(parseHL7(INBOUND), { code: "AA" });
    expect(ack.get("MSA.1")).toBe("AA");
    expect(ack.get("MSA.2")).toBe("MSG00001");
  });

  it("emits the exact disposition code it is told (AR, no second-guessing)", () => {
    const ack = buildAck(parseHL7(INBOUND), { code: "AR" });
    expect(ack.get("MSA.1")).toBe("AR");
    expect(ack.get("MSA.2")).toBe("MSG00001");
  });

  it("golden: a bare AA accept normalizes to the expected wire", () => {
    const ack = buildAck(parseHL7(INBOUND), { code: "AA" });
    expect(normalizeAck(ack.toString())).toBe(
      "MSH|^~\\&|RECVAPP|RECVFAC|SENDAPP|SENDFAC|<TS>||ACK^A01^ACK|<CID>|P|2.5\r" +
        "MSA|AA|MSG00001\r",
    );
  });
});

describe("buildAck — ERR segments", () => {
  it("emits one ERR with location (ERR-2), CWE condition (ERR-3), severity (ERR-4)", () => {
    const ack = buildAck(parseHL7(INBOUND), {
      code: "AE",
      error: { conditionCode: "101", severity: "E", location: "PID^1^5" },
    });
    const round = parseHL7(ack.toString());
    const err = round.allSegments().find((s) => s.type === "ERR");
    expect(err).toBeDefined();
    // ERR-2 ERL components → ["PID", "1", "5"].
    expect(err?.field(2).repetitions[0]?.components.map((c) => c.subcomponents[0])).toEqual([
      "PID",
      "1",
      "5",
    ]);
    // ERR-3 CWE: identifier ^ text ^ name-of-coding-system.
    const cwe = err?.field(3).asCwe();
    expect(cwe?.identifier).toBe("101");
    expect(cwe?.text).toBe("Required field missing");
    expect(cwe?.nameOfCodingSystem).toBe("HL70357");
    expect(err?.field(4).value).toBe("E");
  });

  it("defaults condition code to 207 and severity to E when omitted", () => {
    const ack = buildAck(parseHL7(INBOUND), { code: "AE", error: {} });
    const err = parseHL7(ack.toString())
      .allSegments()
      .find((s) => s.type === "ERR");
    expect(err?.field(3).asCwe().identifier).toBe("207");
    expect(err?.field(3).asCwe().text).toBe("Application internal error");
    expect(err?.field(4).value).toBe("E");
  });

  it("preserves an unknown condition code verbatim with empty display text", () => {
    const ack = buildAck(parseHL7(INBOUND), {
      code: "AE",
      error: { conditionCode: "999" },
    });
    const err = parseHL7(ack.toString())
      .allSegments()
      .find((s) => s.type === "ERR");
    expect(err?.field(3).asCwe().identifier).toBe("999");
    expect(err?.field(3).asCwe().text).toBeUndefined();
  });

  it("emits one ERR segment per supplied detail (array form)", () => {
    const ack = buildAck(parseHL7(INBOUND), {
      code: "AR",
      error: [
        { conditionCode: "200", severity: "E" },
        { conditionCode: "203", severity: "W", location: "MSH^1^12" },
      ],
    });
    const errs = parseHL7(ack.toString())
      .allSegments()
      .filter((s) => s.type === "ERR");
    expect(errs).toHaveLength(2);
    expect(errs[0]?.field(3).asCwe().identifier).toBe("200");
    expect(errs[1]?.field(3).asCwe().identifier).toBe("203");
    // ERR-2 is an ERL composite — its components are the structural path parts.
    const erl = errs[1]?.field(2).repetitions[0]?.components.map((c) => c.subcomponents[0]);
    expect(erl).toEqual(["MSH", "1", "12"]);
  });

  it("golden: AE with a single ERR normalizes to the expected wire", () => {
    const ack = buildAck(parseHL7(INBOUND), {
      code: "AE",
      error: { conditionCode: "101", severity: "E", location: "PID^1^5" },
    });
    expect(normalizeAck(ack.toString())).toBe(
      "MSH|^~\\&|RECVAPP|RECVFAC|SENDAPP|SENDFAC|<TS>||ACK^A01^ACK|<CID>|P|2.5\r" +
        "MSA|AE|MSG00001\r" +
        "ERR||PID^1^5|101^Required field missing^HL70357|E\r",
    );
  });
});

describe("buildAck — round-trip + cleanliness", () => {
  it("a built ACK re-parses with zero warnings (when correlated)", () => {
    const ack = buildAck(parseHL7(INBOUND), { code: "AA" });
    const round = parseHL7(ack.toString());
    expect(round.warnings).toEqual([]);
    expect(round.meta.messageCode).toBe("ACK");
  });

  it("is idempotent under re-serialization", () => {
    const ack = buildAck(parseHL7(INBOUND), {
      code: "AE",
      error: { conditionCode: "101", location: "PID^1^5" },
    });
    const once = ack.toString();
    const twice = parseHL7(once).toString();
    expect(twice).toBe(once);
  });
});

describe("buildAck — fail-safe (no inbound MSH-10)", () => {
  it("downgrades AA → AE and leaves MSA-2 empty when no correlation id", () => {
    const ack = buildAck(parseHL7(INBOUND_NO_CONTROL_ID), { code: "AA" });
    expect(ack.get("MSA.1")).toBe("AE");
    expect(ack.get("MSA.2")).toBeUndefined();
  });

  it("downgrades CA → CE under the same condition", () => {
    const ack = buildAck(parseHL7(INBOUND_NO_CONTROL_ID), { code: "CA" });
    expect(ack.get("MSA.1")).toBe("CE");
  });

  it("attaches an ACK_NO_CORRELATION_ID warning to the returned message", () => {
    const ack = buildAck(parseHL7(INBOUND_NO_CONTROL_ID), { code: "AA" });
    expect(ack.warnings.map((w) => w.code)).toContain("ACK_NO_CORRELATION_ID");
  });

  it("does NOT downgrade an already-negative disposition (AR stays AR)", () => {
    const ack = buildAck(parseHL7(INBOUND_NO_CONTROL_ID), { code: "AR" });
    expect(ack.get("MSA.1")).toBe("AR");
  });

  it("never throws on a correlatable inbound (no spurious warning)", () => {
    const ack = buildAck(parseHL7(INBOUND), { code: "AA" });
    expect(ack.warnings.map((w) => w.code)).not.toContain("ACK_NO_CORRELATION_ID");
  });
});

describe("buildAck — programming-error guards", () => {
  it("throws TypeError when inbound is not an Hl7Message", () => {
    const notAMessage = {} as unknown as ReturnType<typeof parseHL7>;
    expect(() => buildAck(notAMessage, { code: "AA" })).toThrow(TypeError);
  });

  it("throws TypeError on an unknown acknowledgment code", () => {
    expect(() => buildAck(parseHL7(INBOUND), { code: "ZZ" as unknown as "AA" })).toThrow(TypeError);
  });
});

describe("detectAckMode", () => {
  it("returns 'original' when both MSH-15 and MSH-16 are absent", () => {
    expect(detectAckMode(parseHL7(INBOUND))).toBe("original");
  });

  it("returns 'enhanced' when MSH-15/16 are present", () => {
    expect(detectAckMode(parseHL7(INBOUND_ENHANCED))).toBe("enhanced");
  });

  it("buildAck emits the told code verbatim regardless of mode (enhanced CA)", () => {
    const ack = buildAck(parseHL7(INBOUND_ENHANCED), { code: "CA" });
    expect(ack.get("MSA.1")).toBe("CA");
    expect(ack.get("MSA.2")).toBe("MSG00002");
  });
});

describe("interpretAck — read-side", () => {
  it("reads a positive AA: accepted, controlId, no errors", () => {
    const view = interpretAck(
      parseHL7("MSH|^~\\&|S|SF|R|RF|20260101120000||ACK^A01^ACK|A1|P|2.5\rMSA|AA|MSG001"),
    );
    expect(view.accepted).toBe(true);
    expect(view.error).toBe(false);
    expect(view.rejected).toBe(false);
    expect(view.code).toBe("AA");
    expect(view.controlId).toBe("MSG001");
    expect(view.errors).toEqual([]);
  });

  it("reads an error AE with one ERR entry", () => {
    const raw =
      "MSH|^~\\&|S|SF|R|RF|20260101120000||ACK^A01^ACK|A2|P|2.5\r" +
      "MSA|AE|MSG002\r" +
      "ERR||PID^1^5|101^Required field missing^HL70357|E";
    const view = interpretAck(parseHL7(raw));
    expect(view.error).toBe(true);
    expect(view.accepted).toBe(false);
    expect(view.errors).toHaveLength(1);
    expect(view.errors[0]?.conditionCode).toBe("101");
    expect(view.errors[0]?.conditionText).toBe("Required field missing");
    expect(view.errors[0]?.conditionCodeSystem).toBe("HL70357");
    expect(view.errors[0]?.severity).toBe("E");
    expect(view.errors[0]?.location).toBe("PID^1^5");
  });

  it("reads a reject AR", () => {
    const view = interpretAck(
      parseHL7("MSH|^~\\&|S|SF|R|RF|20260101120000||ACK^A01^ACK|A3|P|2.5\rMSA|AR|MSG003"),
    );
    expect(view.rejected).toBe(true);
    expect(view.accepted).toBe(false);
    expect(view.error).toBe(false);
  });

  it("is fail-safe: a message with no MSA yields all-false, empty errors", () => {
    const view = interpretAck(parseHL7("MSH|^~\\&|S|SF|R|RF|20260101120000||ADT^A01|X|P|2.5"));
    expect(view.accepted).toBe(false);
    expect(view.error).toBe(false);
    expect(view.rejected).toBe(false);
    expect(view.code).toBeUndefined();
    expect(view.errors).toEqual([]);
  });

  it("is fail-safe: an unrecognized MSA-1 is never reported as accepted", () => {
    const view = interpretAck(
      parseHL7("MSH|^~\\&|S|SF|R|RF|20260101120000||ACK^A01^ACK|A4|P|2.5\rMSA|ZZ|MSG004"),
    );
    expect(view.accepted).toBe(false);
    expect(view.code).toBe("ZZ");
  });

  it("omits controlId when MSA-2 is absent (code present, no correlation echoed)", () => {
    const view = interpretAck(
      parseHL7("MSH|^~\\&|S|SF|R|RF|20260101120000||ACK^A01^ACK|A5|P|2.5\rMSA|AE"),
    );
    expect(view.code).toBe("AE");
    expect(view.error).toBe(true);
    expect(view.controlId).toBeUndefined();
  });

  it("interprets a bare-condition ERR (code only — no text/system/location/severity)", () => {
    // ERR with only ERR-3.1 populated: ERR-1/ERR-2 empty, ERR-3 = "500".
    const raw =
      "MSH|^~\\&|S|SF|R|RF|20260101120000||ACK^A01^ACK|A6|P|2.5\r" +
      "MSA|AE|MSG006\r" +
      "ERR|||500";
    const view = interpretAck(parseHL7(raw));
    expect(view.errors).toHaveLength(1);
    expect(view.errors[0]?.conditionCode).toBe("500");
    expect(view.errors[0]?.conditionText).toBeUndefined();
    expect(view.errors[0]?.conditionCodeSystem).toBeUndefined();
    expect(view.errors[0]?.location).toBeUndefined();
    expect(view.errors[0]?.severity).toBeUndefined();
  });

  it("round-trips buildAck → interpretAck (AA echoes the inbound control id)", () => {
    const ack = buildAck(parseHL7(INBOUND), { code: "AA" });
    const view = interpretAck(parseHL7(ack.toString()));
    expect(view.accepted).toBe(true);
    expect(view.controlId).toBe("MSG00001");
  });
});

describe("buildAck — verbatim MSA-2 echo (vendor-quirk control ids)", () => {
  /** Inbound whose MSH-10 carries an unescaped component delimiter — a real vendor quirk. */
  const INBOUND_QUIRKY_CARET =
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|ID^X|P|2.5";

  it("echoes a delimiter-bearing MSH-10 into MSA-2 byte-for-byte (never truncates to component 1)", () => {
    const ack = buildAck(parseHL7(INBOUND_QUIRKY_CARET), { code: "AA" });
    const msaLine = ack
      .toString()
      .split("\r")
      .find((l) => l.startsWith("MSA"));
    expect(msaLine).toBe("MSA|AA|ID^X");
    expect(ack.warnings).toEqual([]);
  });

  it("echoes a subcomponent-delimiter id (A&B) verbatim", () => {
    const inbound = parseHL7(
      "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|A&B|P|2.5",
    );
    const ack = buildAck(inbound, { code: "AA" });
    const msaLine = ack
      .toString()
      .split("\r")
      .find((l) => l.startsWith("MSA"));
    expect(msaLine).toBe("MSA|AA|A&B");
  });

  it("echoes an escape-sequence id (A\\F\\B) verbatim without double-escaping", () => {
    const inbound = parseHL7(
      "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|A\\F\\B|P|2.5",
    );
    const ack = buildAck(inbound, { code: "AA" });
    const msaLine = ack
      .toString()
      .split("\r")
      .find((l) => l.startsWith("MSA"));
    expect(msaLine).toBe("MSA|AA|A\\F\\B");
  });

  it("a leading-delimiter id (^X) still correlates — no downgrade, verbatim echo", () => {
    const inbound = parseHL7(
      "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|^X|P|2.5",
    );
    const ack = buildAck(inbound, { code: "AA" });
    expect(ack.get("MSA.1")).toBe("AA"); // NOT downgraded — the field has content
    const msaLine = ack
      .toString()
      .split("\r")
      .find((l) => l.startsWith("MSA"));
    expect(msaLine).toBe("MSA|AA|^X");
    expect(ack.warnings).toEqual([]);
  });

  it("interpretAck surfaces a delimiter-bearing MSA-2 verbatim (read-side symmetry)", () => {
    const ack = buildAck(parseHL7(INBOUND_QUIRKY_CARET), { code: "AA" });
    const view = interpretAck(parseHL7(ack.toString()));
    expect(view.controlId).toBe("ID^X");
    expect(view.accepted).toBe(true);
  });

  it("Field.text exposes verbatim wire text where .value truncates to component 1", () => {
    const inbound = parseHL7(INBOUND_QUIRKY_CARET);
    const msh10 = inbound.segments("MSH")[0]?.field(10);
    expect(msh10?.value).toBe("ID");
    expect(msh10?.text).toBe("ID^X");
  });
});

describe("downgradePositiveAck — the single upstream downgrade primitive", () => {
  it("downgrades AA→AE and CA→CE; every other code passes through", () => {
    expect(downgradePositiveAck("AA")).toBe("AE");
    expect(downgradePositiveAck("CA")).toBe("CE");
    expect(downgradePositiveAck("AE")).toBe("AE");
    expect(downgradePositiveAck("AR")).toBe("AR");
    expect(downgradePositiveAck("CE")).toBe("CE");
    expect(downgradePositiveAck("CR")).toBe("CR");
  });
});

describe("buildAck — escape canonicalization limits (documented, pinned)", () => {
  const inboundWith = (controlId: string): string =>
    `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|${controlId}|P|2.5`;

  it("a hex-escaped CR in MSH-10 (\\X0D\\) NEVER corrupts the ACK's segment framing", () => {
    const ack = buildAck(parseHL7(inboundWith("A\\X0D\\B")), { code: "AA" });
    const wire = ack.toString();
    // Exactly MSH + MSA — no phantom segment split by a raw CR.
    const lines = wire.split("\r").filter((l) => l !== "");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("MSA|AA|A\\X0D\\B");
    // Round-trip stays structurally intact and re-parses as an ACK.
    const round = parseHL7(wire);
    expect(round.segments("MSA")).toHaveLength(1);
    expect(round.meta.messageCode).toBe("ACK");
  });

  it("hex escapes canonicalize on echo (\\X41\\ decodes to A) — documented, not silent structure loss", () => {
    const ack = buildAck(parseHL7(inboundWith("A\\X41\\B")), { code: "AA" });
    const msaLine = ack
      .toString()
      .split("\r")
      .find((l) => l.startsWith("MSA"));
    expect(msaLine).toBe("MSA|AA|AAB");
  });

  it("preserved escapes (\\H\\) re-emit as escaped literal text — lossless at the text level", () => {
    const ack = buildAck(parseHL7(inboundWith("A\\H\\B")), { code: "AA" });
    const msaLine = ack
      .toString()
      .split("\r")
      .find((l) => l.startsWith("MSA"));
    expect(msaLine).toBe("MSA|AA|A\\E\\H\\E\\B");
    // A conformant reader decodes that back to the same literal text the
    // decoded tree holds — the text round-trips even though the escape's
    // original byte form does not.
    const round = parseHL7(ack.toString());
    expect(round.segments("MSA")[0]?.field(2).value).toBe("A\\H\\B");
  });

  it("a custom-delimiter inbound is re-delimited spec-cleanly (ACK emits default encoding chars)", () => {
    // Sender declares $ as the component separator; ^ is plain data for them.
    const inbound = parseHL7(
      "MSH|$~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT$A01|ID$X|P|2.5",
    );
    const ack = buildAck(inbound, { code: "AA" });
    const msaLine = ack
      .toString()
      .split("\r")
      .find((l) => l.startsWith("MSA"));
    // The two-component structure survives; the ACK speaks default delimiters.
    expect(msaLine).toBe("MSA|AA|ID^X");
    expect(parseHL7(ack.toString()).warnings).toEqual([]);
  });
});

describe("interpretAck — explicit-null MSA-2 (foreign ACK)", () => {
  it('surfaces an explicit HL7 null MSA-2 as the literal two-character `""` (whole-field contract)', () => {
    const view = interpretAck(
      parseHL7('MSH|^~\\&|A|B|C|D|20260101120000||ACK^A01^ACK|X1|P|2.5\rMSA|AA|""'),
    );
    expect(view.controlId).toBe('""');
    expect(view.accepted).toBe(true);
  });
});
