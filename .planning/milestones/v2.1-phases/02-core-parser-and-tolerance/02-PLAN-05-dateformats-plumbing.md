---
phase: 02-core-parser-and-tolerance
plan: 05
type: execute
wave: 2
depends_on: [02-PLAN-01]
files_modified:
  - src/parser/dates.ts
  - test/parser-dates.test.ts
autonomous: true
requirements: [TOL-08, TOL-09]

must_haves:
  truths:
    - "A developer calling `parseHl7Timestamp(raw, { userFormats, emit, position })` on a valid HL7 TS/DTM string (YYYYMMDDHHMMSS with optional fractional seconds and optional trailing +/-HHMM offset, and shorter truncations like YYYY, YYYYMM, YYYYMMDD, YYYYMMDDHHMM) receives a JS `Date`."
    - "A developer calling `parseHl7Timestamp(raw, { userFormats, ... })` where `userFormats` is non-empty and the HL7 pattern does NOT match: user formats are tried IN ORDER. First match wins and emits a `TIMESTAMP_FALLBACK_FORMAT` warning naming the matched format."
    - "A developer whose user formats don't match falls through to the built-in fallbacks (ISO-8601, YYYY-MM-DD, MM/DD/YYYY, MM/DD/YYYY HH:mm:ss). Built-ins are always tried AFTER user formats (TOL-09)."
    - "A developer whose input matches no known pattern receives `undefined` — no throw."
    - "A developer passing an empty `userFormats` option still gets built-in fallbacks (TOL-09 — built-ins always tried)."
  artifacts:
    - path: "src/parser/dates.ts"
      provides: "Timestamp parser with dateFormats plumbing and TIMESTAMP_FALLBACK_FORMAT emission"
      exports: ["parseHl7Timestamp", "BUILTIN_DATE_FALLBACKS"]
  key_links:
    - from: "src/parser/dates.ts"
      to: "src/parser/warnings.ts"
      via: "calls timestampFallbackFormat when a non-HL7 fallback pattern matches"
      pattern: "timestampFallbackFormat\\("
    - from: "src/parser/dates.ts"
      to: "src/parser/types.ts"
      via: "consumes Hl7Position for warning emission"
      pattern: "Hl7Position"
---

<objective>
Ship the timestamp-parsing helper that threads the `dateFormats: [...]` option from `ParseOptions` through a deterministic match cascade: HL7 TS/DTM first → user-supplied formats → built-in ISO/date/US fallbacks. Emits `TIMESTAMP_FALLBACK_FORMAT` when a non-HL7 format matches.

