/**
 * Roadmap Phase K — `identityEvents()` patient-identity / merge events.
 *
 * Safety-critical invariants under test:
 * - Role labelling: a `surviving` / `subject` / `linked` party is ONLY ever
 *   sourced from PID (+PV1); a `prior` party is ONLY ever sourced from MRG.
 * - Direction is the spec constant `MRG_TO_PID` on merge/move events —
 *   surfaced even when a side is missing, never inferred, never reversed.
 * - Fail-safe: an incomplete MRG→PID pair surfaces what is present plus a
 *   `MERGE_MISSING_PRIOR_OR_SURVIVOR` warning; the MRG is NEVER dropped
 *   (orphaned MRG yields its own event).
 * - Version gate: the withdrawn-as-of-v2.7 legacy fields (PID-2 / MRG-4) are
 *   not read on a v2.7+ message (MSH-12).
 * - PHI: warning messages carry structural facts only — never an identifier
 *   or name value.
 * - Helper never throws; all views deeply frozen; `msg.warnings` untouched.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { IdentityEvent, IdentityEventKind } from "../src/index.js";
import { parseHL7, WARNING_CODES } from "../src/index.js";

import { assertStructuralRoundTrip } from "./_helpers/structural-equivalence.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "canonical",
);

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, `${name}.hl7`), "utf8");
}

/** Build a minimal identity-family message from segment lines. */
function raw(...segments: string[]): string {
  return segments.join("\r");
}

const MSH_A40 = "MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT^A40^ADT_A39|MSGT01|P|2.5";

describe("Phase K: trigger-event recognition", () => {
  const cases: readonly (readonly [string, IdentityEventKind])[] = [
    ["A18", "merge"],
    ["A34", "merge"],
    ["A35", "merge"],
    ["A36", "merge"],
    ["A39", "merge"],
    ["A40", "merge"],
    ["A41", "merge"],
    ["A42", "merge"],
    ["A43", "move"],
    ["A44", "move"],
    ["A24", "link"],
    ["A37", "unlink"],
    ["A28", "add"],
    ["A31", "update"],
  ];

  for (const [trigger, kind] of cases) {
    it(`recognizes ${trigger} as kind "${kind}"`, () => {
      const msg = parseHL7(
        raw(
          `MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT^${trigger}|MSGT02|P|2.5`,
          "PID|1||MRN70001^^^HOSP^MR||Trigtest^Case",
          "MRG|MRN70002^^^HOSP^MR",
        ),
      );
      const events = msg.identityEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]?.kind).toBe(kind);
      expect(events[0]?.eventType).toBe(trigger);
    });
  }

  it("returns [] for a non-identity trigger (A01)", () => {
    expect(parseHL7(loadFixture("adt-a01")).identityEvents()).toEqual([]);
  });

  it("returns [] for a message with no trigger event at all", () => {
    const msg = parseHL7(
      raw("MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT|MSGT03|P|2.5", "PID|1"),
    );
    expect(msg.identityEvents()).toEqual([]);
  });

  it("falls back to EVN-1 when MSH-9.2 is absent", () => {
    const msg = parseHL7(
      raw(
        "MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT|MSGT04|P|2.5",
        "EVN|A40|20260704080000",
        "PID|1||MRN70003^^^HOSP^MR||Evntest^Fallback",
        "MRG|MRN70004^^^HOSP^MR",
      ),
    );
    const [ev] = msg.identityEvents();
    expect(ev?.eventType).toBe("A40");
    expect(ev?.kind).toBe("merge");
  });

  it("normalizes a lowercase trigger (lenient parse)", () => {
    const msg = parseHL7(
      raw(
        "MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT^a40|MSGT05|P|2.5",
        "PID|1||MRN70005^^^HOSP^MR",
        "MRG|MRN70006^^^HOSP^MR",
      ),
    );
    expect(msg.identityEvents()[0]?.eventType).toBe("A40");
  });
});

