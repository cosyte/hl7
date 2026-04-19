---
phase: 05-serialization-and-round-trip
plan: 04
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/serialize/pretty-print.ts
  - test/serialize-pretty-print.test.ts
autonomous: true
requirements: [SER-04]

must_haves:
  truths:
    - "A developer calling `msg.prettyPrint()` on any parsed message receives a multi-line string with a metadata header followed by one line per segment with labeled `[N]=value` fields."
    - "A developer reviewing the first line of `prettyPrint()` output sees `HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)`; missing meta fields render as `-` and the segment count is always present (D-25)."
    - "A developer reviewing any segment line sees `<segmentName>  [N]=<rawEmittedValue>  [M]=<rawEmittedValue>  ...` where field numbers use HL7 1-indexed convention (MSH-3 is the first content field for MSH; non-MSH segments start at [1]) and trailing empty positions are suppressed (D-23)."
    - "A developer whose message has a composite field (e.g. `Smith^John^Q`) sees the composite rendered as a single raw string on the segment line — depth stops at field level (D-24)."
    - "A developer calling `msg.prettyPrint()` never sees it throw — including on empty/MSH-only messages, messages with null fields, messages with no profile, and messages with zero warnings (D-26)."
    - "A developer who embeds a delimiter character (e.g. `|`) inside a subcomponent sees the pretty-print output show the HL7 ESCAPE FORM (e.g. `\\F\\`), not the literal char — this preserves round-trip fidelity (W2). For un-escaped human display, parse the composite via typed accessors (e.g. `msg.patient?.familyName`)."
  artifacts:
    - path: "src/serialize/pretty-print.ts"
      provides: "emitPrettyPrint body — single opinionated human-readable format (D-22..D-26) with raw-escape rendering documented (W2)"
      exports: ["emitPrettyPrint"]
    - path: "test/serialize-pretty-print.test.ts"
      provides: "SER-04 unit coverage — header, segment lines, labeled fields, composite-depth stop, purity, raw-escape rendering"
  key_links:
    - from: "src/serialize/pretty-print.ts::emitPrettyPrint"
      to: "msg.meta + msg.rawSegments + emit-field.ts::emitField"
      via: "header from meta; segment lines walk rawSegments; each field rendered by emitField"
      pattern: 'msg\.meta|msg\.rawSegments|emitField'
    - from: "src/serialize/pretty-print.ts"
      to: "src/serialize/emit-field.ts"
      via: "emitField reused for D-24 field-level rendering"
      pattern: 'import \{ emitField \} from "\./emit-field\.js"'
---

<objective>
Fill the `emitPrettyPrint` body in `src/serialize/pretty-print.ts`. This plan
CLOSES **SER-04** (`msg.prettyPrint()` returns a human-readable multi-line
string for logging/debugging).

**Body-only edit:** Plan 01 shipped `src/serialize/pretty-print.ts` with the
module JSDoc, the `Hl7Message` import, and the `emitPrettyPrint(msg): string`
stub throwing `NOT IMPLEMENTED — Phase 5 Plan 04`. Plan 04 ONLY replaces the
function body and adds tests. Do NOT touch the module JSDoc, imports, or
signature — and do NOT touch `src/model/message.ts` (Plan 01 wired
`prettyPrint()` already WITH the W2 raw-escape JSDoc note) or `src/index.ts`.

**Decisions implemented verbatim:**

- **D-22: no options — single opinionated format.** Minimal API surface.
  No colors, no truncation, no depth knob in v1.
- **D-23: segment-per-line with labeled fields `[N]=value`.** Example
  output shape (canonical ADT^A01):
  ```
  HL7 ADT^A01^ADT_A01  controlId=MSG00001  timestamp=2026-04-19T10:15:00.000Z  (5 segments)
  MSH  [3]=SENDAPP  [4]=SENDFAC  [5]=RECVAPP  [6]=RECVFAC  [7]=20260419101500  [9]=ADT^A01  [10]=MSG00001  [11]=P  [12]=2.5
  PID  [1]=1  [3]=MRN12345  [5]=Smith^John^Q  [7]=19800115  [8]=M
  PV1  [2]=I  [3]=ICU^101^A  [44]=20260419080000
  OBX  [1]=1  [2]=NM  [3]=GLUC^Glucose^LN  [5]=95  [6]=mg/dL^^UCUM
  ```
  Field values shown verbatim with active delimiters. Field numbers use
  HL7 1-indexed convention:
  - **MSH**: first content field is `[3]` (MSH-3); MSH-1 and MSH-2 are the
    delimiters themselves (already in the header context) — DO NOT label
    them. Start iteration at `fields[2]` (HL7 index 3).
  - **Non-MSH**: first content field is `[1]` (PID-1, OBX-1, …). Start
    iteration at `fields[1]` (HL7 index 1).
  - `fields[0]` (the name placeholder) is ALWAYS skipped.

