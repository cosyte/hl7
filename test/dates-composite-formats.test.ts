/**
 * Declared `dateFormats` on the TS composite path: a caller who tells the
 * parser what shape their vendor sends gets that answer honoured on EVERY
 * typed datetime the library exposes, not only the message header timestamp.
 *
 * The safety line this file exists to hold: only DECLARED formats reach a
 * typed datetime. `BUILTIN_DATE_FALLBACKS` carries `MM/DD/YYYY` and no
 * day-first form, so letting it follow the hook onto `patient.dateOfBirth`
 * would turn a day-first `05/07/1988` into a confident May 7 with
 * `valid: true`. In a PHI-bearing library a plausible wrong date of birth is a
 * patient misidentification, and re-running the parse does not undo what the
 * consumer already wrote. So the composite path tries the strict HL7 DTM, then
 * the declared formats, and then stops.
 *
 * `msg.meta.timestamp` is deliberately NOT part of that rule: it is a
 * non-composite caller that has always run the full lenient cascade, and the
 * built-in fallback list is the subject of its own separate change. Its
 * behaviour here is pinned as a boundary, not as a target.
 */

import { describe, expect, it } from "vitest";

import { parseHL7, type ParseOptions, type TS } from "../src/index.js";
import { BUILTIN_DATE_FALLBACKS } from "../src/parser/dates.js";
import { defineProfile } from "../src/profiles/define.js";

/** Build a segment from a sparse 1-indexed field map so positions are unambiguous. */
function seg(name: string, fields: Readonly<Record<number, string>>): string {
  const max = Math.max(0, ...Object.keys(fields).map(Number));
  const parts: string[] = [name];
  for (let i = 1; i <= max; i++) parts.push(fields[i] ?? "");
  return parts.join("|");
}

function msh(value: string, type = "ADT^A01"): string {
  return `MSH|^~\\&|APP|FAC|RECV|RFAC|${value}||${type}|MSG1|P|2.5`;
}

/**
 * PID / PV1 / AL1 / DG1 / IN1 / FT1 / OBX / TXA: every datetime one segment
 * can carry without a grouping state machine getting in the way. The OBX is
 * `TS`-typed so OBX-5 exercises the typed-value path as well as OBX-14.
 */
function clinicalMessage(value: string): string {
  return (
    [
      msh(value),
      seg("PID", { 1: "1", 3: "MRN1^^^HOSP^MR", 5: "Smith^Jane", 7: value, 8: "F" }),
      seg("PV1", { 1: "1", 2: "I", 3: "ICU^101^A", 44: value, 45: value }),
      seg("AL1", { 1: "1", 2: "DA", 3: "PEN^Penicillin^DRUG", 4: "SV", 5: "Hives", 6: value }),
      seg("DG1", { 1: "1", 2: "I10", 3: "E11.9^Diabetes^I10", 4: "Diabetes", 5: value }),
      seg("IN1", { 1: "1", 2: "PLAN^CompanyPlan^X", 3: "CO123^^^HOSP", 12: value, 13: value }),
      seg("FT1", { 1: "1", 2: "T", 4: value, 6: "CG", 7: "CODE^Charge^L" }),
      seg("OBX", { 1: "1", 2: "TS", 3: "COLLECT^Collected^L", 5: value, 11: "F", 14: value }),
      seg("TXA", { 1: "1", 2: "DS", 4: value }),
    ].join("\r") + "\r"
  );
}

/** ORC-7 legacy embedded TQ: TQ.4 start / TQ.5 end, parsed direct in `timing.ts`. */
function legacyOrderMessage(value: string): string {
  return (
    [
      msh(value, "ORM^O01"),
      seg("PID", { 3: "MRN1" }),
      seg("ORC", { 1: "NW", 2: "A", 3: "B", 7: `1^Q8H^^${value}^${value}^R^^^^^^12` }),
      seg("OBR", { 1: "1", 2: "A", 3: "B", 4: "CBC^^L" }),
    ].join("\r") + "\r"
  );
}

