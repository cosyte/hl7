/**
 * Result status classification: every observation carries its own OBX-11 read against HL7 Table
 * 0085, and every order its own OBR-25 read against HL7 Table 0123, each classified by HL7's
 * published v2-to-FHIR status map for that table. Every test names the acceptance criterion it
 * grades (AC-1 to AC-12; AC-7 is the property test in `test/property/result-status.property.test.ts`).
 *
 * All messages here are synthetic, built inline by the helpers below: no patient data, a
 * placeholder PID, and made-up order numbers and test codes.
 */

import { describe, expect, it } from "vitest";

import { parseHL7, type ResultStatusClassification } from "../src/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ORU^R01|1|P|2.5";
const PID = "PID|||X";

/** An OBX whose OBX-11 is `status` written on the wire exactly as given (OBX-3 is `id^Test^L`, OBX-4 `subId`). */
function obx(setId: number, status: string, id = "GLU", subId = ""): string {
  return [
    "OBX",
    String(setId),
    "ST",
    `${id}^Test^L`,
    subId,
    "text",
    "",
    "",
    "",
    "",
    "",
    status,
  ].join("|");
}

/** An OBR whose OBR-25 is `status` written on the wire exactly as given. */
function obr(setId: number, status: string): string {
  const fields = Array<string>(26).fill("");
  fields[0] = "OBR";
  fields[1] = String(setId);
  fields[2] = `PLACER${String(setId)}`;
  fields[3] = `FILLER${String(setId)}`;
  fields[4] = "GLU^Test^L";
  fields[25] = status;
  return fields.join("|");
}

function message(...segments: string[]): string {
  return [MSH, PID, ...segments].join("\r");
}

/** Parse with the default options, or with `trimFields` set when one is given. */
function parse(raw: string, trimFields?: boolean): ReturnType<typeof parseHL7> {
  return trimFields === undefined ? parseHL7(raw) : parseHL7(raw, { trimFields });
}

/** The classification of a lone OBX whose OBX-11 is `status` (default parse options). */
function observationStatus(status: string, trimFields?: boolean): ResultStatusClassification {
  const msg = parse(message(obr(1, "F"), obx(1, status)), trimFields);
  const obs = msg.observations();
  expect(obs).toHaveLength(1);
  const first = obs[0];
  if (first === undefined) throw new Error("no observation returned");
  return first.resultStatus;
}

/** The classification of a lone OBR whose OBR-25 is `status` (default parse options). */
function orderStatus(status: string, trimFields?: boolean): ResultStatusClassification {
  const msg = parse(message(obr(1, status), obx(1, "F")), trimFields);
  const orders = msg.orders();
  expect(orders).toHaveLength(1);
  const first = orders[0];
  if (first === undefined) throw new Error("no order returned");
  return first.resultStatus;
}

const OBSERVATION_MAP_URL =
  "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70085-to-observation-status";
const ORDER_MAP_URL =
  "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70123-queries-to-diagnostic-report-status";

// Table 0085 (OBX-11), all 15 codes of v3.0.0, one test each.
describe("OBX-11 against HL7 Table 0085", () => {
  it.each([
    ["D", "entered-in-error"],
    ["W", "entered-in-error"],
    ["X", "cancelled"],
  ])("AC-1: OBX-11 %s classifies as %s", (code, expected) => {
    expect(observationStatus(code).classification).toBe(expected);
  });

  it.each([
    ["F", "final"],
    ["C", "corrected"],
    ["A", "amended"],
    ["P", "preliminary"],
  ])("AC-2: OBX-11 %s classifies as %s", (code, expected) => {
    expect(observationStatus(code).classification).toBe(expected);
  });

  it.each(["B", "I", "N", "O", "R", "S", "V", "U"])(
    "AC-4: OBX-11 %s, left unmapped by HL7's map, classifies as undetermined",
    (code) => {
      expect(observationStatus(code).classification).toBe("undetermined");
    },
  );
});

// Table 0123 (OBR-25), all 13 codes of v3.0.0, one test each.
describe("OBR-25 against HL7 Table 0123", () => {
  it.each([
    ["O", "registered"],
    ["I", "registered"],
    ["S", "registered"],
    ["P", "preliminary"],
    ["C", "corrected"],
    ["R", "partial"],
    ["F", "final"],
    ["X", "cancelled"],
  ])("AC-3: OBR-25 %s classifies as %s", (code, expected) => {
    expect(orderStatus(code).classification).toBe(expected);
  });

  it.each(["A", "Y", "Z", "M", "N"])(
    "AC-4: OBR-25 %s, left unmapped by HL7's map, classifies as undetermined",
    (code) => {
      expect(orderStatus(code).classification).toBe("undetermined");
    },
  );
});

