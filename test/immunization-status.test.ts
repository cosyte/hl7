/**
 * Immunization administration status: every entry `msg.immunizations()` returns carries its own
 * RXA-21, RXA-5 and RXA-20 read against HL7 Table 0323, the CDC CVX code 998 and HL7 Table 0322
 * (by HL7's Table 0322 to Event Status map), first rule first. Every test names the acceptance
 * criterion it grades (AC-1 to AC-12, AC-14, AC-15; AC-13 is the property test in
 * `test/property/immunization-status.property.test.ts`).
 *
 * Tiers: Tier 1 is one case per Table 0322 and Table 0323 code, the CVX 998 record and the CDC
 * record shapes; Tier 2 is the near-misses (AC-6 to AC-8); Tier 3 is the `buildVxu` round trip
 * (AC-14).
 *
 * All messages here are synthetic, built inline by the helpers below: no patient data, a
 * placeholder PID, and made-up vaccine lots and control ids.
 */

import { describe, expect, it } from "vitest";

import {
  buildVxu,
  parseHL7,
  type CWE,
  type Immunization,
  type ImmunizationAdministrationStatus,
  type ImmunizationStatusBasis,
  type ImmunizationStatusClass,
  type ImmunizationStatusCodeSet,
  type ImmunizationStatusMap,
  type ImmunizationStatusTable,
} from "../src/index.js";

const MSH = "MSH|^~\\&|APP|FAC|IIS|FAC|20260801||VXU^V04|1|P|2.5.1";
const PID = "PID|||X";

const TDAP = "115^Tdap^CVX";
const NO_VACCINE = "998^No vaccine administered^CVX";

interface RxaInit {
  /** RXA-5, written on the wire exactly as given. */
  readonly vaccine?: string;
  /** RXA-20, written on the wire exactly as given. */
  readonly status?: string;
  /** RXA-21, written on the wire exactly as given. */
  readonly action?: string;
  /** Any other RXA field, by its 1-based position. */
  readonly extra?: Readonly<Record<number, string>>;
}

/** An RXA through RXA-21 with each field written on the wire exactly as given. */
function rxa({ vaccine = TDAP, status = "", action = "", extra = {} }: RxaInit = {}): string {
  const fields = Array<string>(22).fill("");
  fields[0] = "RXA";
  fields[1] = "0";
  fields[2] = "1";
  fields[3] = "20260801";
  fields[5] = vaccine;
  fields[6] = "0.5";
  fields[7] = "mL^^UCUM";
  fields[20] = status;
  fields[21] = action;
  for (const [position, value] of Object.entries(extra)) fields[Number(position)] = value;
  return fields.join("|");
}

function message(...segments: string[]): string {
  return [MSH, PID, ...segments].join("\r");
}

/** Parse with the default options, or with `trimFields` set when one is given. */
function parse(raw: string, trimFields?: boolean): ReturnType<typeof parseHL7> {
  return trimFields === undefined ? parseHL7(raw) : parseHL7(raw, { trimFields });
}

/** The one immunization of a message holding the one RXA `init` describes. */
function entryOf(init: RxaInit, trimFields?: boolean): Immunization {
  const all = parse(message(rxa(init)), trimFields).immunizations();
  expect(all).toHaveLength(1);
  const first = all[0];
  if (first === undefined) throw new Error("no immunization returned");
  return first;
}

function statusOf(init: RxaInit, trimFields?: boolean): ImmunizationAdministrationStatus {
  return entryOf(init, trimFields).administrationStatus;
}

// AC-15: each value type is named from the package root.
const TABLE_0322 = {
  name: "HL7 Table 0322",
  version: "3.0.0",
} as const satisfies ImmunizationStatusTable;
const TABLE_0323 = {
  name: "HL7 Table 0323",
  version: "3.0.0",
} as const satisfies ImmunizationStatusTable;
const MAP_0322: ImmunizationStatusMap = {
  url: "http://hl7.org/fhir/uv/v2mappings/ConceptMap/table-hl70322-to-event-status",
  version: "1.0.0",
};
const CVX_998: ImmunizationStatusCodeSet = { name: "CDC CVX", code: "998", version: "2023-03-09" };

const BY_RXA_20: ImmunizationStatusBasis = { field: "RXA-20", table: TABLE_0322, map: MAP_0322 };
const BY_RXA_21: ImmunizationStatusBasis = { field: "RXA-21", table: TABLE_0323 };
const BY_RXA_5: ImmunizationStatusBasis = { field: "RXA-5", codeSet: CVX_998 };