/** TQ1-7 / TQ1-8, which reach the composite path through `Field.asTs()`. */
function tq1OrderMessage(value: string): string {
  return (
    [
      msh(value, "ORM^O01"),
      seg("PID", { 3: "MRN1" }),
      seg("ORC", { 1: "NW", 2: "A", 3: "B" }),
      seg("TQ1", { 1: "1", 3: "BID", 7: value, 8: value }),
      seg("OBR", { 1: "1", 2: "A", 3: "B", 4: "CBC^^L" }),
    ].join("\r") + "\r"
  );
}

/** RXA-3 administered / RXA-16 expiration. */
function immunizationMessage(value: string): string {
  return (
    [
      msh(value, "VXU^V04"),
      seg("PID", { 3: "MRN1" }),
      seg("ORC", { 1: "RE" }),
      seg("RXA", {
        1: "0",
        2: "1",
        3: value,
        5: "49281041688^Influenza^CVX",
        6: "0.5",
        7: "mL^mL^UCUM",
        16: value,
      }),
    ].join("\r") + "\r"
  );
}

/** SCH-11 TQ.4 / TQ.5, parsed direct in `appointments.ts`. */
function appointmentMessage(value: string): string {
  return (
    [
      msh(value, "SIU^S12"),
      seg("SCH", { 1: "PLACER1", 2: "FILLER1", 11: `^^^${value}^${value}`, 25: "BOOKED^Booked" }),
    ].join("\r") + "\r"
  );
}

/**
 * Every datetime the public helper surface exposes as a `TS`, keyed by the
 * documented accessor. `meta.timestamp` is listed separately where it matters,
 * because it is the one non-composite caller.
 */
function compositeSurfaces(
  value: string,
  options: ParseOptions = {},
): Record<string, TS | undefined> {
  const clinical = parseHL7(clinicalMessage(value), options);
  const legacy = parseHL7(legacyOrderMessage(value), options);
  const tq1 = parseHL7(tq1OrderMessage(value), options);
  const immunization = parseHL7(immunizationMessage(value), options);
  const appointment = parseHL7(appointmentMessage(value), options);

  return {
    "patient.dateOfBirth": clinical.patient?.dateOfBirth,
    "visit.admitDateTime": clinical.visit?.admitDateTime,
    "visit.dischargeDateTime": clinical.visit?.dischargeDateTime,
    "observation.observedDateTime": clinical.observations()[0]?.observedDateTime,
    "allergy.onsetDate": clinical.allergies()[0]?.onsetDate,
    "diagnosis.dateTime": clinical.diagnoses()[0]?.dateTime,
    "insurance.effectiveDate": clinical.insurance()[0]?.effectiveDate,
    "insurance.expirationDate": clinical.insurance()[0]?.expirationDate,
    "charge.transactionDate": clinical.charges()[0]?.transactionDate,
    "document.activityDateTime": clinical.documents()[0]?.activityDateTime,
    "immunization.administeredDateTime": immunization.immunizations()[0]?.administeredDateTime,
    "immunization.expirationDate": immunization.immunizations()[0]?.expirationDate,
    "timing.startDateTime (TQ1)": tq1.orders()[0]?.timings[0]?.startDateTime,
    "timing.endDateTime (TQ1)": tq1.orders()[0]?.timings[0]?.endDateTime,
    "timing.startDateTime (legacy TQ)": legacy.orders()[0]?.timings[0]?.startDateTime,
    "timing.endDateTime (legacy TQ)": legacy.orders()[0]?.timings[0]?.endDateTime,
    "appointment.startDateTime": appointment.appointments()[0]?.startDateTime,
    "appointment.endDateTime": appointment.appointments()[0]?.endDateTime,
  };
}

