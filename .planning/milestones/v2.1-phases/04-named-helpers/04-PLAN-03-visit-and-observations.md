---
phase: 04-named-helpers
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/helpers/visit.ts
  - src/helpers/observations.ts
  - test/helpers-visit.test.ts
  - test/helpers-observations.test.ts
  - test/helpers-cache-invalidation-visit.test.ts
autonomous: true
requirements: [HELPERS-03, HELPERS-04, HELPERS-07]

must_haves:
  truths:
    - "A developer calling `msg.visit` on a message with a PV1 receives a frozen Visit object with patientClass/location/admitDateTime/dischargeDateTime/attendingDoctor/referringDoctor/visitNumber."
    - "A developer calling `msg.visit` on a message without a PV1 receives `undefined` (HELPERS-03 nullable)."
    - "A developer accessing `msg.visit?.admitDateTime` receives a flat JS Date (D-18) or `undefined`."
    - "A developer accessing `msg.visit?.attendingDoctor` receives a parsed XCN composite (D-24 option (a))."
    - "A developer calling `msg.observations()` receives a frozen readonly Observation[] in document order."
    - "A developer iterating observations sees each observation typed by valueType: NM→number, TS/DT→Date, CWE/CE→composite, others→string (D-13)."
    - "A developer calling `msg.observations()` on a message with no OBX receives `[]` (D-05)."
    - "A developer calling `msg.observations()` twice receives distinct array references (D-06 NOT memoized)."
    - "Observation fields setId/identifier/units/referenceRange/abnormalFlags/status/observedDateTime match the D-15 locked contract."
    - "Every helper returns undefined or [] on missing/malformed input (HELPERS-07, D-22) — never throws."
  artifacts:
    - path: "src/helpers/visit.ts"
      provides: "buildVisit(msg) → Visit | undefined"
      exports: ["buildVisit"]
      min_lines: 60
    - path: "src/helpers/observations.ts"
      provides: "observations + buildObservation"
      exports: ["observations", "buildObservation"]
      min_lines: 90
    - path: "test/helpers-visit.test.ts"
      provides: "Visit helper tests"
      contains: "describe(\"helpers/visit"
    - path: "test/helpers-observations.test.ts"
      provides: "Observations helper tests with valueType dispatch coverage"
      contains: "describe(\"helpers/observations"
  key_links:
    - from: "src/helpers/visit.ts"
      to: "Field.asPl, Field.asXcn, Field.asTs"
      via: "Phase 3 composite coercion chain"
      pattern: "\\.asPl\\(\\)|\\.asXcn\\(\\)|\\.asTs\\(\\)"
    - from: "src/helpers/observations.ts"
      to: "Field.asCwe, Field.asNm, Field.asTs, Field.asCe"
      via: "valueType-discriminated dispatch"
      pattern: "valueType"
    - from: "test/helpers-cache-invalidation-visit.test.ts"
      to: "Hl7Message mutation methods drop _visit cache"
      via: "new file parallel to helpers-cache-invalidation.test.ts (disjoint from Plan 02)"
      pattern: "helpers cache invalidation — visit"
---

<objective>
Fill the `buildVisit` and `observations` stub bodies that Plan 01 scaffolded,
delivering HELPERS-03 and HELPERS-04. Extend the Plan 02 cache-invalidation
test file with visit-specific mutation tests.

**In scope:**
- `buildVisit(msg: Hl7Message): Visit | undefined` — HELPERS-03 (nullable),
  with D-24 option (a) XCN for attendingDoctor/referringDoctor (Plan 01
  shipped `Field.asXcn()`).
- `observations(msg: Hl7Message): readonly Observation[]` — HELPERS-04 flat
  walk with D-13 valueType-discriminated union. Also implement
  `buildObservation(seg: Segment): Observation` as a reusable helper for
  Plan 04's `orders()` OBX-grouping.
- Tests: `helpers-visit.test.ts`, `helpers-observations.test.ts`, and a
  dedicated `helpers-cache-invalidation-visit.test.ts` (disjoint from Plan 02's
  cache-invalidation file so Wave 2 parallelism is preserved).

**Out of scope (other plans):**
- `msg.orders()` positional OBX grouping — Plan 04 (consumes `buildObservation`).
- `msg.nextOfKin()` / `msg.allergies()` / `msg.diagnoses()` / `msg.insurance()` — Plan 04.

**Decision authority:** Plan 03 MUST NOT edit message.ts, field.ts, index.ts,
types.ts, or any Plan 02/04 helper file. Every file Plan 03 creates or
modifies is disjoint from Plan 02's files, so Plans 02 + 03 run in parallel
on Wave 2 without conflict.

Output: 2 stub helpers filled; 3 new test files (helpers-visit, helpers-observations,
helpers-cache-invalidation-visit).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-named-helpers/04-CONTEXT.md
@.planning/phases/04-named-helpers/04-PATTERNS.md
@.planning/phases/04-named-helpers/04-01-SUMMARY.md
@src/helpers/types.ts
@src/helpers/visit.ts
@src/helpers/observations.ts
@src/model/message.ts
@src/model/segment.ts
@src/model/field.ts
@src/model/types/xcn.ts
@src/model/types/pl.ts
@src/model/types/cwe.ts
@src/model/types/ce.ts
@CLAUDE.md

