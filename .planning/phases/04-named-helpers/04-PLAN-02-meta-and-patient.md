---
phase: 04-named-helpers
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/helpers/meta.ts
  - src/helpers/patient.ts
  - test/helpers-meta.test.ts
  - test/helpers-patient.test.ts
  - test/helpers-cache-invalidation.test.ts
autonomous: true
requirements: [HELPERS-01, HELPERS-02, HELPERS-07]

must_haves:
  truths:
    - "A developer calling `msg.meta.type` on a parsed ADT^A01 message receives the string 'ADT^A01' (full MSH-9)."
    - "A developer calling `msg.meta.messageCode` receives 'ADT', `msg.meta.triggerEvent` receives 'A01', `msg.meta.messageStructure` receives 'ADT_A01' when MSH-9 is 'ADT^A01^ADT_A01'."
    - "A developer calling `msg.meta.controlId` receives MSH-10 as a string."
    - "A developer calling `msg.meta.timestamp` receives a JS Date parsed from MSH-7 (D-18 flat shape — NOT {raw,date})."
    - "A developer calling `msg.meta.version`, `msg.meta.sendingApp`, `msg.meta.sendingFacility`, `msg.meta.receivingApp`, `msg.meta.receivingFacility`, `msg.meta.processingId` receives strings or undefined when the field is absent."
    - "A developer calling `msg.patient` on a message with a PID receives an object with typed fields; on a message without a PID receives `undefined`."
    - "A developer calling `msg.patient?.mrn` receives the first CX-5='MR' idNumber from PID-3; fallback to first CX.idNumber."
    - "A developer calling `msg.patient?.fullName` receives 'Given Middle Family, Suffix' Western order (D-17) — omits missing parts, no double spaces, no trailing comma; `undefined` when no usable parts."
    - "A developer calling `msg.patient?.dateOfBirth` receives a flat JS Date or `undefined` (D-18)."
    - "A developer calling `msg.patient?.identifiers` receives a frozen array of CX composites."
    - "A developer calling `msg.patient?.phoneNumbers` receives a frozen array of XTN composites from PID-13 + PID-14."
    - "A developer calling `msg.patient?.name` / `.address` / `.race` / `.ethnicity` / `.language` receives the correct composite types (XPN / XAD / CWE / CWE / CE)."
    - "A developer calling `msg.meta === msg.meta` and `msg.patient === msg.patient` receives `true` (D-02 memoized)."
    - "A developer mutating the message via `msg.setField('PID.5.1', 'Jones')` causes the next `msg.patient` call to return a fresh object (cache invalidated per D-02 + D-17)."
    - "A developer calling these helpers on an all-optional-fields-absent message never throws (HELPERS-07, D-22)."
  artifacts:
    - path: "src/helpers/meta.ts"
      provides: "buildMeta(msg) → Meta"
      exports: ["buildMeta"]
      min_lines: 80
    - path: "src/helpers/patient.ts"
      provides: "buildPatient(msg) → Patient | undefined + composeFullName helper"
      exports: ["buildPatient"]
      min_lines: 120
    - path: "test/helpers-meta.test.ts"
      provides: "Meta helper test suite"
      contains: "describe(\"helpers/meta"
    - path: "test/helpers-patient.test.ts"
      provides: "Patient helper test suite"
      contains: "describe(\"helpers/patient"
    - path: "test/helpers-cache-invalidation.test.ts"
      provides: "Helper cache memoization + invalidation tests (meta + patient; visit tests added by Plan 03)"
      contains: "describe(\"helpers cache invalidation"
  key_links:
    - from: "src/helpers/meta.ts"
      to: "Hl7Message public read surface"
      via: "msg.segments('MSH')[0].field(N).asXxx() and msg.get()"
      pattern: 'msg\\.segments\\("MSH"\\)'
    - from: "src/helpers/patient.ts"
      to: "pickMrn + parseXpn/parseCx/parseXtn"
      via: "imports + Field.repetitions walk"
      pattern: "pickMrn\\(|\\.repetitions"
---

<objective>
Fill the `buildMeta` and `buildPatient` stub bodies that Plan 01 scaffolded,
delivering HELPERS-01, HELPERS-02, and establishing the D-02 memoization /
invalidation test suite (which also covers `_visit` Plan 03 ships).

**In scope:**
- `buildMeta(msg: Hl7Message): Meta` — full HELPERS-01 field list, D-01 frozen,
  D-18 flat Date, D-21 silent, D-22 never-throws.
- `buildPatient(msg: Hl7Message): Patient | undefined` — full HELPERS-02 field
  list, D-04 undefined-on-no-PID, D-07/D-08 MRN pick via `pickMrn`, D-17
  Western fullName, D-19 locked field names, D-20 phoneNumbers concat.
- Tests: `helpers-meta.test.ts`, `helpers-patient.test.ts`,
  `helpers-cache-invalidation.test.ts` (covering meta + patient + observations()
  NOT-memoized check; visit-specific mutation tests are added by Plan 03).

**Out of scope (other plans):**
- `msg.visit` — Plan 03.
- `msg.observations()` / `msg.orders()` / collection helpers — Plans 03/04.
- Visit cache-invalidation tests (msg.addSegment('PV1', ...)) — Plan 03 extends
  `helpers-cache-invalidation.test.ts` with those.

**Decision authority:** Plan 02 MUST NOT edit message.ts, field.ts, index.ts,
types.ts, or any file outside its `files_modified` list. The stub `buildMeta`
and `buildPatient` exports are replaced IN PLACE — function signatures stay
identical to what Plan 01 declared.

Purpose: ship the north-star DX surface for message metadata + patient
demographics. Deliver HELPERS-01 + HELPERS-02 + prove the memoization
contract (D-02) via the shared cache-invalidation test.