/** The rule that decided, as the two parts that say so. */
function decision(
  status: ImmunizationAdministrationStatus,
): readonly [ImmunizationStatusClass, ImmunizationStatusBasis] {
  return [status.classification, status.decidedBy];
}

describe("Tier 1: RXA-20 against HL7 Table 0322, by the Table 0322 to Event Status map", () => {
  it.each([
    ["CP", "completed"],
    ["PA", "completed"],
    ["RE", "not-done"],
    ["NA", "not-done"],
  ] as const)("AC-1: RXA-20 %s classifies as %s, decided by RXA-20", (code, expected) => {
    expect(decision(statusOf({ status: code }))).toEqual([expected, BY_RXA_20]);
  });
});

describe("Tier 1: RXA-21 against HL7 Table 0323", () => {
  it("AC-3: RXA-21 D classifies as delete-requested and never as a dose", () => {
    const status = statusOf({ status: "CP", action: "D" });
    expect(decision(status)).toEqual(["delete-requested", BY_RXA_21]);
    expect(status.classification).not.toBe("completed");
  });

  const OTHER_FIELDS: readonly RxaInit[] = [
    { status: "CP" },
    { status: "PA" },
    { status: "RE" },
    { status: "NA" },
    { status: "" },
    { status: "XX" },
    { status: "CP", vaccine: NO_VACCINE },
    { status: "CP", vaccine: `${NO_VACCINE}^115^Tdap^CVX` },
  ];

  it.each(["A", "U", "X"])(
    "AC-6: RXA-21 %s classifies exactly as the same RXA with RXA-21 empty",
    (code) => {
      for (const init of OTHER_FIELDS) {
        const withCode = statusOf({ ...init, action: code });
        const empty = statusOf({ ...init, action: "" });
        expect(decision(withCode)).toEqual(decision(empty));
      }
    },
  );
});

describe("Tier 1: the CDC record shapes", () => {
  it("AC-1: a refusal, RXA-18 carrying the reason and RXA-20 RE, is not-done", () => {
    const status = statusOf({
      status: "RE",
      action: "A",
      extra: { 6: "999", 7: "", 18: "00^Parental decision^NIP002" },
    });
    expect(decision(status)).toEqual(["not-done", BY_RXA_20]);
  });

  it("AC-2: a CVX 998 record with RXA-20 NA is no-vaccine-administered", () => {
    const status = statusOf({
      vaccine: NO_VACCINE,
      status: "NA",
      action: "A",
      extra: { 6: "999", 7: "" },
    });
    expect(decision(status)).toEqual(["no-vaccine-administered", BY_RXA_5]);
  });

  it("AC-3: a D record is delete-requested", () => {
    expect(decision(statusOf({ status: "CP", action: "D" }))).toEqual([
      "delete-requested",
      BY_RXA_21,
    ]);
  });
});

describe("AC-2: RXA-5 carrying CVX 998", () => {
  it.each(["CP", "PA", "RE", "NA", "", "XX"])(
    "AC-2: CVX 998 with RXA-20 %j is no-vaccine-administered, decided by RXA-5",
    (code) => {
      expect(decision(statusOf({ vaccine: NO_VACCINE, status: code }))).toEqual([
        "no-vaccine-administered",
        BY_RXA_5,
      ]);
    },
  );

  it.each([
    ["the primary triplet naming no coding system", "998^No vaccine administered"],
    ["a CVX claim in lowercase, resolved by Table 0396 provenance", "998^No vaccine^cvx"],
    ["the alternate triplet coded CVX under an empty primary", "^^^998^No vaccine^CVX"],
    ["both triplets coded CVX 998", "998^No vaccine^CVX^998^No vaccine^CVX"],
  ])("AC-2: 998 in %s is no-vaccine-administered", (_, vaccine) => {
    expect(decision(statusOf({ vaccine, status: "CP" }))).toEqual([
      "no-vaccine-administered",
      BY_RXA_5,
    ]);
  });
});

describe("AC-4: RXA-20 empty or outside Table 0322", () => {
  it("AC-4: an absent RXA-20 (segment ends before it) is undetermined, never completed", () => {
    const all = parseHL7(message("RXA|0|1|20260801||115^Tdap^CVX|0.5|mL^^UCUM")).immunizations();
    expect(all).toHaveLength(1);
    expect(all[0] && decision(all[0].administrationStatus)).toEqual(["undetermined", BY_RXA_20]);
  });

  it.each([
    ["empty", ""],
    ["a code outside the table", "XX"],
    ["a Table 0323 code", "A"],
    ["a result status letter", "F"],
    ["a three-letter near-miss", "CPA"],
  ])("AC-4: RXA-20 %s (%j) is undetermined, never completed", (_, code) => {
    expect(decision(statusOf({ status: code }))).toEqual(["undetermined", BY_RXA_20]);
  });
});

