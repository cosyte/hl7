---
phase: 03-structural-model-and-types
plan: 03
title: Composite parsers — Telecom (XTN), Location (PL), Timestamp (TS/DTM), Numeric (NM)
type: execute
wave: 2
depends_on: [03-PLAN-01]
files_modified:
  - src/model/types/xtn.ts
  - src/model/types/pl.ts
  - src/model/types/ts.ts
  - src/model/types/nm.ts
  - test/types-xtn.test.ts
  - test/types-pl.test.ts
  - test/types-ts.test.ts
  - test/types-nm.test.ts
autonomous: true
requirements: [TYPES-01, TYPES-02, TYPES-03, TYPES-04]

must_haves:
  truths:
    - "A developer calling `parseXtn(rep, enc)` on an HL7 telecom repetition receives an `XTN` object with telephoneNumber, telecommunicationUseCode, telecommunicationEquipmentType, emailAddress, countryCode, areaCityCode, localNumber, extension, anyText, extensionPrefix, speedDialCode, unformattedTelephoneNumber (12 v1 components)."
    - "A developer calling `parsePl(rep, enc)` on an HL7 person-location repetition receives a `PL` object with pointOfCare, room, bed, facility (nested HD), locationStatus, personLocationType, building, floor, locationDescription, comprehensiveLocationId, assigningAuthorityForLocation (11 v1 components)."
    - "A developer calling `parseTs(rep, enc)` on an HL7 TS/DTM repetition receives `{ raw: string; date: Date | undefined }` (TYPES-03). `raw` is the auto-unescaped string as it appeared in the message; `date` is the result of `parseHl7Timestamp(raw, {})` with calendar-invalid values normalized to `undefined` (D-24, TYPES-04)."
    - "A developer calling `parseNm(rep, enc)` on an HL7 numeric repetition receives `{ raw: string; value: number | undefined }`. `raw` preserves the original string including negative signs and exponents; `value` is `parseFloat(raw)` with `NaN` normalized to `undefined`."
    - "A developer's `parseTs` reuses `parseHl7Timestamp` from Phase 2 — zero duplicate date logic (D-10). No-offset timestamps resolve to UTC (D-21); truncations resolve to midnight/first-of-month/Jan-1 (D-22); fractional seconds truncate to 3 digits via the stdlib Date (D-23)."
  artifacts:
    - path: "src/model/types/xtn.ts"
      provides: "XTN interface + parseXtn(rep, enc): XTN"
      exports: ["XTN", "parseXtn"]
    - path: "src/model/types/pl.ts"
      provides: "PL interface + parsePl(rep, enc): PL"
      exports: ["PL", "parsePl"]
    - path: "src/model/types/ts.ts"
      provides: "TS interface + parseTs(rep, enc): TS — delegates to parseHl7Timestamp"
      exports: ["TS", "parseTs"]
    - path: "src/model/types/nm.ts"
      provides: "NM interface + parseNm(rep, enc): NM"
      exports: ["NM", "parseNm"]
  key_links:
    - from: "src/model/types/ts.ts"
      to: "src/parser/dates.ts"
      via: "parseTs delegates to parseHl7Timestamp(raw, {}) — D-10 zero duplicate date logic"
      pattern: "parseHl7Timestamp\\("
    - from: "src/model/types/ts.ts"
      to: "src/parser/escapes.ts"
      via: "parseTs calls unescape on the raw TS string (TS may contain escapes though rare)"
      pattern: "unescape\\("
    - from: "src/model/types/pl.ts"
      to: "src/model/types/hd.ts"
      via: "PL.facility is a nested HD (component 4 of PL, 3 subcomponents — same synthesis pattern as CX)"
      pattern: "parseHd\\("
---

<objective>
Ship the remaining 4 of the 10 typed composite parsers: XTN (Extended Telecommunication Number), PL (Person Location), TS/DTM (Time Stamp, delegates to Phase 2), NM (Numeric). Runs in parallel with Plan 02 — disjoint file ownership under `src/model/types/`. Closes TYPES-03 + TYPES-04 (TS/DTM specifics).

Purpose: Phase 4's `msg.patient.phoneNumbers[]` (XTN), `msg.visit.location` (PL), `msg.meta.timestamp` and `msg.patient.dateOfBirth` (TS/DTM), `msg.observations()[n].value` when valueType is `"NM"` (NM) all depend on these. The TS composite is the ONLY composite that delegates to a Phase 2 helper (D-10), so correctness of the Phase 2 timestamp cascade surfaces through `Field.asTs().date` unchanged.

Output:
- 4 type+parser files under `src/model/types/` — one per composite.
- 4 Vitest test files — one per composite.
- Zero modifications to `src/index.ts` — Plan 04 handles the barrel.
- Consumes `src/model/types/_shared.ts` (created in Plan 02 Task 1) via relative import — Plan 02 and Plan 03 both depend on Plan 01 but do NOT depend on each other; if the parallel execution runs Plan 02 first and creates `_shared.ts`, Plan 03 imports it; if Plan 03 starts simultaneously, it creates a minimal local fallback. **Note: see Task 0 below for the explicit handshake.**
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/phases/03-structural-model-and-types/03-CONTEXT.md
@.planning/phases/03-structural-model-and-types/03-PATTERNS.md
@.planning/phases/02-core-parser-and-tolerance/02-05-SUMMARY.md
@src/parser/types.ts
@src/parser/escapes.ts
@src/parser/dates.ts
@src/parser/delimiters.ts