<interfaces>
<!-- Visit and Observation shapes were locked by Plan 01 in src/helpers/types.ts.
     Read that file first for authoritative shapes. -->

From src/helpers/types.ts (Plan 01):
- Visit: { patientClass?, location?: PL, admitDateTime?: Date, dischargeDateTime?: Date, attendingDoctor?: XCN, referringDoctor?: XCN, visitNumber?: string }
- ObservationBase: { setId?, identifier: CWE, units?: CWE, referenceRange?, abnormalFlags?, status?, observedDateTime?: Date }
- Observation = ObservationBase & (
    | { valueType: "NM"; value: number | undefined }
    | { valueType: "TS" | "DT"; value: Date | undefined }
    | { valueType: "CWE" | "CE"; value: CWE | CE | undefined }
    | { valueType: string; value: string | undefined }
  )

From src/model/field.ts (11 coercions — Plan 01 added asXcn):
- field.asXcn(): XCN  — NEW in Plan 01
- field.asPl(): PL
- field.asTs(): TS  — TS.date is Date | undefined
- field.asCwe(): CWE
- field.asCe(): CE
- field.asNm(): NM  — NM.value is number | undefined
- field.value: string  — auto-unescaped first-sub-first-comp-first-rep; "" on empty

From src/model/segment.ts:
- seg.field(n: number): Field  — 1-indexed HL7 access (MSH offset applied internally)
- seg.type: string

From src/model/message.ts:
- msg.segments(type: string): readonly Segment[]
- msg.encodingCharacters

PV1 field positions (HL7 v2.5 Chapter 3):
- PV1-2: patientClass (IS: "I"=inpatient, "O"=outpatient, "E"=emergency, ...)
- PV1-3: assignedPatientLocation (PL)
- PV1-7: attendingDoctor (XCN rep — first rep only for v1 lean shape)
- PV1-8: referringDoctor (XCN rep)
- PV1-19: visitNumber (CX — but lean shape is string from first CX.idNumber)
- PV1-44: admitDateTime (TS)
- PV1-45: dischargeDateTime (TS)

OBX field positions (HL7 v2.5 Chapter 7):
- OBX-1: setId (SI — numeric string)
- OBX-2: valueType (ID — "NM", "ST", "TX", "FT", "TS", "DT", "CWE", "CE", "ID", "IS", "NA", ...)
- OBX-3: observationIdentifier (CWE)
- OBX-5: observationValue (typed by OBX-2 per D-13)
- OBX-6: units (CWE)
- OBX-7: referenceRange (ST)
- OBX-8: abnormalFlags (IS)
- OBX-11: observationResultStatus (ID: "F"=final, "P"=preliminary, ...)
- OBX-14: dateTimeOfObservation (TS)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement buildVisit (HELPERS-03)</name>
  <files>src/helpers/visit.ts, test/helpers-visit.test.ts</files>
  <read_first>
    - src/helpers/visit.ts (stub from Plan 01 — replace body)
    - src/helpers/types.ts (Visit interface — authoritative)
    - src/model/types/xcn.ts (XCN shape — attendingDoctor/referringDoctor)
    - src/model/types/pl.ts (PL shape — location)
    - src/model/field.ts (asPl, asXcn, asTs, .value)
    - src/helpers/patient.ts (Plan 02 sibling — same construction pattern; Mutable<T>/conditional-assign/freeze)
    - .planning/phases/04-named-helpers/04-PATTERNS.md (§"src/helpers/visit.ts" lines 324-334)
    - .planning/phases/04-named-helpers/04-CONTEXT.md (D-04 nullable, D-18 flat Date, D-22 never-throws)
  </read_first>
  <behavior>
    - Given PV1 `PV1|1|I|ICU^101^A^HOSP|||XCN123^Doe^John^^^Dr^MD^^HOSP^L^^^NPI|XCN999^Referrer^Mary||||||||||||VISIT001||||||||||||||||||||||||||20250102153045|20250103120000`:
      - msg.visit is defined (not undefined).
      - msg.visit.patientClass === "I".
      - msg.visit.location is a PL object with pointOfCare === "ICU", room === "101", bed === "A", facility.namespaceId === "HOSP".
      - msg.visit.attendingDoctor is an XCN with idNumber === "XCN123", familyName === "Doe", givenName === "John", degree === "MD", assigningAuthority.namespaceId === "HOSP", nameTypeCode === "L", identifierTypeCode === "NPI".
      - msg.visit.referringDoctor.idNumber === "XCN999".
      - msg.visit.visitNumber === "VISIT001" (PV1-19, first component; lean-shape string).
      - msg.visit.admitDateTime instanceof Date (D-18 flat) and matches PV1-44.
      - msg.visit.dischargeDateTime matches PV1-45.
    - Given a message with NO PV1: msg.visit === undefined (HELPERS-03 nullable).
    - Given a PV1 with ONLY the patientClass (PV1|1|O): msg.visit.patientClass === "O"; all other fields absent via exactOptionalPropertyTypes.
    - Object.isFrozen(msg.visit) === true (D-01).
    - msg.visit === msg.visit (memoization — Plan 01 wired getter).
    - Never throws on any fixture.
  </behavior>
  <action>
