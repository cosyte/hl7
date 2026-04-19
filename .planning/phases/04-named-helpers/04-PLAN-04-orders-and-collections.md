---
phase: 04-named-helpers
plan: 04
type: execute
wave: 3
depends_on: [01, 03]
files_modified:
  - src/helpers/orders.ts
  - src/helpers/next-of-kin.ts
  - src/helpers/allergies.ts
  - src/helpers/diagnoses.ts
  - src/helpers/insurance.ts
  - test/helpers-orders.test.ts
  - test/helpers-collections.test.ts
autonomous: true
requirements: [HELPERS-05, HELPERS-06, HELPERS-07]

must_haves:
  truths:
    - "A developer calling `msg.orders()` on a message with OBR + OBX segments receives an Order[] where each Order has the OBX under it (positionally grouped per D-12)."
    - "A developer reads `order.placerOrderNumber`, `order.fillerOrderNumber`, `order.universalServiceId`, `order.orderStatus`, `order.orderControl`, `order.orderedBy`, `order.observations` and gets the D-16 locked contract."
    - "A developer parsing an ORM^O01 with ORC before OBR sees `order.orderControl` populated from the ORC-1; ORC without following OBR is ignored."
    - "A developer calling `msg.orders()[0].observations` gets Observation[] for the OBX following the first OBR (reusing buildObservation from Plan 03)."
    - "A developer calling `msg.orders()[0].orderedBy` gets an XCN composite (D-24 option a)."
    - "A developer calling `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`, `msg.insurance()` receives typed readonly arrays (empty when source segments absent, per D-05 + HELPERS-06)."
    - "A developer iterating `msg.insurance()` sees one entry per IN1 with hasIn2/hasIn3 flags set based on positional IN2/IN3 following."
    - "A developer calling these helpers on messages with NO matching segments receives `[]` without throwing."
    - "Every helper never throws (HELPERS-07) even on malformed/partial segments."
  artifacts:
    - path: "src/helpers/orders.ts"
      provides: "orders(msg) → Order[] with D-12 positional OBX grouping"
      exports: ["orders"]
      min_lines: 80
    - path: "src/helpers/next-of-kin.ts"
      provides: "nextOfKin(msg) → NextOfKin[]"
      exports: ["nextOfKin"]
    - path: "src/helpers/allergies.ts"
      provides: "allergies(msg) → Allergy[]"
      exports: ["allergies"]
    - path: "src/helpers/diagnoses.ts"
      provides: "diagnoses(msg) → Diagnosis[]"
      exports: ["diagnoses"]
    - path: "src/helpers/insurance.ts"
      provides: "insurance(msg) → Insurance[] with IN2/IN3 positional flags"
      exports: ["insurance"]
    - path: "test/helpers-orders.test.ts"
      provides: "Orders + OBX-grouping tests"
      contains: "describe(\"helpers/orders"
    - path: "test/helpers-collections.test.ts"
      provides: "Collection helper tests for NK1/AL1/DG1/IN1 + universal never-throws coverage"
      contains: "describe(\"helpers/collections"
  key_links:
    - from: "src/helpers/orders.ts"
      to: "src/helpers/observations.ts::buildObservation"
      via: "reuse for positional OBX → Observation"
      pattern: "buildObservation"
    - from: "src/helpers/orders.ts"
      to: "msg.allSegments() state machine"
      via: "document-order walk for ORC → OBR → OBX grouping"
      pattern: "allSegments\\(\\)"
    - from: "src/helpers/insurance.ts"
      to: "msg.allSegments() state machine"
      via: "IN1 opens group; subsequent IN2/IN3 attach until next IN1"
      pattern: "allSegments\\(\\)"
---

<objective>
Close HELPERS-05 + HELPERS-06 + HELPERS-07 by filling the 5 remaining stub
helpers that Plan 01 scaffolded. All five are collection walkers; one
(`orders`) and one (`insurance`) use document-order state machines because
they positionally group child segments under parent segments.

**In scope:**
- `orders(msg): readonly Order[]` — D-12 positional OBX grouping, ORC-1 → orderControl
  when ORC precedes OBR. Reuses `buildObservation` from Plan 03.
- `nextOfKin(msg): readonly NextOfKin[]` — one entry per NK1.
- `allergies(msg): readonly Allergy[]` — one entry per AL1.
- `diagnoses(msg): readonly Diagnosis[]` — one entry per DG1.
- `insurance(msg): readonly Insurance[]` — one entry per IN1 with positional
  IN2/IN3 flags (hasIn2/hasIn3 per types.ts Plan 01 lean shape).
- Tests: `helpers-orders.test.ts`, `helpers-collections.test.ts` (merged file
  for NK1/AL1/DG1/IN1 + a universal HELPERS-07 sweep across every helper).