<interfaces>
<!-- From Phase 2 Plan 05 — parseHl7Timestamp is shipped, signature locked. -->

From src/parser/dates.ts:
```typescript
export function parseHl7Timestamp(
  raw: string,
  opts: ParseHl7TimestampOptions,
): Date | undefined;

export interface ParseHl7TimestampOptions {
  readonly userFormats?: readonly string[];
  readonly emit?: (warning: Hl7ParseWarning) => void;
  readonly position?: Hl7Position;
}

export const BUILTIN_DATE_FALLBACKS: readonly string[];
```

The TS composite calls `parseHl7Timestamp(raw, {})` — empty options, silent (no `emit`/`position`). This is the D-10 "zero duplicate date logic" contract.

From src/model/types/_shared.ts (created in Plan 02 Task 1):
```typescript
export function readSubcomponent(component: RawComponent | undefined, index: number, enc: EncodingCharacters): string | undefined;
export function readComponent(rep: RawRepetition, index: number, enc: EncodingCharacters): string | undefined;
```

Empty-string → `undefined` mapping: Both helpers map `subcomponents[i] === ""` to `undefined`. Composite parsers use `if (value !== undefined) out.field = value;` to honor exactOptionalPropertyTypes.

From src/model/types/hd.ts (created in Plan 02 Task 2):
```typescript
export interface HD {
  readonly namespaceId?: string;
  readonly universalId?: string;
  readonly universalIdType?: string;
}
export function parseHd(rep: RawRepetition, enc: EncodingCharacters): HD;
```

PL.facility uses the same nested-HD synthesis pattern as CX.assigningAuthority (see Plan 02 Task 3 for the canonical shape).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 0: Handshake — wait for _shared.ts to exist, then proceed</name>
  <files>(none — sanity check only)</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PLAN-02-composites-person-address-identifier.md (Plan 02 Task 1 creates _shared.ts)
  </read_first>
  <action>
Verify that `src/model/types/_shared.ts` exists on disk:

```bash
test -f src/model/types/_shared.ts || {
  echo "MISSING: src/model/types/_shared.ts — Plan 02 must land before Plan 03 can continue."
  exit 1
}
test -f src/model/types/hd.ts || {
  echo "MISSING: src/model/types/hd.ts — Plan 02 Task 2 must land before Plan 03's PL composite."
  exit 1
}
```

Both files are created by Plan 02 (Task 1 → _shared.ts, Task 2 → hd.ts). The wave-2 parallel execution scheduler should guarantee Plan 02 has shipped both by the time Plan 03 runs — but we verify explicitly because `files_modified` only prevents WRITE conflicts, not READ dependencies. If the sanity check fails, the runner should re-run Plan 02 first.