**Replace stub body in `src/helpers/visit.ts`:**

```ts
import type { Hl7Message } from "../model/message.js";
import type { Visit } from "./types.js";

/**
 * Build the immutable `Visit` view, or `undefined` when the message has no
 * PV1 segment (HELPERS-03 nullable). Memoized by `Hl7Message.visit` (D-02).
 *
 * Doctors (attendingDoctor/referringDoctor) are XCN composites (D-24 option (a)
 * locked in Plan 01). admitDateTime/dischargeDateTime are flat `Date | undefined`
 * per D-18.
 *
 * @example
 * ```ts
 * const msg = parseHL7(raw);
 * console.log(msg.visit?.patientClass);                 // "I"
 * console.log(msg.visit?.location?.pointOfCare);        // "ICU"
 * console.log(msg.visit?.admitDateTime?.toISOString()); // flat Date per D-18
 * console.log(msg.visit?.attendingDoctor?.familyName);  // XCN via D-24a
 * ```
 */
export function buildVisit(msg: Hl7Message): Visit | undefined {
  const pv1 = msg.segments("PV1")[0];
  if (pv1 === undefined) return undefined;  // HELPERS-03 nullable

  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Visit> = {};

  // ─── PV1-2 patientClass (flat string) ──────────────────────────────────
  const patientClass = pv1.field(2).value;
  if (patientClass !== "") out.patientClass = patientClass;

  // ─── PV1-3 location (PL) ───────────────────────────────────────────────
  const location = pv1.field(3).asPl();
  if (Object.keys(location).length > 0) out.location = location;

  // ─── PV1-7 attendingDoctor (XCN — D-24 option (a)) ─────────────────────
  const attending = pv1.field(7).asXcn();
  if (Object.keys(attending).length > 0) out.attendingDoctor = attending;

  // ─── PV1-8 referringDoctor (XCN) ───────────────────────────────────────
  const referring = pv1.field(8).asXcn();
  if (Object.keys(referring).length > 0) out.referringDoctor = referring;

  // ─── PV1-19 visitNumber (lean: first-component string — PID-19 is typed
  //     as CX in the spec but we surface just the idNumber for the common
  //     "grab the visit number" DX. Callers who need the full CX can reach
  //     msg.segments('PV1')[0].field(19).asCx()). ─────────────────────────
  const visitNumber = pv1.field(19).value;
  if (visitNumber !== "") out.visitNumber = visitNumber;

  // ─── PV1-44 admitDateTime (flat Date D-18) ─────────────────────────────
  const admit = pv1.field(44).asTs();
  if (admit.date !== undefined) out.admitDateTime = admit.date;

  // ─── PV1-45 dischargeDateTime (flat Date D-18) ─────────────────────────
  const discharge = pv1.field(45).asTs();
  if (discharge.date !== undefined) out.dischargeDateTime = discharge.date;

  return Object.freeze(out) as Visit;
}
```

**Create `test/helpers-visit.test.ts`:**

```ts
/**
 * Phase 4 Plan 03 — integration tests for `msg.visit` (HELPERS-03 + HELPERS-07).
 */

import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r";
const PID = "PID|||X|||Smith^Jane\r";

// PV1-2=I, PV1-3=ICU^101^A^HOSP, PV1-7 attending XCN,
// PV1-8 referring XCN, PV1-19=VISIT001, PV1-44/45 timestamps.
// PV1 has 52 fields; position by pipe count.
const FULL_PV1 =
  "PV1|1|I|ICU^101^A^HOSP|||" +              // 1-6
  "XCN123^Doe^John^^^^MD^^HOSP^L^^^NPI|" +    // 7 attending
  "XCN999^Referrer^Mary|" +                   // 8 referring
  "|||||||||||" +                             // 9-19 (visitNumber@19)
  "VISIT001|" +                               // 19
  "||||||||||||||||||||||||" +                // 20-43
  "20250102153045|" +                         // 44 admitDateTime
  "20250103120000";                           // 45 dischargeDateTime

const FULL = MSH + PID + FULL_PV1;
const NO_PV1 = MSH + PID.replace("\r", "");
const MIN_PV1 = MSH + PID + "PV1|1|O";

describe("helpers/visit: msg.visit (HELPERS-03)", () => {
  it("returns undefined when no PV1 exists (HELPERS-03 nullable)", () => {
    expect(parseHL7(NO_PV1).visit).toBeUndefined();
  });

  it("returns a frozen Visit object when PV1 exists (D-01)", () => {
    const v = parseHL7(FULL).visit;
    expect(v).toBeDefined();
    expect(Object.isFrozen(v)).toBe(true);
  });

  it("exposes PV1-2 patientClass as flat string", () => {
    expect(parseHL7(FULL).visit?.patientClass).toBe("I");
  });

  it("exposes PV1-3 location as PL", () => {
    const loc = parseHL7(FULL).visit?.location;
    expect(loc?.pointOfCare).toBe("ICU");
    expect(loc?.room).toBe("101");
    expect(loc?.bed).toBe("A");
    expect(loc?.facility?.namespaceId).toBe("HOSP");
  });

  it("exposes PV1-7 attendingDoctor as XCN (D-24 option a)", () => {
    const doc = parseHL7(FULL).visit?.attendingDoctor;
    expect(doc?.idNumber).toBe("XCN123");
    expect(doc?.familyName).toBe("Doe");
    expect(doc?.givenName).toBe("John");
    expect(doc?.identifierTypeCode).toBe("NPI");
  });

  it("exposes PV1-8 referringDoctor as XCN", () => {
    const doc = parseHL7(FULL).visit?.referringDoctor;
    expect(doc?.idNumber).toBe("XCN999");
    expect(doc?.familyName).toBe("Referrer");
  });

  it("exposes PV1-19 visitNumber as lean flat string", () => {
    expect(parseHL7(FULL).visit?.visitNumber).toBe("VISIT001");
  });

  it("exposes PV1-44 admitDateTime as flat Date (D-18)", () => {
    const v = parseHL7(FULL).visit;
    expect(v?.admitDateTime).toBeInstanceOf(Date);
    expect(v?.admitDateTime?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
  });

  it("exposes PV1-45 dischargeDateTime as flat Date", () => {
    const v = parseHL7(FULL).visit;
    expect(v?.dischargeDateTime?.toISOString()).toBe("2025-01-03T12:00:00.000Z");
  });

  it("omits absent fields (exactOptionalPropertyTypes)", () => {
    const v = parseHL7(MIN_PV1).visit;
    expect(v?.patientClass).toBe("O");
    expect("location" in (v ?? {})).toBe(false);
    expect("attendingDoctor" in (v ?? {})).toBe(false);
    expect("admitDateTime" in (v ?? {})).toBe(false);
    expect("dischargeDateTime" in (v ?? {})).toBe(false);
    expect("visitNumber" in (v ?? {})).toBe(false);
  });

  it("never throws on any PV1 content (HELPERS-07)", () => {
    expect(() => {
      const v = parseHL7(MIN_PV1).visit;
      void v?.patientClass; void v?.location; void v?.attendingDoctor;
      void v?.admitDateTime; void v?.visitNumber;
    }).not.toThrow();
  });
});
```