**Out of scope:**
- No new types — all 5 shapes were locked by Plan 01's types.ts.
- No changes to message.ts (method already wired in Plan 01).
- No changes to the cache-invalidation test (collections are NOT memoized per D-06;
  Plan 02's test already has a D-06 case for observations, which is representative).

**Decision authority:** Plan 04 MUST NOT edit message.ts, field.ts, index.ts,
types.ts, or any Plan 01/02/03 helper file. Only the 5 stub bodies Plan 01
left + 2 new test files.

**Design note — orders() state machine (why the naive ORC attachment fails):**
A naive implementation might try to attach `pendingOrc` as soon as the OBR is
seen, then clear it. That breaks if the closing/finalization of the PREVIOUS
order runs in the same branch, because the "pending" ORC really belongs to the
NEW OBR, not the old one. The correct model has TWO slots — `pendingOrc`
(accumulates ORCs since the last OBR) and `currentOrc` (the ORC attached to
the currently-open OBR group). When an OBR is seen, close the previous group
with `currentOrc`, then promote `pendingOrc` → `currentOrc` for the new group
and reset `pendingOrc`. A trailing ORC after the last OBR stays in `pendingOrc`
and is implicitly dropped (never promoted). This matches D-16: "when ORC
precedes OBR" = "most recent ORC before this OBR within the same group." The
Task 1 action block contains only the correct two-slot state machine.

Output: 5 stub helpers filled; 2 new test files. Phase 4 complete after this plan.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-named-helpers/04-CONTEXT.md
@.planning/phases/04-named-helpers/04-PATTERNS.md
@.planning/phases/04-named-helpers/04-01-SUMMARY.md
@.planning/phases/04-named-helpers/04-02-SUMMARY.md
@.planning/phases/04-named-helpers/04-03-SUMMARY.md
@src/helpers/types.ts
@src/helpers/orders.ts
@src/helpers/next-of-kin.ts
@src/helpers/allergies.ts
@src/helpers/diagnoses.ts
@src/helpers/insurance.ts
@src/helpers/observations.ts
@src/model/message.ts
@src/model/segment.ts
@src/model/field.ts
@CLAUDE.md

<interfaces>
<!-- All 5 target type shapes locked by Plan 01's src/helpers/types.ts. Read that file first. -->

From src/helpers/types.ts (Plan 01):
- Order: { placerOrderNumber?, fillerOrderNumber?, universalServiceId?: CWE, orderStatus?, orderControl?, orderedBy?: XCN, observations: readonly Observation[] }
- NextOfKin: { name?: XPN, relationship?: CWE, address?: XAD, phone?: XTN, contactRole?: CWE }
- Allergy: { type?, code?: CWE, severity?, reaction?, onsetDate?: Date }
- Diagnosis: { code?: CWE, description?, dateTime?: Date, type? }
- Insurance: { planId?: CWE, companyId?: CX, companyName?, policyNumber?, groupNumber?, insuredName?: XPN, effectiveDate?: Date, expirationDate?: Date, hasIn2: boolean, hasIn3: boolean }

From src/helpers/observations.ts (Plan 03):
- export function buildObservation(seg: Segment): Observation  — reuse for orders() OBX grouping

From src/model/message.ts:
- msg.segments(type): readonly Segment[]
- msg.allSegments(): readonly Segment[]  — for state-machine walks that need cross-type ordering
- msg.encodingCharacters

From src/model/segment.ts:
- seg.type: string
- seg.field(n: number): Field

HL7 v2.5 segment field positions (lean v1 shape — planner picks per CONTEXT.md Claude's Discretion):
- OBR: 1=setId, 2=placerOrderNumber (EI→string), 3=fillerOrderNumber, 4=universalServiceId (CWE), 5=priority, 16=orderingProvider (XCN), 25=resultStatus (ID→orderStatus for v1 per D-16)
- ORC: 1=orderControl (ID — "NW", "OK", "CA", "CR", ...)
- NK1: 2=name (XPN), 3=relationship (CE/CWE), 4=address (XAD), 5=phoneNumber (XTN), 7=contactRole (CE/CWE)
- AL1: 2=allergenTypeCode (IS — "DA"/"FA"/"MA"), 3=allergenCodeMnemonic (CWE/CE), 4=allergySeverity (IS — "SV"/"MO"/"MI"), 5=allergyReaction (string/CWE), 6=identificationDate (TS/DT)
- DG1: 3=diagnosisCode (CWE), 4=diagnosisDescription (string), 5=diagnosisDateTime (TS), 6=diagnosisType (IS)
- IN1: 2=insurancePlanId (CWE), 3=insuranceCompanyId (CX — first rep), 4=insuranceCompanyName (XON — we flatten to first component string for v1 lean), 8=groupNumber, 12=planEffectiveDate (TS/DT), 13=planExpirationDate, 16=nameOfInsured (XPN), 36=policyNumber
- IN2, IN3: positional metadata — lean shape only tracks hasIn2/hasIn3 booleans.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement orders() with positional OBX grouping (HELPERS-05)</name>
  <files>src/helpers/orders.ts, test/helpers-orders.test.ts</files>
  <read_first>
    - src/helpers/orders.ts (stub from Plan 01 — replace body)
    - src/helpers/observations.ts (Plan 03 — buildObservation import)
    - src/helpers/types.ts (Order interface — authoritative)
    - src/model/message.ts (msg.allSegments() for document-order walk)
    - src/model/field.ts (asCwe, asXcn, .value)
    - .planning/phases/04-named-helpers/04-PATTERNS.md (§"src/helpers/orders.ts" lines 438-489 — state-machine algorithm)
    - .planning/phases/04-named-helpers/04-CONTEXT.md (D-11 observations()-all-OBX, D-12 orders-group-OBX-under-OBR, D-16 Order field contract, D-22 never-throws, D-24 orderedBy XCN)
  </read_first>
  <behavior>
    - Given fixture (ORM^O01):
      ```
      MSH|^~\&|APP|FAC|||20250102||ORM^O01|1|P|2.5
      PID|||X
      ORC|NW
      OBR|1|PLACER1|FILLER1|GLU^Glucose^LN|||||||||||||XCN1^Doe^John
      OBX|1|NM|GLU^Glucose^LN||120|mg/dL
      OBX|2|NM|CR^Creatinine^LN||1.0|mg/dL
      OBR|2|PLACER2|FILLER2|HGB^Hemoglobin^LN
      OBX|1|NM|HGB^Hemoglobin^LN||14.5|g/dL
      ```
      - msg.orders().length === 2.
      - orders[0].placerOrderNumber === "PLACER1".
      - orders[0].fillerOrderNumber === "FILLER1".
      - orders[0].universalServiceId.identifier === "GLU"; .text === "Glucose".
      - orders[0].orderControl === "NW" (from ORC-1 preceding first OBR).
      - orders[0].orderedBy.idNumber === "XCN1"; .familyName === "Doe"; .givenName === "John".
      - orders[0].observations.length === 2; .observations[0].value === 120; .observations[1].value === 1.0.
      - orders[1].observations.length === 1; .observations[0].value === 14.5.
      - orders[1].orderControl is undefined (no ORC between OBR[0] and OBR[1]).
    - Given a message with OBX before any OBR: those pre-OBR OBX are NOT attached to any order (D-12) but ARE still returned by msg.observations().
    - Given a message with OBR but no OBX: order.observations === [] (frozen).
    - Given a message with NO OBR: orders() === [] (D-05).
    - Given an ORC without a following OBR (trailing ORC): the ORC is dropped; no phantom order created.
    - orders() returns a frozen readonly Order[].
    - orders() returns fresh reference on each call (D-06 not memoized).
    - Never throws (HELPERS-07, D-22).
    - buildObservation from Plan 03 is reused — verify via grep that orders.ts imports `buildObservation`.
  </behavior>
  <action>
**Replace stub body in `src/helpers/orders.ts`:**

The correct state machine has TWO ORC slots — `pendingOrc` (accumulates ORCs
since the last OBR) and `currentOrc` (the ORC attached to the currently-open
OBR group). See the objective block's "Design note" above for why a single
slot is insufficient. Implementation:

```ts
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { CWE } from "../model/types/cwe.js";
import type { XCN } from "../model/types/xcn.js";
import type { Observation, Order } from "./types.js";
import { buildObservation } from "./observations.js";

/** Normalize `""` → `undefined`. @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** @internal — build an Order from the accumulated state. */
function finalizeOrder(
  obr: Segment,
  attachedOrc: Segment | undefined,
  observations: readonly Observation[],
): Order {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Order> = { observations };

  const placer = stringOrUndefined(obr.field(2).value);
  if (placer !== undefined) out.placerOrderNumber = placer;

  const filler = stringOrUndefined(obr.field(3).value);
  if (filler !== undefined) out.fillerOrderNumber = filler;

  const usvc: CWE = obr.field(4).asCwe();
  if (Object.keys(usvc).length > 0) out.universalServiceId = usvc;

  // D-16: orderStatus from OBR-25 (resultStatus) for v1; Phase 7 may revisit.
  const status = stringOrUndefined(obr.field(25).value);
  if (status !== undefined) out.orderStatus = status;

  // D-16: orderControl from the attached ORC-1 (when an ORC preceded this OBR).
  if (attachedOrc !== undefined) {
    const oc = stringOrUndefined(attachedOrc.field(1).value);
    if (oc !== undefined) out.orderControl = oc;
  }

  // D-16: orderedBy from OBR-16 (XCN via D-24 option a).
  const orderedBy: XCN = obr.field(16).asXcn();
  if (Object.keys(orderedBy).length > 0) out.orderedBy = orderedBy;

  return Object.freeze(out) as Order;
}

/**
 * Every OBR as an Order with its OBX children grouped positionally (D-12).
 * OBX segments that precede any OBR are NOT attached to an order (they still
 * appear in `msg.observations()` which walks all OBX regardless).
 *
 * An ORC segment preceding an OBR contributes its `orderControl` (ORC-1) to
 * that order. Unmatched ORCs (no following OBR — i.e. trailing ORCs after
 * the last OBR) are dropped.
 *
 * D-05: returns `[]` when no OBR present. D-06: NOT memoized.
 *
 * @example
 * ```ts
 * for (const order of msg.orders()) {
 *   console.log(order.placerOrderNumber, order.observations.length);
 *   for (const obs of order.observations) console.log(obs.value);
 * }
 * ```
 */
export function orders(msg: Hl7Message): readonly Order[] {
  const out: Order[] = [];
  let pendingOrc: Segment | undefined;  // accumulates ORCs since last OBR
  let currentObr: Segment | undefined;
  let currentOrc: Segment | undefined;  // ORC attached to the open OBR group
  let currentObservations: Observation[] = [];

  for (const seg of msg.allSegments()) {
    if (seg.type === "ORC") {
      pendingOrc = seg;
      continue;
    }
    if (seg.type === "OBR") {
      // Close previous group using THAT group's attached ORC.
      if (currentObr !== undefined) {
        out.push(
          finalizeOrder(
            currentObr,
            currentOrc,
            Object.freeze(currentObservations.slice()) as readonly Observation[],
          ),
        );
      }
      // Open new group; promote pendingOrc → currentOrc; reset pending.
      currentObr = seg;
      currentOrc = pendingOrc;
      pendingOrc = undefined;
      currentObservations = [];
      continue;
    }
    if (seg.type === "OBX" && currentObr !== undefined) {
      currentObservations.push(buildObservation(seg));
    }
  }

  // Finalize the trailing order. A trailing ORC after the last OBR stays in
  // pendingOrc and is implicitly dropped (never promoted to currentOrc).
  if (currentObr !== undefined) {
    out.push(
      finalizeOrder(
        currentObr,
        currentOrc,
        Object.freeze(currentObservations.slice()) as readonly Observation[],
      ),
    );
  }

  return Object.freeze(out) as readonly Order[];
}
```

**Create `test/helpers-orders.test.ts`:**

```ts
/**
 * Phase 4 Plan 04 — integration tests for `msg.orders()` (HELPERS-05, HELPERS-07).
 * Covers D-12 positional OBX grouping + ORC orderControl attachment.
 */

import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ORM^O01|1|P|2.5\r";
const PID = "PID|||X\r";

const TWO_ORDERS =
  MSH + PID +
  "ORC|NW\r" +
  "OBR|1|PLACER1|FILLER1|GLU^Glucose^LN|||||||||||||XCN1^Doe^John\r" +
  "OBX|1|NM|GLU^Glucose^LN||120|mg/dL\r" +
  "OBX|2|NM|CR^Creatinine^LN||1.0|mg/dL\r" +
  "OBR|2|PLACER2|FILLER2|HGB^Hemoglobin^LN\r" +
  "OBX|1|NM|HGB^Hemoglobin^LN||14.5|g/dL";

describe("helpers/orders: msg.orders() — HELPERS-05", () => {
  it("returns [] when no OBR present (D-05)", () => {
    const msg = parseHL7(MSH + PID);
    expect(msg.orders()).toEqual([]);
  });

  it("groups 2 orders from 2 OBRs with 2 + 1 OBX", () => {
    const orders = parseHL7(TWO_ORDERS).orders();
    expect(orders).toHaveLength(2);
    expect(orders[0]?.observations).toHaveLength(2);
    expect(orders[1]?.observations).toHaveLength(1);
  });

  it("populates placerOrderNumber/fillerOrderNumber (D-16)", () => {
    const o = parseHL7(TWO_ORDERS).orders()[0];
    expect(o?.placerOrderNumber).toBe("PLACER1");
    expect(o?.fillerOrderNumber).toBe("FILLER1");
  });

  it("populates universalServiceId as CWE (D-16)", () => {
    const o = parseHL7(TWO_ORDERS).orders()[0];
    expect(o?.universalServiceId?.identifier).toBe("GLU");
    expect(o?.universalServiceId?.text).toBe("Glucose");
    expect(o?.universalServiceId?.nameOfCodingSystem).toBe("LN");
  });

  it("attaches ORC-1 as orderControl when ORC precedes OBR (D-16)", () => {
    const orders = parseHL7(TWO_ORDERS).orders();
    expect(orders[0]?.orderControl).toBe("NW");
    // Second OBR has no preceding ORC — orderControl absent.
    expect("orderControl" in (orders[1] ?? {})).toBe(false);
  });

  it("populates orderedBy as XCN (OBR-16, D-24 option a)", () => {
    const o = parseHL7(TWO_ORDERS).orders()[0];
    expect(o?.orderedBy?.idNumber).toBe("XCN1");
    expect(o?.orderedBy?.familyName).toBe("Doe");
    expect(o?.orderedBy?.givenName).toBe("John");
  });

  it("embeds OBX as Observation[] via buildObservation (D-12)", () => {
    const o = parseHL7(TWO_ORDERS).orders()[0];
    expect(o?.observations[0]?.valueType).toBe("NM");
    expect(o?.observations[0]?.value).toBe(120);
    expect(o?.observations[0]?.identifier.identifier).toBe("GLU");
  });

  it("OBX before any OBR is NOT attached to an order (D-12)", () => {
    const fx =
      MSH + PID +
      "OBX|1|NM|EARLY^Early^X||42\r" +
      "OBR|1|P|F|SVC\r" +
      "OBX|1|NM|IN^InOrder^X||7";
    const msg = parseHL7(fx);
    const orders = msg.orders();
    expect(orders).toHaveLength(1);
    expect(orders[0]?.observations).toHaveLength(1);
    expect(orders[0]?.observations[0]?.value).toBe(7);
    // But msg.observations() still sees both OBX
    expect(msg.observations()).toHaveLength(2);
  });

  it("OBR with no OBX → empty observations array", () => {
    const fx = MSH + PID + "OBR|1|P|F|SVC";
    const o = parseHL7(fx).orders()[0];
    expect(o?.observations).toEqual([]);
    expect(Object.isFrozen(o?.observations)).toBe(true);
  });

  it("trailing ORC without OBR is dropped", () => {
    const fx = MSH + PID + "OBR|1|P|F|SVC\r" + "OBX|1|NM|X||1\r" + "ORC|CA";
    const orders = parseHL7(fx).orders();
    expect(orders).toHaveLength(1);  // No phantom order from trailing ORC.
    expect("orderControl" in (orders[0] ?? {})).toBe(false);
  });

  it("returned array is frozen and not memoized (D-06)", () => {
    const msg = parseHL7(TWO_ORDERS);
    const a = msg.orders();
    const b = msg.orders();
    expect(Object.isFrozen(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a).toStrictEqual(b);
  });

  it("never throws on malformed OBR/OBX (HELPERS-07)", () => {
    expect(() => {
      const msg = parseHL7(MSH + PID + "OBR\r" + "OBX\r");
      void msg.orders();
    }).not.toThrow();
  });
});
```

Run `pnpm test -- helpers-orders`.
  </action>
  <verify>
    <automated>pnpm test -- helpers-orders.test.ts 2>&1 | tail -30 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/helpers/orders.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "export function orders" src/helpers/orders.ts` succeeds
    - `! grep -q "NOT IMPLEMENTED" src/helpers/orders.ts` succeeds
    - `grep -q "buildObservation" src/helpers/orders.ts` succeeds (reuses Plan 03's function)
    - `grep -q 'import { buildObservation }' src/helpers/orders.ts` succeeds
    - `grep -q "allSegments()" src/helpers/orders.ts` succeeds (state-machine walk)
    - `grep -q 'seg.type === "ORC"' src/helpers/orders.ts` succeeds
    - `grep -q 'seg.type === "OBR"' src/helpers/orders.ts` succeeds
    - `grep -q 'seg.type === "OBX"' src/helpers/orders.ts` succeeds
    - `grep -q ".asXcn()" src/helpers/orders.ts` succeeds (D-24 option a orderedBy)
    - `pnpm test -- helpers-orders.test.ts` exits 0 with ≥ 11 cases passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/helpers/orders.ts` exits 0
  </acceptance_criteria>
  <done>HELPERS-05 closed: orders() positionally groups OBX under OBR (D-12), attaches ORC-1 as orderControl, reuses buildObservation, full D-16 field contract, HELPERS-07 never-throws, D-06 not memoized.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement nextOfKin / allergies / diagnoses / insurance (HELPERS-06)</name>
  <files>src/helpers/next-of-kin.ts, src/helpers/allergies.ts, src/helpers/diagnoses.ts, src/helpers/insurance.ts, test/helpers-collections.test.ts</files>
  <read_first>
    - src/helpers/next-of-kin.ts (stub from Plan 01)
    - src/helpers/allergies.ts (stub)
    - src/helpers/diagnoses.ts (stub)
    - src/helpers/insurance.ts (stub)
    - src/helpers/types.ts (all 4 target interfaces — authoritative)
    - src/helpers/patient.ts (Plan 02 — Mutable<T>/conditional-assign pattern analog)
    - src/model/field.ts (asXpn, asCwe, asCe, asXad, asXtn, asTs, asCx, .value)
    - src/model/message.ts (segments(type) for NK1/AL1/DG1; allSegments() for insurance state machine)
    - .planning/phases/04-named-helpers/04-PATTERNS.md (§"next-of-kin.ts / allergies.ts / diagnoses.ts" lines 491-526; §"insurance.ts" 528-534)
    - .planning/phases/04-named-helpers/04-CONTEXT.md (D-05 []-on-empty, D-22 never-throws, Claude's Discretion § insurance grouping)
  </read_first>
  <behavior>
    - **nextOfKin** — given NK1 `NK1|1|Doe^John^^^Mr|FTH|456 Oak St^^Boston^MA|(555)111-2222|||FTHR`:
      - nextOfKin[0].name.familyName === "Doe"; .givenName === "John"; .prefix === "Mr".
      - nextOfKin[0].relationship.identifier === "FTH".
      - nextOfKin[0].address.city === "Boston".
      - nextOfKin[0].phone.telephoneNumber === "(555)111-2222".
      - nextOfKin[0].contactRole.identifier === "FTHR".
      - nextOfKin() returns [] when no NK1 (D-05).
    - **allergies** — given AL1 `AL1|1|DA|PEN^Penicillin^DRUG|SV|Hives|20250101`:
      - allergies[0].type === "DA".
      - allergies[0].code.identifier === "PEN".
      - allergies[0].severity === "SV".
      - allergies[0].reaction === "Hives".
      - allergies[0].onsetDate instanceof Date (D-18 flat) with ISO "2025-01-01T00:00:00.000Z".
    - **diagnoses** — given DG1 `DG1|1|I10|E11.9^Type 2 diabetes^I10|Diabetes description|20250102|W`:
      - diagnoses[0].code.identifier === "E11.9".
      - diagnoses[0].code.text === "Type 2 diabetes".
      - diagnoses[0].description === "Diabetes description" (DG1-4 = diagnosisDescription, ST).
      - diagnoses[0].dateTime instanceof Date (D-18) parsed from DG1-5 "20250102".
      - diagnoses[0].type === "W" (DG1-6 = diagnosisType, IS — "A"=admit, "W"=working, "F"=final).
    - **insurance** — given `IN1|1|PLAN^CompanyPlan|CO123^^^HOSP|BlueCross|...|GRP001|||||VIC^Insured|20250101|20261231|...|POLICY123` + optional IN2 + IN3 following:
      - insurance[0].planId.identifier === "PLAN".
      - insurance[0].companyId.idNumber === "CO123".
      - insurance[0].companyName === "BlueCross".
      - insurance[0].groupNumber === "GRP001".
      - insurance[0].insuredName.familyName === "VIC".
      - insurance[0].effectiveDate instanceof Date.
      - insurance[0].expirationDate instanceof Date.
      - insurance[0].policyNumber === "POLICY123".
      - insurance[0].hasIn2 === false when no IN2 follows; true when IN2 is immediately after IN1 before next IN1.
      - insurance[0].hasIn3 === false/true similarly.
    - All 4 helpers: D-05 return `[]` when source segments absent; D-22 never throw; return frozen arrays; D-06 NOT memoized (distinct reference on each call).
  </behavior>
  <action>
**Replace stub bodies for all 4 files. Pattern: Mutable<T> + conditional-assign + Object.freeze (same as Plan 02's buildPatient).**

### `src/helpers/next-of-kin.ts`:

```ts
import type { Hl7Message } from "../model/message.js";
import type { NextOfKin } from "./types.js";

/**
 * Every NK1 as a NextOfKin entry in document order. D-05: returns `[]`
 * when no NK1 present. D-06: NOT memoized. HELPERS-07: never throws.
 *
 * Fields: name (NK1-2, XPN), relationship (NK1-3, CWE), address (NK1-4, XAD),
 * phone (NK1-5 first rep, XTN), contactRole (NK1-7, CWE).
 *
 * @example
 * ```ts
 * for (const nk of msg.nextOfKin()) {
 *   console.log(nk.name?.familyName, nk.relationship?.identifier);
 * }
 * ```
 */
export function nextOfKin(msg: Hl7Message): readonly NextOfKin[] {
  const out: NextOfKin[] = [];
  for (const nk1 of msg.segments("NK1")) {
    type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
    const entry: Mutable<NextOfKin> = {};

    const name = nk1.field(2).asXpn();
    if (Object.keys(name).length > 0) entry.name = name;

    const relationship = nk1.field(3).asCwe();
    if (Object.keys(relationship).length > 0) entry.relationship = relationship;

    const address = nk1.field(4).asXad();
    if (Object.keys(address).length > 0) entry.address = address;

    const phone = nk1.field(5).asXtn();
    if (Object.keys(phone).length > 0) entry.phone = phone;

    const contactRole = nk1.field(7).asCwe();
    if (Object.keys(contactRole).length > 0) entry.contactRole = contactRole;

    out.push(Object.freeze(entry) as NextOfKin);
  }
  return Object.freeze(out) as readonly NextOfKin[];
}
```

### `src/helpers/allergies.ts`:

```ts
import type { Hl7Message } from "../model/message.js";
import type { Allergy } from "./types.js";

function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/**
 * Every AL1 as an Allergy entry in document order. Fields: type (AL1-2,
 * string), code (AL1-3, CWE), severity (AL1-4, string), reaction (AL1-5,
 * string first value), onsetDate (AL1-6, flat Date per D-18).
 *
 * @example
 * ```ts
 * for (const al of msg.allergies()) {
 *   console.log(al.code?.identifier, al.severity);
 * }
 * ```
 */
export function allergies(msg: Hl7Message): readonly Allergy[] {
  const out: Allergy[] = [];
  for (const al1 of msg.segments("AL1")) {
    type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
    const entry: Mutable<Allergy> = {};

    const type = stringOrUndefined(al1.field(2).value);
    if (type !== undefined) entry.type = type;

    const code = al1.field(3).asCwe();
    if (Object.keys(code).length > 0) entry.code = code;

    const severity = stringOrUndefined(al1.field(4).value);
    if (severity !== undefined) entry.severity = severity;

    const reaction = stringOrUndefined(al1.field(5).value);
    if (reaction !== undefined) entry.reaction = reaction;

    const onset = al1.field(6).asTs();
    if (onset.date !== undefined) entry.onsetDate = onset.date;

    out.push(Object.freeze(entry) as Allergy);
  }
  return Object.freeze(out) as readonly Allergy[];
}
```

### `src/helpers/diagnoses.ts`:

```ts
import type { Hl7Message } from "../model/message.js";
import type { Diagnosis } from "./types.js";

function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/**
 * Every DG1 as a Diagnosis entry in document order. Fields: code (DG1-3,
 * CWE), description (DG1-4, string), dateTime (DG1-5, flat Date D-18),
 * type (DG1-6, string — "A"=admit, "W"=working, "F"=final).
 *
 * @example
 * ```ts
 * for (const dg of msg.diagnoses()) {
 *   console.log(dg.code?.identifier, dg.description);
 * }
 * ```
 */
export function diagnoses(msg: Hl7Message): readonly Diagnosis[] {
  const out: Diagnosis[] = [];
  for (const dg1 of msg.segments("DG1")) {
    type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
    const entry: Mutable<Diagnosis> = {};

    const code = dg1.field(3).asCwe();
    if (Object.keys(code).length > 0) entry.code = code;

    const description = stringOrUndefined(dg1.field(4).value);
    if (description !== undefined) entry.description = description;

    const dt = dg1.field(5).asTs();
    if (dt.date !== undefined) entry.dateTime = dt.date;

    const type = stringOrUndefined(dg1.field(6).value);
    if (type !== undefined) entry.type = type;

    out.push(Object.freeze(entry) as Diagnosis);
  }
  return Object.freeze(out) as readonly Diagnosis[];
}
```

### `src/helpers/insurance.ts` (state machine — IN1 opens group, IN2/IN3 follow):

```ts
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { Insurance } from "./types.js";

function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** @internal — finalize an IN1 group with hasIn2/hasIn3 flags. */
function finalizeInsurance(in1: Segment, hasIn2: boolean, hasIn3: boolean): Insurance {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const entry: Mutable<Insurance> = { hasIn2, hasIn3 };

  const planId = in1.field(2).asCwe();
  if (Object.keys(planId).length > 0) entry.planId = planId;

  const companyId = in1.field(3).asCx();
  if (Object.keys(companyId).length > 0) entry.companyId = companyId;

  const companyName = stringOrUndefined(in1.field(4).value);
  if (companyName !== undefined) entry.companyName = companyName;

  const groupNumber = stringOrUndefined(in1.field(8).value);
  if (groupNumber !== undefined) entry.groupNumber = groupNumber;

  const effective = in1.field(12).asTs();
  if (effective.date !== undefined) entry.effectiveDate = effective.date;

  const expiration = in1.field(13).asTs();
  if (expiration.date !== undefined) entry.expirationDate = expiration.date;

  const insuredName = in1.field(16).asXpn();
  if (Object.keys(insuredName).length > 0) entry.insuredName = insuredName;

  const policyNumber = stringOrUndefined(in1.field(36).value);
  if (policyNumber !== undefined) entry.policyNumber = policyNumber;

  return Object.freeze(entry) as Insurance;
}

/**
 * Every IN1 as an Insurance entry in document order with positional IN2/IN3
 * flags. `hasIn2`/`hasIn3` become `true` when an IN2/IN3 appears between this
 * IN1 and the next IN1 (or end of message). Callers wanting full IN2/IN3
 * data can drop to `msg.segments("IN2")[i]` since the positional index
 * matches IN1 index.
 *
 * @example
 * ```ts
 * for (const ins of msg.insurance()) {
 *   console.log(ins.companyName, ins.policyNumber, ins.hasIn2);
 * }
 * ```
 */
export function insurance(msg: Hl7Message): readonly Insurance[] {
  const out: Insurance[] = [];
  let currentIn1: Segment | undefined;
  let currentHasIn2 = false;
  let currentHasIn3 = false;

  for (const seg of msg.allSegments()) {
    if (seg.type === "IN1") {
      // Close previous group.
      if (currentIn1 !== undefined) {
        out.push(finalizeInsurance(currentIn1, currentHasIn2, currentHasIn3));
      }
      currentIn1 = seg;
      currentHasIn2 = false;
      currentHasIn3 = false;
      continue;
    }
    if (seg.type === "IN2" && currentIn1 !== undefined) {
      currentHasIn2 = true;
      continue;
    }
    if (seg.type === "IN3" && currentIn1 !== undefined) {
      currentHasIn3 = true;
      continue;
    }
  }

  // Finalize the trailing IN1.
  if (currentIn1 !== undefined) {
    out.push(finalizeInsurance(currentIn1, currentHasIn2, currentHasIn3));
  }

  return Object.freeze(out) as readonly Insurance[];
}
```

**Create `test/helpers-collections.test.ts`:**

```ts
/**
 * Phase 4 Plan 04 — integration tests for `msg.nextOfKin()`, `msg.allergies()`,
 * `msg.diagnoses()`, `msg.insurance()` (HELPERS-06 + HELPERS-07).
 * Plus a universal "never throws" sweep covering every Phase 4 helper.
 */

import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r";
const PID = "PID|||X\r";

describe("helpers/collections: nextOfKin (HELPERS-06, NK1)", () => {
  it("returns [] when no NK1 present (D-05)", () => {
    expect(parseHL7(MSH + PID).nextOfKin()).toEqual([]);
  });

  it("builds one entry per NK1 with full field set", () => {
    const fx = MSH + PID + "NK1|1|Doe^John^^^Mr|FTH|456 Oak St^^Boston^MA|(555)111-2222|||FTHR";
    const nk = parseHL7(fx).nextOfKin();
    expect(nk).toHaveLength(1);
    expect(nk[0]?.name?.familyName).toBe("Doe");
    expect(nk[0]?.name?.givenName).toBe("John");
    expect(nk[0]?.relationship?.identifier).toBe("FTH");
    expect(nk[0]?.address?.city).toBe("Boston");
    expect(nk[0]?.phone?.telephoneNumber).toBe("(555)111-2222");
    expect(nk[0]?.contactRole?.identifier).toBe("FTHR");
  });

  it("frozen + NOT memoized (D-06)", () => {
    const msg = parseHL7(MSH + PID + "NK1|1|Doe");
    const a = msg.nextOfKin();
    expect(Object.isFrozen(a)).toBe(true);
    expect(msg.nextOfKin()).not.toBe(a);
  });
});

describe("helpers/collections: allergies (HELPERS-06, AL1)", () => {
  it("returns [] when no AL1 present", () => {
    expect(parseHL7(MSH + PID).allergies()).toEqual([]);
  });

  it("builds one entry per AL1 with type/code/severity/reaction/onsetDate", () => {
    const fx = MSH + PID + "AL1|1|DA|PEN^Penicillin^DRUG|SV|Hives|20250101";
    const a = parseHL7(fx).allergies();
    expect(a).toHaveLength(1);
    expect(a[0]?.type).toBe("DA");
    expect(a[0]?.code?.identifier).toBe("PEN");
    expect(a[0]?.code?.text).toBe("Penicillin");
    expect(a[0]?.severity).toBe("SV");
    expect(a[0]?.reaction).toBe("Hives");
    expect(a[0]?.onsetDate).toBeInstanceOf(Date);
    expect(a[0]?.onsetDate?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });
});

describe("helpers/collections: diagnoses (HELPERS-06, DG1)", () => {
  it("returns [] when no DG1 present", () => {
    expect(parseHL7(MSH + PID).diagnoses()).toEqual([]);
  });

  it("builds one entry per DG1 with code/description/dateTime/type", () => {
    const fx = MSH + PID + "DG1|1|I10|E11.9^Type 2 diabetes^I10|Diabetes description|20250102|W";
    const d = parseHL7(fx).diagnoses();
    expect(d).toHaveLength(1);
    expect(d[0]?.code?.identifier).toBe("E11.9");
    expect(d[0]?.code?.text).toBe("Type 2 diabetes");
    expect(d[0]?.description).toBe("Diabetes description");
    expect(d[0]?.dateTime).toBeInstanceOf(Date);
    expect(d[0]?.type).toBe("W");
  });
});

describe("helpers/collections: insurance (HELPERS-06, IN1 + IN2/IN3 flags)", () => {
  it("returns [] when no IN1 present", () => {
    expect(parseHL7(MSH + PID).insurance()).toEqual([]);
  });

  it("builds one entry per IN1 with full field set", () => {
    // IN1 fields: 1 setId, 2 planId CWE, 3 companyId CX, 4 companyName (flatten),
    // 8 groupNumber, 12 effective, 13 expiration, 16 insuredName XPN, 36 policyNumber.
    const fx =
      MSH + PID +
      "IN1|1|PLAN^CompanyPlan^X|CO123^^^HOSP|BlueCross||||GRP001" +
      "||||20250101|20261231|||VIC^Insured" +
      "||||||||||||||||||||POLICY123";
    const ins = parseHL7(fx).insurance();
    expect(ins).toHaveLength(1);
    expect(ins[0]?.planId?.identifier).toBe("PLAN");
    expect(ins[0]?.companyId?.idNumber).toBe("CO123");
    expect(ins[0]?.companyName).toBe("BlueCross");
    expect(ins[0]?.groupNumber).toBe("GRP001");
    expect(ins[0]?.effectiveDate).toBeInstanceOf(Date);
    expect(ins[0]?.expirationDate).toBeInstanceOf(Date);
    expect(ins[0]?.insuredName?.familyName).toBe("VIC");
    expect(ins[0]?.policyNumber).toBe("POLICY123");
    expect(ins[0]?.hasIn2).toBe(false);
    expect(ins[0]?.hasIn3).toBe(false);
  });

  it("hasIn2/hasIn3 flip to true when IN2/IN3 follow IN1", () => {
    const fx = MSH + PID + "IN1|1|PLAN\rIN2|1|SSN123\rIN3|1|CERT456";
    const ins = parseHL7(fx).insurance();
    expect(ins).toHaveLength(1);
    expect(ins[0]?.hasIn2).toBe(true);
    expect(ins[0]?.hasIn3).toBe(true);
  });

  it("second IN1 gets its own hasIn2/hasIn3 independently", () => {
    const fx =
      MSH + PID +
      "IN1|1|PLAN1\rIN2|1|SSN\r" +
      "IN1|2|PLAN2";
    const ins = parseHL7(fx).insurance();
    expect(ins).toHaveLength(2);
    expect(ins[0]?.hasIn2).toBe(true);
    expect(ins[1]?.hasIn2).toBe(false);
  });
});

describe("helpers/collections: universal HELPERS-07 never-throws sweep", () => {
  // HELPERS-07: every helper must return undefined/[]/default on missing/malformed
  // data without throwing.
  const EMPTY_MSH_ONLY = "MSH|^~\\&|||||||ADT^A01|1|P|2.5";

  it("msg.meta never throws on minimal MSH", () => {
    expect(() => {
      const m = parseHL7(EMPTY_MSH_ONLY).meta;
      void m.type; void m.timestamp; void m.sendingApp;
    }).not.toThrow();
  });

  it("msg.patient returns undefined on no PID without throwing", () => {
    expect(() => {
      const p = parseHL7(EMPTY_MSH_ONLY).patient;
      void p?.mrn;
    }).not.toThrow();
  });

  it("msg.visit returns undefined on no PV1 without throwing", () => {
    expect(() => { void parseHL7(EMPTY_MSH_ONLY).visit; }).not.toThrow();
  });

  it("all 6 collection helpers return [] on empty input without throwing", () => {
    const msg = parseHL7(EMPTY_MSH_ONLY);
    expect(() => {
      expect(msg.observations()).toEqual([]);
      expect(msg.orders()).toEqual([]);
      expect(msg.nextOfKin()).toEqual([]);
      expect(msg.allergies()).toEqual([]);
      expect(msg.diagnoses()).toEqual([]);
      expect(msg.insurance()).toEqual([]);
    }).not.toThrow();
  });

  it("malformed segments do not crash any helper", () => {
    const fx =
      MSH + "PID\r" + "PV1\r" + "NK1\r" + "AL1\r" + "DG1\r" + "IN1\r" + "IN2\r" +
      "OBR\r" + "OBX\r" + "ORC";
    expect(() => {
      const msg = parseHL7(fx);
      void msg.meta; void msg.patient; void msg.visit;
      void msg.observations(); void msg.orders();
      void msg.nextOfKin(); void msg.allergies();
      void msg.diagnoses(); void msg.insurance();
    }).not.toThrow();
  });
});
```

Run `pnpm test -- helpers-collections`.
  </action>
  <verify>
    <automated>pnpm test -- helpers-collections.test.ts 2>&1 | tail -40 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/helpers</automated>
  </verify>
  <acceptance_criteria>
    - All 4 files implemented: `! grep -l "NOT IMPLEMENTED" src/helpers/next-of-kin.ts src/helpers/allergies.ts src/helpers/diagnoses.ts src/helpers/insurance.ts` returns no matches
    - `grep -q "export function nextOfKin" src/helpers/next-of-kin.ts` succeeds
    - `grep -q "export function allergies" src/helpers/allergies.ts` succeeds
    - `grep -q "export function diagnoses" src/helpers/diagnoses.ts` succeeds
    - `grep -q "export function insurance" src/helpers/insurance.ts` succeeds
    - `grep -q "allSegments()" src/helpers/insurance.ts` succeeds (state-machine walk for IN1/IN2/IN3)
    - `grep -q "hasIn2" src/helpers/insurance.ts && grep -q "hasIn3" src/helpers/insurance.ts` succeeds
    - `grep -c "Object.freeze" src/helpers/next-of-kin.ts src/helpers/allergies.ts src/helpers/diagnoses.ts src/helpers/insurance.ts` returns ≥ 8 (each file freezes both entry + outer array)
    - `pnpm test -- helpers-collections.test.ts` exits 0 with ≥ 15 cases passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/helpers` exits 0
  </acceptance_criteria>
  <done>HELPERS-06 closed: nextOfKin/allergies/diagnoses/insurance all return typed frozen arrays; insurance has hasIn2/hasIn3 positional flags; D-05 []-on-empty; D-06 not memoized; HELPERS-07 never-throws proved via the universal sweep covering ALL Phase 4 helpers.</done>
</task>

</tasks>

<verification>
```bash
pnpm typecheck
pnpm lint
pnpm test -- helpers-orders helpers-collections
pnpm test    # full suite: ≥ 420 tests should pass (Plan 01 + 02 + 03 + 04)
pnpm build   # tsup + dts emit must succeed
```

Confirm Phase 4 goal: a developer can extract common HL7 fields in one line
through `msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`,
`msg.orders()`, `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`,
`msg.insurance()` — no segment/field numbers needed.

Sanity check by parsing a complete ORU^R01 + IN1/IN2/DG1 fixture and printing:
```ts
const msg = parseHL7(raw);
msg.meta.type;               // "ORU^R01"
msg.patient?.mrn;            // from pickMrn
msg.patient?.fullName;       // Western
msg.visit?.patientClass;     // "I"
msg.orders()[0].placerOrderNumber;
msg.orders()[0].observations[0].value;
msg.nextOfKin().length;
msg.allergies().length;
msg.diagnoses().length;
msg.insurance()[0].hasIn2;
```
</verification>

<success_criteria>
- HELPERS-05 satisfied: orders() positionally groups OBX under OBR (D-12), attaches ORC-1 as orderControl, reuses buildObservation, full D-16 contract, D-24 option (a) XCN for orderedBy.
- HELPERS-06 satisfied: nextOfKin/allergies/diagnoses/insurance all return typed frozen arrays with lean v1 field sets (per CONTEXT.md Claude's Discretion).
- HELPERS-07 satisfied: universal never-throws sweep proves ALL 9 Phase 4 helpers (meta + patient + visit + 6 collections) handle empty/malformed input gracefully.
- Insurance state machine correctly groups IN2/IN3 under IN1 positionally with hasIn2/hasIn3 boolean flags.
- `pnpm test` green with ≥ 420 total tests; `pnpm build` green; `pnpm typecheck` + `pnpm lint` green.
- Phase 4 COMPLETE: all 4 ROADMAP success criteria satisfied; all 7 HELPERS-0X REQ-IDs closed.
</success_criteria>

<output>
After completion, create `.planning/phases/04-named-helpers/04-04-SUMMARY.md` with:
- What shipped (orders, nextOfKin, allergies, diagnoses, insurance, 2 test files).
- HELPERS-05 + HELPERS-06 + HELPERS-07 closed.
- D-24 option (a) XCN utilized end-to-end: used by visit (attendingDoctor/referringDoctor from Plan 03) AND orders (orderedBy).
- buildObservation reuse from Plan 03 into orders() verified — no OBX duplicate construction.
- Insurance IN1/IN2/IN3 positional grouping via hasIn2/hasIn3 flags; full IN2/IN3 data still reachable via msg.segments("IN2")/msg.segments("IN3") for callers who need it.
- Files modified (5) + test files created (2).
- Final test count.
- Phase 4 COMPLETE marker: all 7 REQ-IDs (HELPERS-01..07) closed, all 4 success criteria satisfied, north-star DX shipped.
</output>