describe("AC-5: exactly one rule decides, the first that applies", () => {
  it("AC-5: RXA-21 D over CVX 998: delete-requested", () => {
    expect(decision(statusOf({ vaccine: NO_VACCINE, status: "NA", action: "D" }))).toEqual([
      "delete-requested",
      BY_RXA_21,
    ]);
  });

  it("AC-5: RXA-21 D over RXA-20 CP: delete-requested", () => {
    expect(decision(statusOf({ status: "CP", action: "D" }))).toEqual([
      "delete-requested",
      BY_RXA_21,
    ]);
  });

  it("AC-5: RXA-21 D over an empty RXA-20: delete-requested", () => {
    expect(decision(statusOf({ status: "", action: "D" }))).toEqual([
      "delete-requested",
      BY_RXA_21,
    ]);
  });

  it("AC-5: RXA-21 D over a contradicted CVX 998: delete-requested", () => {
    const vaccine = `${NO_VACCINE}^115^Tdap^CVX`;
    expect(decision(statusOf({ vaccine, status: "CP", action: "D" }))).toEqual([
      "delete-requested",
      BY_RXA_21,
    ]);
  });

  it.each(["D~A", "D^X", "d"])(
    "AC-5: RXA-21 %j leads with a D but is not exactly D, so the RXA-21 table rule decides: undetermined",
    (action) => {
      expect(decision(statusOf({ status: "CP", action }))).toEqual(["undetermined", BY_RXA_21]);
    },
  );

  it("AC-5: an RXA-21 outside Table 0323 over CVX 998: undetermined, decided by RXA-21", () => {
    expect(decision(statusOf({ vaccine: NO_VACCINE, status: "NA", action: "Z" }))).toEqual([
      "undetermined",
      BY_RXA_21,
    ]);
  });

  it("AC-5: an RXA-21 outside Table 0323 over RXA-20 CP: undetermined, decided by RXA-21", () => {
    expect(decision(statusOf({ status: "CP", action: "Z" }))).toEqual(["undetermined", BY_RXA_21]);
  });

  it("AC-5: CVX 998 over RXA-20 CP: no-vaccine-administered", () => {
    expect(decision(statusOf({ vaccine: NO_VACCINE, status: "CP", action: "A" }))).toEqual([
      "no-vaccine-administered",
      BY_RXA_5,
    ]);
  });

  it("AC-5: a contradicted CVX 998 over RXA-20 CP: undetermined, decided by RXA-5", () => {
    const vaccine = `${NO_VACCINE}^115^Tdap^CVX`;
    expect(decision(statusOf({ vaccine, status: "CP", action: "A" }))).toEqual([
      "undetermined",
      BY_RXA_5,
    ]);
  });
});

describe("Tier 2, AC-6: RXA-21 present and outside Table 0323", () => {
  const OUTSIDE = ["d", "DEL", "Z", "D~A", "D^X"];
  const WHATEVER_ELSE: readonly RxaInit[] = [
    { status: "CP" },
    { status: "PA", vaccine: TDAP },
    { status: "NA", vaccine: NO_VACCINE },
    { status: "RE" },
    { status: "" },
  ];

  it.each(OUTSIDE)("AC-6: RXA-21 %j is undetermined whatever RXA-5 and RXA-20 say", (action) => {
    for (const init of WHATEVER_ELSE) {
      expect(decision(statusOf({ ...init, action }))).toEqual(["undetermined", BY_RXA_21]);
    }
  });
});