describe("AC-5: absent, empty, null and not-exactly-one-code values are undetermined", () => {
  const NOT_ONE_CODE: readonly (readonly [string, string])[] = [
    ["empty", ""],
    ["the HL7 explicit null", '""'],
    ["a lowercase letter", "f"],
    ["a code with leading whitespace", " F"],
    ["a code with trailing whitespace", "F "],
    ["a multi-character value", "FF"],
    ["a letter outside the table", "Q"],
    ["a code written as an escape sequence", "\\X46\\"],
    ["a code followed by an empty repetition", "F~"],
    ["a code after a VT byte", "\u000BF"],
    ["a code before an FS byte", "F\u001C"],
    ["a code between VT and FS bytes", "\u000BW\u001C"],
  ];

  it.each(NOT_ONE_CODE)("AC-5: OBX-11 %s (%j) is undetermined and still returned", (_, value) => {
    expect(() => observationStatus(value)).not.toThrow();
    expect(observationStatus(value).classification).toBe("undetermined");
  });

  it.each(NOT_ONE_CODE)("AC-5: OBR-25 %s (%j) is undetermined and still returned", (_, value) => {
    expect(() => orderStatus(value)).not.toThrow();
    expect(orderStatus(value).classification).toBe("undetermined");
  });

  it("AC-5: an absent OBX-11 (segment ends before it) is undetermined and still returned", () => {
    const msg = parseHL7(message(obr(1, "F"), "OBX|1|ST|GLU^Test^L||text"));
    expect(msg.observations()).toHaveLength(1);
    expect(msg.observations()[0]?.resultStatus.classification).toBe("undetermined");
  });

  it("AC-5: an absent OBR-25 (segment ends before it) is undetermined and still returned", () => {
    const msg = parseHL7(message("OBR|1|PLACER1|FILLER1|GLU^Test^L", obx(1, "F")));
    expect(msg.orders()).toHaveLength(1);
    expect(msg.orders()[0]?.resultStatus.classification).toBe("undetermined");
  });

  it("AC-5: whitespace around a code is undetermined with field trimming off as well", () => {
    expect(observationStatus(" F", false).classification).toBe("undetermined");
    expect(orderStatus("F ", false).classification).toBe("undetermined");
  });

  // The parser removes every VT and FS byte before it splits segments, so the field reads `F`
  // while the wire carried more. Only the byte's own field is undetermined; the MLLP block frame
  // around the whole message is not part of any field (AC-2, AC-3 below).
  it.each([
    ["CR", "\r"],
    ["LF", "\n"],
    ["CR LF", "\r\n"],
  ])(
    "AC-5, AC-2, AC-3: a VT or FS inside one status field of a framed message with %s breaks leaves the others exact",
    (_, br) => {
      const raw =
        "\u000B" +
        [
          MSH,
          PID,
          obr(1, "F\u001C"),
          obx(1, "F"),
          obx(2, "\u000BW"),
          obr(2, "R"),
          obx(1, "W"),
        ].join(br) +
        "\u001C\r";
      const msg = parseHL7(raw);
      expect(msg.orders().map((o) => o.resultStatus.classification)).toEqual([
        "undetermined",
        "partial",
      ]);
      expect(msg.observations().map((o) => o.resultStatus.classification)).toEqual([
        "final",
        "undetermined",
        "entered-in-error",
      ]);
      expect(msg.observations()[1]?.status).toBe("W");
    },
  );

  it("AC-5: a VT inside OBX-11 is undetermined with MLLP framing warnings off as well", () => {
    const msg = parseHL7(message(obr(1, "F"), obx(1, "F\u000B")), { stripMllpFraming: false });
    expect(msg.observations()[0]?.resultStatus.classification).toBe("undetermined");
    expect(msg.orders()[0]?.resultStatus.classification).toBe("final");
  });

  it("AC-2, AC-3: the MLLP block frame is not part of the last field of the message", () => {
    const framed = parseHL7("\u000B" + message(obr(1, "R"), obx(1, "F")) + "\u001C\r");
    expect(framed.observations()[0]?.resultStatus.classification).toBe("final");
    expect(framed.orders()[0]?.resultStatus.classification).toBe("partial");
    const noCr = parseHL7("\u000B" + message(obr(1, "R"), obx(1, "F")) + "\u001C");
    expect(noCr.observations()[0]?.resultStatus.classification).toBe("final");
  });

  it("AC-5: an FS ending a message with no VT start block is not a frame, so OBX-11 F\\x1C is undetermined", () => {
    expect(observationStatus("F\u001C").classification).toBe("undetermined");
    expect(
      parseHL7(message(obr(1, "F"), obx(1, "F")) + "\u001C\r").observations()[0]?.resultStatus
        .classification,
    ).toBe("undetermined");
  });

  // What a field arrived as stays with that field when other segments are added or removed.
  it("AC-5: an OBX-11 that arrived as ' F' stays undetermined after an unrelated segment is removed", () => {
    const msg = parseHL7(message("NTE|1||note", obr(1, "F"), obx(1, " F")));
    msg.removeSegment("NTE");
    expect(msg.observations()[0]?.resultStatus.classification).toBe("undetermined");
    expect(msg.orders()[0]?.resultStatus.classification).toBe("final");
  });

  it("AC-1: an exact OBX-11 W stays entered-in-error when a trimmed OBX before it is removed", () => {
    const msg = parseHL7(message(obr(1, "F"), obx(1, " F"), obx(2, "W")));
    msg.removeSegment("OBX", 0);
    expect(msg.observations()[0]?.resultStatus.classification).toBe("entered-in-error");
  });
});

