---
phase: 05-serialization-and-round-trip
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/serialize/to-string.ts
  - test/serialize-to-string.test.ts
  - test/round-trip.test.ts
  - test/fixtures/round-trip/canonical-adt-a01.hl7
  - test/fixtures/round-trip/oru-r01-repetitions.hl7
  - test/fixtures/round-trip/null-fields.hl7
  - test/fixtures/round-trip/embedded-delimiters.hl7
  - test/fixtures/round-trip/decoded-br.hl7
autonomous: true
requirements: [SER-01, SER-02, SER-05]

must_haves:
  truths:
    - "A developer calling `msg.toString()` on any parsed message produces spec-clean HL7 with correct delimiters, re-escaped sequences, and no leaked MLLP/whitespace quirks (SER-01)."
    - "A developer calling `parseHL7(msg.toString())` on any canonical fixture produces an `Hl7Message` whose `rawSegments` tree is deeply equal to the original's (SER-02)."
    - "A developer whose source field contains a literal `|`, `^`, `~`, `\\`, or `&` sees that character correctly re-encoded as `\\F\\`, `\\S\\`, `\\R\\`, `\\E\\`, or `\\T\\` in the emitted HL7 (SER-05)."
    - "A developer whose parsed message has `RawField.isNull === true` sees that field emit as the literal two-character `\"\"` on output — distinct from absent."
    - "A developer running `toString()` on a message parsed from MLLP-framed or BOM-prefixed input gets spec-clean output (no MLLP bytes, no BOM, CR-separated)."
    - "A developer calling `parseHL7(msg.toString())` then `.toString()` again gets byte-identical output on the second pass (D-03 idempotency from second pass onward)."
    - "A developer relying on HL7 positional addressing sees trailing EMPTY FIELDS preserved at the segment level (only trailing empty repetitions/components/subcomponents INSIDE a field are stripped, per D-02) — `PID|1|||||Doe^John||||` round-trips as `PID|1|||||Doe^John||||` preserving positional alignment."
  artifacts:
    - path: "src/serialize/to-string.ts"
      provides: "emitMessage body — composes emitField/emitSegment, inlines MSH-1/MSH-2, joins by CR"
      exports: ["emitMessage"]
    - path: "test/serialize-to-string.test.ts"
      provides: "Unit coverage of emitMessage — MSH special-case, CR terminator, re-escape through, no MLLP, purity, trailing-field preservation"
    - path: "test/round-trip.test.ts"
      provides: "SER-02 structural-equivalence sweep across 5 fixtures + D-03 idempotency check"
    - path: "test/fixtures/round-trip/canonical-adt-a01.hl7"
      provides: "Clean ADT^A01 fixture (no quirks)"
    - path: "test/fixtures/round-trip/oru-r01-repetitions.hl7"
      provides: "ORU^R01 fixture with OBX repetitions + repeating fields"
    - path: "test/fixtures/round-trip/null-fields.hl7"
      provides: "Fixture exercising explicit `\"\"` null fields (D-02 isNull preservation)"
    - path: "test/fixtures/round-trip/embedded-delimiters.hl7"
      provides: "Fixture with `\\F\\`, `\\S\\`, `\\T\\`, `\\R\\`, `\\E\\` escape sequences in user data (SER-05)"
    - path: "test/fixtures/round-trip/decoded-br.hl7"
      provides: "Fixture with `\\.br\\` in OBX-5 to verify newline pass-through (D-04)"
  key_links:
    - from: "src/serialize/to-string.ts::emitMessage"
      to: "src/serialize/emit-field.ts::emitField + emitSegment"
      via: "import + delegation (emit-field is the D-04 chokepoint)"
      pattern: 'import \{ emitField, emitSegment \} from "\./emit-field\.js"'
    - from: "src/serialize/to-string.ts::emitMessage"
      to: "msg.encodingCharacters (MSH-1/MSH-2 source)"
      via: "direct access — D-06 inline emission"
      pattern: 'msg\.encodingCharacters'
    - from: "test/round-trip.test.ts"
      to: "parseHL7 + msg.toString + parseHL7"
      via: "SER-02 structural-equivalence assertion loop"
      pattern: 'expect\(.+rawSegments\)\.toEqual\('
---

<objective>
Fill the `emitMessage` body in `src/serialize/to-string.ts` and ship the
SER-02 round-trip fixture sweep. This plan CLOSES **SER-01, SER-02, SER-05**.

**Body-only edit:** Plan 01 shipped `src/serialize/to-string.ts` as a stub
with the module JSDoc, the `Hl7Message` import, and the `emitMessage`
function signature. Plan 02 ONLY replaces the function body and adds tests.
Do NOT touch the module JSDoc, imports, or signature — and do NOT touch
`src/model/message.ts` or `src/index.ts` (Plan 01 already wired them).

**Decisions implemented verbatim:**

- **D-01:** walk `msg.rawSegments` verbatim — no separate dirty tracking.
- **D-02:** inherited from `emitField` (Plan 01 shipped this). Trailing
  empties stripped at component + subcomponent levels INSIDE a field;
  `isNull` preserved as `""`. `emitMessage` does not re-handle D-02 — the
  primitive does.