describe("Tier 2, AC-7: CVX 998 contradicted, or claimed by another coding system", () => {
  it.each([
    ["a primary CVX 998 beside a different alternate code", `${NO_VACCINE}^115^Tdap^CVX`],
    ["an alternate CVX 998 beside an NDC primary", "58160-0842-52^Tdap^NDC^998^None^CVX"],
    ["a primary 998 naming no system beside an alternate CVX code", "998^^^115^Tdap^CVX"],
    ["a primary CVX 998 beside an alternate identifier in a local system", "998^^CVX^X1^^L"],
  ])("AC-7: %s is undetermined", (_, vaccine) => {
    for (const status of ["CP", "NA"]) {
      expect(decision(statusOf({ vaccine, status }))).toEqual(["undetermined", BY_RXA_5]);
    }
  });

  it.each([
    ["an NDC claim", "998^x^NDC"],
    ["a local claim", "998^x^99LOCAL"],
    ["a Table 0396 system other than CVX", "998^x^MVX"],
    ["an alternate triplet naming no coding system", "115^Tdap^CVX^998^x"],
    ["an alternate triplet claiming NDC", "115^Tdap^CVX^998^x^NDC"],
  ])("AC-7: a 998 under %s is not CVX 998 and falls through to RXA-20", (_, vaccine) => {
    expect(decision(statusOf({ vaccine, status: "CP" }))).toEqual(["completed", BY_RXA_20]);
    expect(decision(statusOf({ vaccine, status: "RE" }))).toEqual(["not-done", BY_RXA_20]);
  });
});

describe("Tier 2, AC-8: a code that is not exactly one code as received is outside its table", () => {
  const NOT_ONE_CODE_20: readonly (readonly [string, string])[] = [
    ["lowercase", "cp"],
    ["whitespace the parser trimmed before it", " CP"],
    ["whitespace the parser trimmed after it", "PA "],
    ["repeated", "CP~RE"],
    ["followed by an empty repetition", "CP~"],
    ["componentized", "CP^X"],
    ["subcomponentized", "CP&X"],
    ["written as an escape sequence", "\\X43\\P"],
    ["the HL7 null", '""'],
    ["after a VT byte the parser removed", "\u000BCP"],
  ];

  it.each(NOT_ONE_CODE_20)(
    "AC-8, AC-4: RXA-20 %s (%j) is undetermined, never completed",
    (_, status) => {
      expect(decision(statusOf({ status }))).toEqual(["undetermined", BY_RXA_20]);
    },
  );

  it("AC-8, AC-4: whitespace around RXA-20 is undetermined with field trimming off as well", () => {
    expect(decision(statusOf({ status: " CP" }, false))).toEqual(["undetermined", BY_RXA_20]);
  });

  const NOT_ONE_CODE_21: readonly (readonly [string, string])[] = [
    ["lowercase", "d"],
    ["whitespace the parser trimmed before it", " D"],
    ["whitespace the parser trimmed after it", "D "],
    ["a deferring code with whitespace the parser trimmed", " A"],
    ["repeated", "D~"],
    ["componentized", "D^"],
    ["subcomponentized", "D&X"],
    ["written as an escape sequence", "\\X44\\"],
    ["the HL7 null", '""'],
    ["after a VT byte the parser removed", "\u000BD"],
    ["a VT byte alone", "\u000B"],
    ["whitespace alone", " "],
    ["a lone component separator", "^"],
    ["a lone repetition separator", "~"],
  ];

  it.each(NOT_ONE_CODE_21)(
    "AC-8, AC-6: RXA-21 %s (%j) is undetermined, never delete-requested or completed",
    (_, action) => {
      expect(decision(statusOf({ status: "CP", action }))).toEqual(["undetermined", BY_RXA_21]);
    },
  );
});

describe("AC-9: the raw codes ride beside the classification, with what decided it", () => {
  const STATUSES = ["CP", "RE", "cp", " CP", "CP~RE", "CP^X", "\\X43\\P", '""', ""];
  const ACTIONS = ["A", "D", "X", "", " D", "D~A", '""', "Z", "\\X44\\"];

  it.each(STATUSES)(
    "AC-9: with RXA-20 %j, completionStatus and actionCode are byte-identical to the entry's",
    (status) => {
      for (const action of ACTIONS) {
        const entry = entryOf({ status, action });
        const raw = entry.administrationStatus;
        expect(raw.completionStatus).toBe(entry.completionStatus);
        expect(raw.actionCode).toBe(entry.actionCode);
        expect("completionStatus" in raw).toBe("completionStatus" in entry);
        expect("actionCode" in raw).toBe("actionCode" in entry);
      }
    },
  );

  it("AC-9: the raw codes are the fields' decoded first values, omitted when those are empty", () => {
    const msg = parseHL7(message(rxa({ status: " CP", action: "\\X44\\" }), rxa({ status: '""' })));
    const [first, second] = msg.immunizations();
    expect(first?.administrationStatus.completionStatus).toBe(
      msg.segments("RXA")[0]?.field(20).value,
    );
    expect(first?.administrationStatus.completionStatus).toBe("CP");
    expect(first?.administrationStatus.actionCode).toBe("D");
    expect(first?.administrationStatus.classification).toBe("undetermined");
    expect(second !== undefined && "completionStatus" in second.administrationStatus).toBe(false);
    expect(second !== undefined && "actionCode" in second.administrationStatus).toBe(false);
  });

  it.each([
    ["RXA-20 with Table 0322 and its map", { status: "CP" }, BY_RXA_20],
    ["RXA-21 with Table 0323", { status: "CP", action: "D" }, BY_RXA_21],
    ["RXA-5 with the CDC CVX code set", { vaccine: NO_VACCINE, status: "CP" }, BY_RXA_5],
  ] as const)("AC-9: a record decided by %s names exactly that", (_, init, basis) => {
    expect(statusOf(init).decidedBy).toEqual(basis);
  });
});