describe("AC-6: more than one repetition, component or subcomponent is undetermined", () => {
  const STRUCTURED = ["F~W", "F^X", "F&X", "W~F", "C^F"];

  it.each(STRUCTURED)("AC-6: OBX-11 %s is undetermined", (value) => {
    expect(observationStatus(value).classification).toBe("undetermined");
  });

  it.each(STRUCTURED)("AC-6: OBR-25 %s is undetermined", (value) => {
    expect(orderStatus(value).classification).toBe("undetermined");
  });
});

describe("AC-8: the raw code rides beside the classification; status fields unchanged", () => {
  const VALUES = ["F", "W", "U", "f", "FF", "Q", "F~W", "F^X", "\\X46\\", " F", "", '""'];

  it.each(VALUES)("AC-8: OBX-11 %j: code is byte-identical to status", (value) => {
    const msg = parseHL7(message(obr(1, "F"), obx(1, value)));
    const obs = msg.observations()[0];
    const decoded = msg.segments("OBX")[0]?.field(11).value ?? "";
    // `status` is still the decoded OBX-11 value, and still omitted when that is empty.
    if (decoded === "") {
      expect(obs !== undefined && "status" in obs).toBe(false);
      expect(obs !== undefined && "code" in obs.resultStatus).toBe(false);
    } else {
      expect(obs?.status).toBe(decoded);
    }
    expect(obs?.resultStatus.code).toBe(obs?.status);
  });

  it.each(VALUES)("AC-8: OBR-25 %j: code is byte-identical to orderStatus", (value) => {
    const msg = parseHL7(message(obr(1, value), obx(1, "F")));
    const order = msg.orders()[0];
    const decoded = msg.segments("OBR")[0]?.field(25).value ?? "";
    if (decoded === "") {
      expect(order !== undefined && "orderStatus" in order).toBe(false);
      expect(order !== undefined && "code" in order.resultStatus).toBe(false);
    } else {
      expect(order?.orderStatus).toBe(decoded);
    }
    expect(order?.resultStatus.code).toBe(order?.orderStatus);
  });
});

describe("AC-9: each OBX and each order classifies from its own status alone", () => {
  it("AC-9: two OBX sharing OBX-3 and OBX-4 keep their own OBX-11 classifications", () => {
    const msg = parseHL7(
      message(
        obr(1, "F"),
        obx(1, "F", "GLU", "1"),
        obx(2, "W", "GLU", "1"),
        obx(3, "D", "GLU", "1"),
        obx(4, "X", "GLU", "1"),
        obx(5, "P", "GLU", "1"),
      ),
    );
    expect(msg.observations().map((o) => o.resultStatus.classification)).toEqual([
      "final",
      "entered-in-error",
      "entered-in-error",
      "cancelled",
      "preliminary",
    ]);
  });

  it("AC-9: OBR-25 F over an OBX-11 W: the order is final, the observation entered-in-error", () => {
    const order = parseHL7(message(obr(1, "F"), obx(1, "W"))).orders()[0];
    expect(order?.resultStatus.classification).toBe("final");
    expect(order?.observations[0]?.resultStatus.classification).toBe("entered-in-error");
  });

  it("AC-9: OBR-25 X over an OBX-11 F: the order is cancelled, the observation final", () => {
    const order = parseHL7(message(obr(1, "X"), obx(1, "F"))).orders()[0];
    expect(order?.resultStatus.classification).toBe("cancelled");
    expect(order?.observations[0]?.resultStatus.classification).toBe("final");
  });

  it("AC-9: an unmapped OBR-25 does not borrow a mapped OBX-11, nor the reverse", () => {
    const order = parseHL7(message(obr(1, "A"), obx(1, "F"), obr(2, "F"), obx(1, "V"))).orders();
    expect(order[0]?.resultStatus.classification).toBe("undetermined");
    expect(order[0]?.observations[0]?.resultStatus.classification).toBe("final");
    expect(order[1]?.resultStatus.classification).toBe("final");
    expect(order[1]?.observations[0]?.resultStatus.classification).toBe("undetermined");
  });
});