/**
 * The OBX `TS`/`DT` typed value (OBX-2 declares the type, OBX-5 carries it).
 * Kept out of {@link compositeSurfaces} because D-22 collapses an INVALID
 * typed value to `undefined` rather than surfacing the invalid `TS`, so it
 * cannot share the uniform expectations the other surfaces do.
 */
function obxTypedValue(value: string, options: ParseOptions = {}): TS | undefined {
  const obs = parseHL7(clinicalMessage(value), options).observations()[0];
  if (obs === undefined || (obs.valueType !== "TS" && obs.valueType !== "DT")) return undefined;
  const typed = obs.value;
  return typeof typed === "object" ? typed : undefined;
}

/**
 * The surfaces whose helper OMITS its key when the datetime does not parse
 * (`if (ts.valid)`), as against the ones that surface the invalid `TS` itself
 * (`if (ts.raw !== "")`, or the direct-parse sites that always set it). Which
 * of the two answers a surface gives is pre-existing behaviour that this work
 * does not touch, and it is pinned here because AC-3 is a claim about the
 * no-formats path being unchanged, not only about the parse result.
 */
const OMITS_AN_INVALID_DATETIME: ReadonlySet<string> = new Set([
  "patient.dateOfBirth",
  "visit.admitDateTime",
  "visit.dischargeDateTime",
  "observation.observedDateTime",
  "allergy.onsetDate",
  "diagnosis.dateTime",
  "insurance.effectiveDate",
  "insurance.expirationDate",
  "immunization.administeredDateTime",
  "immunization.expirationDate",
]);

/**
 * PID-7 as the typed `TS` the composite path produces, read before any helper
 * gate. Use this where the criterion is about the exact `TS` shape: the
 * `patient.dateOfBirth` accessor omits its key on an invalid value, so it
 * cannot tell "no parts" from "not surfaced".
 */
function dobField(value: string, options: ParseOptions = {}): TS | undefined {
  return parseHL7(clinicalMessage(value), options).segments("PID")[0]?.field(7).asTs();
}

/** Assert a surface yields no usable date and, above all, no fabricated parts. */
function expectNoDate(name: string, ts: TS | undefined, raw: string): void {
  if (OMITS_AN_INVALID_DATETIME.has(name)) {
    expect(ts, name).toBeUndefined();
    return;
  }
  expect(ts, name).toEqual({ raw, valid: false, hasTimezone: false });
}

const ISO_DATE: readonly string[] = ["YYYY-MM-DD"];

describe("dates/composite: a declared format reaches a typed datetime (AC-1)", () => {
  it("PID-7 in a declared format yields a valid TS with matchedFormat", () => {
    const dob = parseHL7(clinicalMessage("1988-07-05"), { dateFormats: ISO_DATE }).patient
      ?.dateOfBirth;
    expect(dob).toMatchObject({
      raw: "1988-07-05",
      valid: true,
      precision: "day",
      year: 1988,
      month: 7,
      day: 5,
      hasTimezone: false,
      matchedFormat: "YYYY-MM-DD",
    });
  });

  it("a profile-declared format reaches the same field", () => {
    const profile = defineProfile({ name: "vendor", dateFormats: ["YYYY-MM-DD"] });
    const dob = parseHL7(clinicalMessage("1988-07-05"), { profile }).patient?.dateOfBirth;
    expect(dob?.valid).toBe(true);
    expect(dob?.matchedFormat).toBe("YYYY-MM-DD");
    expect(dob?.month).toBe(7);
  });

  it("a datetime-carrying declared format populates the time parts", () => {
    const msg = parseHL7(clinicalMessage("07/05/1988 14:30:00"), {
      dateFormats: ["MM/DD/YYYY HH:mm:ss"],
    });
    expect(msg.patient?.dateOfBirth).toMatchObject({
      valid: true,
      precision: "second",
      year: 1988,
      month: 7,
      day: 5,
      hour: 14,
      minute: 30,
      second: 0,
      matchedFormat: "MM/DD/YYYY HH:mm:ss",
    });
  });
});