/** Assert `value` and every object it nests are frozen. */
function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const inner of Object.values(value)) expectDeepFrozen(inner);
}

describe("AC-10: every entry carries it, nothing throws, and it is frozen", () => {
  it.each([
    ["a bare RXA", "RXA"],
    ["an RXA of 21 empty fields", `RXA${"|".repeat(21)}`],
  ])("AC-10: %s still carries an undetermined classification", (_, segment) => {
    const all = parseHL7(message(segment)).immunizations();
    expect(all).toHaveLength(1);
    const status = all[0]?.administrationStatus;
    expect(status).toEqual({ classification: "undetermined", decidedBy: BY_RXA_20 });
  });

  const ADVERSARIAL = [
    `RXA${"|~".repeat(21)}`,
    `RXA${'|""'.repeat(21)}`,
    `RXA${"|^&~".repeat(21)}`,
    `RXA${"|\\".repeat(21)}`,
    rxa({ vaccine: "^^^^^^^^^", status: "&&&", action: "~^&" }),
    rxa({ vaccine: "998&998^&CVX^998&x^^CVX&y", status: "CP&", action: "D&" }),
    rxa({ vaccine: `${NO_VACCINE}~${TDAP}`, status: "\\X0\\", action: "\\Zbad\\" }),
    rxa({ vaccine: "\u000B998^x^CVX", status: "C\u001CP", action: "\u000B" }),
  ];

  it.each(ADVERSARIAL)("AC-10: never throws, and classifies, on %j", (segment) => {
    expect(() => parseHL7(message(segment)).immunizations()).not.toThrow();
    const all = parseHL7(message(segment)).immunizations();
    expect(all).toHaveLength(1);
    expect(all[0]?.administrationStatus.classification).toBeDefined();
    expect(all[0]?.administrationStatus.classification).not.toBe("completed");
  });

  it("AC-10: the list, each entry and each classification are frozen, with everything nested", () => {
    const all = parseHL7(
      message(
        rxa({ status: "CP" }),
        rxa({ status: "CP", action: "D" }),
        rxa({ vaccine: NO_VACCINE }),
        rxa({ status: "cp" }),
      ),
    ).immunizations();
    expect(Object.isFrozen(all)).toBe(true);
    expect(all).toHaveLength(4);
    for (const entry of all) {
      expect(Object.isFrozen(entry)).toBe(true);
      expectDeepFrozen(entry.administrationStatus);
    }
  });
});

describe("AC-11: every record is still returned, in order, with its other keys unchanged", () => {
  it("AC-11: a CP dose followed by a D record for the same vaccine returns two entries, the first still completed", () => {
    const all = parseHL7(
      message(rxa({ status: "CP", action: "A" }), rxa({ status: "CP", action: "D" })),
    ).immunizations();
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.administrationStatus.classification)).toEqual([
      "completed",
      "delete-requested",
    ]);
    expect(all.map((e) => [e.vaccineCode?.identifier, e.completionStatus, e.actionCode])).toEqual([
      ["115", "CP", "A"],
      ["115", "CP", "D"],
    ]);
  });

  it("AC-11: delete-requested, no-vaccine-administered, not-done and undetermined records are all returned in document order", () => {
    const refusal: CWE = {
      identifier: "00",
      text: "Parental decision",
      nameOfCodingSystem: "NIP002",
    };
    const all = parseHL7(
      message(
        rxa({ status: "CP", action: "D" }),
        rxa({ vaccine: NO_VACCINE, status: "NA" }),
        rxa({ status: "RE", extra: { 18: "00^Parental decision^NIP002" } }),
        rxa({ status: "cp" }),
        rxa({ status: "PA", action: "U" }),
      ),
    ).immunizations();
    expect(all.map((e) => e.administrationStatus.classification)).toEqual([
      "delete-requested",
      "no-vaccine-administered",
      "not-done",
      "undetermined",
      "completed",
    ]);
    expect(all.map((e) => e.vaccineCode?.identifier)).toEqual(["115", "998", "115", "115", "115"]);
    expect(all.map((e) => e.completionStatus)).toEqual(["CP", "NA", "RE", "cp", "PA"]);
    expect(all.map((e) => e.actionCode)).toEqual(["D", undefined, undefined, undefined, "U"]);
    expect(all[2]?.refusalReason).toEqual(refusal);
    for (const entry of all) {
      expect(entry.doseAmount).toBe(0.5);
      expect(entry.routes).toEqual([]);
      expect(entry.observations).toEqual([]);
    }
  });
});