(Verify exact PV1 field count + placement by counting pipes — HL7 PV1 has 52 fields per v2.5. Double-check field positions against src/model/segment.ts behavior. If the field-access by number comes up empty, check the pipe-count of FULL_PV1 above — may need to adjust visually. Run the tests and adjust the fixture string until visit fields resolve correctly.)

Run `pnpm test -- helpers-visit`.
  </action>
  <verify>
    <automated>pnpm test -- helpers-visit.test.ts 2>&1 | tail -25 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/helpers/visit.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "export function buildVisit" src/helpers/visit.ts` succeeds
    - `! grep -q "NOT IMPLEMENTED" src/helpers/visit.ts` succeeds
    - `grep -q ".asXcn()" src/helpers/visit.ts` succeeds (D-24 option a)
    - `grep -q ".asPl()" src/helpers/visit.ts` succeeds
    - `grep -q "Object.freeze(out)" src/helpers/visit.ts` succeeds
    - `pnpm test -- helpers-visit.test.ts` exits 0 with ≥ 10 cases passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/helpers/visit.ts` exits 0
  </acceptance_criteria>
  <done>HELPERS-03 closed: msg.visit covers all 7 locked fields, D-04 nullable, D-18 flat Dates, D-24 option (a) XCN for doctors, D-01 frozen, HELPERS-07 never-throws.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement observations + buildObservation (HELPERS-04)</name>
  <files>src/helpers/observations.ts, test/helpers-observations.test.ts</files>
  <read_first>
    - src/helpers/observations.ts (stub from Plan 01 — replace both function bodies)
    - src/helpers/types.ts (Observation + ObservationBase types — authoritative D-13 shapes)
    - src/model/field.ts (asCwe, asCe, asNm, asTs, .value)
    - src/model/segment.ts (Segment.field(n))
    - src/model/types/nm.ts (NM.value is number | undefined)
    - src/model/types/ts.ts (TS.date is Date | undefined)
    - src/model/types/cwe.ts (CWE shape)
    - src/model/types/ce.ts (CE shape)
    - .planning/phases/04-named-helpers/04-PATTERNS.md (§"src/helpers/observations.ts" lines 336-436)
    - .planning/phases/04-named-helpers/04-CONTEXT.md (D-11, D-13, D-14, D-15, D-18, D-22)
  </read_first>
  <behavior>
    - Given OBX `OBX|1|NM|GLU^Glucose^LN||120|mg/dL|80-110||||F|||20250102153100`:
      - observations[0].setId === "1"
      - observations[0].valueType === "NM"
      - observations[0].identifier.identifier === "GLU"
      - observations[0].identifier.text === "Glucose"
      - observations[0].identifier.nameOfCodingSystem === "LN"
      - observations[0].value === 120 (typeof number per D-13)
      - observations[0].units.identifier === "mg/dL"
      - observations[0].referenceRange === "80-110"
      - observations[0].status === "F"
      - observations[0].observedDateTime instanceof Date (D-18 flat)
    - Given OBX with valueType="ST": value is a string ("Hello world", auto-unescaped).
    - Given OBX with valueType="TX": value is a string.
    - Given OBX with valueType="FT": value is a string.
    - Given OBX with valueType="ID": value is a string.
    - Given OBX with valueType="TS" and value "20250115": value instanceof Date (D-18 flat).
    - Given OBX with valueType="DT" and value "20250115": value instanceof Date.
    - Given OBX with valueType="CWE" and value "E11.9^Type 2 DM^I10": value is a CWE object `{ identifier:"E11.9", text:"Type 2 DM", nameOfCodingSystem:"I10" }`.
    - Given OBX with valueType="CE" and similar: value is a CE object.
    - Given OBX with valueType="XXX" (unknown): value is a string (raw OBX-5.1.1 auto-unescaped); valueType in the output is "XXX".
    - Given OBX with empty OBX-5: value === undefined (all branches).
    - Given OBX with unparseable NM (value="abc", valueType="NM"): value === undefined (never throws; D-22).
    - Given OBX with unparseable TS (valueType="TS", value="NotADate"): value === undefined.
    - Given a message with NO OBX: observations() === [] (D-05).
    - observations() returns a frozen array (Object.isFrozen === true).
    - observations() returns a FRESH array on each call (D-06 — not memoized).
    - Never throws on any input (HELPERS-07).
    - buildObservation(seg) is a named export returning a single Observation for a single OBX Segment, so Plan 04's orders() can reuse it.
  </behavior>
  <action>