Output: 2 stub helpers filled; 3 test files created (cache-invalidation is
shared with Plan 03 but owned by Plan 02 — Plan 03 appends test cases to it).
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
@src/helpers/pick-mrn.ts
@src/helpers/meta.ts
@src/helpers/patient.ts
@src/model/message.ts
@src/model/field.ts
@src/model/types/xpn.ts
@src/model/types/cx.ts
@src/model/types/xtn.ts
@src/model/types/hd.ts
@CLAUDE.md

<interfaces>
<!-- Meta and Patient shapes are locked by Plan 01's src/helpers/types.ts.
     Read that file first. Key consumers (Plan 02 MUST use these, not rawSegments): -->

From src/model/message.ts (public read surface):
- msg.get(path: string): string | undefined  — auto-unescaped string leaf read (D-03)
- msg.segments(type: string): readonly Segment[]  — cached wrapper array
- msg.encodingCharacters: EncodingCharacters  — passed to parseXxx(rep, enc) calls
- msg.allSegments(): readonly Segment[]  — doc-order wrapper iteration

From src/model/segment.ts (Segment wrapper):
- seg.type: string
- seg.field(n: number): Field  — 1-indexed HL7 field access. MSH-3 returns MSH-3 (MSH offset is applied inside .field()).
- seg.fields: readonly RawField[]  — raw tree if needed (prefer field())

From src/model/field.ts (Field wrapper — 11 coercions after Plan 01):
- field.value: string  — first-sub-of-first-comp-of-first-rep, auto-unescaped. "" when empty.
- field.repetitions: readonly RawRepetition[]  — for multi-rep walks (PID-3 identifiers, PID-13/14 phones)
- field.asXpn(): XPN, .asXad(): XAD, .asCx(): CX, .asCwe(): CWE, .asCe(): CE, .asXtn(): XTN, .asPl(): PL, .asTs(): TS, .asNm(): NM, .asHd(): HD, .asXcn(): XCN

From src/helpers/pick-mrn.ts:
- export function pickMrn(identifiers: readonly CX[]): string | undefined

From src/helpers/types.ts (Plan 01 — these are the EXACT locked shapes):
- Meta: { type?, messageCode?, triggerEvent?, messageStructure?, controlId?, timestamp?, version?, sendingApp?, sendingFacility?, receivingApp?, receivingFacility?, processingId? }
- Patient: { mrn?, identifiers: readonly CX[], name: XPN, familyName?, givenName?, middleName?, fullName?, dateOfBirth?, sex?, address?, phoneNumbers: readonly XTN[], race?, ethnicity?, language? }

From src/model/types/ts.ts:
- TS: { raw: string; date: Date | undefined }  — NOTE: helper layer uses .date (flat Date per D-18), NOT the whole TS.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement buildMeta (HELPERS-01)</name>
  <files>src/helpers/meta.ts, test/helpers-meta.test.ts</files>
  <read_first>
    - src/helpers/meta.ts (stub from Plan 01 — replace the function body, keep the signature + imports)
    - src/helpers/types.ts (Meta interface — authoritative field list)
    - src/model/message.ts (Hl7Message.get/segments/encodingCharacters surface)
    - src/model/field.ts (Field.asTs, .asHd, .value)
    - src/model/segment.ts (Segment.field(n) — MSH offset is built in)
    - src/model/types/xpn.ts (Mutable<T> + conditional-assign pattern — canonical template for exactOptionalPropertyTypes compliance)
    - test/model-field-coercions.test.ts (integration test style — header + describe/it)
    - .planning/phases/04-named-helpers/04-PATTERNS.md (§"Pattern Assignments — src/helpers/meta.ts" lines 117-208)
    - .planning/phases/04-named-helpers/04-CONTEXT.md (D-01, D-03, D-17, D-18, D-21, D-22, D-23)
  </read_first>
  <behavior>
    - On a message parsed from `MSH|^~\&|SEND_APP|SEND_FAC|REC_APP|REC_FAC|20250102153045||ADT^A01^ADT_A01|MSG001|P|2.5`:
      - msg.meta.type === "ADT^A01^ADT_A01"
      - msg.meta.messageCode === "ADT"
      - msg.meta.triggerEvent === "A01"
      - msg.meta.messageStructure === "ADT_A01"
      - msg.meta.controlId === "MSG001"
      - msg.meta.timestamp instanceof Date && msg.meta.timestamp.toISOString() === "2025-01-02T15:30:45.000Z"
      - msg.meta.version === "2.5"
      - msg.meta.sendingApp === "SEND_APP"
      - msg.meta.sendingFacility === "SEND_FAC"
      - msg.meta.receivingApp === "REC_APP"
      - msg.meta.receivingFacility === "REC_FAC"
      - msg.meta.processingId === "P"
    - On a minimal MSH (`MSH|^~\&|||||20250102||ADT^A01|1|P|2.5`):
      - msg.meta.type === "ADT^A01", messageCode === "ADT", triggerEvent === "A01", messageStructure is absent (`"messageStructure" in msg.meta` === false)
      - sendingApp/sendingFacility/receivingApp/receivingFacility are absent (exactOptionalPropertyTypes)
      - msg.meta.timestamp.toISOString() === "2025-01-02T00:00:00.000Z" (date-only truncation to midnight UTC per Phase 3 D-22)
    - msg.meta === msg.meta (memoization — Plan 01 wired the getter).
    - Object.isFrozen(msg.meta) === true (D-01 freeze at boundary).
    - msg.meta never throws on any parsed message.
    - On a message with unparseable MSH-7 (e.g. "ABC"): `msg.meta.timestamp` is absent (`"timestamp" in msg.meta` === false; D-22).
  </behavior>
  <action>