describe("dates/composite: a well-formed DTM still wins, unchanged (AC-2)", () => {
  it("the strict parse is returned and matchedFormat is omitted", () => {
    const dob = parseHL7(clinicalMessage("19880705"), { dateFormats: ISO_DATE }).patient
      ?.dateOfBirth;
    expect(dob).toEqual({
      raw: "19880705",
      valid: true,
      precision: "day",
      year: 1988,
      month: 7,
      day: 5,
      hasTimezone: false,
    });
    expect(dob?.matchedFormat).toBeUndefined();
  });

  it("holds however many formats are declared and whatever order they are in", () => {
    const orders: readonly (readonly string[])[] = [
      ["YYYYMMDD"],
      ["YYYY-MM-DD", "MM/DD/YYYY", "YYYYMMDD"],
      ["YYYYMMDD", "MM/DD/YYYY", "YYYY-MM-DD"],
      ["DD/MM/YYYY", "YYYYMMDDHHmmss"],
    ];
    for (const dateFormats of orders) {
      const dob = parseHL7(clinicalMessage("19880705"), { dateFormats }).patient?.dateOfBirth;
      expect(dob).toMatchObject({ valid: true, precision: "day", year: 1988, month: 7, day: 5 });
      expect(dob?.matchedFormat).toBeUndefined();
    }
  });

  it("timezone fidelity survives a declared-format parse of a strict value", () => {
    const admit = parseHL7(clinicalMessage("20250102153045-0500"), { dateFormats: ISO_DATE }).visit
      ?.admitDateTime;
    expect(admit).toMatchObject({ valid: true, hasTimezone: true, offsetMinutes: -300 });
    expect(admit?.matchedFormat).toBeUndefined();
  });
});

describe("dates/composite: no declared formats is byte-identical to today (AC-3)", () => {
  it("a canonical DTM parses exactly as the strict parser does, on every surface", () => {
    for (const [name, ts] of Object.entries(compositeSurfaces("19880705"))) {
      expect(ts, name).toEqual({
        raw: "19880705",
        valid: true,
        precision: "day",
        year: 1988,
        month: 7,
        day: 5,
        hasTimezone: false,
      });
    }
  });

  it("a non-canonical value stays invalid with no parts, on every surface", () => {
    for (const [name, ts] of Object.entries(compositeSurfaces("1988-07-05"))) {
      expectNoDate(name, ts, "1988-07-05");
    }
  });

  it("msg.dateFormats is empty when neither route declared anything", () => {
    expect(parseHL7(clinicalMessage("19880705")).dateFormats).toEqual([]);
  });

  it("an OBX TS-typed value keeps both of today's answers", () => {
    expect(obxTypedValue("19880705")).toMatchObject({ valid: true, month: 7, day: 5 });
    // D-22: an invalid typed value surfaces as `undefined`, not an invalid TS.
    expect(obxTypedValue("1988-07-05")).toBeUndefined();
  });
});

describe("dates/composite: built-in fallbacks never reach a typed datetime (AC-4)", () => {
  it("the built-in list does carry the US-order form this rule guards against", () => {
    expect(BUILTIN_DATE_FALLBACKS).toContain("MM/DD/YYYY");
  });

  it("a day-first 05/07/1988 date of birth is never reported as a valid May 7", () => {
    for (const options of [{}, { dateFormats: ISO_DATE }]) {
      for (const [name, ts] of Object.entries(compositeSurfaces("05/07/1988", options))) {
        expectNoDate(name, ts, "05/07/1988");
      }
    }
  });

  it("an ISO value is not rescued by the built-in ISO-8601 entry either", () => {
    expect(dobField("1988-07-05T00:00:00Z", { dateFormats: ["MM/DD/YYYY"] })).toEqual({
      raw: "1988-07-05T00:00:00Z",
      valid: false,
      hasTimezone: false,
    });
  });

  it("an OBX TS-typed value is not rescued either", () => {
    expect(obxTypedValue("05/07/1988")).toBeUndefined();
    expect(obxTypedValue("05/07/1988", { dateFormats: ISO_DATE })).toBeUndefined();
  });

  it("the same value IS accepted once the caller declares that format", () => {
    const dob = parseHL7(clinicalMessage("05/07/1988"), {
      dateFormats: ["DD/MM/YYYY"],
    }).patient?.dateOfBirth;
    expect(dob).toMatchObject({ valid: true, year: 1988, month: 7, day: 5 });
  });

  it("meta.timestamp keeps its own lenient cascade (the boundary of this rule)", () => {
    // MSH-7 is the one non-composite caller and has always run the built-in
    // fallbacks. Pinned so a later change to either side is a visible decision.
    const meta = parseHL7(clinicalMessage("1988-07-05")).meta.timestamp;
    expect(meta?.valid).toBe(true);
    expect(meta?.matchedFormat).toBe("ISO-8601");
  });
});