- **D-24: resolution depth stops at the field level.** Composite values
  render as their raw HL7 string (e.g. `Smith^John^Q`). No component
  breakdown. Use `emitField(field, enc)` from Plan 01 — same primitive as
  `toString()` — so re-escape is applied consistently on the visible
  output. This means `prettyPrint` output shows ESCAPED user content
  (e.g. a name containing `|` shows as `Smith\F\Jones`) — that is
  correct per D-24 "raw HL7 string", and the user-facing tradeoff is
  documented via W2 JSDoc (on both the module-level `emitPrettyPrint` and
  the `Hl7Message.prettyPrint()` wrapper in message.ts).

- **D-25: first line is a metadata header.** Exact format:
  ```
  HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)
  ```
  - `<type>` comes from `msg.meta.type` (e.g. `"ADT^A01^ADT_A01"`). When
    absent → `-`.
  - `<id>` comes from `msg.meta.controlId`. When absent → `-`.
  - `<iso>` comes from `msg.meta.timestamp?.toISOString()`. When absent
    → `-`.
  - `<N>` is `msg.rawSegments.length` — ALWAYS a number, always present.
  - Separator between header fields is TWO spaces.

- **D-26: pure — never warns or throws.** Matches `toString` and
  `toJSON` doctrine.

- **D-27/D-28:** no new warning codes, no new fatal codes.

- **D-30: no emit caching.** Each call re-walks `rawSegments`.

- **D-31: zero runtime deps.** Uses `emitField` (Plan 01, internal) +
  `msg.meta` (Phase 4). No stdlib additions beyond Array / String.

**Claude's Discretion resolved:**

- Header includes segment count (`(<N> segments)`) per D-25.
- No warnings count in header (warnings live in `toJSON` territory).
- Empty trailing positions suppressed — since `emitField` already strips
  trailing-empty components/subcomponents (D-02), the labeled value for
  a field with no content would be an empty string. When the emitted
  value is an empty string (absent field OR `isNull === false` with no
  repetitions), SUPPRESS the `[N]=...` entry entirely (do not emit
  `[N]=`). This keeps lines terse — matches the D-23 example output
  where sparse PID omits most field labels.
- `isNull === true` is shown as `[N]=""` (the D-02 literal — two quote
  chars) because that's the correct "raw HL7 string" representation.
- Separator between labeled fields on a segment line is TWO spaces
  (same as header). Segment name is followed by two spaces then the
  first label.