- **D-02 field-level scope (critical — W3):** **trailing EMPTY FIELDS at
  the segment level are PRESERVED, not stripped.** D-02's trailing-empty
  strip is scoped to the INSIDE of a field (trailing empty repetitions,
  components, subcomponents). It does NOT apply to empty fields at the
  segment-level join. This preserves HL7 positional addressing semantics
  — `PID|1|||||Doe^John||||` (10 fields, several empty) remains
  `PID|1|||||Doe^John||||` (same positional layout) on round-trip.
  `emitSegment` (Plan 01) joins `fields[1..N]` with `enc.field` and does
  NOT pop trailing `""` entries off `parts` before joining.
- **D-04:** every user-content string passes through `reescape()` exactly
  once, via `emitField`'s per-subcomponent call. `emitMessage` adds zero
  additional `reescape` invocations.
- **D-05:** segments joined by strict CR (`\r`). ALSO a trailing `\r` at
  end-of-output. Input parsed with CRLF or LF (Phase 2 normalization) emits
  canonical CR — the "spec-clean" promise.
- **D-06:** MSH-1 and MSH-2 are emitted VERBATIM from `msg.encodingCharacters`.
  MSH-1 = `enc.field` (one char). MSH-2 = `enc.component + enc.repetition +
  enc.escape + enc.subcomponent` (4 chars, fixed order). The exact emission
  trace is:
  ```
  "MSH" + enc.field + enc.component + enc.repetition + enc.escape +
    enc.subcomponent + enc.field + <emit fields MSH-3..N joined by enc.field, each reescaped>
  ```
  These two positions bypass the normal field-join path entirely — the
  emitter inlines them after "MSH", then resumes normal delimiter-joined
  emission from MSH-3 onward (via `emitField` on each fields[i] for i >= 3,
  joined by enc.field).
- **D-07:** pure — never warns, never throws.
- **D-08:** NO MLLP wrapping. Output is never prefixed with `\x0B` or
  suffixed with `\x1C\x0D`.

**SER-02 round-trip contract (D-03):** structural equivalence of
`rawSegments` + `encodingCharacters` after `parseHL7(msg.toString())`. NOT
byte-identical on the first pass — MLLP/BOM/CRLF/custom-delimiter inputs
normalise to spec-clean output on first emission. Byte-identical FROM THE
SECOND PASS onward (idempotency).

**In scope:**

1. Replace the stub body in `src/serialize/to-string.ts::emitMessage` with
   the D-01/D-05/D-06/D-07/D-08 implementation.
2. Create `test/serialize-to-string.test.ts` — unit coverage.
3. Create `test/round-trip.test.ts` + 5 fixture files — SER-02 sweep.

**Out of scope (other plans):**

- `emitJson` body → Plan 03.
- `emitPrettyPrint` body → Plan 04.
- `buildMessage` + timestamp + control-id bodies → Plan 05.
- Vendor-quirk fixtures beyond the canonical 5 → Phase 7.

Purpose: deliver the spec-clean emitter and prove round-trip equivalence
on a canonical sweep.

Output: 1 modified src file (body only) + 2 new test files + 5 new fixture
files.
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
<!-- Plan 01 outputs that Plan 02 consumes. Read directly from code
     if anything looks stale. -->

From src/serialize/emit-field.ts (Plan 01 output — FULLY IMPLEMENTED):
- export function emitField(field: RawField, enc: EncodingCharacters): string
  (handles D-02 trailing-empty strip at COMPONENT/SUBCOMPONENT levels + D-04 reescape + isNull preservation)
- export function emitSegment(seg: RawSegment, enc: EncodingCharacters): string
  (skips fields[0] placeholder; joins fields[1..N] with enc.field — trailing EMPTY
   FIELDS preserved; THROWS on MSH per Plan 01's D-06 guard — MSH must be handled
   specially by emitMessage)

From src/model/message.ts (Phase 4 complete — DO NOT MODIFY in this plan):
- public readonly rawSegments: readonly RawSegment[]
- public readonly encodingCharacters: EncodingCharacters

From src/parser/types.ts:
- EncodingCharacters { field, component, repetition, escape, subcomponent: string }
- RawSegment { name: string; fields: readonly RawField[] }
  MSH convention: fields[0] = field separator placeholder,
                  fields[1] = encoding chars (MSH-2),
                  fields[2..] = MSH-3..N data fields.

From src/parser/index.ts:
- export function parseHL7(raw: string | Buffer, options?: ParseOptions | Profile | null): Hl7Message
  (consumed by round-trip tests; treats `\r`-separated input as canonical)