describe("dates/composite: every public TS surface honours declared formats (AC-5)", () => {
  const surfaces = compositeSurfaces("1988-07-05", { dateFormats: ISO_DATE });

  it("covers every datetime the acceptance criterion names", () => {
    expect(Object.keys(surfaces)).toHaveLength(18);
  });

  for (const [name, ts] of Object.entries(surfaces)) {
    it(`${name} honours the declared format`, () => {
      expect(ts, name).toMatchObject({
        raw: "1988-07-05",
        valid: true,
        precision: "day",
        year: 1988,
        month: 7,
        day: 5,
        matchedFormat: "YYYY-MM-DD",
      });
    });
  }

  it("meta.timestamp honours it too, via its own cascade", () => {
    const meta = parseHL7(clinicalMessage("1988-07-05"), { dateFormats: ISO_DATE }).meta.timestamp;
    expect(meta).toMatchObject({ valid: true, matchedFormat: "YYYY-MM-DD" });
  });

  it("an OBX TS-typed value honours it too", () => {
    expect(obxTypedValue("1988-07-05", { dateFormats: ISO_DATE })).toMatchObject({
      valid: true,
      month: 7,
      day: 5,
      matchedFormat: "YYYY-MM-DD",
    });
  });
});

describe("dates/composite: the plumbing survives the caches it passes through", () => {
  it("a cached Field wrapper still carries the declared formats (D-12 identity holds)", () => {
    const pid = parseHL7(clinicalMessage("1988-07-05"), {
      dateFormats: ISO_DATE,
    }).segments("PID")[0];
    expect(pid?.field(7)).toBe(pid?.field(7)); // same instance, per D-12
    expect(pid?.field(7).asTs().matchedFormat).toBe("YYYY-MM-DD");
    expect(pid?.field(7).asTs().matchedFormat).toBe("YYYY-MM-DD"); // and again, off the cache
  });

  it("a mutation that drops the wrapper caches does not drop the formats", () => {
    const msg = parseHL7(clinicalMessage("1988-07-05"), { dateFormats: ISO_DATE });
    expect(msg.patient?.dateOfBirth?.matchedFormat).toBe("YYYY-MM-DD");
    msg.setField("PID.5.1", "Jones");
    expect(msg.patient?.familyName).toBe("Jones");
    expect(msg.patient?.dateOfBirth?.matchedFormat).toBe("YYYY-MM-DD");
  });

  it("the shared empty-Field sentinel is unaffected by any message's formats", () => {
    const withFormats = parseHL7(clinicalMessage("1988-07-05"), { dateFormats: ISO_DATE });
    const without = parseHL7(clinicalMessage("1988-07-05"));
    // Both out-of-range reads land on the same sentinel; neither can teach it a
    // format, and it has no content to apply one to.
    expect(withFormats.segments("PID")[0]?.field(99)).toBe(without.segments("PID")[0]?.field(99));
    expect(withFormats.segments("PID")[0]?.field(99).dateFormats).toEqual([]);
  });
});