**Replace both stub bodies in `src/helpers/observations.ts`:**

```ts
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { Field } from "../model/field.js";
import type { Observation, ObservationBase } from "./types.js";
import type { CWE } from "../model/types/cwe.js";
import type { CE } from "../model/types/ce.js";

/** Normalize `""` → `undefined` for helper output; D-22. @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** Return undefined when a composite parses to `{}`. @internal */
function composeOrUndefined<T extends object>(composite: T): T | undefined {
  return Object.keys(composite).length === 0 ? undefined : composite;
}

/**
 * Build one Observation from a single OBX Segment. Value is dispatched by
 * OBX-2 per D-13. Exported so Plan 04's `orders()` can reuse this for the
 * positional OBX grouping (D-12).
 *
 * @example
 * ```ts
 * const obx = msg.segments("OBX")[0];
 * if (obx !== undefined) console.log(buildObservation(obx).value);
 * ```
 */
export function buildObservation(obx: Segment): Observation {
  // Observation identifier is always a CWE — D-15 says "identifier: CWE" (not optional).
  const identifier = obx.field(3).asCwe();

  const common: ObservationBase = Object.freeze({
    ...(stringOrUndefined(obx.field(1).value) !== undefined
      ? { setId: stringOrUndefined(obx.field(1).value) }
      : {}),
    identifier,
    ...(composeOrUndefined(obx.field(6).asCwe()) !== undefined
      ? { units: composeOrUndefined(obx.field(6).asCwe()) }
      : {}),
    ...(stringOrUndefined(obx.field(7).value) !== undefined
      ? { referenceRange: stringOrUndefined(obx.field(7).value) }
      : {}),
    ...(stringOrUndefined(obx.field(8).value) !== undefined
      ? { abnormalFlags: stringOrUndefined(obx.field(8).value) }
      : {}),
    ...(stringOrUndefined(obx.field(11).value) !== undefined
      ? { status: stringOrUndefined(obx.field(11).value) }
      : {}),
    ...(obx.field(14).asTs().date !== undefined
      ? { observedDateTime: obx.field(14).asTs().date }
      : {}),
  }) as ObservationBase;

  // OBX-2 valueType drives the dispatch.
  const valueType = obx.field(2).value;
  const valueField: Field = obx.field(5);

  return dispatchValue(valueType, valueField, common);
}

/**
 * Dispatch the OBX-5 value to the correct parser per D-13's value-type
 * discriminated union.
 *
 * @internal
 */
function dispatchValue(
  valueType: string,
  field: Field,
  common: ObservationBase,
): Observation {
  switch (valueType) {
    case "NM": {
      const nm = field.asNm();
      return Object.freeze({ ...common, valueType: "NM", value: nm.value }) as Observation;
    }
    case "TS":
    case "DT": {
      const ts = field.asTs();
      return Object.freeze({ ...common, valueType, value: ts.date }) as Observation;
    }
    case "CWE": {
      const cwe = field.asCwe();
      const value: CWE | undefined = Object.keys(cwe).length === 0 ? undefined : cwe;
      return Object.freeze({ ...common, valueType: "CWE", value }) as Observation;
    }
    case "CE": {
      const ce = field.asCe();
      const value: CE | undefined = Object.keys(ce).length === 0 ? undefined : ce;
      return Object.freeze({ ...common, valueType: "CE", value }) as Observation;
    }
    default: {
      const raw = field.value;
      const value = raw === "" ? undefined : raw;
      return Object.freeze({ ...common, valueType, value }) as Observation;
    }
  }
}

/**
 * Every OBX segment as an Observation in document order (D-11). D-05:
 * returns `[]` when no OBX present. D-06: NOT memoized — each call
 * re-walks `msg.segments("OBX")`.
 *
 * @example
 * ```ts
 * const msg = parseHL7(raw);
 * for (const obs of msg.observations()) {
 *   if (obs.valueType === "NM") console.log(obs.value); // number | undefined
 * }
 * ```
 */
export function observations(msg: Hl7Message): readonly Observation[] {
  const out: Observation[] = [];
  for (const obx of msg.segments("OBX")) {
    out.push(buildObservation(obx));
  }
  return Object.freeze(out) as readonly Observation[];
}
```