From src/index.ts:
- export { parseHL7 } from "./parser/index.js"
- export { Hl7Message } from "./model/message.js"
  (test files import from "../src/index.js" — NodeNext with .js extension)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement emitMessage body (MSH special-case + CR terminator + segment walker)</name>
  <files>src/serialize/to-string.ts, test/serialize-to-string.test.ts</files>
  <read_first>
    - src/serialize/to-string.ts (Plan 01 stub — replace body only; keep module JSDoc + import + signature)
    - src/serialize/emit-field.ts (Plan 01 output — confirm emitField + emitSegment signatures; note the MSH guard throw)
    - src/parser/types.ts (lines 148-238 — EncodingCharacters + RawSegment fields[0]/fields[1] MSH conventions)
    - src/parser/delimiters.ts (readDelimiters — the inverse operation; understand how MSH-1/MSH-2 are PARSED so the INVERSE emission matches)
    - src/parser/escapes.ts (lines 127-158 — reescape signature; consumed transitively via emitField)
    - src/model/message.ts (confirm rawSegments + encodingCharacters are public readonly)
    - .planning/phases/05-serialization-and-round-trip/05-CONTEXT.md §decisions D-01 (walk rawSegments), D-02 (field-internal trailing-empty strip ONLY — NOT segment-level fields), D-05 (CR terminator + trailing CR), D-06 (MSH-1/MSH-2 exact emission trace), D-07 (pure), D-08 (no MLLP), and §specifics "toString MSH emission trace"
    - .planning/phases/05-serialization-and-round-trip/05-PATTERNS.md "src/serialize/to-string.ts" section (lines 88-114 — readDelimiters inverse)
    - test/parser-public.test.ts (test convention — describe/it structured integration test)
  </read_first>
  <behavior>
    - On a minimal MSH-only message parsed from `"MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r"`:
      - toString returns a string starting with `"MSH|^~\\&|"` (literal backslash per JS — the HL7 escape char followed by & is "\\&" in source).
      - toString ends with `"\r"` (trailing CR per D-05).
      - toString has exactly ONE `\r` between segments (none in the minimal single-segment case; just one at end).
    - On the same message re-parsed then emitted: the second `toString()` is byte-identical to the first (idempotency from the second pass).
    - MSH-1 emission: for default enc (field="|"), the 4th character of the output is "|".
    - MSH-2 emission: for default enc (component="^", repetition="~", escape="\\", subcomponent="&"), output chars 5-8 are "^~\\&" (i.e. "^", "~", "\\", "&" as individual chars).
    - Between MSH-2 and MSH-3 there is exactly ONE enc.field char.
    - MSH-3 onward is emitted via `emitField` (not re-handled).
    - Non-MSH segments flow through `emitSegment` verbatim.
    - Multiple segments joined by `\r` with a trailing `\r`: for a 3-segment message, output has 3 segment bodies + 3 `\r` = ends with `\r`, and `split("\r")` yields 4 elements where the last is "" (empty trailing).
    - Custom encoding chars round-trip: for input parsed with `"MSH#@~\\&#..."` (field="#", component="@"), the emitted MSH uses the same characters.
    - D-08: `toString` output contains NO `\x0B`, `\x1C`, `\x1D` (MLLP bytes) even when input had MLLP framing.
    - Purity: `emitMessage` never throws on any parseable input; two back-to-back calls return identical strings.
    - Input `isNull` field in any position emits as literal `""` (2 chars).
    - Input with trailing-empty components/fields emits normalised output (trailing empty COMPONENTS / SUBCOMPONENTS inside a field are stripped by emitField; trailing empty FIELDS at the segment level are PRESERVED to maintain positional alignment).
    - **Trailing segment-level empty fields preserved (W3):** parsing `"PID|1|2|3||5||\r"` (fields 1-7 where 4, 6, 7 are empty) round-trips to exactly `"PID|1|2|3||5||\r"` — NOT `"PID|1|2|3||5\r"` (stripped form) — that would break HL7 positional semantics.
  </behavior>
  <action>
**Step A — Replace the body of `src/serialize/to-string.ts::emitMessage`:**

Open the file. Keep the module JSDoc header, the `import type { Hl7Message } from "../model/message.js";` line, and the `export function emitMessage(msg: Hl7Message): string {` signature. REMOVE the `throw new Error("emitMessage: NOT IMPLEMENTED ...")` line and replace with the implementation below. ADD the new import line for `emit-field.ts` right after the existing import.

Final shape of the file:

```typescript
/**
 * (Existing module JSDoc from Plan 01 — unchanged.)
 */

import type { Hl7Message } from "../model/message.js";
import { emitField, emitSegment } from "./emit-field.js";

/**
 * Emit a parsed `Hl7Message` as spec-clean HL7 (SER-01 + SER-05). Walks
 * `msg.rawSegments` verbatim (D-01). Inlines MSH-1 and MSH-2 from
 * `msg.encodingCharacters` per D-06. Joins segments with strict CR (`\r`)
 * and appends a trailing CR per D-05. Does NOT wrap in MLLP framing (D-08).
 *
 * Trailing-empty semantics: D-02's trailing-empty strip is field-SCOPED
 * (inside `emitField` — trailing empty repetitions/components/subcomponents
 * are stripped). At the SEGMENT level (inside `emitSegment`) trailing empty
 * fields are PRESERVED to maintain HL7 positional addressing. `emitMessage`
 * does not alter either behavior.
 *
 * Pure — never warns, never throws (D-07).
 *
 * @internal
 */
export function emitMessage(msg: Hl7Message): string {
  const enc = msg.encodingCharacters;
  const segmentStrings: string[] = [];
  for (const seg of msg.rawSegments) {
    if (seg.name === "MSH") {
      segmentStrings.push(emitMshSegment(seg, enc));
    } else {
      segmentStrings.push(emitSegment(seg, enc));
    }
  }
  return segmentStrings.join("\r") + "\r";
}

/**
 * Emit the MSH segment with the D-06 special case: MSH-1 is `enc.field`
 * (one char, inlined immediately after "MSH"), MSH-2 is
 * `enc.component + enc.repetition + enc.escape + enc.subcomponent`
 * (4 chars, fixed order), and MSH-3..N use the normal emitField path
 * joined by `enc.field`.
 *
 * This is the exact inverse of Phase 2 `readDelimiters`:
 *  - readDelimiters reads  `firstSegment.charAt(3)` as the field separator
 *    and `firstSegment.slice(4, 8)` as MSH-2;
 *  - emitMshSegment writes `"MSH" + enc.field + <MSH-2 chars> + enc.field + <rest>`.
 *
 * Trailing empty fields in MSH-3..N are PRESERVED (W3) — no trimming of
 * the `tailParts` array before joining.
 *
 * @internal
 */
function emitMshSegment(
  seg: import("../parser/types.js").RawSegment,
  enc: import("../parser/types.js").EncodingCharacters,
): string {
  // MSH-2 literal chars (D-06 fixed order).
  const msh2 = enc.component + enc.repetition + enc.escape + enc.subcomponent;
  // MSH-3..N: fields[2..N] via emitField, joined by enc.field.
  // W3: trailing empty fields preserved — do NOT pop trailing "" off tailParts.
  const tailParts: string[] = [];
  for (let i = 2; i < seg.fields.length; i++) {
    const f = seg.fields[i];
    tailParts.push(f === undefined ? "" : emitField(f, enc));
  }
  const tail = tailParts.join(enc.field);
  // D-06 exact emission trace:
  // "MSH" + enc.field + enc.component + enc.repetition + enc.escape +
  //   enc.subcomponent + enc.field + <tail>
  //   = "MSH" + enc.field + msh2 + enc.field + tail
  return "MSH" + enc.field + msh2 + enc.field + tail;
}
```

