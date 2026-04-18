---
phase: 02-core-parser-and-tolerance
plan: 06
type: execute
wave: 3
depends_on: [02-PLAN-01, 02-PLAN-02, 02-PLAN-03, 02-PLAN-04, 02-PLAN-05]
files_modified:
  - src/parser/index.ts
  - src/index.ts
  - test/parser-public.test.ts
autonomous: true
requirements: [PARSE-01, TOL-01, TOL-02]

must_haves:
  truths:
    - "A developer calling `parseHL7('MSH|^~\\\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\\rPID|||123')` receives an `Hl7Message` with `msg.encodingCharacters.field === '|'`, `msg.version === '2.5'`, and `msg.warnings` of length 0."
    - "A developer calling `parseHL7('')` receives `Hl7ParseError` with `code === 'EMPTY_INPUT'` and all four required fields (code, message, position, snippet) populated — even in lenient mode (default)."
    - "A developer calling `parseHL7(rawWithMllpFrame, { onWarning: cb })` receives `MLLP_FRAMING_STRIPPED` in `msg.warnings` AND sees `cb` invoked exactly once with the same warning object reference."
    - "A developer calling `parseHL7(rawWithMllpFrame, { strict: true })` throws `Hl7ParseError` with `code === 'MLLP_FRAMING_STRIPPED'` BEFORE any `msg.warnings` entry is created — and `onWarning` is NOT invoked under strict mode."
    - "A developer calling `parseHL7(raw, profile)` with a Profile-shaped argument triggers the Profile-overload branch: `msg.profile.name === profile.name` and `msg.profile.lineage === profile.lineage ?? [profile.name]`."
    - "A developer calling `parseHL7(raw, { profile: null })` explicitly opts out of any profile (`msg.profile === undefined`) — the argument-shape discriminant honors PROF-08 semantics."
    - "A developer importing from `@cosyte/hl7-parser` can resolve `parseHL7`, `Hl7Message`, `Hl7ParseError`, `ProfileDefinitionError`, `FATAL_CODES`, `WARNING_CODES`, and the named types `FatalCode`, `WarningCode`, `Hl7ParseWarning`, `Hl7Position`, `ParseOptions`, `Profile`, `EncodingCharacters`."
  artifacts:
    - path: "src/parser/index.ts"
      provides: "Public parseHL7 function + emitWarning chokepoint + ParseOptions discrimination"
      exports: ["parseHL7"]
    - path: "src/index.ts"
      provides: "Updated public barrel exporting Phase 2 surface alongside VERSION"
      exports: ["VERSION", "parseHL7", "Hl7Message", "Hl7ParseError", "ProfileDefinitionError", "FATAL_CODES", "WARNING_CODES", "DEFAULT_ENCODING_CHARACTERS", "FatalCode", "WarningCode", "Hl7ParseWarning", "Hl7Position", "ParseOptions", "Profile", "OnWarningCallback", "EncodingCharacters"]
  key_links:
    - from: "src/parser/index.ts"
      to: "src/parser/normalize.ts, src/parser/mllp.ts, src/parser/segments.ts, src/parser/delimiters.ts, src/parser/tokenize.ts"
      via: "composes the pipeline: stripMllp → normalize → splitSegments → readDelimiters → tokenize → new Hl7Message(...)"
      pattern: "stripMllp.*normalize.*splitSegments.*readDelimiters.*tokenize"
    - from: "src/parser/index.ts"
      to: "src/parser/warnings.ts, src/parser/errors.ts"
      via: "emitWarning chokepoint: push to warnings array + invoke onWarning; in strict mode throw Hl7ParseError"
      pattern: "function.*emit.*Hl7ParseWarning"
    - from: "src/index.ts"
      to: "all Phase 2 source files"
      via: "re-export public surface; VERSION remains unchanged from Phase 1"
      pattern: "export \\{ parseHL7 \\}"
---

<objective>
Ship the public `parseHL7` entry point that composes every parser stage built in Plans 01–05, the `emitWarning` chokepoint that unifies `msg.warnings` / `onWarning` / strict-mode escalation, and the updated `src/index.ts` barrel exporting the full Phase 2 surface.

Purpose: This is the capstone. After Plan 06 a developer calling `import { parseHL7 } from "@cosyte/hl7-parser"` can parse real messages end-to-end. PARSE-01 (parse any well-formed v2.1–v2.8 message), TOL-01 (strict-mode escalation), and TOL-02 (Tier-3 fatal error shape) are verified via integration tests here.

Output:
- `src/parser/index.ts` — `parseHL7` with three TypeScript overloads (raw only; raw + Profile; raw + ParseOptions), runtime discrimination per CONTEXT.md D-06, full pipeline composition, and the `emitWarning` chokepoint.
- `src/index.ts` (MODIFIED) — re-export the full Phase 2 surface. `VERSION` and its JSDoc preserved; file-level JSDoc preserved.
- Integration test file exercising the full surface end-to-end (not just individual modules).
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
@.planning/phases/02-core-parser-and-tolerance/02-02-SUMMARY.md
@.planning/phases/02-core-parser-and-tolerance/02-03-SUMMARY.md
@.planning/phases/02-core-parser-and-tolerance/02-04-SUMMARY.md
@.planning/phases/02-core-parser-and-tolerance/02-05-SUMMARY.md
@src/index.ts
@src/parser/types.ts
@src/parser/warnings.ts
@src/parser/errors.ts
@src/parser/normalize.ts
@src/parser/mllp.ts
@src/parser/segments.ts
@src/parser/delimiters.ts
@src/parser/tokenize.ts
@src/parser/escapes.ts
@src/parser/dates.ts
@src/model/message.ts

<interfaces>
<!-- Everything below was produced by Plans 01-05. This plan composes, doesn't define new behavior. -->

Plan 01: WARNING_CODES, WarningCode, Hl7ParseWarning, 13 factories, FATAL_CODES, FatalCode, Hl7ParseError, ProfileDefinitionError, Hl7Position, ParseOptions, OnWarningCallback, Profile, EncodingCharacters, Raw* tree, Hl7Message, Hl7MessageInit.