describe("dates/composite: option formats precede profile formats (AC-6)", () => {
  const dayFirst = defineProfile({ name: "day-first", dateFormats: ["DD/MM/YYYY"] });
  const monthFirst = defineProfile({ name: "month-first", dateFormats: ["MM/DD/YYYY"] });

  it("the option format wins the ambiguous value, and msg.dateFormats reports that order", () => {
    const msg = parseHL7(clinicalMessage("05/07/1988"), {
      dateFormats: ["DD/MM/YYYY"],
      profile: monthFirst,
    });
    expect(msg.dateFormats).toEqual(["DD/MM/YYYY", "MM/DD/YYYY"]);
    // Day-first wins: 5 July, not 7 May.
    expect(msg.patient?.dateOfBirth).toMatchObject({
      valid: true,
      month: 7,
      day: 5,
      matchedFormat: "DD/MM/YYYY",
    });
  });

  it("the profile format wins the same value when the option does not match", () => {
    const msg = parseHL7(clinicalMessage("05/07/1988"), {
      dateFormats: ["YYYY-MM-DD"],
      profile: monthFirst,
    });
    expect(msg.dateFormats).toEqual(["YYYY-MM-DD", "MM/DD/YYYY"]);
    // Month-first is the only match left: 7 May.
    expect(msg.patient?.dateOfBirth).toMatchObject({
      valid: true,
      month: 5,
      day: 7,
      matchedFormat: "MM/DD/YYYY",
    });
  });

  it("a profile alone supplies the whole list", () => {
    const msg = parseHL7(clinicalMessage("05/07/1988"), { profile: dayFirst });
    expect(msg.dateFormats).toEqual(["DD/MM/YYYY"]);
    expect(msg.patient?.dateOfBirth).toMatchObject({ valid: true, month: 7, day: 5 });
  });

  it("duplicates collapse first-occurrence-wins", () => {
    const both = defineProfile({ name: "both", dateFormats: ["YYYY-MM-DD", "MM/DD/YYYY"] });
    const msg = parseHL7(clinicalMessage("19880705"), {
      dateFormats: ["MM/DD/YYYY", "YYYY-MM-DD"],
      profile: both,
    });
    expect(msg.dateFormats).toEqual(["MM/DD/YYYY", "YYYY-MM-DD"]);
  });
});

describe("dates/composite: partial formats keep precision honest (AC-7)", () => {
  it("a year-and-month format yields month precision with no fabricated day", () => {
    const dob = parseHL7(clinicalMessage("1988-07"), { dateFormats: ["YYYY-MM"] }).patient
      ?.dateOfBirth;
    expect(dob).toEqual({
      raw: "1988-07",
      valid: true,
      precision: "month",
      year: 1988,
      month: 7,
      hasTimezone: false,
      matchedFormat: "YYYY-MM",
    });
  });

  it("a minute-precision format leaves seconds absent, not zero-filled", () => {
    const dob = parseHL7(clinicalMessage("1988-07-05 12:30"), {
      dateFormats: ["YYYY-MM-DD HH:mm"],
    }).patient?.dateOfBirth;
    expect(dob).toMatchObject({ valid: true, precision: "minute", hour: 12, minute: 30 });
    expect(dob?.second).toBeUndefined();
    expect(dob?.fractionalSeconds).toBeUndefined();
  });

  it("a format carrying no offset reports hasTimezone false with no offsetMinutes", () => {
    const dob = parseHL7(clinicalMessage("1988-07-05"), { dateFormats: ISO_DATE }).patient
      ?.dateOfBirth;
    expect(dob?.hasTimezone).toBe(false);
    expect(dob?.offsetMinutes).toBeUndefined();
  });
});