**Notes on the MSH special case:**

1. `seg.fields[0]` is the field-separator placeholder (parser convention per `RawSegment.fields` JSDoc) — NOT emitted here; the char is already inlined as `enc.field` between "MSH" and MSH-2.
2. `seg.fields[1]` is MSH-2 (encoding chars) — NOT emitted via emitField; we emit the literal 4 chars from `enc.*`.
3. `seg.fields[2]` onward is MSH-3, MSH-4, ... — emitted via `emitField` joined by `enc.field`. This is symmetric with emitSegment's loop starting from `i = 1`, offset by the MSH-specific skip of fields[1].
4. Trailing CR (`+ "\r"`) at the end of the return expression covers the last segment — matches D-05 ("strict CR between every pair of segments plus one trailing CR at end of output").
5. **Segment-level trailing empty fields preserved (W3):** `emitSegment` in Plan 01 already preserves trailing `""` entries in its `parts` array (it pushes every field position with no trimming). `emitMshSegment` matches that semantic for MSH. Downstream code that addresses fields by HL7 position (e.g. `msg.get("PID.7")`) depends on this.

**Step B — Create `test/serialize-to-string.test.ts`:**

Convention: Vitest describe/it, import `parseHL7` and `Hl7Message` from `../src/index.js`, include a FIXTURE const for the happy path + explicit hand-built `Hl7Message` instances for MSH-only and encoding-char edge cases.

Required test cases:

**Block 1: MSH special-case emission (D-06)**
1. "MSH-1 emits enc.field immediately after 'MSH'" — parse `"MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\r"` then check `msg.toString().charAt(3) === "|"`.
2. "MSH-2 emits enc.component+repetition+escape+subcomponent in fixed order" — with default enc, `msg.toString().slice(4, 8) === "^~\\&"` (4 chars in order).
3. "MSH-3 starts after enc.field separator" — `msg.toString().charAt(8) === "|"` then the next run of chars is MSH-3 = "A".
4. "custom encoding chars round-trip" — parse input with non-default delimiters (e.g. `"MSH#@~\\&#A#B#...\r"` where field="#", component="@"), confirm emitted MSH uses the same chars.

**Block 2: Segment terminator (D-05)**
5. "minimal single-segment message emits trailing \r exactly once" — `emitMessage` output of a 1-segment message ends with exactly one `\r` and has no embedded `\r`.
6. "multi-segment message joins with \r and trails with \r" — 3-segment input → output has exactly 3 `\r` characters, all at segment boundaries + end.
7. "input parsed from LF normalises to CR" — construct an Hl7Message whose rawSegments came from `"MSH|...\nPID|...\n"` input; emitted output uses `\r` only, no `\n`.
8. "input parsed from CRLF normalises to CR" — same as above with CRLF input.