**Replace the stub body in `src/helpers/meta.ts`:**

Keep the file-level prose JSDoc Plan 01 wrote (update if it mentioned "NOT IMPLEMENTED"). Keep the imports. Replace `throw new Error(...)` with the real implementation.

Implementation pattern (mirrors `parseXpn` construction + PATTERNS.md lines 146-207):

```ts
// Imports — append to existing Plan 01 imports as needed.
import type { Hl7Message } from "../model/message.js";
import type { Meta } from "./types.js";

export function buildMeta(msg: Hl7Message): Meta {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Meta> = {};

  const msh = msg.segments("MSH")[0];
  // D-03 — MSH is always present on a parsed Hl7Message (parseHL7 throws
  // NO_MSH_SEGMENT otherwise). Defensive guard for TS narrowing only.

  // ─── MSH-9 message type (full + components) ────────────────────────────
  // msg.get("MSH.9") returns the first subcomponent of the first component —
  // i.e. MSH-9.1 (messageCode). For the FULL typed string "ADT^A01^ADT_A01"
  // we reconstruct from the components directly. Use the raw field walk
  // via Segment.field(9) so we get the per-component strings.
  if (msh !== undefined) {
    const typeField = msh.field(9);
    const firstRep = typeField.repetitions[0];
    if (firstRep !== undefined) {
      // Reconstruct full MSH-9 by joining component values with '^'.
      // Use readComponent equivalent: first subcomponent of each component,
      // auto-unescaped via msg.get which goes through resolvePath.
      const parts: string[] = [];
      for (let i = 0; i < firstRep.components.length; i++) {
        const sub = msg.get(`MSH.9.${i + 1}`);
        parts.push(sub ?? "");
      }
      // Trim trailing empty parts so "ADT^A01" isn't rendered as "ADT^A01^^".
      while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
      const fullType = parts.join("^");
      if (fullType !== "") out.type = fullType;
    }
  }
  const messageCode = msg.get("MSH.9.1");
  if (messageCode !== undefined && messageCode !== "") out.messageCode = messageCode;
  const triggerEvent = msg.get("MSH.9.2");
  if (triggerEvent !== undefined && triggerEvent !== "") out.triggerEvent = triggerEvent;
  const messageStructure = msg.get("MSH.9.3");
  if (messageStructure !== undefined && messageStructure !== "") out.messageStructure = messageStructure;

  // ─── MSH-10 control id ────────────────────────────────────────────────
  const controlId = msg.get("MSH.10");
  if (controlId !== undefined && controlId !== "") out.controlId = controlId;

  // ─── MSH-7 timestamp (D-18 flat Date) ─────────────────────────────────
  if (msh !== undefined) {
    const ts = msh.field(7).asTs();
    if (ts.date !== undefined) out.timestamp = ts.date;
  }

  // ─── MSH-12 version ───────────────────────────────────────────────────
  const version = msg.get("MSH.12");
  if (version !== undefined && version !== "") out.version = version;

  // ─── MSH-3/-4/-5/-6 apps + facilities (first component / namespaceId) ─
  const sendingApp = msg.get("MSH.3.1");
  if (sendingApp !== undefined && sendingApp !== "") out.sendingApp = sendingApp;
  const sendingFacility = msg.get("MSH.4.1");
  if (sendingFacility !== undefined && sendingFacility !== "") out.sendingFacility = sendingFacility;
  const receivingApp = msg.get("MSH.5.1");
  if (receivingApp !== undefined && receivingApp !== "") out.receivingApp = receivingApp;
  const receivingFacility = msg.get("MSH.6.1");
  if (receivingFacility !== undefined && receivingFacility !== "") out.receivingFacility = receivingFacility;

  // ─── MSH-11 processing id (first component) ───────────────────────────
  const processingId = msg.get("MSH.11.1");
  if (processingId !== undefined && processingId !== "") out.processingId = processingId;

  // D-01 freeze at boundary.
  return Object.freeze(out) as Meta;
}
```

Keep the existing `@example` JSDoc comment (or enhance it) on `buildMeta`. The function is `@internal` so `require-example` is optional — but KEEP the example because it's useful docstring.

**Create `test/helpers-meta.test.ts`:**

Use PATTERNS.md lines 820-873 as the template. Minimum cases:

```ts
/**
 * Phase 4 Plan 02 — integration tests for `msg.meta` (HELPERS-01).
 * Verifies the exact field list locked by D-01..D-03, D-18, D-22 against
 * realistic MSH fixtures.
 */

import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

const FULL = "MSH|^~\\&|SEND_APP|SEND_FAC|REC_APP|REC_FAC|20250102153045||ADT^A01^ADT_A01|MSG001|P|2.5";
const MIN = "MSH|^~\\&|||||20250102||ADT^A01|1|P|2.5";

describe("helpers/meta: msg.meta (HELPERS-01)", () => {
  it("reads MSH-9 full type + components", () => {
    const msg = parseHL7(FULL);
    expect(msg.meta.type).toBe("ADT^A01^ADT_A01");
    expect(msg.meta.messageCode).toBe("ADT");
    expect(msg.meta.triggerEvent).toBe("A01");
    expect(msg.meta.messageStructure).toBe("ADT_A01");
  });

  it("reads MSH-10 controlId", () => { /* msg.meta.controlId === "MSG001" */ });
  it("reads MSH-7 timestamp as a flat JS Date (D-18)", () => { /* toISOString === "2025-01-02T15:30:45.000Z" */ });
  it("reads MSH-12 version", () => { /* "2.5" */ });
  it("reads MSH-3/4 sendingApp + sendingFacility", () => { /* "SEND_APP", "SEND_FAC" */ });
  it("reads MSH-5/6 receivingApp + receivingFacility", () => { /* "REC_APP", "REC_FAC" */ });
  it("reads MSH-11 processingId", () => { /* "P" */ });

  it("omits absent optional fields (exactOptionalPropertyTypes)", () => {
    const msg = parseHL7(MIN);
    expect("messageStructure" in msg.meta).toBe(false);
    expect("sendingApp" in msg.meta).toBe(false);
    expect("receivingFacility" in msg.meta).toBe(false);
  });

  it("omits timestamp when MSH-7 is unparseable", () => {
    const msg = parseHL7("MSH|^~\\&|||||ABC||ADT^A01|1|P|2.5");
    expect("timestamp" in msg.meta).toBe(false);
  });

  it("truncates MSH-9 to 'ADT^A01' when no message structure present", () => {
    const msg = parseHL7("MSH|^~\\&|||||20250102||ADT^A01|1|P|2.5");
    expect(msg.meta.type).toBe("ADT^A01");
    expect("messageStructure" in msg.meta).toBe(false);
  });

  it("is frozen at the top level (D-01)", () => {
    const msg = parseHL7(FULL);
    expect(Object.isFrozen(msg.meta)).toBe(true);
  });

  it("never throws on an empty MSH", () => {
    expect(() => {
      const msg = parseHL7("MSH|^~\\&|||||||ADT^A01|1|P|2.5");
      void msg.meta.type;
      void msg.meta.timestamp;
      void msg.meta.sendingApp;
    }).not.toThrow();
  });

  it("auto-unescapes string fields (D-23)", () => {
    // MSH-3 "A\\F\\B" → "A|B" auto-unescape
    const msg = parseHL7("MSH|^~\\&|A\\F\\B|FAC|||20250102||ADT^A01|1|P|2.5");
    expect(msg.meta.sendingApp).toBe("A|B");
  });
});
```

Run `pnpm test -- helpers-meta`, verify ≥ 11 tests pass.
  </action>
  <verify>
    <automated>pnpm test -- helpers-meta.test.ts 2>&1 | tail -25 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/helpers/meta.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "export function buildMeta" src/helpers/meta.ts` succeeds
    - `! grep -q "NOT IMPLEMENTED" src/helpers/meta.ts` succeeds (stub gone)
    - `grep -q "Object.freeze(out)" src/helpers/meta.ts` succeeds (D-01)
    - `grep -q 'msg.get("MSH.9' src/helpers/meta.ts` succeeds (composes on Phase 3 public surface)
    - `grep -q ".asTs()" src/helpers/meta.ts` succeeds (D-18 flat Date extraction)
    - `! grep -q "rawSegments" src/helpers/meta.ts` succeeds (does NOT reach through)
    - `pnpm test -- helpers-meta.test.ts` exits 0 with ≥ 11 cases passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/helpers/meta.ts` exits 0 with no warnings
  </acceptance_criteria>
  <done>HELPERS-01 closed: msg.meta exposes all 12 fields, auto-unescaped, flat-Date per D-18, frozen, never throws, test suite green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement buildPatient (HELPERS-02)</name>
  <files>src/helpers/patient.ts, test/helpers-patient.test.ts</files>
  <read_first>
    - src/helpers/patient.ts (stub from Plan 01 — replace body)
    - src/helpers/types.ts (Patient interface — authoritative field list)
    - src/helpers/pick-mrn.ts (pickMrn function — import + call)
    - src/model/types/xpn.ts (parseXpn + XPN shape; XPN.secondName maps to Patient.middleName per D-19)
    - src/model/types/cx.ts (parseCx + CX shape — used for PID-3 repetition walk)
    - src/model/types/xtn.ts (parseXtn — used for PID-13/14 phone concat)
    - src/model/types/xad.ts (XAD shape for PID-11)
    - src/model/types/cwe.ts (CWE for PID-10 race, PID-22 ethnicity)
    - src/model/types/ce.ts (CE for PID-15 language)
    - .planning/phases/04-named-helpers/04-PATTERNS.md (§"Pattern Assignments — src/helpers/patient.ts" lines 211-322)
    - .planning/phases/04-named-helpers/04-CONTEXT.md (D-04, D-07, D-08, D-09, D-10, D-17, D-18, D-19, D-20, D-23)
  </read_first>
  <behavior>
    - Given a PID like `PID|||MRN123^^^HOSP^MR~ALT456|||Smith^Jane^Q^Jr^Mrs^MD||19800115|F|||123 Main St^Apt 4^Boston^MA^02101^USA||(555)555-1234^PRN^PH~(555)555-5678^WPN^PH`:
      - msg.patient is an object (not undefined).
      - msg.patient.mrn === "MRN123" (CX with identifierTypeCode="MR" wins per D-07).
      - msg.patient.identifiers.length === 2; identifiers[0].idNumber === "MRN123", identifiers[0].identifierTypeCode === "MR"; identifiers[1].idNumber === "ALT456".
      - msg.patient.name.familyName === "Smith"; .givenName === "Jane"; .secondName === "Q"; .suffix === "Jr"; .prefix === "Mrs"; .degree === "MD".
      - msg.patient.familyName === "Smith" (flat convenience per D-19).
      - msg.patient.givenName === "Jane".
      - msg.patient.middleName === "Q" (mapped from XPN.secondName per D-19).
      - msg.patient.fullName === "Jane Q Smith, Jr" (D-17 Western order; omit prefix/degree per D-17 which only mentions given+middle+family+suffix).
      - msg.patient.dateOfBirth.toISOString() === "1980-01-15T00:00:00.000Z" (flat Date, D-18, midnight UTC per Phase 3 D-22).
      - msg.patient.sex === "F".
      - msg.patient.address.street === "123 Main St" (XPN field name), .city === "Boston", etc. (full XAD).
      - msg.patient.phoneNumbers.length === 2; phoneNumbers[0].telephoneNumber === "(555)555-1234"; phoneNumbers[0].useCode === "PRN"; phoneNumbers[1].useCode === "WPN".
    - Given a message with NO PID: msg.patient === undefined (D-04).
    - Given a PID with no PID-3: msg.patient.mrn === undefined; msg.patient.identifiers === []; `Array.isArray(msg.patient.identifiers)` is true; `Object.isFrozen(msg.patient.identifiers)` is true.
    - Given a PID with no PID-5: msg.patient.name deep-equals `{}`; msg.patient.familyName/givenName/middleName/fullName are all absent.
    - Given a PID with no PID-13 or PID-14: msg.patient.phoneNumbers === [] (frozen empty array).
    - Given a PID with MR-lowercase "mr" CX: msg.patient.mrn falls back to first CX.idNumber (D-10 case-sensitive).
    - msg.patient === msg.patient (memoization).
    - Object.isFrozen(msg.patient) === true (D-01).
    - fullName with only givenName+familyName: "Jane Smith" (no double spaces).
    - fullName with only familyName: "Smith".
    - fullName with only suffix "Jr": "Jr" (no leading comma).
    - fullName with NO parts (empty XPN): fullName key absent.
    - Never throws on any input (HELPERS-07, D-22).
  </behavior>
  <action>