describe("Phase K: A40 merge — canonical fixture (adt-a40-merge.hl7)", () => {
  const msg = parseHL7(loadFixture("adt-a40-merge"));
  const events = msg.identityEvents();

  it("yields exactly one merge event with the spec-constant direction", () => {
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("merge");
    expect(events[0]?.direction).toBe("MRG_TO_PID");
    expect(events[0]?.warnings).toEqual([]);
  });

  it("labels the surviving party from PID/PV1 by role, with provenance", () => {
    const surviving = events[0]?.surviving;
    expect(surviving?.role).toBe("surviving");
    expect(surviving?.sourceSegment).toBe("PID");
    expect(surviving?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN99001"]);
    expect(surviving?.accountNumber?.idNumber).toBe("ACCT8801");
    expect(surviving?.visitNumber?.idNumber).toBe("VIS7001");
    expect(surviving?.name?.familyName).toBe("Mergetest");
    expect(surviving?.name?.givenName).toBe("Survivor");
  });

  it("labels the prior party from MRG by role, with provenance", () => {
    const prior = events[0]?.prior;
    expect(prior?.role).toBe("prior");
    expect(prior?.sourceSegment).toBe("MRG");
    expect(prior?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN99002"]);
    expect(prior?.accountNumber?.idNumber).toBe("ACCT8802");
    expect(prior?.name?.givenName).toBe("Prior");
  });

  it("surfaces both parties in document order on `parties`", () => {
    expect(events[0]?.parties.map((p) => p.role)).toEqual(["surviving", "prior"]);
  });

  it("no longer flags MRG as UNKNOWN_SEGMENT", () => {
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_SEGMENT)).toBe(false);
  });
});