**Block 3: Re-escape through (D-04, SER-05)**
9. "field with embedded | reescapes through emitField" — hand-build or parse a message where a PID field subcomponent contains a value that was `\F\` on input; the `Field.value` (after parse) is the literal `|`; emit must produce `\F\` back.
10. "field with embedded \\n emits \\.br\\" — subcomponent containing a literal newline emits `\.br\` (since `reescape` translates `\n` → `\.br\`).
11. **"all 5 active delimiters round-trip" (W4 — explicit input shape)** — call `emitField` directly (not via `msg.toString()`) on hand-built RawFields so the input shape is unambiguous. For each of the 5 active delimiters (`|`, `^`, `~`, `\\`, `&` — corresponding to HL7 escapes `\F\`, `\S\`, `\R\`, `\E\`, `\T\`), build a RawField of exact shape:

    ```typescript
    const DELIM_CASES: ReadonlyArray<{ delim: string; expectedEscape: string }> = [
      { delim: "|",  expectedEscape: "\\F\\" },
      { delim: "^",  expectedEscape: "\\S\\" },
      { delim: "~",  expectedEscape: "\\R\\" },
      { delim: "\\", expectedEscape: "\\E\\" },
      { delim: "&",  expectedEscape: "\\T\\" },
    ];
    for (const { delim, expectedEscape } of DELIM_CASES) {
      const field: RawField = {
        repetitions: [
          { components: [{ subcomponents: ["a" + delim + "b"] }] },
        ],
        isNull: false,
      };
      // Import emitField from ../src/serialize/emit-field.js OR parse via
      // parseHL7 and inspect the emitted string. Preferred: direct call
      // because it isolates the re-escape from segment/MSH concerns.
      expect(emitField(field, DEFAULT_ENCODING_CHARACTERS)).toBe(
        "a" + expectedEscape + "b",
      );
    }
    ```

    The key property asserted: the embedded delimiter appears INSIDE a subcomponent string (not at a rep/comp/sub boundary), and `emitField` re-escapes it to the HL7 escape form while leaving the surrounding `"a"` and `"b"` literal. This nails down the D-04 chokepoint unambiguously.

**Block 4: isNull preservation (D-02)**
12. 'explicit "" null field round-trips' — parse a message with a field that is `""` (HL7 null) and confirm emit reproduces `""` in that position.
13. "absent field vs null distinct" — message with `||` (absent) emits `||`; message with `|""|` emits `|""|`.

**Block 5: Purity (D-07)**
14. "never throws on any parseable input" — wrap `emitMessage(msg)` in `expect().not.toThrow()` for 3 diverse inputs (minimal, complex, with escapes).
15. "deterministic" — two back-to-back `msg.toString()` calls return identical strings.
16. "does not mutate msg" — snapshot `msg.rawSegments` JSON, call toString, re-snapshot; compare deeply equal.
17. "toString is pure on repeat calls" — after calling toString then mutating `msg.setField(...)`, then calling toString again, the output reflects the mutation (proves no stale cache, per D-30).

**Block 6: No MLLP (D-08)**
18. "no MLLP bytes on output even when input was MLLP-framed" — parse input with `\x0B` and `\x1C\x0D` framing (Phase 2 stripMllp is on by default); confirm emitted output has none of those bytes.

**Block 7: D-03 idempotency (byte-identical from second pass)**
19. "second pass is byte-identical to first" — `const once = parseHL7(raw).toString(); const twice = parseHL7(once).toString(); expect(twice).toBe(once);` — pick 2 fixtures (canonical ADT + one with MLLP framing) and run both through.

**Block 8: Trailing segment-level empty fields preserved (W3)**
20. "trailing empty fields at segment level preserved — PID with mid/trail empties" — parse input `"MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5\rPID|1|2|3||5||\r"` (PID has 7 fields: 1, 2, 3, empty, 5, empty, empty). Assert `msg.toString()` contains the literal substring `"PID|1|2|3||5||\r"` — every trailing delimiter preserved. Do NOT expect `"PID|1|2|3||5\r"` (stripped form) — that would break HL7 positional semantics.
21. "trailing empty fields preserved on MSH-3..N" — parse `"MSH|^~\\&|A|B|C|D|20260419|||MSG1|P|2.5|||\r"` (with 3 trailing empty fields after version 2.5). Assert the emitted MSH line preserves those 3 trailing `|` chars before the CR.
22. "segment with trailing empty fields after non-empty content — structural round-trip" — build input where PID-7 is present and PID-8/9/10 are empty. After `parseHL7(msg.toString())`, assert `rawSegments.find(s=>s.name==='PID')?.fields.length === 11` (placeholder + 10 HL7 positions — i.e. the trailing empties produce RawField entries on re-parse).

Run `pnpm typecheck`, `pnpm lint src/serialize`, `pnpm test -- serialize-to-string`.
  </action>
  <verify>
    <automated>pnpm test -- serialize-to-string.test.ts 2>&amp;1 | tail -40 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint src/serialize test/serialize-to-string.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q 'throw new Error("emitMessage: NOT IMPLEMENTED' src/serialize/to-string.ts` returns NO matches (stub has been replaced)
    - `grep -q 'import { emitField, emitSegment } from "./emit-field.js"' src/serialize/to-string.ts` succeeds
    - `grep -q "msg.encodingCharacters" src/serialize/to-string.ts` succeeds
    - `grep -q 'segmentStrings.join("\\\\r")' src/serialize/to-string.ts || grep -q "segmentStrings.join(.\\\\r" src/serialize/to-string.ts` — output joins with \r
    - `grep -q '"MSH" + enc.field' src/serialize/to-string.ts` succeeds (D-06 trace)
    - `grep -q "enc.component + enc.repetition + enc.escape + enc.subcomponent" src/serialize/to-string.ts` succeeds (D-06 MSH-2 chars order)
    - `test -f test/serialize-to-string.test.ts` succeeds
    - `grep -q "trailing empty" test/serialize-to-string.test.ts` succeeds (W3 test case present)
    - `grep -q "DELIM_CASES\|expectedEscape" test/serialize-to-string.test.ts` succeeds (W4 explicit input-shape test present)
    - `pnpm test -- serialize-to-string.test.ts` exits 0 with >= 22 test cases passing
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint src/serialize test/serialize-to-string.test.ts` exits 0 with zero warnings
  </acceptance_criteria>
  <done>emitMessage body implemented per D-01/D-05/D-06/D-07/D-08; trailing segment-level empty fields preserved per W3; 5-delimiter reescape test uses explicit input shape per W4; unit test suite (>= 22 cases) green; SER-01 + SER-05 closed at the unit-test layer.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create 5 round-trip fixtures + SER-02 structural-equivalence sweep</name>
  <files>test/round-trip.test.ts, test/fixtures/round-trip/canonical-adt-a01.hl7, test/fixtures/round-trip/oru-r01-repetitions.hl7, test/fixtures/round-trip/null-fields.hl7, test/fixtures/round-trip/embedded-delimiters.hl7, test/fixtures/round-trip/decoded-br.hl7</files>
  <read_first>
    - src/serialize/to-string.ts (Task 1 output — confirm emitMessage body exists and works)
    - src/parser/index.ts (parseHL7 signature — consumed in the sweep)
    - src/model/message.ts (rawSegments + encodingCharacters — the SER-02 equivalence targets)
    - test/parser-public.test.ts (structured integration test convention)
    - test/model-mutation.test.ts (inline FIXTURE const style)
    - .planning/phases/05-serialization-and-round-trip/05-CONTEXT.md §decisions D-03 (structural — not byte — equivalence), §specifics "Round-trip test fixture strategy" (the 5 fixture shapes)
    - .planning/phases/05-serialization-and-round-trip/05-PATTERNS.md "test/round-trip.test.ts + test/fixtures/round-trip/*" section (fixture directory convention + assertStructuralEquivalence helper)
  </read_first>
  <behavior>
    - All 5 fixture files exist under `test/fixtures/round-trip/`.
    - Every fixture uses `\r` as segment terminator and ends with `\r` (so `readFileSync(..., "utf8")` preserves them verbatim).
    - `parseHL7(raw)` succeeds on every fixture (no throw; no warnings are asserted — just structural parse).
    - `parseHL7(parseHL7(raw).toString())` has `rawSegments` deeply equal to `parseHL7(raw).rawSegments` for every fixture.
    - `parseHL7(...).encodingCharacters` is preserved structurally (same 5 fields, same values).
    - Idempotency: `parseHL7(parseHL7(raw).toString()).toString() === parseHL7(raw).toString()` byte-for-byte.
    - `null-fields.hl7` exercises `isNull === true` preservation: at least one field in at least one segment is the literal `""`; after round-trip, that field's `isNull` is `true`.
    - `embedded-delimiters.hl7` exercises all 5 escape sequences (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`) — at least one subcomponent per escape form; after round-trip, the decoded `Field.value` strings are identical to the original.
    - `decoded-br.hl7` exercises `\.br\` in at least one OBX-5: after round-trip the decoded value contains the literal `\n` character in the same position.
    - `oru-r01-repetitions.hl7` exercises at least one field with multiple `~`-separated repetitions; after round-trip the repetition count is preserved.
    - `canonical-adt-a01.hl7` is a clean ADT^A01 message with MSH + EVN + PID + PV1 (no quirks — baseline).
  </behavior>
  <action>
**Step A — Create 5 fixture files.** Use `test/fixtures/round-trip/*.hl7`
(the `test/fixtures/` directory is NEW — Phase 7 will expand). Files are
ASCII text with `\r` segment terminators. Use a HEREDOC-safe editor that
preserves CR — or write the files via Node/TS helper script. Below each
fixture body is shown with literal escape sequences (replace `\r` with
the actual CR byte when writing to disk).

**1. `test/fixtures/round-trip/canonical-adt-a01.hl7`:**

```
MSH|^~\&|EPIC|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5\r
EVN|A01|20260419101500\r
PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101||^PRN^PH^^^617^5551212\r
PV1|1|I|ICU^101^A^HOSP|||||ATTEND^Smith^Jane^^^^MD|||||||||||VISIT001\r
```

**2. `test/fixtures/round-trip/oru-r01-repetitions.hl7`:**

```
MSH|^~\&|LAB|MAIN|EHR|REF|20260419101500||ORU^R01^ORU_R01|MSG00002|P|2.5\r
PID|1||MRN12345^^^HOSP^MR~SSN^^^USA^SS||Doe^John\r
OBR|1|ORD001|FLR001|CBC^Complete Blood Count^LN|||20260419080000\r
OBX|1|NM|WBC^White Blood Cells^LN||7.5|K/uL^^UCUM|4.0-11.0|N|||F\r
OBX|2|NM|HGB^Hemoglobin^LN||14.2|g/dL^^UCUM|12.0-16.0|N|||F\r
OBX|3|NM|HCT^Hematocrit^LN||42.1|%^^UCUM|37.0-47.0|N|||F\r
```

**3. `test/fixtures/round-trip/null-fields.hl7`:**

```
MSH|^~\&|SRC|FAC|DST|REF|20260419101500||ADT^A04|MSG00003|P|2.5\r
PID|1|""|MRN99999^^^HOSP^MR||Doe^Jane||19850601|F|""|""\r
```

(The `""` fields in PID-2, PID-9, and PID-10 are HL7 explicit nulls.)

**4. `test/fixtures/round-trip/embedded-delimiters.hl7`:**

```
MSH|^~\&|SRC|FAC|DST|REF|20260419101500||ADT^A08|MSG00004|P|2.5\r
PID|1||MRN77777^^^HOSP^MR||Smith\F\Jones^John\S\Public^Q\T\Roe^Jr\R\Sr^Dr\E\Prof||19700101|M\r
```

(Each XPN component contains one of the 5 escape forms. The decoded
`Field.value` should contain literal `|`, `^`, `&`, `~`, `\` respectively.)

**5. `test/fixtures/round-trip/decoded-br.hl7`:**

```
MSH|^~\&|LAB|MAIN|EHR|REF|20260419101500||ORU^R01|MSG00005|P|2.5\r
OBR|1|ORD002|FLR002|PATH^Pathology Report^LN|||20260419080000\r
OBX|1|TX|REPORT^Pathology Narrative^LN||Specimen received.\.br\Gross examination normal.\.br\Microscopic examination pending.||||F\r
```

(OBX-5 contains three `\.br\` sequences — after parse these become literal
`\n`; after round-trip via `reescape` they emit back as `\.br\`.)

**Writing the fixtures with real CR bytes:**

- Prefer `Write` tool with literal `\r` chars in the content. JS/TS
  literal `"\r"` in a Write call writes a CR byte. If editor tooling
  strips CR, fall back to a one-shot Node script:
  ```typescript
  // scripts/write-fixtures.ts (delete after use or leave in test/helpers)
  import { writeFileSync } from "node:fs";
  const f1 = ["MSH|...", "EVN|...", "PID|...", "PV1|..."].join("\r") + "\r";
  writeFileSync("test/fixtures/round-trip/canonical-adt-a01.hl7", f1);
  ```
- Verify by running `od -c test/fixtures/round-trip/canonical-adt-a01.hl7 | head` (or `file`) and confirming `\r` not `\n` appears between segments.

**Step B — Create `test/round-trip.test.ts`:**

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseHL7 } from "../src/index.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "round-trip",
);

function loadFixture(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, `${name}.hl7`), "utf8");
}

/**
 * SER-02 structural-equivalence helper.
 * D-03: compares `rawSegments` trees + `encodingCharacters` deeply. Byte
 * equivalence is NOT asserted on the first pass (MLLP/BOM/CRLF normalisation
 * may emit a different — but structurally equivalent — string).
 */