Purpose: Phase 2's public `parseHL7(options.dateFormats)` option must be honored. TS/DTM composite parsing itself is Phase 3's job, but Phase 3 (and Phase 4's `msg.meta.timestamp`) will call this helper. Shipping it in Phase 2 locks the cascade semantics and the warning emission contract.

Output:
- `src/parser/dates.ts` — one exported function, a `BUILTIN_DATE_FALLBACKS` constant listing the 4 built-in format names (ISO-8601, YYYY-MM-DD, MM/DD/YYYY, MM/DD/YYYY HH:mm:ss), plus an `@internal` options interface.
- Test file covering HL7 happy path, HL7 truncations, user-format match + warning, fallback to built-ins, unparseable input returns undefined.

Format strings supported (matching spec):
- HL7 TS/DTM: YYYY, YYYYMM, YYYYMMDD, YYYYMMDDHH, YYYYMMDDHHMM, YYYYMMDDHHMMSS, with optional `.SSSS` fractional seconds and optional trailing `+HHMM` / `-HHMM` timezone.
- Built-ins: ISO-8601, `YYYY-MM-DD`, `MM/DD/YYYY`, `MM/DD/YYYY HH:mm:ss`.
- User formats: a minimal token language (YYYY, MM, DD, HH, mm, ss, literal chars). Zero external deps per CLAUDE.md — hand-roll a minimal template matcher.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/PROJECT.md
@.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md
@.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md
@.planning/phases/02-core-parser-and-tolerance/02-01-SUMMARY.md
@src/parser/types.ts
@src/parser/warnings.ts

<interfaces>
<!-- Produced by Plan 01. -->

From src/parser/warnings.ts:
```typescript
export function timestampFallbackFormat(position: Hl7Position, matchedFormat: string): Hl7ParseWarning;
```

From src/parser/types.ts:
```typescript
export interface Hl7Position { ... }
```

Deferred in CONTEXT.md <deferred>: "dateFormats implementation choice (token strings vs regex vs named presets). Deferred to research/planning within Phase 2 — constraint locked (zero deps, must honor TOL-08 order-sensitivity and TOL-09 fallbacks)."

This plan picks: token strings with the 6 tokens YYYY, MM, DD, HH, mm, ss. Anything else in a format string is a literal character. Rationale:
- Zero deps (hand-rolled, approximately 40 LOC).
- Matches the minimum surface developers expect from `dateFormats: ["MM/DD/YYYY"]`.
- No ambiguity (case-sensitive tokens; `MM` = month, `mm` = minute mirroring the moment.js minimal-token convention — consistent with `MM/DD/YYYY HH:mm:ss` from REQUIREMENTS.md TOL-09).
- TS/DTM is handled by a dedicated HL7-specific branch (not via the token language) because TS/DTM uses concatenated digit groups with no separators plus optional fractional seconds and optional timezone.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/parser/dates.ts with parseHl7Timestamp cascade</name>
  <files>src/parser/dates.ts, test/parser-dates.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md (deferred.dateFormats — zero-dep constraint; TOL-09 built-ins always tried)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/REQUIREMENTS.md (TOL-08 full text, TOL-09 full text, TYPES-03 / TYPES-04 — Phase 3 scope, not Phase 2, but worth knowing the interface Phase 3 will call)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts (timestampFallbackFormat factory)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (Hl7Position)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (zero runtime deps — no date-fns, no luxon; short testable functions)
  </read_first>
  <behavior>
    - Test 1: `parseHl7Timestamp("20250102", {})` returns a Date corresponding to 2025-01-02 (midnight UTC for date-only).
    - Test 2: `parseHl7Timestamp("20250102153045", {})` returns a Date at 2025-01-02T15:30:45 interpreted as UTC (HL7 default for absent timezone). Document in JSDoc.
    - Test 3: `parseHl7Timestamp("20250102153045.5", {})` handles fractional seconds (0.5 → 500ms).
    - Test 4: `parseHl7Timestamp("20250102153045+0500", {})` handles trailing timezone offset (+0500 → UTC+5).
    - Test 5: `parseHl7Timestamp("2025", {})` (year-only truncation) returns 2025-01-01 UTC.
    - Test 6: `parseHl7Timestamp("202501", {})` (year-month truncation) returns 2025-01-01 UTC.
    - Test 7: `parseHl7Timestamp("01/02/2025", { userFormats: ["MM/DD/YYYY"], emit, position })` returns 2025-01-02 AND emits a `TIMESTAMP_FALLBACK_FORMAT` warning with matchedFormat `"MM/DD/YYYY"`.
    - Test 8: User formats tried in order — `parseHl7Timestamp("01/02/2025", { userFormats: ["YYYY-MM-DD", "MM/DD/YYYY"], emit, position })` — user's second format matches (first fails on format mismatch). Warning names `"MM/DD/YYYY"`.
    - Test 9: `parseHl7Timestamp("2025-01-02", { userFormats: [], emit, position })` falls back to built-in ISO-8601 or YYYY-MM-DD — returns valid Date, emits TIMESTAMP_FALLBACK_FORMAT naming the built-in.
    - Test 10: `parseHl7Timestamp("notadate", { userFormats: [], emit, position })` returns `undefined`. NO warning is emitted (per TOL-09 — the warning only fires when a fallback MATCHES).
    - Test 11: HL7 match does NOT emit a warning (TS match is the expected path, not a fallback).
    - Test 12: `parseHl7Timestamp("2025-01-02T15:30:45Z", { userFormats: [] }, emit, position)` matches the built-in ISO-8601 fallback and emits TIMESTAMP_FALLBACK_FORMAT naming "ISO-8601".
    - Test 13: `BUILTIN_DATE_FALLBACKS` const is a readonly string[] of 4 entries: `["ISO-8601", "YYYY-MM-DD", "MM/DD/YYYY", "MM/DD/YYYY HH:mm:ss"]`.
  </behavior>
  <action>
Create `src/parser/dates.ts`.

File-level JSDoc: plain prose NOT starting with `@`. Example: "Timestamp parsing helper for the `@cosyte/hl7-parser` parser pipeline — cascades from HL7 TS/DTM to user-supplied formats to built-in fallbacks."

Imports (relative, with `.js` extension; `import type` for type-only imports):
```typescript
import { timestampFallbackFormat } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type { Hl7Position } from "./types.js";
```

Exports and core logic:

```typescript
export const BUILTIN_DATE_FALLBACKS: readonly string[] = [
  "ISO-8601",
  "YYYY-MM-DD",
  "MM/DD/YYYY",
  "MM/DD/YYYY HH:mm:ss",
] as const;

/** Options passed to `parseHl7Timestamp`. `emit` and `position` are required only when the caller wants warnings. @internal */
export interface ParseHl7TimestampOptions {
  readonly userFormats?: readonly string[];
  readonly emit?: (warning: Hl7ParseWarning) => void;
  readonly position?: Hl7Position;
}

export function parseHl7Timestamp(raw: string, opts: ParseHl7TimestampOptions): Date | undefined {
  if (raw.length === 0) return undefined;

  // 1. HL7 TS/DTM — never warns (this is the spec-preferred format)
  const hl7Result = parseHl7TsDtm(raw);
  if (hl7Result !== undefined) return hl7Result;

  // 2. User-supplied formats, in order
  for (const format of opts.userFormats ?? []) {
    const matched = matchTokenFormat(raw, format);
    if (matched !== undefined) {
      if (opts.emit !== undefined && opts.position !== undefined) {
        opts.emit(timestampFallbackFormat(opts.position, format));
      }
      return matched;
    }
  }

  // 3. Built-in fallbacks, in order. ISO first because it's the most constrained.
  for (const builtin of BUILTIN_DATE_FALLBACKS) {
    const matched = builtin === "ISO-8601" ? parseIso8601(raw) : matchTokenFormat(raw, builtin);
    if (matched !== undefined) {
      if (opts.emit !== undefined && opts.position !== undefined) {
        opts.emit(timestampFallbackFormat(opts.position, builtin));
      }
      return matched;
    }
  }

  return undefined;
}

/** Parse HL7 TS/DTM: YYYY[MM[DD[HH[MM[SS[.SSSS]]]]]] with optional +/-HHMM offset. No separators. @internal */
function parseHl7TsDtm(raw: string): Date | undefined {
  const pattern = /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:\.(\d{1,4}))?(?:([+\-])(\d{2})(\d{2}))?$/u;
  const match = pattern.exec(raw);
  if (match === null) return undefined;
  const year = parseInt(match[1] ?? "0", 10);
  const month = match[2] !== undefined ? parseInt(match[2], 10) - 1 : 0;
  const day = match[3] !== undefined ? parseInt(match[3], 10) : 1;
  const hour = match[4] !== undefined ? parseInt(match[4], 10) : 0;
  const minute = match[5] !== undefined ? parseInt(match[5], 10) : 0;
  const second = match[6] !== undefined ? parseInt(match[6], 10) : 0;
  // Fractional seconds: "5" means 0.5s = 500ms; "50" means 0.50s = 500ms; "005" means 0.005s = 5ms.
  let milliseconds = 0;
  if (match[7] !== undefined) {
    const fractional = match[7];
    const padded = (fractional + "000").slice(0, 3);
    milliseconds = parseInt(padded, 10);
  }
  // Validate ranges (cheap sanity guard)
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return undefined;
  let epochMs = Date.UTC(year, month, day, hour, minute, second, milliseconds);
  if (match[8] !== undefined && match[9] !== undefined && match[10] !== undefined) {
    const sign = match[8] === "+" ? 1 : -1;
    const tzMinutes = parseInt(match[9], 10) * 60 + parseInt(match[10], 10);
    // Input is expressed in the offset timezone; shift to UTC by subtracting the offset.
    epochMs -= sign * tzMinutes * 60_000;
  }
  const candidate = new Date(epochMs);
  return isNaN(candidate.getTime()) ? undefined : candidate;
}

/** Parse an ISO-8601 string (what the JS Date constructor accepts, with strictness). @internal */
function parseIso8601(raw: string): Date | undefined {
  // Require a hyphen in the date part so we don't accidentally match TS/DTM strings.
  const isoPattern = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:?\d{2})?)?$/u;
  if (!isoPattern.test(raw)) return undefined;
  const candidate = new Date(raw);
  return isNaN(candidate.getTime()) ? undefined : candidate;
}

/**
 * Minimal format-string matcher for the tokens YYYY, MM, DD, HH, mm, ss.
 * Anything else in `format` is a literal character. Returns undefined if the
 * input doesn't match the template exactly.
 * @internal
 */
function matchTokenFormat(input: string, format: string): Date | undefined {
  const tokens = ["YYYY", "MM", "DD", "HH", "mm", "ss"] as const;
  type Token = (typeof tokens)[number];
  const parts: { token: Token | "lit"; value: string }[] = [];
  let i = 0;
  while (i < format.length) {
    let matched: Token | undefined;
    for (const t of tokens) {
      if (format.slice(i, i + t.length) === t) {
        matched = t;
        break;
      }
    }
    if (matched !== undefined) {
      parts.push({ token: matched, value: "" });
      i += matched.length;
    } else {
      parts.push({ token: "lit", value: format.charAt(i) });
      i += 1;
    }
  }
  const lens: Record<Token, number> = { YYYY: 4, MM: 2, DD: 2, HH: 2, mm: 2, ss: 2 };
  const got: Partial<Record<Token, number>> = {};
  let j = 0;
  for (const p of parts) {
    if (p.token === "lit") {
      if (input.charAt(j) !== p.value) return undefined;
      j += 1;
    } else {
      const len = lens[p.token];
      const chunk = input.slice(j, j + len);
      if (chunk.length !== len || !/^\d+$/u.test(chunk)) return undefined;
      got[p.token] = parseInt(chunk, 10);
      j += len;
    }
  }
  if (j !== input.length) return undefined; // trailing chars = mismatch
  const year = got.YYYY ?? 1970;
  const month = (got.MM ?? 1) - 1;
  const day = got.DD ?? 1;
  const hour = got.HH ?? 0;
  const minute = got.mm ?? 0;
  const second = got.ss ?? 0;
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return undefined;
  const candidate = new Date(Date.UTC(year, month, day, hour, minute, second));
  return isNaN(candidate.getTime()) ? undefined : candidate;
}
```

JSDoc on `parseHl7Timestamp` and `BUILTIN_DATE_FALLBACKS` (both exported) with `@example`. `ParseHl7TimestampOptions` is marked `@internal`.

CRITICAL — `noUncheckedIndexedAccess`: every regex-capture-group access is guarded by `!== undefined`. `parseInt(match[1] ?? "0", 10)` handles the defined-but-optional case safely.

CRITICAL — zero deps: no date-fns, no luxon, only `Date` + `Date.UTC` from the JS stdlib.

CRITICAL — `consistent-type-assertions`: `[...] as const` on the array literal is fine; no object-literal `as` cast.

CRITICAL — No `console.*`; no `any`; no non-null `!` assertions.

CRITICAL — `exactOptionalPropertyTypes`: the `ParseHl7TimestampOptions.emit` and `.position` fields are optional AND the callers may legitimately want to omit them (e.g., Phase 3's TS/DTM parsing during `msg.get(path)` does not always know the position). Current signature accepts that case via the `opts.emit !== undefined && opts.position !== undefined` guard.

Test file `test/parser-dates.test.ts` (13 cases from behavior):

```typescript
import { describe, expect, it } from "vitest";

import { parseHl7Timestamp, BUILTIN_DATE_FALLBACKS } from "../src/parser/dates.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";
import type { Hl7Position } from "../src/parser/types.js";

const pos: Hl7Position = { segmentIndex: 0, fieldIndex: 7 };

function collect(): { emit: (w: Hl7ParseWarning) => void; warnings: Hl7ParseWarning[] } {
  const warnings: Hl7ParseWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("parser/dates: parseHl7Timestamp", () => {
  it("parses HL7 date YYYYMMDD", () => {
    const d = parseHl7Timestamp("20250102", {});
    expect(d?.toISOString()).toBe("2025-01-02T00:00:00.000Z");
  });

  it("parses HL7 date-time YYYYMMDDHHMMSS as UTC", () => {
    const d = parseHl7Timestamp("20250102153045", {});
    expect(d?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
  });

  it("parses HL7 fractional seconds as milliseconds", () => {
    const d = parseHl7Timestamp("20250102153045.5", {});
    expect(d?.getUTCMilliseconds()).toBe(500);
  });

  it("parses HL7 timestamp with trailing timezone offset", () => {
    const d = parseHl7Timestamp("20250102153045+0500", {});
    // Input is 15:30:45 in UTC+5 — UTC equivalent is 10:30:45
    expect(d?.toISOString()).toBe("2025-01-02T10:30:45.000Z");
  });

  it("parses YYYY truncation", () => {
    const d = parseHl7Timestamp("2025", {});
    expect(d?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("parses YYYYMM truncation", () => {
    const d = parseHl7Timestamp("202501", {});
    expect(d?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("emits TIMESTAMP_FALLBACK_FORMAT when a user format matches a non-HL7 input", () => {
    const { emit, warnings } = collect();
    const d = parseHl7Timestamp("01/02/2025", { userFormats: ["MM/DD/YYYY"], emit, position: pos });
    expect(d?.toISOString()).toBe("2025-01-02T00:00:00.000Z");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.TIMESTAMP_FALLBACK_FORMAT);
    expect(warnings[0]?.message).toMatch(/MM\/DD\/YYYY/);
  });

  it("tries user formats in order — second format matches when first fails", () => {
    const { emit, warnings } = collect();
    parseHl7Timestamp("01/02/2025", { userFormats: ["YYYY-MM-DD", "MM/DD/YYYY"], emit, position: pos });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/MM\/DD\/YYYY/);
  });

  it("falls back to built-ins when userFormats is empty", () => {
    const { emit, warnings } = collect();
    const d = parseHl7Timestamp("2025-01-02", { userFormats: [], emit, position: pos });
    expect(d?.toISOString()).toBe("2025-01-02T00:00:00.000Z");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/YYYY-MM-DD|ISO-8601/);
  });

  it("returns undefined and emits no warning when no pattern matches", () => {
    const { emit, warnings } = collect();
    const d = parseHl7Timestamp("notadate", { userFormats: [], emit, position: pos });
    expect(d).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it("HL7 path never emits a fallback warning", () => {
    const { emit, warnings } = collect();
    parseHl7Timestamp("20250102", { userFormats: ["MM/DD/YYYY"], emit, position: pos });
    expect(warnings).toHaveLength(0);
  });

  it("parses ISO-8601 via the built-in fallback", () => {
    const { emit, warnings } = collect();
    const d = parseHl7Timestamp("2025-01-02T15:30:45Z", { userFormats: [], emit, position: pos });
    expect(d?.toISOString()).toBe("2025-01-02T15:30:45.000Z");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/ISO-8601/);
  });

  it("BUILTIN_DATE_FALLBACKS lists all 4 built-in format names in order", () => {
    expect(BUILTIN_DATE_FALLBACKS).toEqual(["ISO-8601", "YYYY-MM-DD", "MM/DD/YYYY", "MM/DD/YYYY HH:mm:ss"]);
  });
});
```
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; pnpm lint src/parser/dates.ts test/parser-dates.test.ts --max-warnings=0 &amp;&amp; pnpm test -- --run parser-dates</automated>
  </verify>
  <acceptance_criteria>
    - File `src/parser/dates.ts` exists and exports `parseHl7Timestamp`, `BUILTIN_DATE_FALLBACKS`, `ParseHl7TimestampOptions` — verify: `grep -E "^export (function|const|interface)" src/parser/dates.ts | wc -l` returns 3.
    - `BUILTIN_DATE_FALLBACKS` contains exactly 4 strings — verify: `grep -A 4 "BUILTIN_DATE_FALLBACKS" src/parser/dates.ts | grep -cE '"ISO-8601"|"YYYY-MM-DD"|"MM/DD/YYYY"|"MM/DD/YYYY HH:mm:ss"'` returns 4.
    - Cascade order is HL7 → user → built-in — verify: `grep -n "parseHl7TsDtm\|userFormats\|BUILTIN_DATE_FALLBACKS" src/parser/dates.ts` shows `parseHl7TsDtm` line number < `userFormats` line number < `BUILTIN_DATE_FALLBACKS` iteration line number.
    - `timestampFallbackFormat` factory is called — verify: `grep -c "timestampFallbackFormat(" src/parser/dates.ts` >= 1.
    - No external date-lib imports — verify: `grep -E "^import " src/parser/dates.ts | grep -v -E "(\"\\./|\"node:)" | wc -l` returns 0.
    - No `console.*` — `grep -c "console\\." src/parser/dates.ts` returns 0.
    - No `any` — `grep -cE "(: any(\\s|,|\\))|<any>)" src/parser/dates.ts` returns 0.
    - File-level JSDoc does NOT start with `@` — `awk 'NR<=3 && /^\s*\* @/{print "FAIL";exit 1}' src/parser/dates.ts` prints nothing.
    - `@example` on both non-`@internal` exports (`parseHl7Timestamp`, `BUILTIN_DATE_FALLBACKS`) — `grep -c "@example" src/parser/dates.ts` >= 2.
    - `pnpm typecheck`, `pnpm lint ... --max-warnings=0`, `pnpm test -- --run parser-dates` all exit 0 with 13 passing cases.
  </acceptance_criteria>
  <done>`parseHl7Timestamp` cascades through HL7 → user formats → built-in fallbacks with correct warning semantics. 13 tests pass. Typecheck + lint + test green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user-supplied format strings → token matcher | `userFormats` passed via `ParseOptions.dateFormats` is user-controlled; the format parser must not allow injection via crafted format strings. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-05-01 | Denial of Service | User format strings passed to `matchTokenFormat` | mitigate | Format parsing is linear in the length of the format string (one scan) and input matching is linear in the input length. No regex compiled from user input; all regex literals are fixed. |
| T-02-05-02 | Tampering | HL7 TS/DTM regex | mitigate | The TS/DTM regex is anchored (`^...$`) with fixed character classes; no user-controlled content forms part of the pattern. |
| T-02-05-03 | Information Disclosure | Warning message contains the matched format string | accept | Format strings are user-supplied constants from their own `dateFormats` option; echoing them back in a warning is not a disclosure. |
</threat_model>

<verification>
Run after the task:

```bash
pnpm typecheck
pnpm lint --max-warnings=0
pnpm test -- --run parser-dates
pnpm build
```

All four exit 0.
</verification>

<success_criteria>
- `src/parser/dates.ts` ships `parseHl7Timestamp` (cascade) and `BUILTIN_DATE_FALLBACKS` (named-order constant).
- 13 tests passing covering HL7 happy path, truncations, fractional ms, timezone offset, user-format order, built-in fallback, unparseable-returns-undefined.
- TOL-08 (user dateFormats honored, TIMESTAMP_FALLBACK_FORMAT warning) and TOL-09 (built-ins always tried) both demonstrated.
- Zero external deps. Zero file overlap with Plans 01/02/03/04.
- No `src/index.ts` changes.
</success_criteria>

<output>
After completion, create `.planning/phases/02-core-parser-and-tolerance/02-05-SUMMARY.md` describing:
- What shipped (1 source file, 1 test file).
- Format-string token language choice (YYYY/MM/DD/HH/mm/ss; literal characters elsewhere) and rationale.
- REQ-IDs closed (TOL-08, TOL-09).
- Notes for Phase 3: `parseHl7Timestamp` is the function TS/DTM composite types will call. Signature + options shape are stable.
- Notes for Phase 6: Profile `dateFormats` will flow into `ParseOptions.dateFormats` via the Phase 6 merge logic — Plan 05's function needs no changes to support profiles.
</output>