describe("dates/composite: a shape match with an impossible calendar is rejected (AC-8)", () => {
  it("13/45/1988 against MM/DD/YYYY is invalid, never wrapped or clamped", () => {
    expect(dobField("13/45/1988", { dateFormats: ["MM/DD/YYYY"] })).toEqual({
      raw: "13/45/1988",
      valid: false,
      hasTimezone: false,
    });
  });

  it("a rejected shape does not consume the remaining declared formats", () => {
    const dob = parseHL7(clinicalMessage("13/05/1988"), {
      dateFormats: ["MM/DD/YYYY", "DD/MM/YYYY"],
    }).patient?.dateOfBirth;
    expect(dob).toMatchObject({
      valid: true,
      year: 1988,
      month: 5,
      day: 13,
      matchedFormat: "DD/MM/YYYY",
    });
  });

  it("an out-of-range hour is rejected the same way", () => {
    expect(dobField("1988-07-05 25:00", { dateFormats: ["YYYY-MM-DD HH:mm"] })).toEqual({
      raw: "1988-07-05 25:00",
      valid: false,
      hasTimezone: false,
    });
  });
});

describe("dates/composite: empty, HL7 null and out of range never throw (AC-9)", () => {
  const cases: readonly (readonly [string, ParseOptions])[] = [
    ["without declared formats", {}],
    ["with declared formats", { dateFormats: ISO_DATE }],
  ];

  for (const [label, options] of cases) {
    it(`an empty PID-7 yields an empty invalid TS ${label}`, () => {
      const raw = `${msh("19880705")}\r${seg("PID", { 1: "1", 5: "Smith^Jane" })}\r`;
      const msg = parseHL7(raw, options);
      const read = (): TS | undefined => msg.segments("PID")[0]?.field(7).asTs();
      expect(read).not.toThrow();
      expect(read()).toEqual({ raw: "", valid: false, hasTimezone: false });
      expect(msg.patient?.dateOfBirth).toBeUndefined();
    });

    it(`the HL7 explicit null "" yields an empty invalid TS ${label}`, () => {
      const raw = `${msh("19880705")}\r${seg("PID", { 1: "1", 5: "Smith^Jane", 7: '""' })}\r`;
      const msg = parseHL7(raw, options);
      const pid = msg.segments("PID")[0];
      expect(pid?.field(7).isNull).toBe(true);
      const read = (): TS | undefined => pid?.field(7).asTs();
      expect(read).not.toThrow();
      expect(read()).toEqual({ raw: "", valid: false, hasTimezone: false });
      expect(msg.patient?.dateOfBirth).toBeUndefined();
    });

    it(`a field past the end of its segment yields an empty invalid TS ${label}`, () => {
      const pid = parseHL7(clinicalMessage("19880705"), options).segments("PID")[0];
      const read = (): TS | undefined => pid?.field(99).asTs();
      expect(read).not.toThrow();
      expect(read()).toEqual({ raw: "", valid: false, hasTimezone: false });
    });
  }
});

describe("dates/composite: a format with no supported token matches nothing (AC-10)", () => {
  it("does not throw and leaves the value invalid", () => {
    const read = (): TS | undefined => dobField("1988-07-05", { dateFormats: ["QQQQ"] });
    expect(read).not.toThrow();
    expect(read()).toEqual({ raw: "1988-07-05", valid: false, hasTimezone: false });
  });

  it("the remaining declared formats are still tried in order", () => {
    const dob = parseHL7(clinicalMessage("1988-07-05"), {
      dateFormats: ["QQQQ", "YYYY-MM-DD"],
    }).patient?.dateOfBirth;
    expect(dob).toMatchObject({ valid: true, month: 7, day: 5, matchedFormat: "YYYY-MM-DD" });
  });

  it("an empty format string is inert rather than a wildcard", () => {
    const dob = parseHL7(clinicalMessage("1988-07-05"), {
      dateFormats: ["", "YYYY-MM-DD"],
    }).patient?.dateOfBirth;
    expect(dob).toMatchObject({ valid: true, matchedFormat: "YYYY-MM-DD" });
  });
});