function assertStructuralRoundTrip(raw: string): void {
  const original = parseHL7(raw);
  const emitted = original.toString();
  const roundTripped = parseHL7(emitted);
  expect(roundTripped.rawSegments).toEqual(original.rawSegments);
  expect(roundTripped.encodingCharacters).toEqual(original.encodingCharacters);
}

/**
 * D-03 idempotency: byte-identical from second pass onward.
 */
function assertIdempotency(raw: string): void {
  const once = parseHL7(raw).toString();
  const twice = parseHL7(once).toString();
  expect(twice).toBe(once);
}

describe("round-trip: SER-02 structural-equivalence sweep", () => {
  const fixtures = [
    "canonical-adt-a01",
    "oru-r01-repetitions",
    "null-fields",
    "embedded-delimiters",
    "decoded-br",
  ];

  for (const name of fixtures) {
    it(`${name} round-trips structurally`, () => {
      assertStructuralRoundTrip(loadFixture(name));
    });

    it(`${name} is idempotent from second pass onward (D-03)`, () => {
      assertIdempotency(loadFixture(name));
    });
  }
});

describe("round-trip: specific correctness checks", () => {
  it("null-fields preserves RawField.isNull === true through round-trip", () => {
    const raw = loadFixture("null-fields");
    const original = parseHL7(raw);
    const roundTripped = parseHL7(original.toString());
    // PID-2, PID-9, PID-10 are "" nulls in the fixture.
    const pidOriginal = original.rawSegments.find((s) => s.name === "PID");
    const pidRound = roundTripped.rawSegments.find((s) => s.name === "PID");
    expect(pidOriginal).toBeDefined();
    expect(pidRound).toBeDefined();
    // Spot-check a known-null field (PID-2 = fields[2]):
    expect(pidOriginal?.fields[2]?.isNull).toBe(true);
    expect(pidRound?.fields[2]?.isNull).toBe(true);
  });

  it("embedded-delimiters preserves all 5 escape forms through round-trip", () => {
    const raw = loadFixture("embedded-delimiters");
    const original = parseHL7(raw);
    const roundTripped = parseHL7(original.toString());
    // Spot-check PID-5 (XPN) — each component's decoded value contains one
    // of the 5 literal delimiter chars.
    const pidOriginal = original.get("PID.5.1");
    const pidRound = roundTripped.get("PID.5.1");
    expect(pidRound).toBe(pidOriginal);
    expect(pidRound).toContain("|"); // from \F\
  });

  it("decoded-br emits \\n positions back as \\.br\\ on emit", () => {
    const raw = loadFixture("decoded-br");
    const original = parseHL7(raw);
    const emitted = original.toString();
    // After emit, OBX-5 should contain \.br\ (NOT literal \n) because
    // reescape translates \n -> \.br\.
    expect(emitted).toContain("\\.br\\");
    expect(emitted.includes("\n")).toBe(false); // no literal LF inside
    // Round-trip still structurally equivalent:
    assertStructuralRoundTrip(raw);
  });

  it("oru-r01-repetitions preserves repetition count", () => {
    const raw = loadFixture("oru-r01-repetitions");
    const original = parseHL7(raw);
    const roundTripped = parseHL7(original.toString());
    // PID-3 has 2 repetitions (MRN ~ SSN) in the fixture.
    const pidOriginal = original.rawSegments.find((s) => s.name === "PID");
    const pidRound = roundTripped.rawSegments.find((s) => s.name === "PID");
    expect(pidOriginal?.fields[3]?.repetitions.length).toBe(2);
    expect(pidRound?.fields[3]?.repetitions.length).toBe(2);
  });
});
```

Run `pnpm typecheck`, `pnpm lint test/round-trip.test.ts`, `pnpm test -- round-trip`.
  </action>
  <verify>
    <automated>pnpm test -- round-trip.test.ts 2>&amp;1 | tail -40 &amp;&amp; pnpm tsc --noEmit &amp;&amp; pnpm lint test/round-trip.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -d test/fixtures/round-trip` succeeds
    - All 5 fixture files exist: `test -f test/fixtures/round-trip/canonical-adt-a01.hl7 && test -f test/fixtures/round-trip/oru-r01-repetitions.hl7 && test -f test/fixtures/round-trip/null-fields.hl7 && test -f test/fixtures/round-trip/embedded-delimiters.hl7 && test -f test/fixtures/round-trip/decoded-br.hl7`
    - `grep -q 'MSH|' test/fixtures/round-trip/canonical-adt-a01.hl7` succeeds
    - Fixtures use CR terminators: `od -c test/fixtures/round-trip/canonical-adt-a01.hl7 | grep -q '\\r'` succeeds (or equivalent check — `\\n` should NOT appear mid-file as a segment terminator)
    - `test -f test/round-trip.test.ts` succeeds
    - `grep -q "assertStructuralRoundTrip" test/round-trip.test.ts` succeeds
    - `grep -q "expect.*rawSegments.*toEqual" test/round-trip.test.ts` succeeds
    - `pnpm test -- round-trip.test.ts` exits 0 with all fixtures passing structural + idempotency + specific checks (>= 14 cases)
    - `pnpm tsc --noEmit` exits 0
    - `pnpm lint test/round-trip.test.ts` exits 0 with zero warnings
    - Full suite: `pnpm test` exits 0 with zero failures
  </acceptance_criteria>
  <done>SER-02 round-trip sweep green across 5 canonical fixtures; structural equivalence + D-03 idempotency both proven; isNull preservation + 5-escape-forms round-trip + \.br\ emission + repetition preservation all spot-verified.</done>