Plan 02: normalize(string): string (line-ending normalization only; pure function, does NOT throw and does NOT strip BOM — those stages are owned by this plan's pipeline composition below); normalizeBuffer(Buffer, charset|undefined, emit): string (decodes + line-ending-normalizes; may emit UNKNOWN_CHARSET); stripMllp(string): StripMllpResult; emitIfFramed(result, emit, position): void.

Plan 03: splitSegments(string): readonly string[]; snippet(string): string; readDelimiters(string): EncodingCharacters (throws Hl7ParseError NO_MSH_SEGMENT / MSH_TOO_SHORT / INVALID_ENCODING_CHARACTERS); DEFAULT_ENCODING_CHARACTERS; tokenize(segments, enc, emit, trimFields): readonly RawSegment[].

Plan 04: unescape(input, enc, emit, position): string; reescape(input, enc): string. (Not directly invoked by parseHL7 — consumed by Phase 3 on-access.)

Plan 05: parseHl7Timestamp(raw, opts): Date | undefined; BUILTIN_DATE_FALLBACKS. (Not directly invoked by parseHL7 — consumed by Phase 3's TS/DTM composite parser.)

Composition order for `parseHL7(raw, optionsOrProfile?)`:
1. Discriminate the second argument into `options: ParseOptions` (create a normalized options object with defaults applied).
2. If `raw` is a Buffer: `text = normalizeBuffer(raw, options-charset-unused-in-phase-2, tentativeEmit)`. NOTE: MSH-18 charset lookup requires parsing MSH first, so Phase 2 uses UTF-8 by default for Buffer input. (REQUIREMENTS.md PARSE-09: "defaults to UTF-8; unknown charsets warn and fall back to UTF-8" — we honor this. Per-message MSH-18-driven charset negotiation is a Phase 3+ deep-handling concern per CONTEXT.md <deferred>.)
3. EMPTY_INPUT fatal check at the top of the pipeline (throws `Hl7ParseError` with `code === "EMPTY_INPUT"` before any warning is pushed — enforces D-03 ordering).
4. Strip UTF-8 BOM silently if `text.charCodeAt(0) === 0xFEFF` (Tier-1 silent, no warning).
5. `stripMllp(text)` — removes VT (0x0B), FS (0x1C), and MLLP trailing CR (0x0D after FS). Capture `wasFramed`.
5a. Re-check EMPTY_INPUT — MLLP strip may have left empty content; throw `Hl7ParseError` again if so.
5b. `normalize(strippedText)` — line-ending normalization only (`\r\n`/`\n`/mixed → `\r`).
5c. Build the real `emit` chokepoint and forward any warnings captured during the Buffer decode (e.g. UNKNOWN_CHARSET).
5d. `emitIfFramed(mllpResult, emit, { segmentIndex: 0 })` — issues the MLLP_FRAMING_STRIPPED Tier-2 warning AFTER the fatal checks pass (so EMPTY_INPUT takes precedence over MLLP_FRAMING_STRIPPED).
6. `splitSegments(normalized)`.
7. `readDelimiters(segments[0])` — may throw NO_MSH_SEGMENT / MSH_TOO_SHORT / INVALID_ENCODING_CHARACTERS.
8. `tokenize(segments, enc, emit, options.trimFields ?? true)` — may emit FIELD_WHITESPACE_TRIMMED.
9. Extract `version` from MSH-12 — read `msh.fields[11]` (the unified HL7 1-indexed convention from Plan 03: fields[0]=MSH-1 separator placeholder, fields[1]=MSH-2 encoding chars, fields[2]=MSH-3 sending app, …, fields[11]=MSH-12 version). NoUncheckedIndexedAccess guard: if `fields[11]` is undefined OR its first subcomponent string is empty, version defaults to the empty string "". Phase 4's `msg.meta.version` will provide a richer read.
10. Apply profile attribution (only if profile argument was present and not null): set `profile: { name, lineage }`.
11. Construct `new Hl7Message({ segments: rawSegments, encodingCharacters: enc, version, warnings: warningsArray, profile: profileInit })` — Hl7Message constructor freezes warnings.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/parser/index.ts — parseHL7 composition + emitWarning chokepoint + option discrimination</name>
  <files>src/parser/index.ts, test/parser-public.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md (D-05 Hl7Message shell; D-06 argument discrimination rules; D-11 emitWarning chokepoint; specifics line 140 — PROF-08 profile-null opt-out)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md (section: "src/parser/index.ts" — overload signatures, emitWarning closure shape, Strict TS note on frozen warnings)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/REQUIREMENTS.md (PARSE-01 full text, TOL-01 strict-mode escalation, TOL-02 fatal error shape)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/normalize.ts (normalize, normalizeBuffer signatures)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/mllp.ts (stripMllp, emitIfFramed signatures)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/segments.ts (splitSegments, snippet)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/delimiters.ts (readDelimiters, DEFAULT_ENCODING_CHARACTERS)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/tokenize.ts (tokenize signature; unified HL7 1-indexed convention — fields[0] is the segment name/separator placeholder for ALL segments, fields[N] for N >= 1 is the HL7 N-th field; MSH: fields[0]=MSH-1 separator, fields[1]=MSH-2 encoding chars, ..., fields[11]=MSH-12 version; non-MSH: fields[0]=name placeholder, fields[1]=field-1, ...)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts (Hl7ParseWarning type)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/errors.ts (Hl7ParseError + FATAL_CODES)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (ParseOptions, Profile, OnWarningCallback, EncodingCharacters)
    - /home/nschatz/projects/cosyte/hl7-parser/src/model/message.ts (Hl7Message constructor signature)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (no any; JSDoc @example required; no console)
  </read_first>
  <behavior>
    - Happy path: `parseHL7("MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123")` returns an `Hl7Message` with `msg.version === "2.5"`, `msg.encodingCharacters.field === "|"`, `msg.segments.length === 2`, `msg.warnings.length === 0`.
    - Empty input (lenient default): `parseHL7("")` throws `Hl7ParseError` with `code === "EMPTY_INPUT"` — NOT suppressed by lenient mode.
    - Missing MSH: `parseHL7("PID|1")` throws `Hl7ParseError` with `code === "NO_MSH_SEGMENT"`.
    - MLLP framing (lenient): `parseHL7("\u000BMSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123\u001C\u000D")` returns an `Hl7Message` with `msg.warnings` containing exactly one `MLLP_FRAMING_STRIPPED`.
    - onWarning callback fires: Same input as above with `{ onWarning: cb }` invokes `cb` exactly once, with the SAME reference as `msg.warnings[0]`.
    - Strict-mode escalation: Same MLLP input with `{ strict: true }` throws `Hl7ParseError` with `code === "MLLP_FRAMING_STRIPPED"`. The thrown error carries `message`, `position`, and `snippet` (snippet is a short excerpt of input). `onWarning` is NOT invoked.
    - PROF-08 opt-out: `parseHL7(raw, { profile: null })` returns an `Hl7Message` with `msg.profile === undefined`.
    - Profile attribution: `parseHL7(raw, { name: "epic", lineage: ["base", "epic"] })` (Profile-overload path) returns an `Hl7Message` with `msg.profile?.name === "epic"` and `msg.profile?.lineage` equal to `["base", "epic"]`.
    - Argument discrimination: `{ name: "foo" }` (only `name`, no options-only keys) is treated as a Profile. `{ strict: true }` (has options-only key) is treated as ParseOptions. `{ name: "foo", strict: true }` is treated as ParseOptions because it has an options-only key (per D-06 runtime discriminant).
    - Buffer input: `parseHL7(Buffer.from("MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123", "utf-8"))` returns an equivalent Hl7Message as the string path.
    - Version extraction: MSH with `2.8` in MSH-12 yields `msg.version === "2.8"`. MSH-12 absent → `msg.version === ""`.
    - Strict-mode escalation DOES NOT escalate Tier-1 (silent) events or Tier-3 (already-fatal) events. Only Tier-2 warnings are escalated. Verified via tests: `\r\n` line endings (Tier 1) produce no warning and don't escalate; `EMPTY_INPUT` (Tier 3) throws same code regardless of strict flag.
    - `src/index.ts` barrel exports (tested by the integration suite importing from `"../src/index.js"`): `parseHL7`, `Hl7Message`, `Hl7ParseError`, `ProfileDefinitionError`, `FATAL_CODES`, `WARNING_CODES`, `DEFAULT_ENCODING_CHARACTERS`, and the types.
  </behavior>
  <action>
**Step 1: Create `src/parser/index.ts`.**

File-level JSDoc: plain prose NOT starting with `@`. Example: "Public entry point for the `@cosyte/hl7-parser` parser — composes every parser stage (normalize, strip MLLP, split segments, read delimiters, tokenize) and routes all warnings through the `emitWarning` chokepoint."

Imports (use `.js` extensions; `import type` for type-only):
```typescript
import { Buffer } from "node:buffer";

import { FATAL_CODES, Hl7ParseError } from "./errors.js";
import { normalize, normalizeBuffer } from "./normalize.js";
import { stripMllp, emitIfFramed } from "./mllp.js";
import { splitSegments, snippet as segmentSnippet } from "./segments.js";
import { readDelimiters, DEFAULT_ENCODING_CHARACTERS } from "./delimiters.js";
import { tokenize } from "./tokenize.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type { Hl7Position, ParseOptions, Profile, RawSegment } from "./types.js";

import { Hl7Message } from "../model/message.js";
```

Note: `Buffer` MUST be imported from `node:buffer` for explicit typing.

Define the `emitWarning` closure and argument-discrimination helper:

```typescript
/** @internal — Discriminates the optional second argument of `parseHL7` per CONTEXT.md D-06. */
function discriminateOptionsOrProfile(arg: ParseOptions | Profile | undefined): ParseOptions {
  if (arg === undefined) return {};
  // A Profile has `name: string` and none of the options-only keys.
  const OPTIONS_ONLY_KEYS: readonly (keyof ParseOptions)[] = [
    "strict",
    "onWarning",
    "dateFormats",
    "stripMllpFraming",
    "trimFields",
    "profile",
  ];
  // Structural check: does the arg have any options-only key?
  const hasOptionsKey = OPTIONS_ONLY_KEYS.some((k) => Object.prototype.hasOwnProperty.call(arg, k));
  if (hasOptionsKey) {
    // Even if it also has `name`, explicit options-only keys win → treat as ParseOptions.
    return arg as ParseOptions;
  }
  // Otherwise if it has a `name: string`, it's a Profile.
  if (typeof (arg as { name?: unknown }).name === "string") {
    return { profile: arg as Profile };
  }
  // Fallback: treat as empty options (unlikely in practice).
  return {};
}
```

Note on the `as` casts above: these are narrowing-from-unknown casts used to discriminate a union type, NOT object-literal casts. The ESLint rule `consistent-type-assertions: { objectLiteralTypeAssertions: "never" }` allows these forms.

Emit chokepoint:

```typescript
/** @internal — Builds the `emit` function passed into every parser stage per D-11. */
function makeEmitter(
  warnings: Hl7ParseWarning[],
  options: ParseOptions,
  input: string,
): (w: Hl7ParseWarning) => void {
  return (w) => {
    if (options.strict === true) {
      // Construct a full Hl7ParseError from the warning's code + position.
      // NOTE: FatalCode is a narrow union of 4 strings; WarningCode is a different
      // union. In strict mode we throw an Hl7ParseError whose `code` is
      // typed as FatalCode, but the actual string value is the warning code
      // (which is NOT in FATAL_CODES). This is intentional per TOL-01: the
      // ERROR surface mirrors the WARNING surface under strict mode. Two
      // viable typings:
      //   (a) widen Hl7ParseError.code to `FatalCode | WarningCode` (changes Plan 01's type).
      //   (b) keep FatalCode narrow; construct with an `as FatalCode` cast + justification comment.
      //
      // Choice: (b) — preserves the Plan 01 type (FatalCode reserved for
      // Tier-3 unrecoverable structural codes in normal flow). Strict-mode
      // escalation is documented as reusing the Error shape; the runtime
      // `code` carries the Tier-2 warning string and consumers narrow on
      // it at runtime. Comment justifies the cast per CLAUDE.md.
      //
      // Justification: strict mode escalates Tier-2 to error; the `code`
      // field on Hl7ParseError is the public discriminant for both Tier-2
      // and Tier-3 codes under strict mode. Widening FatalCode would leak
      // strict-mode semantics into lenient-mode types.
      throw new Hl7ParseError(
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        w.code as unknown as (typeof FATAL_CODES)[keyof typeof FATAL_CODES],
        w.message,
        w.position,
        buildSnippet(input, w.position),
      );
    }
    warnings.push(w);
    options.onWarning?.(w);
  };
}

/** @internal */
function buildSnippet(input: string, position: Hl7Position): string {
  // Best-effort: we don't track character offsets (only segment/field indices),
  // so return a short excerpt from the start of input. Phase 4+ may refine.
  return segmentSnippet(input.slice(0, 80));
}
```

Explanation for the `as` cast: TypeScript's `as unknown as T` form is the standard two-step cast for narrowing across unrelated unions. ESLint's `consistent-type-assertions` rule permits `as` casts with the `"as"` style (which is this project's setting); the rule only forbids object-literal casts. The `eslint-disable-next-line` comment is defensive belt-and-suspenders — remove it if lint passes without. **Alternative if the rule still flags:** widen `Hl7ParseError.code` to `string` (pure string) and rely on runtime narrowing. But this weakens Plan 01's contract and should only be taken if (b) fails lint. Prefer (b). If neither (b) nor the alternative works, fall back to a fresh subclass: `class Hl7ParseWarningError extends Hl7ParseError { readonly code: WarningCode }` — that is option (c), which preserves the taxonomy but introduces a third class. Implementer picks whichever lints; document the choice in the 02-06-SUMMARY.

`parseHL7` overloads + implementation:

```typescript
/**
 * Parse a raw HL7 v2 message (string or Buffer) into an `Hl7Message`. The
 * parser is lenient by default: recoverable deviations from the HL7 spec are
 * reported via `msg.warnings` and (optionally) `options.onWarning` but do not
 * throw. Four unrecoverable structural errors throw `Hl7ParseError`:
 * `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`,
 * `EMPTY_INPUT`. Opt into strict mode with `{ strict: true }` to escalate
 * every Tier-2 warning into an `Hl7ParseError`.
 *
 * @example
 * ```ts
 * import { parseHL7, WARNING_CODES } from "@cosyte/hl7-parser";
 * const msg = parseHL7("MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123");
 * console.log(msg.version);          // "2.5"
 * console.log(msg.warnings.length);  // 0
 * ```
 */
export function parseHL7(raw: string | Buffer): Hl7Message;
export function parseHL7(raw: string | Buffer, profile: Profile): Hl7Message;
export function parseHL7(raw: string | Buffer, options: ParseOptions): Hl7Message;
export function parseHL7(
  raw: string | Buffer,
  optionsOrProfile?: ParseOptions | Profile,
): Hl7Message {
  const options = discriminateOptionsOrProfile(optionsOrProfile);
  const warnings: Hl7ParseWarning[] = [];

  // D-03 pipeline (explicit, ordered, inspectable at the site):
  //   1. If Buffer: decode to string via charset (and capture UNKNOWN_CHARSET warnings for later).
  //   2. EMPTY_INPUT check (Tier-3 fatal; thrown even in lenient mode; emits nothing).
  //   3. Strip UTF-8 BOM silently (Tier-1 silent; no warning).
  //   4. stripMllp — removes VT/FS/MLLP-trailing-CR; captures `wasFramed`.
  //   5. Re-check EMPTY_INPUT — MLLP strip could have emptied the content.
  //   6. normalize — line-ending normalization only (per refactored Plan 02).
  //   7. Build the real `emit` chokepoint and forward any pre-captured Buffer warnings.
  //   8. Fire the MLLP_FRAMING_STRIPPED warning (Tier-2) after all fatals are past.
  //
  // Plan 02 exposes `normalize` as line-ending-only, so this composition
  // drives the full D-03 ordering explicitly rather than relying on
  // `normalize`'s composite behavior.

  // Step 1: Buffer → string decode (if needed). UNKNOWN_CHARSET warnings
  // are captured here and forwarded through the real emitter after the
  // fatal checks pass.
  const bufferWarnings: Hl7ParseWarning[] = [];
  const bufferEmit = (w: Hl7ParseWarning): void => bufferWarnings.push(w);
  let text: string;
  if (typeof raw === "string") {
    text = raw;
  } else {
    // `normalizeBuffer` decodes + line-ending-normalizes. We re-run
    // normalize below anyway (post-MLLP-strip); that's fine because
    // line-ending normalization is idempotent.
    text = normalizeBuffer(raw, undefined, bufferEmit);
  }

  // Step 2: EMPTY_INPUT fatal check (top of pipeline per D-03).
  if (text.length === 0) {
    throw new Hl7ParseError(
      FATAL_CODES.EMPTY_INPUT,
      "Input is empty.",
      { segmentIndex: 0 },
      "",
    );
  }

  // Step 3: Strip UTF-8 BOM silently (Tier-1; no warning).
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // Step 4: Strip MLLP framing bytes.
  const mllpResult = stripMllp(text);
  text = mllpResult.stripped;

  // Step 5: Re-check EMPTY_INPUT — MLLP strip may have removed everything.
  if (text.length === 0) {
    throw new Hl7ParseError(
      FATAL_CODES.EMPTY_INPUT,
      "Input is empty after MLLP framing was stripped.",
      { segmentIndex: 0 },
      "",
    );
  }

  // Step 6: Normalize line endings to `\r`.
  const inputForPipeline = normalize(text);

  // Step 7: All Tier-3 fatals are past. Build the real emitter and
  // forward any warnings captured during the Buffer decode.
  const emit = makeEmitter(warnings, options, inputForPipeline);
  for (const pre of bufferWarnings) emit(pre);

  // Step 8: MLLP framing warning (Tier-2) — fired AFTER the fatal checks.
  if ((options.stripMllpFraming ?? true) === true) {
    emitIfFramed(mllpResult, emit, { segmentIndex: 0 });
  }
  // Note: when `stripMllpFraming` is explicitly false, we still ran
  // `stripMllp` above (the bytes would otherwise corrupt segment splitting).
  // The warning is suppressed because the user told us they're aware; the
  // bytes are NOT re-inserted.

  const segments = splitSegments(inputForPipeline);
  const encoding = segments.length > 0 ? readDelimiters(segments[0] ?? "") : (() => {
    // Defensive: splitSegments returning [] implies empty input, which normalize would have
    // rejected. Throw NO_MSH_SEGMENT for safety.
    throw new Hl7ParseError(FATAL_CODES.NO_MSH_SEGMENT, "No segments found after normalization.", { segmentIndex: 0 }, "");
  })();

  const rawSegments: readonly RawSegment[] = tokenize(
    segments,
    encoding,
    emit,
    options.trimFields ?? true,
  );

  // Version extraction from MSH-12. Phase 3 will extend this via msg.meta;
  // Phase 2 provides a minimal read for D-08.
  const msh = rawSegments[0];
  const version = extractVersion(msh);

  // Profile attribution (PROF-08 opt-out supported).
  const profileInit =
    options.profile && options.profile !== null
      ? { name: options.profile.name, lineage: options.profile.lineage ?? [options.profile.name] }
      : undefined;

  // With exactOptionalPropertyTypes, we must OMIT the `profile` key when undefined
  // rather than passing it as `undefined`. Build the init object conditionally.
  if (profileInit === undefined) {
    return new Hl7Message({
      segments: rawSegments,
      encodingCharacters: encoding,
      version,
      warnings,
    });
  }
  return new Hl7Message({
    segments: rawSegments,
    encodingCharacters: encoding,
    version,
    warnings,
    profile: profileInit,
  });
}

/** @internal — Read MSH-12 version field, empty string if absent. */
function extractVersion(msh: RawSegment | undefined): string {
  if (msh === undefined || msh.name !== "MSH") return "";
  // Per Plan 03's unified HL7 1-indexed convention: fields[0] = MSH-1
  // (field-separator placeholder), fields[1] = MSH-2 (encoding chars),
  // fields[2] = MSH-3 (sending app), ..., fields[11] = MSH-12 (version).
  // The same indexing scheme applies to non-MSH segments (fields[0] is the
  // name placeholder, fields[N] for N >= 1 is the HL7 N-th field).
  const versionField = msh.fields[11];
  if (versionField === undefined) return "";
  const firstRep = versionField.repetitions[0];
  if (firstRep === undefined) return "";
  const firstComp = firstRep.components[0];
  if (firstComp === undefined) return "";
  const firstSub = firstComp.subcomponents[0];
  return firstSub ?? "";
}
```

JSDoc requirement: `parseHL7` has `@example` (shown above). `extractVersion`, `makeEmitter`, `buildSnippet`, `discriminateOptionsOrProfile` are `@internal`. The overload signatures don't need their own `@example` — the rule checks the implementation signature (the last one) per TypeScript's overload merging rules.

**Step 2: Update `src/index.ts`.**

Preserve the existing file-level JSDoc and `VERSION` export. APPEND new exports. CRITICAL — the file-level JSDoc rule from Plan 01-04 applies: `@`-prefixed tokens at JSDoc line start are rejected by eslint-plugin-jsdoc. Keep the current JSDoc unchanged.

Final content:

```typescript
/**
 * Public entry point for the `@cosyte/hl7-parser` package.
 *
 * The full public API (parseHL7, defineProfile, helpers, types) is populated
 * in subsequent phases. This stub keeps the module resolvable and typed so
 * downstream tooling (tsup, vitest, tsc) can verify the build/typecheck
 * pipeline end-to-end.
 */

/**
 * Library version string, synced with `package.json#version` at build time
 * by downstream phases. Exported now so consumers (and the type-check
 * pipeline) have at least one symbol to resolve through the `exports` map.
 *
 * @example
 * ```ts
 * import { VERSION } from "@cosyte/hl7-parser";
 * console.log(VERSION);
 * ```
 */
export const VERSION: string = "0.0.0";

export { parseHL7 } from "./parser/index.js";
export { Hl7Message } from "./model/message.js";
export { FATAL_CODES, Hl7ParseError, ProfileDefinitionError } from "./parser/errors.js";
export type { FatalCode } from "./parser/errors.js";
export {
  WARNING_CODES,
  mllpFramingStripped,
  fieldWhitespaceTrimmed,
  unknownEscapeSequence,
  timestampFallbackFormat,
  segmentCase,
  extraFields,
  unknownSegment,
  duplicateRequiredSegment,
  encodingMismatch,
  missingRequiredField,
  outOfOrderSegment,
  versionMismatch,
  unknownCharset,
} from "./parser/warnings.js";
export type { WarningCode, Hl7ParseWarning } from "./parser/warnings.js";
export { DEFAULT_ENCODING_CHARACTERS } from "./parser/delimiters.js";
export type {
  Hl7Position,
  ParseOptions,
  OnWarningCallback,
  Profile,
  EncodingCharacters,
  RawSegment,
  RawField,
  RawRepetition,
  RawComponent,
} from "./parser/types.js";
export { BUILTIN_DATE_FALLBACKS, parseHl7Timestamp } from "./parser/dates.js";
export type { ParseHl7TimestampOptions } from "./parser/dates.js";
export { unescape, reescape } from "./parser/escapes.js";
```

Note: the re-exports of `unescape` and `reescape` make Phase 3+ life easier; exposing them in the public API is intentional (developers who implement their own composite parsers can call them).

**Step 3: Integration test `test/parser-public.test.ts`.**

Exercises the PUBLIC barrel (`"../src/index.js"`), not internal modules. This is the end-to-end proof that Phase 2's surface is complete.

```typescript
import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import {
  parseHL7,
  Hl7Message,
  Hl7ParseError,
  WARNING_CODES,
  FATAL_CODES,
  DEFAULT_ENCODING_CHARACTERS,
  type Hl7ParseWarning,
  type ParseOptions,
  type Profile,
} from "../src/index.js";

const VALID_MSG =
  "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123\rEVN|A01|20250101";

describe("parseHL7: happy paths", () => {
  it("parses a well-formed v2.5 message and exposes encodingCharacters + version + segments + warnings", () => {
    const msg = parseHL7(VALID_MSG);
    expect(msg).toBeInstanceOf(Hl7Message);
    expect(msg.encodingCharacters).toEqual(DEFAULT_ENCODING_CHARACTERS);
    expect(msg.version).toBe("2.5");
    expect(msg.segments).toHaveLength(3);
    expect(msg.warnings).toHaveLength(0);
    expect(msg.profile).toBeUndefined();
  });

  it("parses a Buffer input equivalently to its string counterpart", () => {
    const fromString = parseHL7(VALID_MSG);
    const fromBuffer = parseHL7(Buffer.from(VALID_MSG, "utf-8"));
    expect(fromBuffer.version).toBe(fromString.version);
    expect(fromBuffer.segments.length).toBe(fromString.segments.length);
  });
});

describe("parseHL7: Tier-3 fatal errors (thrown even in lenient mode)", () => {
  it("throws Hl7ParseError with code EMPTY_INPUT on empty input", () => {
    try {
      parseHL7("");
      expect.fail("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Hl7ParseError);
      if (err instanceof Hl7ParseError) expect(err.code).toBe(FATAL_CODES.EMPTY_INPUT);
    }
  });

  it("throws NO_MSH_SEGMENT on input not starting with MSH", () => {
    try {
      parseHL7("PID|1");
      expect.fail("should throw");
    } catch (err) {
      if (err instanceof Hl7ParseError) expect(err.code).toBe(FATAL_CODES.NO_MSH_SEGMENT);
    }
  });

  it("throws MSH_TOO_SHORT on a truncated MSH", () => {
    try {
      parseHL7("MSH|^");
      expect.fail("should throw");
    } catch (err) {
      if (err instanceof Hl7ParseError) expect(err.code).toBe(FATAL_CODES.MSH_TOO_SHORT);
    }
  });

  it("throws INVALID_ENCODING_CHARACTERS on malformed MSH-2", () => {
    try {
      parseHL7("MSH|^^^^|APP|FAC");
      expect.fail("should throw");
    } catch (err) {
      if (err instanceof Hl7ParseError) expect(err.code).toBe(FATAL_CODES.INVALID_ENCODING_CHARACTERS);
    }
  });

  it("fatal errors carry populated message, position, snippet fields (TOL-02 shape)", () => {
    try {
      parseHL7("PID|1");
    } catch (err) {
      if (err instanceof Hl7ParseError) {
        expect(err.message.length).toBeGreaterThan(0);
        expect(err.position.segmentIndex).toBe(0);
        expect(err.snippet.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("parseHL7: Tier-2 warnings (lenient mode) + onWarning callback", () => {
  const MLLP_WRAPPED = `\u000B${VALID_MSG}\u001C\u000D`;

  it("strips MLLP framing and emits a single MLLP_FRAMING_STRIPPED warning", () => {
    const msg = parseHL7(MLLP_WRAPPED);
    expect(msg.warnings).toHaveLength(1);
    expect(msg.warnings[0]?.code).toBe(WARNING_CODES.MLLP_FRAMING_STRIPPED);
  });

  it("invokes options.onWarning with the same warning reference that lands in msg.warnings", () => {
    const seen: Hl7ParseWarning[] = [];
    const msg = parseHL7(MLLP_WRAPPED, { onWarning: (w) => seen.push(w) });
    expect(seen).toHaveLength(1);
    expect(msg.warnings[0]).toBe(seen[0]);
  });

  it("emits FIELD_WHITESPACE_TRIMMED when trimFields is true (default)", () => {
    const withSpaces = "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|  hi  |";
    const msg = parseHL7(withSpaces);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.FIELD_WHITESPACE_TRIMMED)).toBe(true);
  });

  it("suppresses FIELD_WHITESPACE_TRIMMED when trimFields is explicitly false", () => {
    const withSpaces = "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|  hi  |";
    const msg = parseHL7(withSpaces, { trimFields: false } satisfies ParseOptions);
    expect(msg.warnings.some((w) => w.code === WARNING_CODES.FIELD_WHITESPACE_TRIMMED)).toBe(false);
  });
});

describe("parseHL7: strict-mode escalation (TOL-01)", () => {
  const MLLP_WRAPPED = `\u000B${VALID_MSG}\u001C\u000D`;

  it("throws Hl7ParseError instead of pushing MLLP_FRAMING_STRIPPED under strict: true", () => {
    let threw = false;
    try {
      parseHL7(MLLP_WRAPPED, { strict: true });
    } catch (err) {
      threw = true;
      if (err instanceof Hl7ParseError) {
        expect(err.code).toBe("MLLP_FRAMING_STRIPPED");
        expect(err.message.length).toBeGreaterThan(0);
        expect(err.position.segmentIndex).toBe(0);
      }
    }
    expect(threw).toBe(true);
  });

  it("does NOT invoke onWarning under strict mode (the warning becomes a throw)", () => {
    const seen: Hl7ParseWarning[] = [];
    try {
      parseHL7(MLLP_WRAPPED, { strict: true, onWarning: (w) => seen.push(w) });
    } catch {
      // expected
    }
    expect(seen).toHaveLength(0);
  });

  it("does NOT escalate Tier-1 silent events (BOM, line endings) even under strict mode", () => {
    const bomInput = `\uFEFF${VALID_MSG.replace(/\r/g, "\r\n")}`;
    // \uFEFF BOM (Tier 1 silent) + \r\n line endings (Tier 1 silent) → no throw under strict.
    const msg = parseHL7(bomInput, { strict: true });
    expect(msg.warnings).toHaveLength(0);
  });
});

describe("parseHL7: argument discrimination (D-06)", () => {
  const epicProfile: Profile = { name: "epic", lineage: ["base", "epic"] };

  it("treats a Profile-shaped argument as the profile overload", () => {
    const msg = parseHL7(VALID_MSG, epicProfile);
    expect(msg.profile?.name).toBe("epic");
    expect(msg.profile?.lineage).toEqual(["base", "epic"]);
  });

  it("treats ParseOptions with a nested profile field as options (not the profile overload)", () => {
    const msg = parseHL7(VALID_MSG, { profile: epicProfile, strict: false });
    expect(msg.profile?.name).toBe("epic");
  });

  it("honors PROF-08 opt-out: { profile: null } yields msg.profile === undefined", () => {
    const msg = parseHL7(VALID_MSG, { profile: null });
    expect(msg.profile).toBeUndefined();
  });

  it("defaults lineage to [profile.name] when profile.lineage is absent", () => {
    const msg = parseHL7(VALID_MSG, { name: "custom" } satisfies Profile);
    expect(msg.profile?.lineage).toEqual(["custom"]);
  });
});

describe("parseHL7: PARSE-01 end-to-end — well-formed v2.x messages parse correctly", () => {
  it("parses v2.3 message", () => {
    const msg = parseHL7("MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.3\rPID|||123");
    expect(msg.version).toBe("2.3");
  });

  it("parses v2.8 message with custom encoding chars", () => {
    const msg = parseHL7("MSH#$%*@#APP#FAC#APP#FAC#20250101##ADT$A01#1#P#2.8\rPID#1##XXX");
    expect(msg.version).toBe("2.8");
    expect(msg.encodingCharacters.field).toBe("#");
    expect(msg.encodingCharacters.component).toBe("$");
  });

  it("preserves segment order including repeating and Z-segments (PARSE-04)", () => {
    const msg = parseHL7("MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||1\rNK1|1\rNK1|2\rZPI|custom");
    expect(msg.segments.map((s) => s.name)).toEqual(["MSH", "PID", "NK1", "NK1", "ZPI"]);
  });
});
```

CRITICAL — every `catch` block binds a variable typed as `unknown` (per `useUnknownInCatchVariables`) — the test blocks use `if (err instanceof Hl7ParseError)` to narrow before accessing `.code`. Bare `catch {}` with no binding is also used where the thrown value is not inspected.

CRITICAL — do not remove any existing content from `src/index.ts`. The `VERSION` export and its JSDoc must remain byte-identical (the sanity test `test/sanity.test.ts` depends on it).

CRITICAL — the `as unknown as` cast in `makeEmitter` is a deliberate, justified escape-hatch; the comment block in the action text explains why. If `pnpm lint` rejects the cast despite the `eslint-disable-next-line`, the executor should attempt option (c) from the action text (introduce a `Hl7ParseWarningError` subclass). Document the choice in the SUMMARY.
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; pnpm lint --max-warnings=0 &amp;&amp; pnpm test -- --run parser-public &amp;&amp; pnpm build</automated>
  </verify>
  <acceptance_criteria>
    - File `src/parser/index.ts` exists and exports `parseHL7` — verify: `grep -E "^export function parseHL7" src/parser/index.ts | wc -l` returns >= 3 (three overload signatures plus the implementation signature — at least the final implementation is `export function`).
    - Full pipeline composition present — verify: `grep -cE "stripMllp|normalize|splitSegments|readDelimiters|tokenize" src/parser/index.ts` returns >= 5 (each stage referenced at least once).
    - `emitWarning` chokepoint exists with strict-mode branch — verify: `grep -c "options.strict === true" src/parser/index.ts` >= 1 AND `grep -c "throw new Hl7ParseError" src/parser/index.ts` >= 1.
    - `src/index.ts` preserves `VERSION` export verbatim — verify: `grep -c 'export const VERSION: string = "0.0.0";' src/index.ts` returns 1.
    - `src/index.ts` file-level JSDoc preserved byte-identical — verify: the first 8 lines of `src/index.ts` match the first 8 lines of the pre-Plan-06 file. (Implementer can diff against `git show HEAD:src/index.ts` if in doubt.)
    - `src/index.ts` exports the full Phase 2 surface — verify each of: `grep -c "export { parseHL7 }" src/index.ts` >= 1; `grep -c "export { Hl7Message }" src/index.ts` >= 1; `grep -c "export.*Hl7ParseError" src/index.ts` >= 1; `grep -c "WARNING_CODES" src/index.ts` >= 1; `grep -c "FATAL_CODES" src/index.ts` >= 1; `grep -c "DEFAULT_ENCODING_CHARACTERS" src/index.ts` >= 1.
    - No `console.*` in src/parser/index.ts — `grep -c "console\\." src/parser/index.ts` returns 0.
    - No `any` unjustified — `grep -cE "(: any(\\s|,|\\))|<any>)" src/parser/index.ts` returns 0 (the `as unknown as` casts above are not `: any` annotations).
    - `parseHL7` JSDoc `@example` present — `grep -c "@example" src/parser/index.ts` >= 1.
    - Existing sanity test still passes — `pnpm test -- --run sanity` exits 0.
    - `pnpm typecheck` exits 0.
    - `pnpm lint --max-warnings=0` exits 0 across the WHOLE project (not just Plan 06 files).
    - `pnpm test` (full suite — all Plan 01–06 tests + sanity) exits 0.
    - `pnpm build` exits 0 and `dist/index.mjs` contains `parseHL7` (verify: `grep -c "parseHL7" dist/index.mjs` >= 1).
    - `dist/index.d.ts` includes `parseHL7` and `Hl7Message` (verify: `grep -c "parseHL7\\|Hl7Message" dist/index.d.ts` >= 2).
  </acceptance_criteria>
  <done>`parseHL7` composes the full pipeline with strict-mode escalation, PROF-08 opt-out, and Buffer+string input. `src/index.ts` exports the full Phase 2 surface while preserving Phase 1's `VERSION` export. End-to-end integration tests pass. Full pipeline (typecheck + lint + test + build) green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| consumer → parseHL7 | This is the primary trust boundary: user-supplied HL7 bytes + user-supplied options cross from consumer code into the parser. Every prior plan's mitigations converge here. |
| options.onWarning → consumer | The callback is invoked synchronously with each warning; a misbehaving callback could throw and interrupt parsing. Document: callback errors are not swallowed; the throw propagates (standard Node behavior). This is a Phase 8 README concern. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-06-01 | Tampering | `optionsOrProfile` argument discrimination | mitigate | `discriminateOptionsOrProfile` uses explicit `Object.prototype.hasOwnProperty.call` (not `in`) to avoid prototype-pollution false positives. Options-only keys whitelist is static. |
| T-02-06-02 | Denial of Service | Pipeline composition | mitigate | Every stage is linear (O(n)); no stage recurses. Input size is bounded by caller. |
| T-02-06-03 | Spoofing | Strict-mode escalation reusing Hl7ParseError | accept | Under strict mode, `err.code` carries a Tier-2 warning string which is NOT in FATAL_CODES. Consumer's `switch (err.code)` needs to account for this — documented in Phase 8 README Error Handling. The type-level `as` cast is justified and commented. |
| T-02-06-04 | Tampering | `options.onWarning` callback can throw | accept | Callback-thrown errors propagate through the parser (standard Node behavior). Documenting that `onWarning` should not throw is a Phase 8 README concern. The parser's own invariants are not affected because `onWarning` is invoked AFTER the warning is pushed to `msg.warnings`. |
</threat_model>

<verification>
Final pipeline run after the task:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint --max-warnings=0
pnpm test
pnpm build
```

All five commands exit 0. The `pnpm test` run covers every Phase 2 test file (sanity, parser-types, parser-warnings, parser-errors, model-message, parser-normalize, parser-mllp, parser-segments, parser-delimiters, parser-tokenize, parser-escapes, parser-dates, parser-public) — at least 100+ test cases in aggregate.

`dist/` after `pnpm build`:
- `dist/index.mjs` contains `parseHL7` bundled from `src/parser/index.ts` (reachable via the `src/index.ts` barrel).
- `dist/index.cjs` contains the same via the CJS conditional export.
- `dist/index.d.ts` declares `parseHL7`, `Hl7Message`, `Hl7ParseError`, `ProfileDefinitionError`, `FATAL_CODES`, `WARNING_CODES`, `DEFAULT_ENCODING_CHARACTERS`, `BUILTIN_DATE_FALLBACKS`, `parseHl7Timestamp`, `unescape`, `reescape`, and the 10+ exported types.
</verification>

<success_criteria>
- `src/parser/index.ts` ships `parseHL7` composing every Plan 01–05 stage with: argument discrimination (D-06), emitWarning chokepoint (D-11), strict-mode escalation (TOL-01), full Tier-3 fatal coverage (TOL-02), Buffer + string input, and PROF-08 profile opt-out.
- `src/index.ts` exports the full Phase 2 public surface while preserving Phase 1's `VERSION` export and file-level JSDoc byte-identical.
- `test/parser-public.test.ts` ships 15+ integration cases covering PARSE-01 (well-formed messages parse), TOL-01 (strict-mode escalation), TOL-02 (fatal error shape), and the profile/options argument discrimination rules.
- All four Tier-3 fatal codes reachable via `parseHL7` (3 via `readDelimiters`, 1 via `normalize`).
- `pnpm typecheck`, `pnpm lint --max-warnings=0`, `pnpm test`, `pnpm build` all exit 0.
- `dist/index.mjs` and `dist/index.cjs` bundle `parseHL7`; `dist/index.d.ts` declares it.
</success_criteria>

<output>
After completion, create `.planning/phases/02-core-parser-and-tolerance/02-06-SUMMARY.md` describing:
- What shipped (1 new source file, 1 modified source file, 1 test file).
- REQ-IDs closed: PARSE-01 (parse well-formed message end-to-end), TOL-01 (strict-mode escalation covering all Tier-2 codes), TOL-02 (Hl7ParseError shape with code/message/position/snippet).
- The strict-mode cast choice ((b) `as unknown as FatalCode` with justification comment, OR (c) `Hl7ParseWarningError` subclass if (b) failed lint) — document which path was taken and why.
- The `src/index.ts` barrel's final export list.
- Integration surface confirmed: `dist/index.mjs` + `dist/index.cjs` + `dist/index.d.ts` all ship `parseHL7`.
- PHASE 2 COMPLETE note: mark all 19 Phase 2 REQ-IDs (PARSE-01..09 + TOL-01..10) as code-complete; Phase 7 will verify via the full test-coverage sweep.
- Open items for Phase 3 (not blocking Phase 2 transition):
  - `msg.get(path)` and `msg.segments(type)` — Phase 3 will consume `Hl7Message.segments` + call `unescape` on-access.
  - `msg.meta.timestamp` / `msg.meta.version` — Phase 4 will extend the MSH-12 read and call `parseHl7Timestamp` on MSH-7.
  - The structural `RawSegment` tree shape is now locked; Phase 3 can extend it only by adding fields, not renaming.
</output>