describe("Phase K: legacy identifier era (v2.3 fixtures)", () => {
  it("A34: reads MRG-4 as the prior legacyPatientId on a pre-v2.7 message", () => {
    const [ev] = parseHL7(loadFixture("adt-a34-merge")).identityEvents();
    expect(ev?.kind).toBe("merge");
    expect(ev?.prior?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN99004"]);
    expect(ev?.prior?.legacyPatientId?.idNumber).toBe("LEG99004");
  });

  it("A18: reads PID-2 (surviving) and MRG-4 (prior) legacy IDs", () => {
    const [ev] = parseHL7(loadFixture("adt-a18-merge-deprecated")).identityEvents();
    expect(ev?.kind).toBe("merge");
    expect(ev?.direction).toBe("MRG_TO_PID");
    expect(ev?.surviving?.legacyPatientId?.idNumber).toBe("LEG99005");
    expect(ev?.surviving?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN99005"]);
    expect(ev?.prior?.legacyPatientId?.idNumber).toBe("LEG99006");
  });
});

describe("Phase K: A43 move + A24 link fixtures", () => {
  it("A43: kind move, MRG→PID direction, roles labelled", () => {
    const [ev] = parseHL7(loadFixture("adt-a43-move")).identityEvents();
    expect(ev?.kind).toBe("move");
    expect(ev?.direction).toBe("MRG_TO_PID");
    expect(ev?.surviving?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN99007"]);
    expect(ev?.prior?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN99008"]);
  });

  it("A24: ONE link event, two linked PID parties, no direction, no warnings", () => {
    const events = parseHL7(loadFixture("adt-a24-link")).identityEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev?.kind).toBe("link");
    expect(ev?.direction).toBeUndefined();
    expect(ev?.surviving).toBeUndefined();
    expect(ev?.prior).toBeUndefined();
    expect(ev?.warnings).toEqual([]);
    expect(ev?.parties.map((p) => p.role)).toEqual(["linked", "linked"]);
    expect(ev?.parties.map((p) => p.sourceSegment)).toEqual(["PID", "PID"]);
    expect(ev?.parties.map((p) => p.identifiers[0]?.idNumber)).toEqual(["MRN99009", "MRN99010"]);
  });
});

describe("Phase K: MRG field-map version gate (withdrawn as of v2.7)", () => {
  const pid = "PID|1|LEG80001^^^HOSP^PE|MRN80001^^^HOSP^MR||Gatetest^Survivor";
  const mrg = "MRG|MRN80002^^^HOSP^MR|||LEG80002^^^HOSP^PE";

  function eventsForVersion(version: string): readonly IdentityEvent[] {
    return parseHL7(
      raw(`MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT^A40|MSGT06|P|${version}`, pid, mrg),
    ).identityEvents();
  }

  for (const version of ["2.7", "2.7.1", "2.8"]) {
    it(`v${version}: does NOT read MRG-4 / PID-2 as legacy identity fields`, () => {
      const [ev] = eventsForVersion(version);
      expect(ev?.prior?.legacyPatientId).toBeUndefined();
      expect(ev?.surviving?.legacyPatientId).toBeUndefined();
      // The v2.7+ fields are still read: MRG-1 / PID-3 lists.
      expect(ev?.prior?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN80002"]);
      expect(ev?.surviving?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN80001"]);
    });
  }

  for (const version of ["2.3", "2.5.1", "2.6"]) {
    it(`v${version}: still reads MRG-4 / PID-2 (backward-compat era)`, () => {
      const [ev] = eventsForVersion(version);
      expect(ev?.prior?.legacyPatientId?.idNumber).toBe("LEG80002");
      expect(ev?.surviving?.legacyPatientId?.idNumber).toBe("LEG80001");
    });
  }

  it("an absent or unparseable MSH-12 falls back to the pre-v2.7 map (lenient)", () => {
    for (const version of ["", "vendor-x"]) {
      const [ev] = eventsForVersion(version);
      expect(ev?.prior?.legacyPatientId?.idNumber).toBe("LEG80002");
    }
  });
});

describe("Phase K: fail-safe — MERGE_MISSING_PRIOR_OR_SURVIVOR", () => {
  it("merge with a PID but no MRG warns (missing prior), surfaces the survivor", () => {
    const msg = parseHL7(raw(MSH_A40, "PID|1||MRN81001^^^HOSP^MR||Failsafe^NoMrg"));
    const [ev] = msg.identityEvents();
    expect(ev?.surviving?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN81001"]);
    expect(ev?.prior).toBeUndefined();
    expect(ev?.direction).toBe("MRG_TO_PID");
    expect(ev?.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.MERGE_MISSING_PRIOR_OR_SURVIVOR,
    ]);
  });

  it("an orphaned MRG (no PID) is NEVER dropped — own event + missing-survivor warning", () => {
    const msg = parseHL7(raw(MSH_A40, "MRG|MRN81002^^^HOSP^MR"));
    const [ev] = msg.identityEvents();
    expect(ev?.prior?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN81002"]);
    expect(ev?.surviving).toBeUndefined();
    expect(ev?.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.MERGE_MISSING_PRIOR_OR_SURVIVOR,
    ]);
    expect(ev?.warnings[0]?.message).toContain("survivor");
  });

  it("a PID carrying no surviving identifier warns even when an MRG is present", () => {
    const msg = parseHL7(raw(MSH_A40, "PID|1||||Failsafe^NoId", "MRG|MRN81003^^^HOSP^MR"));
    const [ev] = msg.identityEvents();
    expect(ev?.surviving?.identifiers).toEqual([]);
    expect(ev?.prior?.identifiers.map((cx) => cx.idNumber)).toEqual(["MRN81003"]);
    expect(ev?.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.MERGE_MISSING_PRIOR_OR_SURVIVOR,
    ]);
  });

  it("a merge trigger with neither PID nor MRG records both missing roles", () => {
    const msg = parseHL7(raw(MSH_A40, "EVN|A40|20260704080000"));
    const [ev] = msg.identityEvents();
    expect(ev?.parties).toEqual([]);
    expect(ev?.warnings).toHaveLength(2);
    expect(new Set(ev?.warnings.map((w) => w.code))).toEqual(
      new Set([WARNING_CODES.MERGE_MISSING_PRIOR_OR_SURVIVOR]),
    );
  });

  it("warning messages carry NO identifier or name values (PHI discipline)", () => {
    const msg = parseHL7(
      raw(MSH_A40, "PID|1||||Phitest^Warning", "MRG|MRN81004^^^HOSP^MR||||||Phitest^Prior"),
    );
    const [ev] = msg.identityEvents();
    expect(ev?.warnings.length).toBeGreaterThan(0);
    for (const w of ev?.warnings ?? []) {
      expect(w.message).not.toContain("MRN81004");
      expect(w.message).not.toContain("Phitest");
      expect(w.message).not.toContain("Warning");
      expect(w.message).not.toContain("Prior");
    }
  });

  it("event warnings are scoped to the event — msg.warnings is untouched", () => {
    const msg = parseHL7(raw(MSH_A40, "PID|1||MRN81005^^^HOSP^MR"));
    const before = msg.warnings.length;
    const [ev] = msg.identityEvents();
    expect(ev?.warnings).toHaveLength(1);
    expect(msg.warnings.length).toBe(before);
  });

  it("a v2.7+ MRG whose only content was the gated MRG-4 warns (missing prior)", () => {
    // The prior party surfaces with no identity fields — the consumer must
    // not read that as "nothing to retire", so the fail-safe warns.
    const msg = parseHL7(
      raw(
        "MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT^A40|MSGT11|P|2.7",
        "PID|1||MRN81006^^^HOSP^MR",
        "MRG||||LEG81007^^^HOSP^PE",
      ),
    );
    const [ev] = msg.identityEvents();
    expect(ev?.prior).toBeDefined();
    expect(ev?.prior?.identifiers).toEqual([]);
    expect(ev?.prior?.legacyPatientId).toBeUndefined();
    expect(ev?.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.MERGE_MISSING_PRIOR_OR_SURVIVOR,
    ]);
    expect(ev?.warnings[0]?.message).toContain("prior");
  });

  it("an ID-less CX (assigning authority only) is not a usable surviving identifier", () => {
    const msg = parseHL7(raw(MSH_A40, "PID|1||^^^HOSP", "MRG|MRN81008^^^HOSP^MR"));
    const [ev] = msg.identityEvents();
    expect(ev?.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.MERGE_MISSING_PRIOR_OR_SURVIVOR,
    ]);
    expect(ev?.warnings[0]?.message).toContain("survivor");
  });

  it("account/visit numbers count as identity fields (A41/A42 merge keys)", () => {
    // A41-shaped: both sides keyed on the account number alone — no warning.
    const msg = parseHL7(
      raw(
        "MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT^A41|MSGT12|P|2.5",
        "PID|1||||Accttest^Only|||||||||||||ACCT8803^^^HOSP^AN",
        "MRG|||ACCT8804^^^HOSP^AN",
      ),
    );
    const [ev] = msg.identityEvents();
    expect(ev?.surviving?.accountNumber?.idNumber).toBe("ACCT8803");
    expect(ev?.prior?.accountNumber?.idNumber).toBe("ACCT8804");
    expect(ev?.warnings).toEqual([]);
  });
});

describe("Phase K: repeating groups + document order", () => {
  it("an A40 with two PID+MRG groups yields two independent merge events", () => {
    const msg = parseHL7(
      raw(
        MSH_A40,
        "PID|1||MRN82001^^^HOSP^MR||Multi^GroupOne",
        "MRG|MRN82002^^^HOSP^MR",
        "PID|2||MRN82003^^^HOSP^MR||Multi^GroupTwo",
        "MRG|MRN82004^^^HOSP^MR",
      ),
    );
    const events = msg.identityEvents();
    expect(events).toHaveLength(2);
    expect(events[0]?.surviving?.identifiers[0]?.idNumber).toBe("MRN82001");
    expect(events[0]?.prior?.identifiers[0]?.idNumber).toBe("MRN82002");
    expect(events[1]?.surviving?.identifiers[0]?.idNumber).toBe("MRN82003");
    expect(events[1]?.prior?.identifiers[0]?.idNumber).toBe("MRN82004");
    expect(events[0]?.warnings).toEqual([]);
    expect(events[1]?.warnings).toEqual([]);
  });

  it("a second MRG in one group opens an orphan event — never silently dropped", () => {
    const msg = parseHL7(
      raw(MSH_A40, "PID|1||MRN82005^^^HOSP^MR", "MRG|MRN82006^^^HOSP^MR", "MRG|MRN82007^^^HOSP^MR"),
    );
    const events = msg.identityEvents();
    expect(events).toHaveLength(2);
    expect(events[1]?.prior?.identifiers[0]?.idNumber).toBe("MRN82007");
    expect(events[1]?.surviving).toBeUndefined();
    expect(events[1]?.warnings.map((w) => w.code)).toEqual([
      WARNING_CODES.MERGE_MISSING_PRIOR_OR_SURVIVOR,
    ]);
  });

  it("PV1 attaches to its own PID group (visit number provenance)", () => {
    const msg = parseHL7(
      raw(
        MSH_A40,
        "PID|1||MRN82008^^^HOSP^MR",
        "MRG|MRN82009^^^HOSP^MR",
        "PV1|1|O|||||||||||||||||VIS7002^^^HOSP^VN",
        "PID|2||MRN82010^^^HOSP^MR",
        "MRG|MRN82011^^^HOSP^MR",
      ),
    );
    const events = msg.identityEvents();
    expect(events[0]?.surviving?.visitNumber?.idNumber).toBe("VIS7002");
    expect(events[1]?.surviving?.visitNumber).toBeUndefined();
  });

  it("a nonconforming MRG inside a link message is surfaced, not dropped", () => {
    const msg = parseHL7(
      raw(
        "MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT^A24|MSGT07|P|2.5",
        "PID|1||MRN82012^^^HOSP^MR",
        "MRG|MRN82013^^^HOSP^MR",
        "PID|2||MRN82014^^^HOSP^MR",
      ),
    );
    const [ev] = msg.identityEvents();
    expect(ev?.kind).toBe("link");
    expect(ev?.parties.map((p) => p.role)).toEqual(["linked", "prior", "linked"]);
  });

  it("A28 add surfaces the subject party; A31 update likewise", () => {
    for (const [trigger, kind] of [
      ["A28", "add"],
      ["A31", "update"],
    ] as const) {
      const msg = parseHL7(
        raw(
          `MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT^${trigger}|MSGT08|P|2.5`,
          "PID|1||MRN82015^^^HOSP^MR||Persontest^Subject",
        ),
      );
      const [ev] = msg.identityEvents();
      expect(ev?.kind).toBe(kind);
      expect(ev?.parties[0]?.role).toBe("subject");
      expect(ev?.parties[0]?.sourceSegment).toBe("PID");
      expect(ev?.direction).toBeUndefined();
    }
  });
});

describe("Phase K: immutability + never-throws", () => {
  it("the events array, each event, parties, and identifier lists are frozen", () => {
    const events = parseHL7(loadFixture("adt-a40-merge")).identityEvents();
    expect(Object.isFrozen(events)).toBe(true);
    const ev = events[0];
    expect(Object.isFrozen(ev)).toBe(true);
    expect(Object.isFrozen(ev?.parties)).toBe(true);
    expect(Object.isFrozen(ev?.surviving)).toBe(true);
    expect(Object.isFrozen(ev?.prior)).toBe(true);
    expect(Object.isFrozen(ev?.surviving?.identifiers)).toBe(true);
    expect(Object.isFrozen(ev?.warnings)).toBe(true);
  });

  it("never throws across malformed identity messages", () => {
    const malformed = [
      raw(MSH_A40, "MRG"),
      raw(MSH_A40, "PID", "MRG|||||||"),
      raw(MSH_A40, "PID|1||^^^^||^^", "MRG|^^^^"),
      raw(MSH_A40, "PV1|1|O", "MRG|MRN83001"),
      raw("MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT^A39|MSGT09|P|garbage", "MRG|X"),
    ];
    for (const input of malformed) {
      expect(() => parseHL7(input).identityEvents()).not.toThrow();
    }
  });
});

describe("Phase K: role-labelling invariant (property)", () => {
  const PID_SOURCED: ReadonlySet<string> = new Set(["surviving", "subject", "linked"]);

  it("a survivor is never sourced from MRG; a prior never from PID", () => {
    const triggerArb = fc.constantFrom(
      "A18",
      "A24",
      "A28",
      "A31",
      "A34",
      "A37",
      "A39",
      "A40",
      "A43",
      "A44",
    );
    const segArb = fc.constantFrom(
      "PID|1||MRN90001^^^HOSP^MR||Proptest^One",
      "PID|2|LEG90002^^^HOSP^PE|||Proptest^Two",
      "PID|3",
      "MRG|MRN90003^^^HOSP^MR|||LEG90003^^^HOSP^PE",
      "MRG|MRN90004^^^HOSP^MR",
      "MRG",
      "PV1|1|O|||||||||||||||||VIS9001^^^HOSP^VN",
      "NTE|1||synthetic-note",
    );
    const versionArb = fc.constantFrom("2.3", "2.5", "2.5.1", "2.7", "2.8", "");

    fc.assert(
      fc.property(
        triggerArb,
        versionArb,
        fc.array(segArb, { minLength: 0, maxLength: 6 }),
        (trigger, version, segments) => {
          const msg = parseHL7(
            raw(
              `MSH|^~\\&|REG|MAIN|MPI|MAIN|20260704080000||ADT^${trigger}|MSGT10|P|${version}`,
              ...segments,
            ),
          );
          const events = msg.identityEvents(); // must never throw
          const mrgCount = segments.filter((s) => s.startsWith("MRG")).length;
          let surfacedPriors = 0;
          for (const ev of events) {
            for (const party of ev.parties) {
              // THE invariant: role labels are bound to segment provenance.
              if (party.role === "prior") {
                expect(party.sourceSegment).toBe("MRG");
                surfacedPriors += 1;
              } else {
                expect(PID_SOURCED.has(party.role)).toBe(true);
                expect(party.sourceSegment).toBe("PID");
              }
            }
            if (ev.surviving !== undefined) expect(ev.surviving.sourceSegment).toBe("PID");
            if (ev.prior !== undefined) expect(ev.prior.sourceSegment).toBe("MRG");
            if (ev.kind === "merge" || ev.kind === "move") {
              expect(ev.direction).toBe("MRG_TO_PID");
            } else {
              expect(ev.direction).toBeUndefined();
            }
          }
          // MRG never dropped: every MRG segment surfaces as a prior party
          // (merge/move/link/unlink always; add/update when a PID group exists).
          if (trigger !== "A28" && trigger !== "A31") {
            expect(surfacedPriors).toBe(mrgCount);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("Phase K: round-trip fidelity of the identity fixtures", () => {
  for (const name of [
    "adt-a40-merge",
    "adt-a34-merge",
    "adt-a18-merge-deprecated",
    "adt-a43-move",
    "adt-a24-link",
  ]) {
    it(`${name}.hl7 survives structural round-trip + idempotent re-emit`, () => {
      const fixture = loadFixture(name);
      assertStructuralRoundTrip(fixture);
      const once = parseHL7(fixture).toString();
      expect(parseHL7(once).toString()).toBe(once);
    });
  }
});