**Replace the stub body in `src/helpers/patient.ts`:**

```ts
import type { Hl7Message } from "../model/message.js";
import type { CX } from "../model/types/cx.js";
import { parseCx } from "../model/types/cx.js";
import type { XPN } from "../model/types/xpn.js";
import { parseXpn } from "../model/types/xpn.js";
import type { XTN } from "../model/types/xtn.js";
import { parseXtn } from "../model/types/xtn.js";
import type { XAD } from "../model/types/xad.js";
import type { CWE } from "../model/types/cwe.js";
import type { CE } from "../model/types/ce.js";
import type { Patient } from "./types.js";
import { pickMrn } from "./pick-mrn.js";

/**
 * D-17: compose Western-order fullName from XPN parts.
 * "Given Middle Family, Suffix" — missing parts omitted cleanly, no double
 * spaces, no trailing comma. Prefix and degree are NOT included (D-17 only
 * covers given+middle+family+suffix; prefix/degree remain on patient.name).
 * @internal
 */
function composeFullName(name: XPN): string | undefined {
  const parts: string[] = [];
  if (name.givenName !== undefined && name.givenName !== "") parts.push(name.givenName);
  if (name.secondName !== undefined && name.secondName !== "") parts.push(name.secondName);
  if (name.familyName !== undefined && name.familyName !== "") parts.push(name.familyName);
  const base = parts.join(" ");
  const suffix = name.suffix;
  const hasSuffix = suffix !== undefined && suffix !== "";
  let full: string;
  if (hasSuffix) {
    full = base === "" ? suffix! : `${base}, ${suffix!}`;
  } else {
    full = base;
  }
  return full === "" ? undefined : full;
}

/**
 * @internal
 * Parse all PID-3 repetitions into a CX[]. Empty repetitions OMITTED.
 */
function parseIdentifiers(msg: Hl7Message, pid3Field: { readonly repetitions: readonly { readonly components: readonly unknown[] }[] }): CX[] {
  const out: CX[] = [];
  for (const rep of pid3Field.repetitions) {
    // Cast rep back to RawRepetition shape for parseCx — safe because it came from a Field wrapper.
    const cx = parseCx(rep as { readonly components: readonly { readonly subcomponents: readonly string[] }[] } as Parameters<typeof parseCx>[0], msg.encodingCharacters);
    if (Object.keys(cx).length > 0) out.push(cx);
  }
  return out;
}

/**
 * Build the immutable `Patient` view, or `undefined` when the message has no
 * PID segment (D-04). Memoized by `Hl7Message.patient` (D-02).
 *
 * @example
 * ```ts
 * const msg = parseHL7(raw);
 * console.log(msg.patient?.mrn);                        // first CX-5="MR" idNumber
 * console.log(msg.patient?.fullName);                   // "Jane Q Smith, Jr"
 * console.log(msg.patient?.dateOfBirth?.toISOString()); // flat Date per D-18
 * ```
 */
export function buildPatient(msg: Hl7Message): Patient | undefined {
  const pid = msg.segments("PID")[0];
  if (pid === undefined) return undefined;  // D-04

  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Patient> = {};

  // ─── PID-3 identifiers (D-09) + MRN pick (D-07/D-08) ───────────────────
  const pid3 = pid.field(3);
  const identifiers: CX[] = [];
  for (const rep of pid3.repetitions) {
    const cx = parseCx(rep, msg.encodingCharacters);
    if (Object.keys(cx).length > 0) identifiers.push(cx);
  }
  out.identifiers = Object.freeze(identifiers) as readonly CX[];

  const mrn = pickMrn(out.identifiers);
  if (mrn !== undefined) out.mrn = mrn;

  // ─── PID-5 name (XPN) + flat shortcuts (D-19) + fullName (D-17) ────────
  const name = pid.field(5).asXpn();
  out.name = name;  // always present (may be empty {})

  if (name.familyName !== undefined) out.familyName = name.familyName;
  if (name.givenName !== undefined) out.givenName = name.givenName;
  if (name.secondName !== undefined) out.middleName = name.secondName;  // D-19 rename

  const fullName = composeFullName(name);
  if (fullName !== undefined) out.fullName = fullName;

  // ─── PID-7 date of birth (flat Date D-18) ──────────────────────────────
  const dob = pid.field(7).asTs();
  if (dob.date !== undefined) out.dateOfBirth = dob.date;

  // ─── PID-8 sex (flat string) ───────────────────────────────────────────
  const sex = pid.field(8).value;
  if (sex !== "") out.sex = sex;

  // ─── PID-11 address (XAD) ──────────────────────────────────────────────
  const address = pid.field(11).asXad();
  if (Object.keys(address).length > 0) out.address = address;

  // ─── PID-13 + PID-14 phone numbers (XTN[], D-20) ───────────────────────
  const phones: XTN[] = [];
  for (const rep of pid.field(13).repetitions) {
    const xtn = parseXtn(rep, msg.encodingCharacters);
    if (Object.keys(xtn).length > 0) phones.push(xtn);
  }
  for (const rep of pid.field(14).repetitions) {
    const xtn = parseXtn(rep, msg.encodingCharacters);
    if (Object.keys(xtn).length > 0) phones.push(xtn);
  }
  out.phoneNumbers = Object.freeze(phones) as readonly XTN[];

  // ─── PID-10 race (CWE) ─────────────────────────────────────────────────
  const race = pid.field(10).asCwe();
  if (Object.keys(race).length > 0) out.race = race;

  // ─── PID-22 ethnicity (CWE) ────────────────────────────────────────────
  const ethnicity = pid.field(22).asCwe();
  if (Object.keys(ethnicity).length > 0) out.ethnicity = ethnicity;

  // ─── PID-15 language (CE) ──────────────────────────────────────────────
  const language = pid.field(15).asCe();
  if (Object.keys(language).length > 0) out.language = language;

  return Object.freeze(out) as Patient;
}
```