**W2 raw-escape rendering note (critical UX):** Pretty-print output shows
field values in their raw HL7 string form. A patient family name that
contains a literal `|` (which parsed into `Field.value` as `|` via the
`\F\` → `|` decode) will render in pretty-print as `Smith\F\Jones`
(re-escaped via `emitField`'s `reescape` call), NOT as `Smith|Jones`.

This is a deliberate design choice, not a bug:
- **Round-trip fidelity:** copy-pasting `prettyPrint()` output into
  `parseHL7` yields a structurally equivalent message. A human reading the
  output sees the wire-level representation, not a best-effort
  human-display rendering.
- **Debugging correctness:** when a user reports "my pretty-print shows
  `Smith\F\Jones`, what's wrong?" the answer is "your source field
  contained a literal `|` character; HL7 requires escaping it on the wire".
  Showing `Smith|Jones` would lie about the wire representation.
- **For un-escaped human display:** use typed accessors (`msg.patient?.
  familyName`), which return `Field.value` — already-decoded strings.

This tradeoff is documented in JSDoc on BOTH `emitPrettyPrint` (inside
this file, Plan 04 fills) AND `Hl7Message.prettyPrint()` (Plan 01 already
landed the note in `src/model/message.ts`). Duplication is intentional:
developers might inspect either the instance method or the module-level
function, and both need to carry the caveat.

**In scope:**

1. Replace the stub body in `src/serialize/pretty-print.ts::emitPrettyPrint`
   with the D-22..D-26 implementation. Extend the function-level JSDoc to
   include the W2 raw-escape paragraph.
2. Create `test/serialize-pretty-print.test.ts` — unit coverage INCLUDING
   a dedicated W2 assertion that embedded delimiters render as escape
   sequences (not as the literal char).

**Out of scope:**

- Options bag (colors, depth, showWarnings, maxSegments) — deferred to v2
  per D-22.
- Profile-aware pretty-print overrides — Phase 6.
- Truncation of extremely long messages — v2.

Output: 1 modified src file (body only) + 1 new test file.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/05-serialization-and-round-trip/05-CONTEXT.md
@.planning/phases/05-serialization-and-round-trip/05-PATTERNS.md
@CLAUDE.md

<interfaces>
<!-- Plan 01 outputs that Plan 04 consumes. Read directly from code
     if anything looks stale. -->

From src/serialize/pretty-print.ts (Plan 01 stub — body only to replace):
- existing module JSDoc (KEEP)
- import type { Hl7Message } from "../model/message.js"; (KEEP)
- export function emitPrettyPrint(_msg: Hl7Message): string { throw ... }
  (REPLACE BODY ONLY; rename `_msg` to `msg`; EXTEND function-level JSDoc with W2 note)

From src/serialize/emit-field.ts (Plan 01 output — FULLY IMPLEMENTED):
- export function emitField(field: RawField, enc: EncodingCharacters): string
  (handles D-02 trailing-empty strip + D-04 reescape + isNull preservation;
   returns "" for absent, `""` for isNull true)

From src/model/message.ts (Phase 4 complete — DO NOT MODIFY):
- public readonly rawSegments: readonly RawSegment[]
- public readonly encodingCharacters: EncodingCharacters
- public get meta(): Meta
  (Meta has optional type/controlId/timestamp/messageCode/triggerEvent/
   messageStructure/version/sendingApp/sendingFacility/receivingApp/
   receivingFacility/processingId — all ?: string except timestamp?: Date)
- public prettyPrint(): string  (Plan 01 wired — JSDoc contains W2 note
  about raw-escape rendering; delegates to emitPrettyPrint)

From src/helpers/types.ts:
- Meta shape (used for header fields)
  - type?: string
  - controlId?: string
  - timestamp?: Date
  (other fields not used in header per D-25)

From src/parser/types.ts:
- RawSegment { name: string; fields: readonly RawField[] }
  (MSH fields[0] = name placeholder; fields[1] = encoding chars;
   fields[2] = MSH-3 data onwards. Non-MSH fields[0] = name placeholder;
   fields[1] = N-1 data onwards.)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement emitPrettyPrint body (header + segment-per-line + labeled fields) with full unit coverage</name>
  <files>src/serialize/pretty-print.ts, test/serialize-pretty-print.test.ts</files>
  <read_first>
    - src/serialize/pretty-print.ts (Plan 01 stub — body only to replace; confirm module JSDoc is intact)
    - src/serialize/emit-field.ts (Plan 01 output — emitField signature; handles D-02/D-04 transparently)
    - src/model/message.ts (meta getter — Phase 4 Plan 02 behaviour: buildMeta composes on msg.get + msg.segments("MSH"); confirm prettyPrint JSDoc already has W2 note)
    - src/helpers/types.ts (Meta interface — type/controlId/timestamp optionality)
    - src/parser/types.ts (RawSegment.fields convention — fields[0] placeholder skip; MSH fields[1] = encoding chars skip)
    - test/helpers-patient.test.ts (string-composition test style analog)
    - .planning/phases/05-serialization-and-round-trip/05-CONTEXT.md §decisions D-22 (no options), D-23 (segment-per-line shape + field-number convention), D-24 (depth stops at field), D-25 (exact header format), D-26 (pure)
    - .planning/phases/05-serialization-and-round-trip/05-PATTERNS.md "src/serialize/pretty-print.ts" section (lines 175-207)
  </read_first>
  <behavior>
    - `emitPrettyPrint(msg)` returns a string with at least 1 line (the header).
    - First line starts with `"HL7 "` followed by `msg.meta.type` (or `-`), two spaces, `"controlId="` + controlId (or `-`), two spaces, `"timestamp="` + ISO string (or `-`), two spaces, `"("` + segment count + `" segments)"`.
    - Lines are separated by `"\n"` (NOT CR — this is human output, not HL7 wire).
    - Output does NOT end with a trailing newline (consistent terminal-friendly output).
    - Second line through N+1 line are segment lines, one per `msg.rawSegments[i]`.
    - For a non-MSH segment, line format: `<seg.name>` + `"  "` + labeled fields `[N]=value` joined by `"  "` (two spaces). Field indices start at 1 for the first data field (`fields[1]`).
    - For the MSH segment, line format: `"MSH"` + `"  "` + labeled fields starting at `[3]` (`fields[2]`). MSH-1 and MSH-2 are NEVER labeled.
    - For any field whose emitted value (via `emitField(field, enc)`) is the empty string `""`, the `[N]=...` entry is SUPPRESSED (not emitted). `isNull: true` (emits `""`, 2 chars) IS emitted as `[N]=""`.
    - A segment with only absent fields after `fields[0]` emits just the segment name (e.g. `"NTE"` on its own line — no labels).
    - A segment with no fields at all (not even the placeholder — pathological) emits just the segment name.
    - Composite values render as the raw HL7 string from `emitField` (e.g. `"Smith^John^Q"`), NOT broken into components.
    - Header fields missing render as `-` (single hyphen).
    - Segment count in header is always the number `msg.rawSegments.length`.
    - **W2 raw-escape rendering:** a subcomponent whose decoded value contains a literal `|` (from an input `\F\`) renders in pretty-print output as `\F\`, NOT as `|`. This applies uniformly to all 5 active delimiters and to `\n → \.br\`. Documented on function-level JSDoc for Plan 04's discoverability.
    - `emitPrettyPrint` never throws on any parseable input.
    - `emitPrettyPrint` is deterministic — two back-to-back calls return identical strings.
    - `emitPrettyPrint` does not mutate `msg`.
  </behavior>
  <action>
**Step A — Replace the body of `src/serialize/pretty-print.ts::emitPrettyPrint`:**

Open the file. Keep the module JSDoc. Rename the parameter from `_msg` to
`msg`. Add the `emitField` import right after the existing `Hl7Message`
import. EXTEND the function-level JSDoc with the W2 raw-escape paragraph
(shown below). Replace the `throw new Error(...)` body with the
implementation below.

Final shape of the file:

```typescript
/**
 * (Existing module JSDoc from Plan 01 — unchanged.)
 */

import type { Hl7Message } from "../model/message.js";
import { emitField } from "./emit-field.js";

/**
 * Emit a human-readable multi-line rendering of a parsed `Hl7Message`
 * for logs and debugging (SER-04). Single opinionated format per D-22;
 * no options. Header per D-25; segment lines per D-23; depth stops at
 * field level per D-24; pure per D-26.
 *
 * **Raw-escape rendering (W2):** field values render as their raw HL7
 * string representation, produced via `emitField`. Embedded delimiters
 * in user data appear as HL7 escape sequences — e.g. a patient family
 * name that was decoded from `\F\` on input (literal `|` in
 * `Field.value`) renders in pretty-print as `Smith\F\Jones`, NOT as
 * `Smith|Jones`. This preserves round-trip fidelity: copy-pasting the
 * output into `parseHL7` yields a structurally equivalent message. For
 * un-escaped human display, use typed accessors (e.g.
 * `msg.patient?.familyName`), which return already-decoded strings.
 *
 * @internal
 */
export function emitPrettyPrint(msg: Hl7Message): string {
  const lines: string[] = [];
  lines.push(buildHeaderLine(msg));
  for (const seg of msg.rawSegments) {
    lines.push(buildSegmentLine(seg, msg));
  }
  return lines.join("\n");
}

/**
 * D-25 header:
 *   `HL7 <type>  controlId=<id>  timestamp=<iso>  (<N> segments)`
 * Missing meta fields render as `-`.
 * @internal
 */
function buildHeaderLine(msg: Hl7Message): string {
  const meta = msg.meta;
  const type = meta.type ?? "-";
  const controlId = meta.controlId ?? "-";
  const timestamp = meta.timestamp?.toISOString() ?? "-";
  const segCount = msg.rawSegments.length;
  return (
    "HL7 " +
    type +
    "  controlId=" +
    controlId +
    "  timestamp=" +
    timestamp +
    "  (" +
    String(segCount) +
    " segments)"
  );
}

/**
 * D-23 segment line:
 *   `<seg.name>  [N]=<emittedFieldValue>  [M]=<emittedFieldValue>  ...`
 * - Non-MSH: start at fields[1] with HL7 index 1.
 * - MSH: start at fields[2] with HL7 index 3 (MSH-1/MSH-2 are the
 *   delimiters themselves and are not labelled — their content is
 *   implicit in the header).
 * - Field rendered via `emitField` (D-24 depth stop + W2 raw-escape).
 * - Empty-emitted values are SUPPRESSED (no `[N]=` entry) so sparse
 *   segments stay terse. `isNull === true` emits `""` (2 chars) and IS
 *   shown.
 * @internal
 */
function buildSegmentLine(
  seg: import("../parser/types.js").RawSegment,
  msg: Hl7Message,
): string {
  const enc = msg.encodingCharacters;
  // First data field index and first displayed HL7 field number:
  //   - MSH: fields[2] → [3]
  //   - non-MSH: fields[1] → [1]
  const isMsh = seg.name === "MSH";
  const firstFieldIndex = isMsh ? 2 : 1;
  const firstDisplayNumber = isMsh ? 3 : 1;

  const labeledParts: string[] = [];
  for (let i = firstFieldIndex; i < seg.fields.length; i++) {
    const f = seg.fields[i];
    if (f === undefined) continue;
    const emitted = emitField(f, enc);
    if (emitted === "") continue; // suppress absent-field labels
    const displayNumber = firstDisplayNumber + (i - firstFieldIndex);
    labeledParts.push("[" + String(displayNumber) + "]=" + emitted);
  }

  if (labeledParts.length === 0) return seg.name;
  return seg.name + "  " + labeledParts.join("  ");
}
```

Notes:

1. `emitField` returns `""` for an absent field (isNull:false, zero
   repetitions) and `""` (2 chars — quote-quote) for `isNull:true`.
   The `emitted === ""` check distinguishes correctly.
2. MSH field-number mapping: `fields[2]` displays as `[3]`; `fields[3]`
   as `[4]`; `fields[N]` as `[N+1]`. The formula `firstDisplayNumber +
   (i - firstFieldIndex)` works for both MSH and non-MSH cases.
3. `msg.meta` is MEMOIZED (Phase 4 D-02) — calling it here is a constant-
   time op after the first read. No emit caching in prettyPrint itself
   (D-30).
4. `msg.meta` never throws (Phase 4 D-22). If MSH is pathologically
   malformed and `meta.type/controlId/timestamp` are absent, the `??`
   fallbacks handle it — `emitPrettyPrint` stays pure per D-26.
5. **W2 coverage:** because pretty-print uses `emitField` (the D-04
   re-escape chokepoint from Plan 01) for every field value, the
   raw-escape rendering is automatic — no special-casing required. The
   JSDoc note makes the UX tradeoff explicit for developers.

**Step B — Create `test/serialize-pretty-print.test.ts`:**

Convention: Vitest describe/it, import `parseHL7` from `../src/index.js`.
Use a FIXTURE const for the canonical case + hand-built `Hl7Message`
instances for edge cases.

Required test cases:

**Block 1: Header (D-25)**
1. "header starts with 'HL7 '" — first line of output begins with `"HL7 "`.
2. "header contains type when present" — for a message with `MSH-9 = "ADT^A01^ADT_A01"`, header contains `"ADT^A01^ADT_A01"`.
3. "header renders missing type as '-'" — construct an Hl7Message with a malformed MSH (e.g. empty MSH-9) so `msg.meta.type === undefined`; header contains `"HL7 -"`.
4. "header contains controlId=... when present" — asserts the literal substring after two spaces: `"  controlId=MSG00001  "`.
5. "header renders missing controlId as '-'" — substring `"controlId=-  "` appears.
6. "header contains timestamp=<ISO> when present" — for a message with `MSH-7 = "20260419101500"`, header contains `"timestamp=2026-04-19T10:15:00.000Z"` (or exact ISO output — use `new Date(Date.UTC(2026, 3, 19, 10, 15, 0)).toISOString()` to compute the expected string).
7. "header renders missing timestamp as '-'" — substring `"timestamp=-  "` appears.
8. "header ends with '(N segments)'" — for a 5-segment message, header ends with `"(5 segments)"`.
9. "header uses exactly two spaces between fields" — regex check: `/HL7 .+  controlId=.+  timestamp=.+  \(\d+ segments\)/` matches line 1.

**Block 2: Segment lines (D-23)**
10. "MSH line starts at [3]" — for the canonical ADT fixture, the MSH line contains `[3]=EPIC` (or whatever MSH-3 is) and does NOT contain `[1]=` or `[2]=`.
11. "non-MSH segment starts at [1]" — PID line starts with `[1]=` (PID-1 = setId) assuming PID-1 is present.
12. "two-space separator between labeled fields" — segment line regex check.
13. "segment with no content fields is just the name" — construct a message with `NTE|` (just the segment name and a blank content — or all empty fields); pretty-print output contains a line that is exactly `"NTE"` (no trailing spaces).
14. "empty fields are suppressed" — segment with `PID|1|||||Doe^John` (PID-1, PID-6 present; PID-2/3/4/5 empty) renders `PID  [1]=1  [6]=Doe^John` (no `[2]=`/`[3]=`/`[4]=`/`[5]=`).
15. "isNull field renders as [N]=\"\"" — segment with `""` null field at position N renders `[N]=""` (two quote chars).
16. "field numbers are HL7 1-indexed" — for `PID|1||MRN^^^HOSP^MR`, the third field (PID-3 = MRN) appears with `[3]=` label, not `[2]=`.
17. "composite value rendered as raw HL7 string" — PID-5 containing XPN `Smith^John^Q` renders as `[5]=Smith^John^Q` (not broken into components).

**Block 3: Depth (D-24)**
18. "subcomponent-containing field renders raw" — CX with assigningAuthority `MRN^^^HOSP&1.2.3&ISO^MR` renders the entire raw string.

**Block 4: W2 raw-escape rendering — D-04 through emitField (EXPLICIT per W2)**
19. "user content with embedded `|` shows as `\\F\\`" — build/parse a message where a subcomponent's decoded value contains a literal `|`. Pretty-print output MUST contain `\F\` (literal backslash-F-backslash, 3 chars) in the corresponding position, and MUST NOT contain the literal `|` in the field value (obviously the segment-level `|` separators are still present — this assertion targets the field value specifically: slice out the `[N]=` line fragment for the target field and assert it includes `\F\`).
20. "user content with embedded `\\n` shows as `\\.br\\`" — subcomponent containing a literal newline (from input `\.br\`): pretty-print output contains `\.br\` in the field value and NO literal `\n` (the only `\n` chars in the output should be the line separators).
21. "all 5 active delimiters render as escape forms" — one assertion per delimiter (|, ^, ~, \, &) that a subcomponent containing the literal char emits the corresponding escape form (`\F\`, `\S\`, `\R\`, `\E\`, `\T\`) in pretty-print output.

**Block 5: Line structure**
22. "lines separated by '\\n'" — `output.split("\n").length === msg.rawSegments.length + 1` (header + N segments).
23. "output does NOT end with trailing newline" — `output.endsWith("\n") === false`.
24. "output has no '\\r'" — `output.includes("\r") === false` (pretty-print uses LF, not CR, so logs and terminals render cleanly).

**Block 6: Purity (D-26)**
25. "never throws on any parseable input" — 3 diverse fixtures including MSH-only (rawSegments.length === 1) wrapped in `expect().not.toThrow()`.
26. "deterministic" — two back-to-back calls return identical strings.
27. "does not mutate msg" — snapshot `msg.rawSegments` JSON; call prettyPrint; re-snapshot; deep equal.
28. "MSH-only message prints header + MSH line" — `msg.rawSegments.length === 1`; output has exactly 2 lines; line 2 starts with `"MSH  "` and has at least one `[N]=` label.

Run `pnpm typecheck`, `pnpm lint`, `pnpm test -- serialize-pretty-print`.
  </action>
  <verify>
    <automated>pnpm test -- serialize-pretty-print.test.ts 2>&amp;1 | tail -40 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/serialize/pretty-print.ts test/serialize-pretty-print.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q 'NOT IMPLEMENTED — Phase 5 Plan 04' src/serialize/pretty-print.ts` returns NO matches (stub replaced)
    - `grep -q 'import { emitField } from "./emit-field.js"' src/serialize/pretty-print.ts` succeeds
    - `grep -q "msg.meta" src/serialize/pretty-print.ts` succeeds (D-25 header source)
    - `grep -q 'toISOString()' src/serialize/pretty-print.ts` succeeds (D-25 timestamp)
    - `grep -q 'segments)' src/serialize/pretty-print.ts` succeeds (D-25 segment count literal)
    - `grep -q 'seg.name === "MSH"' src/serialize/pretty-print.ts` succeeds (MSH offset handling)
    - `grep -q 'lines.join("\\\\n")' src/serialize/pretty-print.ts || grep -q "lines.join(.\\\\n" src/serialize/pretty-print.ts` — LF separator
    - `grep -q "raw HL7 string\|escape sequences\|Smith.F.Jones\|round-trip fidelity" src/serialize/pretty-print.ts` succeeds (W2 function-level JSDoc note)
    - `test -f test/serialize-pretty-print.test.ts` succeeds
    - `grep -q "\\\\F\\\\\\|escape form" test/serialize-pretty-print.test.ts` succeeds (W2 test present)
    - `pnpm test -- serialize-pretty-print.test.ts` exits 0 with >= 27 test cases passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/serialize/pretty-print.ts test/serialize-pretty-print.test.ts` exits 0 with zero warnings
  </acceptance_criteria>
  <done>emitPrettyPrint body implements the D-22..D-26 contract with W2 raw-escape rendering documented on the function-level JSDoc; 27+ unit tests green including dedicated W2 assertions; SER-04 closed.</done>
</task>

</tasks>

<verification>
Run the Phase 5 Plan 04 pipeline:

```bash
pnpm tsc --noEmit   # strict TS passes
pnpm lint           # ESLint passes with zero warnings
pnpm test           # Plan 01 + Plan 02 + Plan 03 + Plan 04 tests all pass (>= 566 cases)
pnpm build          # tsup emits dist/ with the populated prettyPrint body
```

Smoke-test from the built bundle:

```bash
node --input-type=module -e "
  const { parseHL7 } = await import('./dist/index.mjs');
  const raw = 'MSH|^~\\\\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5\rPID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M\r';
  const msg = parseHL7(raw);
  console.log(msg.prettyPrint());
"
```

Should print something like:
```
HL7 ADT^A01^ADT_A01  controlId=MSG00001  timestamp=2026-04-19T10:15:00.000Z  (2 segments)
MSH  [3]=EPIC  [4]=MAIN  [5]=LIS  [6]=REF  [7]=20260419101500  [9]=ADT^A01^ADT_A01  [10]=MSG00001  [11]=P  [12]=2.5
PID  [1]=1  [3]=MRN12345^^^HOSP^MR  [5]=Doe^John^Q  [7]=19800115  [8]=M
```
</verification>

<success_criteria>
- `src/serialize/pretty-print.ts::emitPrettyPrint` body implemented per D-22..D-26 with W2 raw-escape JSDoc note on the function-level doc.
- `test/serialize-pretty-print.test.ts` >= 27 cases green including dedicated W2 assertions (literal delimiters render as `\F\` / `\S\` / `\R\` / `\E\` / `\T\` / `\.br\`).
- SER-04 closed.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all exit 0.
- Plan 04 touched ONLY `src/serialize/pretty-print.ts` (body-only) + 1 new test file — no edit to `src/model/message.ts`, `src/index.ts`, `src/serialize/emit-field.ts`, or any other plan's files. (The W2 JSDoc on `Hl7Message.prettyPrint()` was landed in Plan 01 Task 3 — no touch needed here.)
</success_criteria>

<output>
After completion, create `.planning/phases/05-serialization-and-round-trip/05-04-SUMMARY.md` with:
- What shipped (emitPrettyPrint body; test coverage including dedicated W2 raw-escape tests).
- REQ-IDs closed: SER-04.
- Decisions confirmed at runtime: D-22, D-23, D-24, D-25, D-26.
- Warning W2 addressed on function-level JSDoc of `emitPrettyPrint` (complementing the JSDoc on `Hl7Message.prettyPrint()` that Plan 01 landed).
- Files created (1: test) + modified (1: pretty-print.ts body).
- Test count before/after.
- Any deviations flagged for Plan 05.
</output>
</content>