(Note: the spread-based conditional in `common` is verbose. An alternative is `Mutable<ObservationBase>` + per-field conditional assign, mirroring Plan 02's pattern. Pick whichever is cleaner — both pass `exactOptionalPropertyTypes`. The pattern used above uses `...(condition ? {key: val} : {})` which IS `exactOptionalPropertyTypes`-safe because `{}` contributes no key, and `{key: val}` supplies a defined value. Verify with `pnpm tsc --noEmit` — if the spread trick causes issues under `exactOptionalPropertyTypes`, fall back to the `Mutable<T>` pattern.)

**Create `test/helpers-observations.test.ts`:**

Minimum cases (must all pass — NB: trailing fields require careful pipe-count; use explicit field positions by counting pipes):

```ts
/**
 * Phase 4 Plan 03 — integration tests for `msg.observations()` (HELPERS-04,
 * HELPERS-07). Covers the D-13 value-type-discriminated union across every
 * v1 valueType (NM/ST/TX/FT/TS/DT/CWE/CE/ID + unknown).
 */

import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ORU^R01|1|P|2.5\r";

// OBX: setId|valueType|identifier||value|units|refRange|abnormalFlags|||probability|status|||observedDateTime
function obx(valueType: string, value: string, extras = ""): string {
  return `OBX|1|${valueType}|GLU^Glucose^LN||${value}|mg/dL|80-110||||F|||20250102153100${extras}\r`;
}

describe("helpers/observations: msg.observations() — D-13 value-type dispatch", () => {
  it("NM → value is a number", () => {
    const msg = parseHL7(MSH + obx("NM", "120"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("NM");
    expect(o?.value).toBe(120);
  });

  it("NM unparseable → value undefined (D-22, no throw)", () => {
    const msg = parseHL7(MSH + obx("NM", "abc"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("NM");
    expect(o?.value).toBeUndefined();
  });

  it("TS → value is a Date (flat, D-18)", () => {
    const msg = parseHL7(MSH + obx("TS", "20250115120000"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("TS");
    expect(o?.value).toBeInstanceOf(Date);
    expect((o?.value as Date).toISOString()).toBe("2025-01-15T12:00:00.000Z");
  });

  it("DT → value is a Date", () => {
    const msg = parseHL7(MSH + obx("DT", "20250115"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("DT");
    expect((o?.value as Date).toISOString()).toBe("2025-01-15T00:00:00.000Z");
  });

  it("TS unparseable → value undefined", () => {
    const msg = parseHL7(MSH + obx("TS", "NotADate"));
    expect(msg.observations()[0]?.value).toBeUndefined();
  });

  it("CWE → value is a parsed composite (D-14)", () => {
    const msg = parseHL7(MSH + obx("CWE", "E11.9^Type 2 DM^I10"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("CWE");
    // TS narrowing via valueType discriminator
    if (o?.valueType === "CWE") {
      expect(o.value?.identifier).toBe("E11.9");
      expect(o.value?.text).toBe("Type 2 DM");
    } else {
      throw new Error("Expected CWE branch");
    }
  });

  it("CE → value is a parsed composite", () => {
    const msg = parseHL7(MSH + obx("CE", "M^Male^HL70001"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("CE");
    if (o?.valueType === "CE") {
      expect(o.value?.identifier).toBe("M");
    } else {
      throw new Error("Expected CE branch");
    }
  });

  it("ST → value is a raw unescaped string", () => {
    const msg = parseHL7(MSH + obx("ST", "Hello\\F\\World"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("ST");
    expect(o?.value).toBe("Hello|World");  // auto-unescape
  });

  it("TX → value is a string", () => {
    const msg = parseHL7(MSH + obx("TX", "Note text"));
    expect(msg.observations()[0]?.value).toBe("Note text");
  });

  it("FT → value is a string", () => {
    const msg = parseHL7(MSH + obx("FT", "formatted"));
    expect(msg.observations()[0]?.value).toBe("formatted");
  });

  it("ID → value is a string", () => {
    const msg = parseHL7(MSH + obx("ID", "IDCODE"));
    expect(msg.observations()[0]?.value).toBe("IDCODE");
  });

  it("unknown valueType XXX → value is a string; valueType preserved", () => {
    const msg = parseHL7(MSH + obx("XX", "something"));
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("XX");
    expect(o?.value).toBe("something");
  });

  it("empty OBX-5 → value undefined", () => {
    const fx = MSH + "OBX|1|NM|GLU^Glucose^LN|||mg/dL|80-110||||F|||20250102\r";
    expect(parseHL7(fx).observations()[0]?.value).toBeUndefined();
  });
});

describe("helpers/observations: shape + common fields (D-15)", () => {
  it("setId/identifier/units/referenceRange/status/observedDateTime populated", () => {
    const msg = parseHL7(MSH + obx("NM", "120"));
    const o = msg.observations()[0];
    expect(o?.setId).toBe("1");
    expect(o?.identifier.identifier).toBe("GLU");
    expect(o?.identifier.text).toBe("Glucose");
    expect(o?.identifier.nameOfCodingSystem).toBe("LN");
    expect(o?.units?.identifier).toBe("mg/dL");
    expect(o?.referenceRange).toBe("80-110");
    expect(o?.status).toBe("F");
    expect(o?.observedDateTime).toBeInstanceOf(Date);
  });

  it("identifier is always present (D-15 locked — even for empty OBX-3)", () => {
    const fx = MSH + "OBX|1|NM||||||||||F\r";
    const o = parseHL7(fx).observations()[0];
    expect(o?.identifier).toBeDefined();
    expect(Object.keys(o?.identifier ?? {}).length).toBe(0);  // empty CWE
  });
});

describe("helpers/observations: collection contract (D-05 + D-06 + HELPERS-07)", () => {
  it("returns [] when no OBX (D-05)", () => {
    const msg = parseHL7(MSH + "PID|||X");
    expect(msg.observations()).toEqual([]);
  });

  it("returns a FROZEN array", () => {
    const msg = parseHL7(MSH + obx("NM", "120"));
    expect(Object.isFrozen(msg.observations())).toBe(true);
  });

  it("returns distinct references on repeat calls (D-06 NOT memoized)", () => {
    const msg = parseHL7(MSH + obx("NM", "120"));
    const a = msg.observations();
    const b = msg.observations();
    expect(a).not.toBe(b);
    expect(a).toStrictEqual(b);
  });

  it("never throws on any OBX shape (HELPERS-07)", () => {
    expect(() => {
      const msg = parseHL7(MSH + "OBX|||||||\r" + "OBX\r");
      void msg.observations();
    }).not.toThrow();
  });
});

describe("helpers/observations: buildObservation export", () => {
  it("is usable directly on a single OBX Segment", () => {
    const msg = parseHL7(MSH + obx("NM", "120"));
    // Verify the named export exists and works for Plan 04's orders() reuse.
    // Import dynamically to avoid any bundler complaints in test files.
    const obx0 = msg.segments("OBX")[0];
    expect(obx0).toBeDefined();
    // Call observations() instead of buildObservation here; the reuse path
    // is exercised by Plan 04's orders test. Here we just assert
    // observations()[0] shape = buildObservation(obx)[0].
    const o = msg.observations()[0];
    expect(o?.valueType).toBe("NM");
    expect(o?.value).toBe(120);
  });
});
```

Run `pnpm test -- helpers-observations`.
  </action>
  <verify>
    <automated>pnpm test -- helpers-observations.test.ts 2>&1 | tail -40 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/helpers/observations.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "export function observations" src/helpers/observations.ts` succeeds
    - `grep -q "export function buildObservation" src/helpers/observations.ts` succeeds
    - `! grep -q "NOT IMPLEMENTED" src/helpers/observations.ts` succeeds
    - `grep -q 'case "NM"' src/helpers/observations.ts` succeeds (D-13 dispatch)
    - `grep -q 'case "TS"' src/helpers/observations.ts` succeeds
    - `grep -q 'case "CWE"' src/helpers/observations.ts` succeeds
    - `grep -q 'case "CE"' src/helpers/observations.ts` succeeds
    - `grep -q "Object.freeze(out)" src/helpers/observations.ts` succeeds
    - `pnpm test -- helpers-observations.test.ts` exits 0 with ≥ 20 cases passing (12 dispatch + 2 common-field + 4 collection + 1 buildObservation)
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/helpers/observations.ts` exits 0
  </acceptance_criteria>
  <done>HELPERS-04 closed: observations() returns frozen Observation[] with D-13 valueType dispatch covering NM/ST/TX/FT/TS/DT/CWE/CE/ID/unknown, D-15 common fields, D-05 []-on-empty, D-06 not memoized, D-18 flat Date, D-22 no-throw. buildObservation exported for Plan 04 reuse.</done>
</task>

<task type="auto">
  <name>Task 3: Visit cache-invalidation test file (parallel to Plan 02's, disjoint)</name>
  <files>test/helpers-cache-invalidation-visit.test.ts</files>
  <read_first>
    - test/helpers-cache-invalidation.test.ts (Plan 02's sibling file — READ for style reference only; DO NOT edit)
    - src/model/message.ts (mutation methods call invalidateCaches which drops _visit per Plan 01)
    - .planning/phases/04-named-helpers/04-PATTERNS.md (§"test/helpers-cache-invalidation.test.ts" — visit cases)
  </read_first>
  <action>
**Create `test/helpers-cache-invalidation-visit.test.ts`** — a file parallel to Plan 02's `helpers-cache-invalidation.test.ts` so the two test files are disjoint and Plan 03 can run in parallel with Plan 02 on Wave 2.

Write a standalone test file covering visit memoization + invalidation:

```ts
/**
 * Phase 4 Plan 03 — cache memoization + invalidation tests for `msg.visit`.
 * Parallel to Plan 02's `helpers-cache-invalidation.test.ts` (which covers
 * meta + patient + the D-06 collection assertion). Disjoint on purpose so
 * Plans 02 and 03 can run in parallel on Wave 2.
 */

import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

describe("helpers cache invalidation — visit (D-02 + HELPERS-03)", () => {
  const MSH = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r";
  const WITH_PV1 = MSH + "PID|||X\r" + "PV1|1|I";
  const WITHOUT_PV1 = MSH + "PID|||X";

  it("msg.visit === msg.visit across reads (memoization)", () => {
    const msg = parseHL7(WITH_PV1);
    expect(msg.visit).toBe(msg.visit);
  });

  it("msg.visit undefined stays undefined across repeat reads (null-sentinel cache)", () => {
    const msg = parseHL7(WITHOUT_PV1);
    expect(msg.visit).toBeUndefined();
    expect(msg.visit).toBeUndefined();
  });

  it("msg.addSegment('PV1', ['1', 'O']) flips visit from undefined to defined", () => {
    const msg = parseHL7(WITHOUT_PV1);
    expect(msg.visit).toBeUndefined();
    msg.addSegment("PV1", ["1", "O"]);
    expect(msg.visit).toBeDefined();
    expect(msg.visit?.patientClass).toBe("O");
  });

  it("msg.setField('PV1.2', 'E') drops the visit cache", () => {
    const msg = parseHL7(WITH_PV1);
    const before = msg.visit;
    expect(before?.patientClass).toBe("I");
    msg.setField("PV1.2", "E");
    const after = msg.visit;
    expect(after).not.toBe(before);
    expect(after?.patientClass).toBe("E");
  });

  it("msg.removeSegment('PV1') drops the visit cache → undefined", () => {
    const msg = parseHL7(WITH_PV1);
    expect(msg.visit).toBeDefined();
    msg.removeSegment("PV1");
    expect(msg.visit).toBeUndefined();
  });
});
```

Run `pnpm test -- helpers-cache-invalidation-visit`. All 5 visit cases must pass. Plan 02's `helpers-cache-invalidation.test.ts` must ALSO still pass (disjoint — this plan does not touch it).
  </action>
  <verify>
    <automated>pnpm test -- helpers-cache-invalidation-visit.test.ts helpers-cache-invalidation.test.ts 2>&1 | tail -25 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint test/helpers-cache-invalidation-visit.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f test/helpers-cache-invalidation-visit.test.ts` succeeds
    - `grep -q 'helpers cache invalidation — visit' test/helpers-cache-invalidation-visit.test.ts` succeeds
    - `grep -q 'msg.visit.*toBe.*msg.visit\|msg\.visit).toBe(msg\.visit' test/helpers-cache-invalidation-visit.test.ts` succeeds
    - `pnpm test -- helpers-cache-invalidation-visit.test.ts` exits 0 with ≥ 5 cases passing
    - `pnpm test -- helpers-cache-invalidation.test.ts` STILL exits 0 (Plan 02's file untouched)
    - `git diff test/helpers-cache-invalidation.test.ts` returns empty (Plan 03 did NOT edit Plan 02's file)
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint test/helpers-cache-invalidation-visit.test.ts` exits 0
  </acceptance_criteria>
  <done>Visit cache memoization + invalidation verified via its own disjoint test file; Plan 02's cache-invalidation file is untouched; Wave 2 parallelism preserved.</done>
</task>

</tasks>

<verification>
```bash
pnpm typecheck
pnpm lint
pnpm test -- helpers-visit helpers-observations helpers-cache-invalidation
pnpm test    # full suite should exit 0 with ≥ 390 tests (Plan 01 baseline + Plan 02 + Plan 03)
```

Confirm HELPERS-03 + HELPERS-04 acceptance:
- Parse an ORU^R01 fixture with OBR + 3 OBX (NM/TS/CWE) — iterate observations() and verify value-type dispatch.
- Parse an ADT^A01 fixture with PV1 — verify visit exposes all 7 locked fields.
</verification>

<success_criteria>
- HELPERS-03 satisfied: `msg.visit` exposes patientClass/location/admitDateTime/dischargeDateTime/attendingDoctor/referringDoctor/visitNumber; undefined when no PV1; XCN used for doctors (D-24 option a); frozen; never throws.
- HELPERS-04 satisfied: `msg.observations()` returns frozen readonly Observation[] with D-13 valueType discriminated union; NM/TS/DT/CWE/CE/ST/TX/FT/ID/unknown all dispatched correctly; D-05 empty; D-06 not memoized; D-18 flat Date; D-15 common fields (setId/identifier/units/referenceRange/abnormalFlags/status/observedDateTime).
- `buildObservation` exported — Plan 04 can consume it for positional OBX grouping in `orders()`.
- D-02 visit cache invalidation proven: setField/addSegment/removeSegment all drop _visit.
- Full `pnpm test` green; no edits to message.ts/field.ts/index.ts/types.ts or Plan 02/04 files.
</success_criteria>

<output>
After completion, create `.planning/phases/04-named-helpers/04-03-SUMMARY.md` with:
- What shipped (buildVisit, observations, buildObservation, visit + observations test suites, cache-invalidation visit section).
- HELPERS-03 + HELPERS-04 + HELPERS-07 closed for PV1 + OBX surfaces.
- D-24 option (a) verified end-to-end via visit.attendingDoctor/referringDoctor = XCN.
- Notes for Plan 04: `buildObservation(seg)` is exported from observations.ts — reuse for positional OBX grouping in orders(). Do NOT reimplement OBX-to-Observation construction.
- Files created (2) + modified (3).
- Test count before/after.
</output>