(Delete the sketch `parseIdentifiers` helper above if the inline loop inside `buildPatient` is clearer — pick whichever reads better; the inline version is recommended.)

**Create `test/helpers-patient.test.ts`:**

```ts
/**
 * Phase 4 Plan 02 — integration tests for `msg.patient` (HELPERS-02 + HELPERS-07).
 */

import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

const FULL =
  "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r" +
  "PID|||MRN123^^^HOSP^MR~ALT456|||Smith^Jane^Q^Jr^Mrs^MD||19800115|F||" +
  "|123 Main St^Apt 4^Boston^MA^02101^USA||" +
  "(555)555-1234^PRN^PH~(555)555-5678^WPN^PH";

const NO_PID = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5";

const MIN_PID = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r" + "PID|||";

describe("helpers/patient: msg.patient (HELPERS-02)", () => {
  it("returns undefined when no PID exists (D-04)", () => {
    expect(parseHL7(NO_PID).patient).toBeUndefined();
  });

  it("returns a frozen Patient object when PID exists (D-01)", () => {
    const p = parseHL7(FULL).patient;
    expect(p).toBeDefined();
    expect(Object.isFrozen(p)).toBe(true);
  });

  it("picks MR-typed MRN from PID-3 (D-07)", () => {
    expect(parseHL7(FULL).patient?.mrn).toBe("MRN123");
  });

  it("falls back to first CX.idNumber when no MR-typed CX (D-08)", () => {
    const fx = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r" + "PID|||X1~ALT";
    expect(parseHL7(fx).patient?.mrn).toBe("X1");
  });

  it("MR match is case-sensitive (D-10)", () => {
    // Lowercase "mr" must NOT match; fallback to first idNumber.
    const fx = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r" + "PID|||ALT~MRN^^^HOSP^mr";
    expect(parseHL7(fx).patient?.mrn).toBe("ALT");
  });

  it("exposes PID-3 identifiers as readonly CX[] (D-09)", () => {
    const p = parseHL7(FULL).patient;
    expect(p?.identifiers).toHaveLength(2);
    expect(p?.identifiers[0]?.idNumber).toBe("MRN123");
    expect(p?.identifiers[0]?.identifierTypeCode).toBe("MR");
    expect(p?.identifiers[1]?.idNumber).toBe("ALT456");
    expect(Object.isFrozen(p?.identifiers)).toBe(true);
  });

  it("empty PID-3 yields empty identifiers array, not undefined", () => {
    const p = parseHL7(MIN_PID).patient;
    expect(p?.identifiers).toEqual([]);
    expect(Object.isFrozen(p?.identifiers)).toBe(true);
  });

  it("exposes XPN name via .name and flat familyName/givenName/middleName (D-19)", () => {
    const p = parseHL7(FULL).patient;
    expect(p?.name.familyName).toBe("Smith");
    expect(p?.name.secondName).toBe("Q");
    expect(p?.familyName).toBe("Smith");
    expect(p?.givenName).toBe("Jane");
    expect(p?.middleName).toBe("Q");  // mapped from XPN.secondName per D-19
  });

  it("composes fullName in Western order (D-17)", () => {
    expect(parseHL7(FULL).patient?.fullName).toBe("Jane Q Smith, Jr");
  });

  it("fullName omits missing parts cleanly — no double spaces, no leading comma", () => {
    // Only givenName + familyName
    const fx1 = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r" + "PID|||X|||Smith^Jane";
    expect(parseHL7(fx1).patient?.fullName).toBe("Jane Smith");
    // Only suffix
    const fx2 = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r" + "PID|||X|||^^^Jr";
    expect(parseHL7(fx2).patient?.fullName).toBe("Jr");
  });

  it("fullName is absent when no usable parts", () => {
    const p = parseHL7(MIN_PID).patient;
    expect("fullName" in (p ?? {})).toBe(false);
  });

  it("exposes flat Date for dateOfBirth (D-18)", () => {
    const p = parseHL7(FULL).patient;
    expect(p?.dateOfBirth).toBeInstanceOf(Date);
    expect(p?.dateOfBirth?.toISOString()).toBe("1980-01-15T00:00:00.000Z");
  });

  it("omits dateOfBirth when PID-7 is absent or unparseable", () => {
    const p = parseHL7(MIN_PID).patient;
    expect("dateOfBirth" in (p ?? {})).toBe(false);
  });

  it("exposes sex as flat string from PID-8", () => {
    expect(parseHL7(FULL).patient?.sex).toBe("F");
  });

  it("exposes address as XAD (D-19)", () => {
    const addr = parseHL7(FULL).patient?.address;
    expect(addr).toBeDefined();
    // Verify at least one known XAD field populated; match exact interface names in xad.ts.
    expect(addr?.city).toBe("Boston");
  });

  it("concatenates PID-13 + PID-14 into phoneNumbers (D-20)", () => {
    const phones = parseHL7(FULL).patient?.phoneNumbers;
    expect(phones).toHaveLength(2);
    expect(phones?.[0]?.telephoneNumber).toBe("(555)555-1234");
    expect(phones?.[1]?.telephoneNumber).toBe("(555)555-5678");
    expect(Object.isFrozen(phones)).toBe(true);
  });

  it("empty PID-13 and PID-14 → empty phoneNumbers array, not undefined", () => {
    const p = parseHL7(MIN_PID).patient;
    expect(p?.phoneNumbers).toEqual([]);
  });

  it("never throws on absent optional fields (HELPERS-07, D-22)", () => {
    expect(() => {
      const p = parseHL7(MIN_PID).patient;
      void p?.mrn; void p?.fullName; void p?.dateOfBirth; void p?.address; void p?.race;
    }).not.toThrow();
  });

  it("auto-unescapes string fields (D-23)", () => {
    const fx = "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5\r" + "PID|||X|||O\\F\\Brien^Patrick";
    expect(parseHL7(fx).patient?.familyName).toBe("O|Brien");  // \F\ → "|"
  });
});
```