**Planner note:** If gsd-execute-phase cannot guarantee Plan 02 lands before Plan 03 (which it should, because Plan 02's `_shared.ts` and `hd.ts` are read-only dependencies), an alternative is to move _shared.ts and hd.ts creation into Plan 01 or into a joint "Wave 2a" plan. Since both Plan 02 and Plan 03 are declared `depends_on: [03-PLAN-01]`, they are semantically parallel from the executor's perspective. The simplest resolution is to run Plan 02 FIRST within Wave 2 (sequential ordering within the wave), and Plan 03 SECOND. The orchestrator can honor this by executing in listed order within the wave.

**Operational fallback:** If _shared.ts or hd.ts is genuinely missing, halt and signal the orchestrator to run Plan 02 first.
  </action>
  <verify>
    <automated>test -f src/model/types/_shared.ts && test -f src/model/types/hd.ts && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - `src/model/types/_shared.ts` exists.
    - `src/model/types/hd.ts` exists.
  </acceptance_criteria>
  <done>Plan 02's prerequisite files are present. Task 1+ can proceed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 1: Create TS (TS/DTM) and NM — the scalar composites that delegate to Phase 2 helpers</name>
  <files>src/model/types/ts.ts, src/model/types/nm.ts, test/types-ts.test.ts, test/types-nm.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-CONTEXT.md (D-14 TS shape `{ raw, date }`; D-21 no-offset = UTC; D-22 truncations to midnight; D-23 fractional seconds truncate to 3 digits; D-24 NaN → undefined)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PATTERNS.md (§`src/model/types/ts.ts` — full canonical parseTs shape with parseHl7Timestamp delegation; key handoff block)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-05-SUMMARY.md (Phase 2 Plan 05 — parseHl7Timestamp cascade + BUILTIN_DATE_FALLBACKS)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/dates.ts (parseHl7Timestamp signature lines 93-122; BUILTIN_DATE_FALLBACKS; "Timestamps without an explicit timezone offset are interpreted as UTC")
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/escapes.ts (unescape 4-arg signature)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/_shared.ts (readSubcomponent from Plan 02)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (no any, JSDoc @example, no console)
  </read_first>
  <behavior>
    TS composite:
    - Test 1: `parseTs` on `"20250102153045"` returns `{ raw: "20250102153045", date: new Date("2025-01-02T15:30:45.000Z") }` (UTC, D-21).
    - Test 2: `parseTs` on `"20250102"` returns `{ raw: "20250102", date: new Date("2025-01-02T00:00:00.000Z") }` (midnight, D-22).
    - Test 3: `parseTs` on `"202501"` returns `{ raw: "202501", date: new Date("2025-01-01T00:00:00.000Z") }` (first-of-month, D-22).
    - Test 4: `parseTs` on `"2025"` returns `{ raw: "2025", date: new Date("2025-01-01T00:00:00.000Z") }` (Jan 1, D-22).
    - Test 5: `parseTs` on `"20250102153045+0500"` returns `{ raw: "20250102153045+0500", date: new Date("2025-01-02T10:30:45.000Z") }` (offset respected).
    - Test 6: `parseTs` on `"20250102153045.123"` returns `{ raw: "20250102153045.123", date: new Date("2025-01-02T15:30:45.123Z") }` (3-digit fractional, D-23).
    - Test 7: `parseTs` on `"not a date"` returns `{ raw: "not a date", date: undefined }` — no throw (TYPES-04).
    - Test 8: `parseTs` on `"20251345"` (invalid month 13, calendar-invalid though shape-valid) returns `{ raw: "20251345", date: undefined }` — NaN normalized to undefined per D-24.
    - Test 9: `parseTs` on empty repetition returns `{ raw: "", date: undefined }`.
    - Test 10: `parseTs` on `"202501\\F\\02"` (with embedded escape — unlikely in real TS but tests the unescape path) returns `{ raw: "202501|02", date: undefined }` (unescaped raw; shape no longer matches HL7 TS, so date = undefined).
    - Test 11: `parseTs` shape has EXACTLY 2 keys (raw, date) — no extra keys. `Object.keys(ts).sort()` is `["date", "raw"]`.
    - Test 12: `parseTs` result is readonly at compile time — `ts.raw = "..."` fails TypeScript (verify via a `@ts-expect-error` line in a test).

    NM composite:
    - Test 13: `parseNm` on `"120"` returns `{ raw: "120", value: 120 }`.
    - Test 14: `parseNm` on `"-14.5"` returns `{ raw: "-14.5", value: -14.5 }`.
    - Test 15: `parseNm` on `"1.23e2"` returns `{ raw: "1.23e2", value: 123 }`.
    - Test 16: `parseNm` on `"not a number"` returns `{ raw: "not a number", value: undefined }` — no throw.
    - Test 17: `parseNm` on `""` (empty) returns `{ raw: "", value: undefined }`.
    - Test 18: `parseNm` on `"12.0\\F\\5"` returns `{ raw: "12.0|5", value: undefined }` (parseFloat stops at the `|`, giving 12.0 — BUT the presence of non-numeric tail should invalidate; use `Number(raw)` instead of `parseFloat(raw)` for stricter parsing). **Implementation decision: use `Number(raw)` for NM — it returns `NaN` for `"12.0|5"` and `"12abc"`, matching strict-numeric expectations. `parseFloat` is too permissive.**
    - Test 19: `parseNm` NaN → undefined normalization.
  </behavior>
  <action>
**Create `src/model/types/ts.ts`.**

File-level JSDoc:
```typescript
/**
 * TS/DTM — HL7 v2 Time Stamp composite. The ONLY composite in Phase 3 that
 * delegates to a Phase 2 helper: parsing logic lives in
 * `src/parser/dates.ts::parseHl7Timestamp` (D-10 "zero duplicate date logic").
 * The composite shape is locked to `{ raw, date }` (D-14); the caller gets
 * both the raw HL7 string and the parsed JS `Date`, with `date` normalized
 * to `undefined` on calendar-invalid or shape-mismatched input (D-24).
 *
 * No-offset timestamps resolve to UTC (D-21). Truncations (YYYYMMDD, YYYYMM,
 * YYYY) resolve to midnight / first-of-month / Jan-1 in the resolved TZ
 * (D-22). Fractional seconds truncate to 3 digits via JS stdlib `Date`
 * milliseconds (D-23) — the `.raw` string preserves full precision.
 */
```

Imports:
```typescript
import { parseHl7Timestamp } from "../../parser/dates.js";
import { unescape } from "../../parser/escapes.js";
import type { EncodingCharacters, Hl7Position, RawRepetition } from "../../parser/types.js";
```

Interface (D-14 EXACT shape):
```typescript
/**
 * HL7 v2 Time Stamp (TS) / Date Time (DTM) composite. Always carries both
 * the raw HL7 string and the parsed JS `Date`. `.date` is `undefined` when
 * the raw string matches neither the HL7 TS shape nor any built-in fallback
 * and produces no valid `Date` — NEVER throws (TYPES-04 no-throw guarantee).
 *
 * @example
 * ```ts
 * import type { TS } from "@cosyte/hl7-parser";
 * const ts: TS = { raw: "20250102", date: new Date("2025-01-02T00:00:00.000Z") };
 * const invalid: TS = { raw: "not a date", date: undefined };
 * ```
 */
export interface TS {
  readonly raw: string;
  readonly date: Date | undefined;
}
```

Parser (per PATTERNS.md §`src/model/types/ts.ts` exact pattern):

```typescript
const NOOP_EMITTER = (): void => {};
const DEFAULT_POSITION: Hl7Position = { segmentIndex: 0 };

/**
 * Parse an HL7 v2 TS/DTM repetition into `{ raw, date }`. Delegates the date
 * parsing to `parseHl7Timestamp` — the SAME cascade that backs every
 * timestamp in the library (Phase 2). No user `dateFormats` at this layer;
 * Phase 4 helpers (msg.meta.timestamp) that DO know the ParseOptions.dateFormats
 * may call parseHl7Timestamp directly with options.
 *
 * @example
 * ```ts
 * import { parseTs, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7-parser";
 * const rep = { components: [{ subcomponents: ["20250102153045"] }] };
 * const ts = parseTs(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(ts.raw);  // "20250102153045"
 * console.log(ts.date); // Date — 2025-01-02T15:30:45.000Z (UTC by default)
 * ```
 */
export function parseTs(rep: RawRepetition, enc: EncodingCharacters): TS {
  const comp = rep.components[0];
  const sub = comp?.subcomponents[0] ?? "";
  const raw = sub === "" ? "" : unescape(sub, enc, NOOP_EMITTER, DEFAULT_POSITION);

  // D-10: delegate to parseHl7Timestamp — zero duplicate date logic.
  // D-24: normalize calendar-invalid Date (NaN getTime) to undefined.
  const parsed = raw === "" ? undefined : parseHl7Timestamp(raw, {});
  const date = parsed !== undefined && !Number.isNaN(parsed.getTime()) ? parsed : undefined;

  return { raw, date };
}
```

Note that the shape is `readonly raw: string; readonly date: Date | undefined;` — NOT optional (`date?:`). D-14 mandates BOTH keys are always present, `date` is explicitly typed as `Date | undefined` (not an optional). This matters for `exactOptionalPropertyTypes`: the return object has `date: undefined` as a VALUE, not a missing key. The `readonly` is type-level only; runtime assignments would fail TS compilation.

**Create `src/model/types/nm.ts`.**

File-level JSDoc:
```typescript
/**
 * NM — HL7 v2 Numeric composite. Parses the raw HL7 numeric string into a
 * `number` via the stricter `Number(raw)` (not `parseFloat`, which tolerates
 * trailing garbage). `NaN` is normalized to `undefined` per the same
 * no-throw discipline as TS/DTM (D-24 analogous).
 *
 * The raw string is preserved verbatim on the composite so callers needing
 * to round-trip or render with the original precision/formatting can.
 */
```

Imports:
```typescript
import { unescape } from "../../parser/escapes.js";
import type { EncodingCharacters, Hl7Position, RawRepetition } from "../../parser/types.js";
```

Interface:
```typescript
/**
 * HL7 v2 Numeric (NM) composite. Carries both the raw HL7 numeric string
 * and the parsed JS `number`. `.value` is `undefined` when the raw string
 * is empty or not fully numeric — NEVER throws.
 *
 * @example
 * ```ts
 * import type { NM } from "@cosyte/hl7-parser";
 * const glucose: NM = { raw: "120", value: 120 };
 * const bad: NM = { raw: "N/A", value: undefined };
 * ```
 */
export interface NM {
  readonly raw: string;
  readonly value: number | undefined;
}
```

Parser:
```typescript
const NOOP_EMITTER = (): void => {};
const DEFAULT_POSITION: Hl7Position = { segmentIndex: 0 };

/**
 * Parse an HL7 v2 NM repetition into `{ raw, value }`. Uses `Number(raw)` for
 * strict numeric parsing — trailing non-numeric characters produce `NaN`,
 * normalized to `undefined`. Empty raw also produces `undefined`.
 *
 * @example
 * ```ts
 * import { parseNm, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7-parser";
 * const rep = { components: [{ subcomponents: ["120.5"] }] };
 * const nm = parseNm(rep, DEFAULT_ENCODING_CHARACTERS);
 * console.log(nm.value); // 120.5
 * ```
 */
export function parseNm(rep: RawRepetition, enc: EncodingCharacters): NM {
  const comp = rep.components[0];
  const sub = comp?.subcomponents[0] ?? "";
  const raw = sub === "" ? "" : unescape(sub, enc, NOOP_EMITTER, DEFAULT_POSITION);
  if (raw === "") return { raw, value: undefined };
  const n = Number(raw);
  const value = Number.isNaN(n) ? undefined : n;
  return { raw, value };
}
```

**Test files.**

`test/types-ts.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { parseTs } from "../src/model/types/ts.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;
function rep(s: string): RawRepetition {
  return { components: [{ subcomponents: [s] }] };
}

describe("model/types/ts: parseTs", () => {
  it("parses full HL7 TS/DTM with all fields", () => {
    const ts = parseTs(rep("20250102153045"), enc);
    expect(ts.raw).toBe("20250102153045");
    expect(ts.date?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
  });

  it("parses YYYYMMDD truncation to midnight UTC (D-21, D-22)", () => {
    const ts = parseTs(rep("20250102"), enc);
    expect(ts.date?.toISOString()).toBe("2025-01-02T00:00:00.000Z");
  });

  it("parses YYYYMM truncation to first-of-month (D-22)", () => {
    const ts = parseTs(rep("202501"), enc);
    expect(ts.date?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("parses YYYY truncation to Jan 1 (D-22)", () => {
    const ts = parseTs(rep("2025"), enc);
    expect(ts.date?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("honors explicit timezone offset", () => {
    const ts = parseTs(rep("20250102153045+0500"), enc);
    expect(ts.date?.toISOString()).toBe("2025-01-02T10:30:45.000Z");
  });

  it("parses fractional seconds (3 digits) per D-23", () => {
    const ts = parseTs(rep("20250102153045.123"), enc);
    expect(ts.date?.getUTCMilliseconds()).toBe(123);
  });

  it("returns undefined date for unparseable raw (TYPES-04 no-throw)", () => {
    const ts = parseTs(rep("not a date"), enc);
    expect(ts.raw).toBe("not a date");
    expect(ts.date).toBeUndefined();
  });

  it("normalizes calendar-invalid Date to undefined (D-24)", () => {
    const ts = parseTs(rep("20251345"), enc); // month 13
    expect(ts.date).toBeUndefined();
  });

  it("handles empty repetition", () => {
    const ts = parseTs({ components: [] }, enc);
    expect(ts.raw).toBe("");
    expect(ts.date).toBeUndefined();
  });

  it("unescapes the raw string before parsing", () => {
    const ts = parseTs(rep("202501\\F\\02"), enc);
    expect(ts.raw).toBe("202501|02"); // unescaped
    expect(ts.date).toBeUndefined(); // shape no longer valid
  });

  it("result has exactly 2 keys", () => {
    const ts = parseTs(rep("20250102"), enc);
    expect(Object.keys(ts).sort()).toStrictEqual(["date", "raw"]);
  });
});
```

`test/types-nm.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { parseNm } from "../src/model/types/nm.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawRepetition } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;
function rep(s: string): RawRepetition {
  return { components: [{ subcomponents: [s] }] };
}

describe("model/types/nm: parseNm", () => {
  it("parses positive integer", () => {
    expect(parseNm(rep("120"), enc)).toStrictEqual({ raw: "120", value: 120 });
  });
  it("parses negative float", () => {
    expect(parseNm(rep("-14.5"), enc)).toStrictEqual({ raw: "-14.5", value: -14.5 });
  });
  it("parses scientific notation", () => {
    expect(parseNm(rep("1.23e2"), enc)).toStrictEqual({ raw: "1.23e2", value: 123 });
  });
  it("returns undefined value for non-numeric (strict)", () => {
    expect(parseNm(rep("not a number"), enc).value).toBeUndefined();
  });
  it("returns undefined value for empty raw", () => {
    expect(parseNm(rep(""), enc)).toStrictEqual({ raw: "", value: undefined });
  });
  it("rejects trailing garbage (Number, not parseFloat)", () => {
    expect(parseNm(rep("12abc"), enc).value).toBeUndefined();
  });
  it("preserves raw string verbatim", () => {
    expect(parseNm(rep("  3.14  "), enc).raw).toBe("  3.14  ");
    // Number("  3.14  ") === 3.14 (JS allows surrounding whitespace)
    expect(parseNm(rep("  3.14  "), enc).value).toBe(3.14);
  });
  it("auto-unescapes the raw before numeric parse", () => {
    expect(parseNm(rep("12.0\\F\\5"), enc)).toStrictEqual({ raw: "12.0|5", value: undefined });
  });
});
```
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint src/model/types/ts.ts src/model/types/nm.ts test/types-ts.test.ts test/types-nm.test.ts --max-warnings=0 && pnpm test -- --run "types-ts|types-nm"</automated>
  </verify>
  <acceptance_criteria>
    - `src/model/types/ts.ts` and `src/model/types/nm.ts` exist: `test -f src/model/types/ts.ts && test -f src/model/types/nm.ts && echo OK`.
    - TS interface has exactly 2 fields `raw` and `date`: `grep -cE "readonly (raw|date):" src/model/types/ts.ts` returns 2.
    - `parseTs` calls `parseHl7Timestamp`: `grep -cE "parseHl7Timestamp\\(" src/model/types/ts.ts` returns >= 1.
    - `parseTs` normalizes NaN via `Number.isNaN(parsed.getTime())`: `grep -cE "Number\\.isNaN.*getTime" src/model/types/ts.ts` returns 1.
    - NM interface has exactly 2 fields `raw` and `value`: `grep -cE "readonly (raw|value):" src/model/types/nm.ts` returns 2.
    - `parseNm` uses `Number(raw)` not `parseFloat`: `grep -c "Number\\(raw\\)" src/model/types/nm.ts` returns 1 AND `grep -c "parseFloat" src/model/types/nm.ts` returns 0.
    - No `any`, no `console.*`, no object-literal `as` on TS/NM: `grep -cE "(: any(\\s|,|\\))|console\\.|\\} as (TS|NM))" src/model/types/ts.ts src/model/types/nm.ts` returns 0.
    - `@example` on every public export (2 per file × 2 files = 4): `grep -c "@example" src/model/types/ts.ts src/model/types/nm.ts` returns >= 4.
    - Test files exist: all 11 TS tests + 8 NM tests present.
    - `pnpm typecheck && pnpm lint ... --max-warnings=0 && pnpm test -- --run "types-ts|types-nm"` all exit 0.
  </acceptance_criteria>
  <done>TS composite delegates to `parseHl7Timestamp` with NaN → undefined normalization; 11 tests pass. NM composite uses strict `Number(raw)` with NaN → undefined normalization; 8 tests pass. D-10, D-14, D-21, D-22, D-23, D-24 all demonstrated. Zero lint/typecheck warnings.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create XTN and PL — telecom + person-location composites (PL nests HD)</name>
  <files>src/model/types/xtn.ts, src/model/types/pl.ts, test/types-xtn.test.ts, test/types-pl.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-CONTEXT.md (§canonical_refs — XTN 14 spec / v1 trimmed to 12, PL 12 spec / v1 trimmed to 11)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PATTERNS.md (§`src/model/types/xpn.ts` — canonical pattern applies to XTN/PL)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/_shared.ts (readComponent)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/types/hd.ts (parseHd — PL.facility nests HD, same pattern as CX.assigningAuthority)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/03-structural-model-and-types/03-PLAN-02-composites-person-address-identifier.md (CX Task 3 — see `parseAssigningAuthority` nested-HD synthesis; PL.facility reuses this pattern)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md
  </read_first>
  <behavior>
    XTN (12 components for v1):
    - Test 1: `parseXtn` on `"555-1234^PRN^PH"` returns `{ telephoneNumber: "555-1234", telecommunicationUseCode: "PRN", telecommunicationEquipmentType: "PH" }`.
    - Test 2: `parseXtn` on `"^NET^Internet^jane@example.com"` returns `{ telecommunicationUseCode: "NET", telecommunicationEquipmentType: "Internet", emailAddress: "jane@example.com" }` (no telephoneNumber key).
    - Test 3: `parseXtn` on empty repetition returns `{}`.
    - Test 4: `parseXtn` on a full 12-component repetition populates every field.

    PL (11 components for v1):
    - Test 5: `parsePl` on `"ICU^101^A"` returns `{ pointOfCare: "ICU", room: "101", bed: "A" }`.
    - Test 6: `parsePl` on component 4 with HD subcomponents `"^^^APP&1.2.3&UUID"` returns `{ facility: { namespaceId: "APP", universalId: "1.2.3", universalIdType: "UUID" } }`.
    - Test 7: `parsePl` with all 11 components populates every field including nested HD.
    - Test 8: `parsePl` on empty repetition returns `{}`.
    - Test 9: `parsePl.facility` is OMITTED when component 4 is all empty subs.
  </behavior>
  <action>
**Create `src/model/types/xtn.ts`** — 12 components for v1 (trimmed from the full 14-component HL7 v2.5 XTN to keep the v1 interface cohesive; v2 may restore the full shape):

XTN fields:
1. `telephoneNumber` (e.g. `"(555) 555-1234"` — unformatted or formatted)
2. `telecommunicationUseCode` (PRN=Primary Residence, WPN=Work, NET=Internet, ORN=Other Residence, BPN=Beeper, VHN=Vacation Home, ASN=Answering Service, EMR=Emergency, ...)
3. `telecommunicationEquipmentType` (PH=Phone, FX=Fax, MD=Modem, CP=Cellular Phone, BP=Beeper, Internet, X.400, TDD, TTY)
4. `emailAddress` (e.g. `"jane@example.com"`)
5. `countryCode` (e.g. `"+1"`)
6. `areaCityCode` (e.g. `"555"`)
7. `localNumber` (e.g. `"5551234"`)
8. `extension` (e.g. `"4567"`)
9. `anyText` (free text — notes)
10. `extensionPrefix` (e.g. `"x"`)
11. `speedDialCode`
12. `unformattedTelephoneNumber`

Interface with full `@example`. Parser: 12 `readComponent` calls, Mutable<T> + conditional assignment pattern (same as XPN in Plan 02 Task 2).

**Create `src/model/types/pl.ts`** — 11 components for v1:

PL fields (HL7 v2.5 PL has 12 components; v1 trims the rarely-used `entityIdentifier` slot 12 for interface cohesion — revisit in v2):
1. `pointOfCare` (string — e.g. "ICU", "ED")
2. `room` (string)
3. `bed` (string)
4. `facility` (nested HD — 3 subcomponents)
5. `locationStatus` (string — O=Occupied, U=Unoccupied, K=Contaminated, C=Closed, H=Housekeeping, I=Isolated)
6. `personLocationType` (string — C=Clinic, D=Department, H=Home, N=Nursing Unit, O=Office, R=Revenue Location)
7. `building` (string)
8. `floor` (string)
9. `locationDescription` (string — free text)
10. `comprehensiveLocationId` (string — HL7 v2.5 new)
11. `assigningAuthorityForLocation` (string — flattened; could be HD but v1 simplifies — same rationale as CX.assigningFacility)

Parser: 11 component reads, with component 4 (facility) using the nested-HD synthesis helper. The helper is Plan 02's `parseAssigningAuthority` pattern — extract into `_shared.ts` OR inline in pl.ts. **Recommendation: inline it in pl.ts** (DRY principle — the pattern shows up exactly 2 times across all composites: CX and PL. A 3rd occurrence would justify promoting to _shared.ts).

Inline helper in pl.ts:
```typescript
function parseFacility(
  comp: RawComponent | undefined,
  enc: EncodingCharacters,
): HD | undefined {
  if (comp === undefined) return undefined;
  if (comp.subcomponents.every((s) => s === "")) return undefined;
  const synthetic: RawRepetition = {
    components: comp.subcomponents.map((sub) => ({ subcomponents: [sub] })),
  };
  const hd = parseHd(synthetic, enc);
  return Object.keys(hd).length === 0 ? undefined : hd;
}
```

**Test files.** `test/types-xtn.test.ts` with 8-10 cases, `test/types-pl.test.ts` with 8-10 cases (mirror the XPN/CX test shape from Plan 02).

Critical PL tests:

```typescript
describe("model/types/pl: parsePl", () => {
  it("extracts first 3 components", () => {
    const out = parsePl(rep([["ICU"], ["101"], ["A"]]), enc);
    expect(out).toStrictEqual({ pointOfCare: "ICU", room: "101", bed: "A" });
  });

  it("parses nested HD in component 4 (facility)", () => {
    const out = parsePl(
      rep([[""], [""], [""], ["APP", "1.2.3", "UUID"]]),
      enc,
    );
    expect(out.facility).toStrictEqual({
      namespaceId: "APP",
      universalId: "1.2.3",
      universalIdType: "UUID",
    });
  });

  it("omits facility when component 4 is all empty", () => {
    const out = parsePl(rep([["ICU"], [""], [""], ["", "", ""]]), enc);
    expect("facility" in out).toBe(false);
    expect(out.pointOfCare).toBe("ICU");
  });

  it("populates all 11 components", () => {
    const out = parsePl(rep([
      ["ICU"], ["101"], ["A"],
      ["HOSP", "1.2.3", "UUID"],
      ["O"], ["N"], ["BldgA"], ["3"],
      ["West wing ICU"], ["COMP-LOC-1"], ["Auth-Str"],
    ]), enc);
    expect(out).toStrictEqual({
      pointOfCare: "ICU", room: "101", bed: "A",
      facility: { namespaceId: "HOSP", universalId: "1.2.3", universalIdType: "UUID" },
      locationStatus: "O", personLocationType: "N", building: "BldgA", floor: "3",
      locationDescription: "West wing ICU", comprehensiveLocationId: "COMP-LOC-1",
      assigningAuthorityForLocation: "Auth-Str",
    });
  });

  it("returns {} on empty repetition", () => {
    expect(parsePl({ components: [] }, enc)).toStrictEqual({});
  });
});
```
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint src/model/types/xtn.ts src/model/types/pl.ts test/types-xtn.test.ts test/types-pl.test.ts --max-warnings=0 && pnpm test -- --run "types-xtn|types-pl"</automated>
  </verify>
  <acceptance_criteria>
    - `src/model/types/xtn.ts` and `src/model/types/pl.ts` exist: `test -f src/model/types/xtn.ts && test -f src/model/types/pl.ts && echo OK`.
    - XTN has 12 optional fields: `grep -cE "readonly [a-zA-Z]+\\?:" src/model/types/xtn.ts` returns 12.
    - PL has 11 optional fields: `grep -cE "readonly [a-zA-Z]+\\?:" src/model/types/pl.ts` returns 11.
    - XTN parser has 12 readComponent calls: `grep -c "readComponent(" src/model/types/xtn.ts` returns 12.
    - PL.facility is typed as HD: `grep -cE "facility\\?: HD" src/model/types/pl.ts` returns 1.
    - PL imports parseHd: `grep -cE "import.*\\{.*parseHd.*\\}" src/model/types/pl.ts` returns 1.
    - PL has the nested-HD synthesis helper: `grep -cE "parseFacility|parseAssigningAuthority" src/model/types/pl.ts` returns >= 1.
    - No `any`, no `console.*`, no object-literal `as`: `grep -cE "(: any(\\s|,|\\))|console\\.|\\} as (XTN|PL))" src/model/types/xtn.ts src/model/types/pl.ts` returns 0.
    - `@example` on every public export: `grep -c "@example" src/model/types/xtn.ts src/model/types/pl.ts` returns >= 4.
    - Test files exist with nested-HD case in PL suite: `grep -c "facility" test/types-pl.test.ts` returns >= 3.
    - `pnpm typecheck && pnpm lint ... --max-warnings=0 && pnpm test -- --run "types-xtn|types-pl"` all exit 0.
  </acceptance_criteria>
  <done>XTN and PL composite parsers ship. PL demonstrates the nested-HD synthesis pattern (mirrors CX). 16-20 tests across 2 files passing. Zero lint/typecheck warnings.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| raw TS string → parseHl7Timestamp | Already audited in Phase 2 Plan 05; linear scanner with token format matcher, zero recursion. |
| raw NM string → Number() conversion | JS stdlib `Number()` is O(n) in string length and never throws on malformed input (returns `NaN`). |
| parsePl component 4 → synthetic nested HD | Same pattern as CX (Plan 02) — all-empty guard prevents stub HDs from leaking. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-03-01 | Denial of Service | parseTs / parseNm scanning | mitigate | `parseTs` delegates to the already-audited `parseHl7Timestamp` (Phase 2 Plan 05 threat model covers it). `parseNm` uses stdlib `Number()` — O(n), no recursion. No JS regex backtracking. |
| T-03-03-02 | Tampering | calendar-invalid Date surfacing as valid | mitigate | `parseTs` explicitly checks `Number.isNaN(date.getTime())` and normalizes to `undefined` per D-24. Prevents `new Date("20251345")` (which produces an Invalid Date with NaN time) from leaking into `.date`. |
| T-03-03-03 | Information Disclosure | unescape output in TS/NM raw | accept | Consumer responsibility — matches Phase 2 Plan 04 posture. |
</threat_model>

<verification>
After all 3 tasks:

```bash
pnpm typecheck
pnpm lint --max-warnings=0
pnpm test -- --run "types-"
pnpm build
```

All exit 0. Combined with Plan 02 tests, `types-*` suites cover all 10 TYPES-01 composites.
</verification>

<success_criteria>
- 4 composite type+parser files under `src/model/types/` (xtn, pl, ts, nm).
- 4 Vitest test files with 30+ tests total.
- TYPES-01 complete (all 10 composites shipped: Plan 02's XPN/XAD/CX/CWE/CE/HD + Plan 03's XTN/PL/TS/NM).
- TYPES-02 progressed (parsers produce typed shapes; Plan 04 wires Field.asXxx).
- TYPES-03 (HL7 TS/DTM parse to JS Date) demonstrated via `parseTs` — 11 tests covering no-offset UTC, truncations, offsets, fractional seconds.
- TYPES-04 (unparseable → undefined, no throw) demonstrated via the `undefined` branches in `parseTs` and `parseNm`.
- Zero modifications to `src/index.ts`, `src/model/message.ts`, `src/model/segment.ts`, `src/model/field.ts`. No file overlap with Plan 02 (verified: disjoint `files_modified`).
- Zero runtime deps. Zero lint warnings. Zero typecheck errors. No regressions in existing tests.
</success_criteria>

<output>
After completion, create `.planning/phases/03-structural-model-and-types/03-03-SUMMARY.md` describing:
- What shipped: 4 new source files (xtn, pl, ts, nm), 4 new test files.
- REQ-IDs progressed: TYPES-01 complete (10/10 composites), TYPES-02 pending Plan 04 wire-up, TYPES-03 demonstrated, TYPES-04 demonstrated.
- Decisions applied: D-10 TS delegates to `parseHl7Timestamp`, D-14 TS shape `{ raw, date }` exact, D-21/D-22/D-23 inherit from Phase 2 timestamp behavior, D-24 NaN → undefined normalization shipped in both TS and NM.
- Design notes:
  - NM uses strict `Number(raw)` not `parseFloat` — trailing garbage invalidates the parse. Matches developer expectation for HL7 numeric fields (which should be strictly numeric).
  - PL trimmed from 12 → 11 components for v1 (dropped the rarely-used `entityIdentifier` slot); XTN trimmed from 14 → 12 for v1 (dropped 2 rarely-used legacy fields). Roadmap note for v2: restore full shapes if user feedback requires.
  - PL's nested-HD synthesis helper (`parseFacility`) is inline in pl.ts, not promoted to _shared.ts. The pattern now exists 2x (CX.assigningAuthority in Plan 02, PL.facility here); promotion to _shared is justified if a 3rd occurrence appears.
- Notes for Plan 04: `parseXtn`, `parsePl`, `parseTs`, `parseNm` ready for `Field.asXtn()`, `.asPl()`, `.asTs()`, `.asNm()` wire-up. All take `(rep, enc)` and return typed shape. TS composite is the one with a non-optional `date` key (always present as `Date | undefined`); all other composites use fully-optional fields.
</output>