describe("AC-10: the table, its version and the map followed are named", () => {
  it.each(["F", "V", ""])("AC-10: an observation (OBX-11 %j) names Table 0085 and its map", (v) => {
    const { table, map } = observationStatus(v);
    expect(table).toEqual({ name: "HL7 Table 0085", version: "3.0.0" });
    expect(map).toEqual({ url: OBSERVATION_MAP_URL, version: "1.0.0" });
  });

  it.each(["F", "A", ""])("AC-10: an order (OBR-25 %j) names Table 0123 and its map", (v) => {
    const { table, map } = orderStatus(v);
    expect(table).toEqual({ name: "HL7 Table 0123", version: "3.0.0" });
    expect(map).toEqual({ url: ORDER_MAP_URL, version: "1.0.0" });
  });
});

describe("AC-11: every observation and order carries a classification, in both views", () => {
  const MIXED = message(
    obx(1, "P", "PRE"),
    obx(2, "W", "PRE"),
    obr(1, "R"),
    obx(1, "F"),
    obx(2, "D"),
    obr(2, "I"),
    obx(1, "Q"),
    obr(3, ""),
  );

  it("AC-11: msg.observations() classifies OBX both before any OBR and under one", () => {
    const all = parseHL7(MIXED).observations();
    expect(all).toHaveLength(5);
    expect(all.map((o) => o.resultStatus.classification)).toEqual([
      "preliminary",
      "entered-in-error",
      "final",
      "entered-in-error",
      "undetermined",
    ]);
  });

  it("AC-11: order.observations carry the same classification as msg.observations() for the same OBX", () => {
    const msg = parseHL7(MIXED);
    const all = msg.observations();
    const grouped = msg.orders().flatMap((o) => o.observations);
    // The two pre-OBR OBX are only in msg.observations(); the rest appear in both, in order.
    expect(grouped).toHaveLength(3);
    grouped.forEach((obs, i) => {
      expect(obs.resultStatus).toEqual(all[i + 2]?.resultStatus);
    });
  });

  it("AC-11: every order msg.orders() returns carries its own classification", () => {
    const orders = parseHL7(MIXED).orders();
    expect(orders.map((o) => o.resultStatus.classification)).toEqual([
      "partial",
      "registered",
      "undetermined",
    ]);
  });
});

/** Assert `value` and every object it nests are frozen. */
function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const inner of Object.values(value)) expectDeepFrozen(inner);
}

describe("AC-12: the classification is frozen, with everything it nests", () => {
  it.each(["F", "W", "V", "", "F~W"])(
    "AC-12: an observation's classification (OBX-11 %j) is deeply frozen",
    (v) => {
      const rs = observationStatus(v);
      expectDeepFrozen(rs);
      expect(Object.isFrozen(rs.table)).toBe(true);
      expect(Object.isFrozen(rs.map)).toBe(true);
    },
  );

  it.each(["F", "X", "A", "", "F^X"])(
    "AC-12: an order's classification (OBR-25 %j) is deeply frozen",
    (v) => {
      const rs = orderStatus(v);
      expectDeepFrozen(rs);
      expect(Object.isFrozen(rs.table)).toBe(true);
      expect(Object.isFrozen(rs.map)).toBe(true);
    },
  );

  it("AC-12: the classification on an order's grouped observation is deeply frozen", () => {
    const order = parseHL7(message(obr(1, "F"), obx(1, "C"))).orders()[0];
    expectDeepFrozen(order?.observations[0]?.resultStatus);
  });
});