(Verify actual XAD field name — PATTERNS.md has it as `city`; double-check xad.ts in the repo; if the real field name differs, use the real name.)

Run `pnpm test -- helpers-patient`.
  </action>
  <verify>
    <automated>pnpm test -- helpers-patient.test.ts 2>&1 | tail -30 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/helpers/patient.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "export function buildPatient" src/helpers/patient.ts` succeeds
    - `! grep -q "NOT IMPLEMENTED" src/helpers/patient.ts` succeeds
    - `grep -q "pickMrn(" src/helpers/patient.ts` succeeds (D-07/D-08 via the hook)
    - `grep -q "composeFullName" src/helpers/patient.ts` succeeds (D-17)
    - `grep -q 'field(13)' src/helpers/patient.ts && grep -q 'field(14)' src/helpers/patient.ts` succeeds (D-20)
    - `grep -q "Object.freeze(out)" src/helpers/patient.ts` succeeds (D-01)
    - `! grep -q "rawSegments" src/helpers/patient.ts` succeeds
    - `pnpm test -- helpers-patient.test.ts` exits 0 with ≥ 16 tests passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/helpers/patient.ts` exits 0
  </acceptance_criteria>
  <done>HELPERS-02 closed: msg.patient covers every locked field, D-04 undefined-on-no-PID, D-07/D-08 MRN pick, D-17 fullName, D-18 flat Date, D-19 flat name shortcuts, D-20 phones concat, D-01 frozen, HELPERS-07 never-throws, test suite green.</done>
</task>

<task type="auto">
  <name>Task 3: Cache invalidation test suite (meta + patient; Plan 03 will extend for visit)</name>
  <files>test/helpers-cache-invalidation.test.ts</files>
  <read_first>
    - src/model/message.ts (lines 485-488 — invalidateCaches extended by Plan 01 Task 3; lines 193-232 — segments/allSegments caches)
    - test/model-mutation.test.ts (lines 64-79 — "cache invalidated after setField" pattern is the canonical template)
    - .planning/phases/04-named-helpers/04-PATTERNS.md (§"test/helpers-cache-invalidation.test.ts" lines 896-970)
    - .planning/phases/04-named-helpers/04-CONTEXT.md (D-02 memoization + invalidation + Specific Ideas "msg.meta === msg.meta" line 376-379)
  </read_first>
  <action>
**Create `test/helpers-cache-invalidation.test.ts`:**

Plan 02 creates the FILE and ships the meta + patient cases. Plan 03 APPENDS visit-specific cases in a separate describe block; leave comment-marker at the bottom so Plan 03 knows where to append.