</task>

</tasks>

<verification>
Run the full Phase 5 pipeline including Plan 01 primitives + Plan 02 additions:

```bash
pnpm tsc --noEmit   # strict TS passes
pnpm lint           # ESLint passes with zero warnings
pnpm test           # >= 517 tests pass (481 baseline after Plan 01 + >= 22 serialize-to-string + >= 14 round-trip)
pnpm build          # tsup emits dist/ with the populated emitMessage body in the bundle
```

Smoke-test from the built bundle (ESM):

```bash
node --input-type=module -e "
  const { parseHL7 } = await import('./dist/index.mjs');
  const raw = 'MSH|^~\\\\&|A|B|C|D|20260419|||MSG1|P|2.5\rPID|1||MRN001||Doe^John\r';
  const msg = parseHL7(raw);
  const out = msg.toString();
  const round = parseHL7(out);
  console.log('MSH equal:', JSON.stringify(round.rawSegments[0]) === JSON.stringify(msg.rawSegments[0]));
  console.log('Idempotent:', parseHL7(out).toString() === out);
"
```

Should print `MSH equal: true` and `Idempotent: true`.
</verification>

<success_criteria>
- `src/serialize/to-string.ts::emitMessage` body implemented per D-01/D-05/D-06/D-07/D-08 with trailing-empty-field preservation at segment level (W3).
- `test/serialize-to-string.test.ts` >= 22 cases green including W3 trailing-field-preservation coverage and W4 explicit-input-shape 5-delimiter reescape coverage.
- 5 fixtures under `test/fixtures/round-trip/` exercising: canonical ADT, ORU with repetitions, null fields, embedded delimiter escapes, `\.br\` newlines.
- `test/round-trip.test.ts` sweep asserts structural equivalence + D-03 idempotency for all 5 fixtures + specific preservation checks (isNull, escape forms, \.br\, repetitions).
- SER-01 (spec-clean emission), SER-02 (round-trip equivalence), SER-05 (re-escape on serialize) all closed.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all exit 0.
- Plan 02 touched ONLY `src/serialize/to-string.ts` (body-only) + new test files/fixtures — no edit to `src/model/message.ts`, `src/index.ts`, `src/serialize/emit-field.ts`, or any other plan's files.
</success_criteria>

<output>
After completion, create `.planning/phases/05-serialization-and-round-trip/05-02-SUMMARY.md` with:
- What shipped (emitMessage body; 5 round-trip fixtures; 2 new test files).
- REQ-IDs closed: SER-01, SER-02, SER-05.
- Decisions confirmed at runtime: D-01, D-05 (CR terminator), D-06 (MSH emission trace), D-07 (pure), D-08 (no MLLP), D-03 (idempotency from 2nd pass).
- Warnings addressed: W3 (trailing-field-preserve tests), W4 (explicit input-shape for 5-delimiter reescape).
- Files created (7: 2 tests + 5 fixtures) + modified (1: to-string.ts body).
- Test count before/after.
- Any deviations flagged for Plans 03/04/05.
</output>
</content>