describe("AC-12: each RXA classifies from its own RXA-5, RXA-20 and RXA-21 only", () => {
  const NEIGHBOURS: readonly RxaInit[] = [
    { status: "CP", action: "A" },
    { status: "CP", action: "D" },
    { vaccine: NO_VACCINE, status: "NA" },
    { status: "CP" },
    { status: "cp" },
    { vaccine: `${NO_VACCINE}^115^Tdap^CVX`, status: "CP" },
    { status: "RE", action: "Z" },
    { status: "PA" },
  ];

  it("AC-12: in a message of mixed records, each classifies as it does alone", () => {
    const all = parseHL7(message(...NEIGHBOURS.map((init) => rxa(init)))).immunizations();
    expect(all.map((e) => e.administrationStatus.classification)).toEqual([
      "completed",
      "delete-requested",
      "no-vaccine-administered",
      "completed",
      "undetermined",
      "undetermined",
      "undetermined",
      "completed",
    ]);
    NEIGHBOURS.forEach((init, i) => {
      expect(all[i]?.administrationStatus).toEqual(statusOf(init));
    });
  });

  it("AC-12: a D record before a dose and a 998 record after it leave the dose completed", () => {
    const all = parseHL7(
      message(
        rxa({ status: "CP", action: "D" }),
        rxa({ status: "CP" }),
        rxa({ vaccine: NO_VACCINE, status: "CP" }),
      ),
    ).immunizations();
    expect(all[1]?.administrationStatus.classification).toBe("completed");
    expect(all[1]?.administrationStatus.decidedBy).toEqual(BY_RXA_20);
  });
});

describe("Tier 3, AC-14: a buildVxu round trip classifies as the same RXA written by hand", () => {
  const VACCINES: readonly (readonly [string, CWE])[] = [
    [TDAP, { identifier: "115", text: "Tdap", nameOfCodingSystem: "CVX" }],
    [NO_VACCINE, { identifier: "998", text: "No vaccine administered", nameOfCodingSystem: "CVX" }],
  ];

  const CASES = ["CP", "RE", "NA", "PA"].flatMap((status) =>
    ["A", "D", "U", "X"].flatMap((action) =>
      VACCINES.map(([wire, vaccineCode]) => [status, action, wire, vaccineCode] as const),
    ),
  );

  it.each(CASES)(
    "AC-14: completionStatus %s, actionCode %s, vaccine %s",
    (status, action, wire, vaccineCode) => {
      const built = buildVxu({
        sendingApp: "APP",
        receivingApp: "IIS",
        controlId: "CTRL1",
        timestamp: "20260801101500",
        patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
        immunizations: [
          {
            administeredDateTime: "20260801",
            vaccineCode,
            completionStatus: status,
            actionCode: action,
          },
        ],
      });
      const round = parseHL7(built.toString());
      expect(round.warnings).toEqual([]);
      const fromBuilder = round.immunizations()[0]?.administrationStatus;

      const byHand = parseHL7(
        message(`RXA|||20260801||${wire}${"|".repeat(15)}${status}|${action}`),
      ).immunizations()[0]?.administrationStatus;

      expect(fromBuilder).toEqual(byHand);
      const expected: ImmunizationStatusClass =
        action === "D"
          ? "delete-requested"
          : vaccineCode.identifier === "998"
            ? "no-vaccine-administered"
            : status === "CP" || status === "PA"
              ? "completed"
              : "not-done";
      expect(fromBuilder?.classification).toBe(expected);
    },
  );
});