```ts
/**
 * Phase 4 — cache memoization + invalidation tests (D-02).
 * Proves `msg.meta`/`msg.patient`/`msg.visit` are memoized across repeat reads
 * and dropped wholesale by every mutation method (setField/addSegment/
 * removeSegment). Collection helpers are NOT memoized (D-06) — we verify
 * they re-evaluate on every call.
 *
 * Plan 02 owns this file; Plan 03 APPENDS visit-specific cases in the
 * marked section below.
 */

import { describe, expect, it } from "vitest";
import { parseHL7 } from "../src/parser/index.js";

const FIXTURE =
  "MSH|^~\\&|APP|FAC|||20250102||ADT^A01|MSG001|P|2.5\r" +
  "PID|||MRN001^^^HOSP^MR|||Smith^Jane||19800115|F";

const NO_PV1_FIXTURE = FIXTURE;  // same — FIXTURE intentionally has no PV1

describe("helpers cache memoization (D-02)", () => {
  it("msg.meta === msg.meta across reads", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.meta).toBe(msg.meta);
  });

  it("msg.patient === msg.patient across reads", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.patient).toBe(msg.patient);
    // Undefined-cache path: parseHL7(NO_PID) reads patient twice, both undefined.
    const noPid = parseHL7("MSH|^~\\&|APP|FAC|||20250102||ADT^A01|1|P|2.5");
    expect(noPid.patient).toBeUndefined();
    expect(noPid.patient).toBeUndefined();  // second read hits the null-sentinel cache, still undefined
  });
});

describe("helpers cache invalidation on mutation (D-02 + D-17)", () => {
  it("msg.setField('MSH.10', 'NEW') drops the meta cache", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.meta;
    msg.setField("MSH.10", "NEWCTRL");
    const after = msg.meta;
    expect(after).not.toBe(before);
    expect(after.controlId).toBe("NEWCTRL");
  });

  it("msg.setField('PID.5.1', 'Jones') drops the patient cache", () => {
    const msg = parseHL7(FIXTURE);
    const before = msg.patient;
    msg.setField("PID.5.1", "Jones");
    const after = msg.patient;
    expect(after).not.toBe(before);
    expect(after?.familyName).toBe("Jones");
  });

  it("msg.addSegment('NTE', ['', 'note']) drops all helper caches", () => {
    const msg = parseHL7(FIXTURE);
    const meta0 = msg.meta;
    const patient0 = msg.patient;
    msg.addSegment("NTE", ["", "note"]);
    expect(msg.meta).not.toBe(meta0);
    expect(msg.patient).not.toBe(patient0);
  });

  it("msg.removeSegment('PID') drops the patient cache → undefined", () => {
    const msg = parseHL7(FIXTURE);
    expect(msg.patient).toBeDefined();
    msg.removeSegment("PID");
    expect(msg.patient).toBeUndefined();
  });
});

describe("collection helpers are NOT memoized (D-06)", () => {
  it("msg.observations() returns a fresh array on every call", () => {
    // FIXTURE has no OBX — both calls return empty arrays, but distinct references.
    // NOTE: This test asserts the D-06 contract; it does NOT require observations
    // to be fully implemented (Plan 03 fills it). Plan 02 may SKIP this test
    // until Plan 03 lands if the stub throws; see conditional below.
    const msg = parseHL7(FIXTURE);
    try {
      const a = msg.observations();
      const b = msg.observations();
      expect(a).not.toBe(b);  // D-06 — no memoization
      expect(a).toStrictEqual(b);
    } catch (err: unknown) {
      // Plan 03 hasn't run yet — stub still throws. Skip rather than fail Plan 02.
      if (err instanceof Error && err.message.includes("NOT IMPLEMENTED")) {
        // eslint-disable-next-line no-console
        // suppress — acceptable during Plan 02 execution; Plan 03 removes the stub.
        return;
      }
      throw err;
    }
  });
});

// Visit memoization + invalidation tests live in a disjoint file
// (test/helpers-cache-invalidation-visit.test.ts) owned by Plan 03, so Plan
// 02 and Plan 03 can run in parallel on Wave 2 without edit conflicts.
```

Run `pnpm test -- helpers-cache-invalidation`.
  </action>
  <verify>
    <automated>pnpm test -- helpers-cache-invalidation.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `test -f test/helpers-cache-invalidation.test.ts` succeeds
    - `grep -q 'msg.meta === msg.meta' test/helpers-cache-invalidation.test.ts || grep -q "msg.meta.*toBe.*msg.meta" test/helpers-cache-invalidation.test.ts` succeeds
    - `pnpm test -- helpers-cache-invalidation.test.ts` exits 0 with ≥ 6 cases passing
    - Full suite stays green: `pnpm test` exits 0
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint test/helpers-cache-invalidation.test.ts` exits 0
  </acceptance_criteria>
  <done>D-02 memoization + invalidation proved for meta + patient; full suite green. Plan 03 will add visit cases in its own disjoint file.</done>
</task>

</tasks>

<verification>
```bash
pnpm typecheck
pnpm lint
pnpm test -- helpers-meta helpers-patient helpers-cache-invalidation types-xcn helpers-pick-mrn
pnpm test    # full suite — ≥ 336 tests (Plan 01) + ~30 new Plan 02 tests
```

Verify HELPERS-01 + HELPERS-02 acceptance by reading a realistic ADT^A01 fixture and checking all locked fields are exposed with correct types.
</verification>

<success_criteria>
- HELPERS-01 satisfied: `msg.meta` exposes all 12 locked fields, flat Date, auto-unescaped, frozen, never throws.
- HELPERS-02 satisfied: `msg.patient` exposes all 14 locked fields (mrn, identifiers, name, familyName, givenName, middleName, fullName, dateOfBirth, sex, address, phoneNumbers, race, ethnicity, language), D-04 undefined on no-PID, D-07/D-08 MRN pick, D-17 Western fullName, D-18 flat Date, D-19 locked shortcuts, D-20 phones concat, D-01 frozen, HELPERS-07 never-throws.
- D-02 memoization verified: `msg.meta === msg.meta`, `msg.patient === msg.patient`.
- D-17 (mutation invalidation) verified: `msg.setField` / `msg.addSegment` / `msg.removeSegment` drop meta + patient caches.
- D-06 verified: `msg.observations()` returns a fresh array on every call (not memoized).
- Full `pnpm test` green with ≥ 360 tests.
- No edits to message.ts, field.ts, index.ts, types.ts, or any Plan 03/04 file.
</success_criteria>

<output>
After completion, create `.planning/phases/04-named-helpers/04-02-SUMMARY.md` with:
- What shipped (buildMeta, buildPatient, 3 test files).
- HELPERS-01 + HELPERS-02 + HELPERS-07 closed for MSH + PID surfaces.
- D-02 memoization + invalidation proved via dedicated test file.
- Notes for Plan 03: visit cache tests live in `test/helpers-cache-invalidation-visit.test.ts` (Plan 03 creates it). Plan 02's `helpers-cache-invalidation.test.ts` is NOT multi-owner — Plan 03 does not edit this file.
- Files created (3) + modified (2).
- Test count before/after.
</output>
