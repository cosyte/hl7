---
phase: 02-core-parser-and-tolerance
plan: 07
type: tdd
wave: 4
depends_on: [02-PLAN-02-input-normalization-mllp-and-charset, 02-PLAN-06-public-parsehl7-and-strict-mode]
files_modified:
  - src/parser/index.ts
  - src/parser/types.ts
  - src/parser/normalize.ts
  - test/parser-public.test.ts
autonomous: true
gap_closure: true
requirements: [PARSE-09]
tags: [gap-closure, charset, MSH-18, buffer-input, PARSE-09, two-pass-decode, wave-4]

must_haves:
  truths:
    - "A developer calling parseHL7(Buffer) with MSH-18 declaring ISO-8859-1 receives correctly decoded Latin-1 text."
    - "A developer supplying options.charset overrides MSH-18 auto-discovery; if the two disagree, ENCODING_MISMATCH is emitted."
    - "A developer passing a Buffer with no MSH-18 (empty or absent) still parses via UTF-8 default — no regression from pre-gap behaviour."
    - "A developer passing a Buffer with an unknown MSH-18 alias receives UNKNOWN_CHARSET + UTF-8 fallback (preserved from Plan 02)."
    - "A developer passing a Buffer with `\\n`-only line endings and MSH-18 declaring ISO-8859-1 receives correctly decoded Latin-1 text — the MSH-18 extractor is line-ending agnostic."
  artifacts:
    - path: "src/parser/index.ts"
      provides: "Two-pass Buffer decode: tentative UTF-8 → read MSH-18 → re-decode if declared charset differs. Honours options.charset override with ENCODING_MISMATCH on disagreement."
      contains: "resolveBufferCharset"
    - path: "src/parser/types.ts"
      provides: "ParseOptions.charset?: string escape hatch for vendors who misdeclare MSH-18."
      contains: "readonly charset?: string"
    - path: "src/parser/normalize.ts"
      provides: "Exports `mapHl7Charset` so `resolveBufferCharset` can compare override vs declared charset without duplicating the alias table."
      contains: "export function mapHl7Charset"
    - path: "test/parser-public.test.ts"
      provides: "End-to-end tests for MSH-18 auto-discovery, options.charset override, ENCODING_MISMATCH on disagreement, and `\\n`-only line-ending line-ending-agnostic extraction."
      contains: "describe(\"PARSE-09 — MSH-18 charset wiring\""
  key_links:
    - from: "parseHL7 (Buffer input)"
      to: "normalizeBuffer (2nd invocation with resolved charset)"
      via: "two-pass decode — tentative UTF-8 decode → parse MSH-18 from that decode → re-call normalizeBuffer with declared charset"
      pattern: "normalizeBuffer\\(raw,\\s*resolvedCharset"
    - from: "options.charset"
      to: "normalizeBuffer (charset argument)"
      via: "override precedence — if supplied, wins over MSH-18; emits ENCODING_MISMATCH when they disagree"
      pattern: "options\\.charset"
---

<objective>
Close the PARSE-09 gap by wiring MSH-18 character-set resolution into
`parseHL7`'s Buffer input path. The supporting helper (`normalizeBuffer`)
already understands the alias table and emits `UNKNOWN_CHARSET` — but
`parseHL7` never reads MSH-18 to drive the decoder. Ship a two-pass decode
(tentative UTF-8 → read MSH-18 → re-decode if declared charset differs)
and add a `ParseOptions.charset` override for vendors who misdeclare.
Honour override precedence: supplied `options.charset` wins over MSH-18;
emit `ENCODING_MISMATCH` only when they disagree.

Purpose: Phase 2's CONTEXT.md `<domain>` explicitly includes "Buffer input
with MSH-18 charset resolution (UTF-8 default, unknown → warn + UTF-8)" as
in-scope. The verifier found this as a `PARTIAL` satisfaction of PARSE-09
and gap-closure is mandatory before transitioning to Phase 3.

Output: A single-feature TDD plan with RED (failing e2e tests for Buffer
+ MSH-18 + ISO-8859-1 decode) → GREEN (wiring in `src/parser/index.ts`)
→ optional REFACTOR.
</objective>

<design_decision>
## Chose (c) — both override AND two-pass auto-discovery

The gap-closure brief offered three approaches: (a) two-pass auto-discovery
only, (b) `ParseOptions.charset` override only, (c) both. Chose (c).

**Rationale:**
- **Spec fidelity (two-pass):** MSH-18 is the HL7 spec's declared source of
  truth for payload encoding. A parser that ignores it fails PARSE-09 on
  any real cross-vendor traffic.
- **Real-world pragmatism (override):** Vendors routinely misdeclare MSH-18
  (declare UTF-8, ship Latin-1, or vice versa). Without an override, a
  developer has no escape hatch short of pre-decoding the Buffer manually —
  which defeats the point of shipping a Buffer entry at all.
- **Minimum surface:** One new optional field on `ParseOptions`
  (`charset?: string`) plus one private helper (`resolveBufferCharset`)
  inside `src/parser/index.ts`. No new public factories, no new warning
  codes (`ENCODING_MISMATCH` already exists from Plan 01).
- **Precedence rule (locked):**
  1. If `options.charset` is supplied → use it.
  2. Else read MSH-18 from tentative UTF-8 decode → if present and
     resolvable, use it.
  3. Else → default UTF-8.
  4. When both `options.charset` AND MSH-18 are supplied AND they disagree
     after normalization through `mapHl7Charset`, emit `ENCODING_MISMATCH`
     with detail naming both labels; override still wins.

**Two-pass mechanics:** MSH-1 through MSH-18 are always 7-bit ASCII in
real traffic (delimiters, segment names, charset identifiers), so a
tentative UTF-8 decode reliably surfaces MSH-18. The worst case — input
is pure MSH-18=UTF-16 with surrogate payload — would garble the tentative
decode, but MSH-18 itself would still be ASCII-readable and the second
pass fixes the payload. This is the same approach used by HAPI and
nhapi-dotnetcore.

**What this does NOT do:**
- No BOM-based charset sniffing (UTF-16 BOM → force UTF-16). MSH-18 is
  the canonical signal; BOM-sniffing is a Phase 7+ robustness add.
- No partial-decode-on-failure (we trust TextDecoder not to throw on
  known aliases; the `try/catch` already lives in `normalizeBuffer`).
</design_decision>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md
@.planning/phases/02-core-parser-and-tolerance/02-VERIFICATION.md
@.planning/phases/02-core-parser-and-tolerance/02-02-SUMMARY.md
@.planning/phases/02-core-parser-and-tolerance/02-06-SUMMARY.md

@src/parser/index.ts
@src/parser/normalize.ts
@src/parser/types.ts
@src/parser/warnings.ts

<interfaces>
<!-- Contracts the executor uses. Extracted from the codebase — do NOT re-explore. -->

From `src/parser/normalize.ts`:
```ts
// Accepts an optional charset alias; unknown aliases emit UNKNOWN_CHARSET
// via `emit` and fall back to UTF-8. Already handles the alias table
// (`UNICODE UTF-8`, `8859/1`, `ISO-8859-1`, `8859/15`, `ISO-8859-15`,
// `ASCII`, `US-ASCII`). Do NOT re-implement the alias mapping — call
// `normalizeBuffer` twice if needed.
export function normalizeBuffer(
  input: Buffer,
  charset: string | undefined,
  emit: (warning: Hl7ParseWarning) => void,
): string;
```

From `src/parser/warnings.ts`:
```ts
// Factory already exists (Plan 01) — do NOT add a new factory.
export function encodingMismatch(
  position: Hl7Position,
  detail: string,
): Hl7ParseWarning;
```

From `src/parser/types.ts` (current):
```ts
export interface ParseOptions {
  readonly strict?: boolean;
  readonly onWarning?: OnWarningCallback;
  readonly dateFormats?: readonly string[];
  readonly stripMllpFraming?: boolean;
  readonly trimFields?: boolean;
  readonly profile?: Profile | null;
  // ADD: readonly charset?: string;
}
```

From `src/parser/index.ts` (current call site — lines 202-211):
```ts
const bufferWarnings: Hl7ParseWarning[] = [];
const bufferEmit = (w: Hl7ParseWarning): void => { bufferWarnings.push(w); };
let text: string;
if (typeof raw === "string") {
  text = raw;
} else {
  text = normalizeBuffer(raw, undefined, bufferEmit);
  //                          ^^^^^^^^^ — THIS is the gap. Must become:
  //                          resolveBufferCharset(raw, options, bufferEmit)
}
```

From `src/parser/index.ts` (`OPTIONS_ONLY_KEYS` — line 39):
```ts
const OPTIONS_ONLY_KEYS: readonly (keyof ParseOptions)[] = [
  "strict", "onWarning", "dateFormats", "stripMllpFraming", "trimFields", "profile",
  // ADD: "charset",
];
```
</interfaces>

<msh18_extraction>
<!-- Minimal MSH-18 reader spec for `resolveBufferCharset`. -->

MSH-18 is the 18th field of the MSH segment. Following the unified
1-indexed convention locked in Plan 03: `fields[0]` = separator
placeholder, `fields[1]` = MSH-2 (encoding chars), ..., `fields[18]` =
MSH-18 (charset).

For the TENTATIVE decode the helper does NOT need the full tokenizer —
just:
1. **Split on `/[\r\n]/` (LINE-ENDING AGNOSTIC — take the first
   segment).** Using `\r` alone would silently fail on Unix-style
   `\n`-only Buffer traffic: the entire message would become segment 0,
   `startsWith("MSH")` would still pass, and `parts[17]` would leak
   subsequent segments (e.g. `…\nPID|…`) into the MSH-18 token —
   producing an unknown-looking charset string and silently falling
   back to UTF-8 even when MSH-18 legitimately declares a non-UTF-8
   alias. This is a Postel's Law violation against T-02-07-01 and a
   silent PARSE-09 regression. The split MUST treat either `\r` OR `\n`
   as a segment boundary during the tentative pass. (The downstream
   `normalize()` still canonicalizes line endings in the second pass —
   the regex split is only for this shallow, liberal first-pass
   extraction.)
2. Confirm the first chunk starts with `"MSH"`.
3. Split segment 0 on the field separator (char at index 3, `|` by default).
4. Take parts[17] (because MSH's field-separator character itself is in
   parts[1] under the raw split — the off-by-one against the tokenizer's
   1-indexed convention is well-known and documented in Plan 03's summary).
5. Return the trimmed string, or `undefined` if parts[17] is missing/empty.

Do NOT call the full `tokenize` here — it would require `readDelimiters`
which could throw on a malformed MSH, defeating the "tentative" nature
of the first pass. Keep the MSH-18 extractor shallow and defensive: on
ANY failure (no segment boundary, segment != "MSH", parts[17] empty),
return `undefined` and let the second pass fall through to UTF-8.

**MLLP-framing note:** If the raw Buffer carries MLLP framing
(`\x0B` prefix, `\x1C\x0D` suffix), the tentative decode starts with
`\x0B` so the `startsWith("MSH")` check fails and the extractor returns
`undefined`. MSH-18 is then silently ignored and the Buffer path falls
back to UTF-8. This is an accepted limitation (see threat T-02-07-05 —
the current pipeline orders Buffer decode BEFORE MLLP strip, and
reordering that is out of scope for this gap-closure plan). Test 8
below pins this behaviour so future work has a known anchor.
</msh18_extraction>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Wire MSH-18 charset resolution (RED → GREEN)</name>
  <files>src/parser/index.ts, src/parser/types.ts, src/parser/normalize.ts, test/parser-public.test.ts</files>
  <behavior>
    End-to-end behaviours to pin (tests MUST be written first and MUST
    fail against the current `src/parser/index.ts`):

    1. **MSH-18 auto-discovery (two-pass) — ISO-8859-1 payload:**
       - Build a raw message whose MSH-18 = `ISO-8859-1` and whose PID-5
         carries a Latin-1-only character (e.g. `Ü` = byte `0xDC`).
       - `Buffer.from(raw, "latin1")` → `parseHL7(buf)` → the parsed
         `msg.segments[1].fields[5]` must contain the correctly decoded
         `"Ü"` character, NOT a mojibake replacement.
       - `msg.warnings` contains NO `UNKNOWN_CHARSET` (alias is known)
         and NO `ENCODING_MISMATCH` (no override supplied).

    2. **options.charset override (no MSH-18 conflict):**
       - Same message as above but with MSH-18 empty.
       - `parseHL7(buf, { charset: "ISO-8859-1" })` decodes correctly.
       - `msg.warnings` has 0 charset-related warnings.

    3. **options.charset DISAGREES with MSH-18 → ENCODING_MISMATCH:**
       - Build a Buffer whose MSH-18 = `ISO-8859-1`.
       - Pass `parseHL7(buf, { charset: "UTF-8" })`.
       - `msg.warnings` contains exactly one `ENCODING_MISMATCH` whose
         message names both `UTF-8` and `ISO-8859-1`.
       - The override wins: the decoded text reflects UTF-8 semantics.

    4. **options.charset + MSH-18 AGREE (after alias mapping) → no
       ENCODING_MISMATCH:**
       - MSH-18 = `UNICODE UTF-8`, `options.charset = "UTF-8"`.
       - `mapHl7Charset` normalizes both to `"utf-8"` → no mismatch
         warning.
       - Pin this so the factory isn't over-eager on synonym pairs.

    5. **Unknown MSH-18 (guaranteed-unknown label) with no override:**
       - Buffer MSH-18 = `INVALID-CHARSET-XYZ` (NOT `CP1252` — some
         Node versions add `cp1252` to TextDecoder, which would make
         that label flaky across Node 18 / 20 / 22+). The chosen label
         is not in the alias whitelist and guaranteed not a Node
         `TextDecoder`-known label on any Node 18+ build.
       - `parseHL7(buf)` decodes as UTF-8, emits exactly one
         `UNKNOWN_CHARSET`, no `ENCODING_MISMATCH`.

    6. **Regression: Buffer without MSH-18 (empty field) → UTF-8
       default, no warnings.**
       - Existing behaviour must not regress.

    7. **Regression: String input unchanged.**
       - `parseHL7(string)` path does not invoke any charset resolution.
       - No new warnings on well-formed string input.

    8. **`\n`-only line endings + MSH-18=ISO-8859-1 → correct
       Latin-1 decode, no UNKNOWN_CHARSET (line-ending-agnostic
       extractor).**
       - Build the same message as case 1 but join segments with
         `\n` (Unix style) instead of `\r`.
       - `Buffer.from(raw, "latin1")` → `parseHL7(buf)` → PID-5 still
         decodes to `"Ü"` correctly.
       - `msg.warnings` contains NO `UNKNOWN_CHARSET` — the extractor
         MUST split on `/[\r\n]/` and correctly isolate the MSH
         segment from the tentative UTF-8 decode regardless of line
         ending. Without this test, a regression back to `split("\r")`
         would silently misbehave (whole message → segment 0 →
         `parts[17]` includes `\nPID|…`, producing a garbage charset
         string that falls through to UTF-8 and loses Latin-1
         decoding).

    9. **MLLP-wrapped Buffer + non-UTF-8 MSH-18 → documented fallback
       behaviour (UTF-8, no crash).**
       - Build the case 1 message and prefix/suffix it with MLLP frame
         bytes (`\x0B` + msg + `\x1C\x0D`).
       - `Buffer.from(framed, "latin1")` → `parseHL7(buf)` →
         tentative decode starts with `\x0B`, `startsWith("MSH")`
         fails, extractor returns `undefined`, Buffer path decodes as
         UTF-8. This is the pinned-known-limitation anchor for
         T-02-07-05 (MLLP ordering is out of scope here — future
         work owns it).
       - The test asserts that `parseHL7` does NOT throw and that the
         decode happens (even if mojibake). NO assertion on whether
         the Latin-1 byte round-trips correctly — the limitation is
         that it doesn't. The test's purpose is to pin behaviour so a
         future reordering of MLLP strip ↔ charset resolution
         surfaces as a deliberate test update, not a silent breakage.
  </behavior>
  <action>
    Follow the strict RED → GREEN TDD gate sequence. Two atomic commits.

    ## RED commit (`test(02-07): add failing tests for MSH-18 charset wiring`)

    1. Open `test/parser-public.test.ts`.
    2. Add a new `describe("PARSE-09 — MSH-18 charset wiring", () => {...})`
       block at the end of the file, containing the 9 cases enumerated
       in `<behavior>` above. Use `Buffer.from(raw, "latin1")` for the
       Latin-1 cases and `Buffer.from(raw, "utf-8")` for the override
       cases. Pull the Latin-1 byte assertion from the decoded
       `msg.segments[1].fields[5].repetitions[0].components[0].subcomponents[0]`
       — the full 1-indexed walk. Do NOT use `msg.get()` (Phase 3).
    3. Run `pnpm test -- --run parser-public` — the new 9 tests MUST fail
       (auto-discovery and override not yet wired; at minimum cases 1-5
       and 8 fail, cases 6/7/9 may pass by accident on the current
       fallback path — that's acceptable as long as the behaviour pin
       stays). The pre-existing 26 tests MUST still pass.
    4. Run `pnpm typecheck` — MUST pass (tests should be type-correct
       even though they fail at runtime).
    5. `git commit -m "test(02-07): add failing tests for MSH-18 charset wiring"`.

    ## GREEN commit (`feat(02-07): wire MSH-18 charset resolution into parseHL7`)

    1. **`src/parser/types.ts`** — add the override:
       ```ts
       export interface ParseOptions {
         // ...existing fields...
         /**
          * Override the character set used to decode Buffer input. When
          * supplied this wins over MSH-18 auto-discovery. When both are
          * supplied and they disagree (after alias normalization) the
          * parser emits ENCODING_MISMATCH and honours this override.
          * Ignored for `string` input.
          *
          * @example
          * parseHL7(buf, { charset: "ISO-8859-1" });
          */
         readonly charset?: string;
       }
       ```
       JSDoc + `@example` mandatory per `jsdoc/require-example`.

    2. **`src/parser/index.ts`** — update `OPTIONS_ONLY_KEYS`:
       ```ts
       const OPTIONS_ONLY_KEYS: readonly (keyof ParseOptions)[] = [
         "strict", "onWarning", "dateFormats",
         "stripMllpFraming", "trimFields", "profile", "charset",
       ];
       ```
       The discriminator must recognize a bare `{ charset: "..." }` as
       `ParseOptions` (not a `Profile`).

    3. **`src/parser/index.ts`** — add two private helpers:

       a. `extractMsh18FromTentativeDecode(tentativeText: string): string | undefined`
          — shallow MSH-18 reader per `<msh18_extraction>`. Do NOT call
          `tokenize` / `readDelimiters` (they can throw on malformed MSH).
          **Split on `/[\r\n]/`** (line-ending agnostic — MUST NOT use
          `split("\r")` alone; that regressions Unix-style `\n`-only
          Buffer input into a silent PARSE-09 failure per blocker B-2).
          Take the first chunk, check `startsWith("MSH")`, take char-at-3
          as separator, `.split(sep)`, return `parts[17]?.trim() ||
          undefined`. Defensive on every step — unknown shape →
          `undefined`.

       b. `resolveBufferCharset(raw: Buffer, options: ParseOptions, emit: EmitFn): string`
          — the wiring core. Flow:
          ```
          const override = options.charset;
          // Pass 1: tentative UTF-8 decode (cheap — same bytes cost as
          // final decode would be anyway for UTF-8 payloads).
          const tentative = new TextDecoder("utf-8").decode(raw);
          const declared = extractMsh18FromTentativeDecode(tentative);
          if (override !== undefined && declared !== undefined) {
            const overrideNorm = mapHl7Charset(override);
            const declaredNorm = mapHl7Charset(declared);
            if (overrideNorm !== declaredNorm) {
              emit(encodingMismatch(
                { segmentIndex: 0 },
                `options.charset="${override}" disagrees with MSH-18="${declared}"`,
              ));
            }
            return normalizeBuffer(raw, override, emit);
          }
          if (override !== undefined) {
            return normalizeBuffer(raw, override, emit);
          }
          if (declared !== undefined && declared.length > 0) {
            return normalizeBuffer(raw, declared, emit);
          }
          return normalizeBuffer(raw, undefined, emit);
          ```
          `mapHl7Charset` is currently private to `normalize.ts`. Export
          it (or a shallow proxy like `normalizeCharsetAlias`) from
          `normalize.ts`; do not duplicate the alias table.

    4. **`src/parser/normalize.ts`** — export `mapHl7Charset`:
       - Change `function mapHl7Charset(raw: string): string` →
         `export function mapHl7Charset(raw: string): string`.
       - Add `@internal` JSDoc tag (it IS internal to the parser, but
         now crosses a module boundary).
       - `src/parser/normalize.ts` is now in `files_modified`
         (frontmatter fix — blocker B-1).

    5. **`src/parser/index.ts`** — replace the Buffer decode call site
       (currently `normalizeBuffer(raw, undefined, bufferEmit)` at ~line
       210). New code:
       ```ts
       } else {
         text = resolveBufferCharset(raw, options, bufferEmit);
       }
       ```
       Note: `options` is computed via `discriminateOptionsOrProfile` at
       the top of the function body — available in scope.

    6. **Ordering invariant (pin in a comment):** the charset resolution
       runs BEFORE the first `EMPTY_INPUT` check (step 2 in the current
       pipeline). This is correct because:
       - An empty Buffer → tentative decode → `""` → no MSH-18 → falls
         to UTF-8 → `normalizeBuffer` returns `""` → `EMPTY_INPUT` fires
         downstream.
       - `ENCODING_MISMATCH` and `UNKNOWN_CHARSET` are collected into
         `bufferWarnings` and forwarded AFTER the fatal checks pass
         (Plan 06's ordering invariant — do NOT break it).

    7. Run the full gate:
       - `pnpm typecheck` — MUST exit 0.
       - `pnpm lint --max-warnings=0` — MUST exit 0.
       - `pnpm test -- --run` — MUST be 13 files / (123 + 9) = 132 tests,
         all green.
       - `pnpm build` — MUST succeed (ESM + CJS + DTS).
    8. `git commit -m "feat(02-07): wire MSH-18 charset resolution into parseHL7"`.

    ## REFACTOR (only if warranted)
    If `resolveBufferCharset` grows past ~40 lines or introduces a
    testable sub-primitive, extract into a third helper. Otherwise skip
    the REFACTOR commit. Do NOT refactor unrelated code in this plan.

    ## Constraints (hard)
    - NO new public factories or warning codes.
    - NO changes to `Hl7Message`, `Hl7ParseError`, or any other model.
    - NO regex-heavy MSH-18 extraction — split-based only (Postel's Law:
      be liberal on malformed MSH during tentative decode). The one
      regex allowed is `/[\r\n]/` for the initial line-ending-agnostic
      segment split.
    - NO date handling (TOL-08 is explicitly deferred — see VERIFICATION
      override).
    - Zero runtime deps preserved — only `TextDecoder` and `Buffer` from
      Node stdlib (already imported).
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; pnpm lint --max-warnings=0 &amp;&amp; pnpm test -- --run &amp;&amp; pnpm build</automated>
  </verify>
  <done>
    - `src/parser/types.ts` declares `ParseOptions.charset?: string` with
      JSDoc + `@example`.
    - `src/parser/index.ts` invokes `resolveBufferCharset` on the Buffer
      path; `normalizeBuffer(raw, undefined, …)` no longer appears.
    - `OPTIONS_ONLY_KEYS` includes `"charset"`.
    - `mapHl7Charset` exported from `src/parser/normalize.ts` (used by
      `resolveBufferCharset` for override-vs-declared comparison).
    - `extractMsh18FromTentativeDecode` splits on `/[\r\n]/` — NOT
      `split("\r")` alone — so `\n`-only Buffer traffic resolves MSH-18
      correctly.
    - `test/parser-public.test.ts` `PARSE-09 — MSH-18 charset wiring`
      describe block has 9 green tests covering auto-discovery, override,
      disagreement, alias-synonym agreement, unknown charset (with
      guaranteed-unknown `INVALID-CHARSET-XYZ` label — NOT `CP1252`),
      empty MSH-18 regression, string-input regression, `\n`-only
      line-ending-agnostic extraction, and MLLP-wrapped fallback.
    - Full gate passes: typecheck=0, lint=0 warnings, 132+ tests green,
      build ESM+CJS+DTS success.
    - RED and GREEN commits exist in the git log in that order with the
      specified messages.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Untrusted Buffer → decoded string | Bytes from an unknown wire source cross into the parser string space; MSH-18 is attacker-controlled. |
| `options.charset` string → `TextDecoder` | Developer-controlled but forwarded to stdlib API. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-07-01 | Tampering | MSH-18 from tentative decode | mitigate | Shallow split-based extractor; never calls `tokenize`/`readDelimiters`; any malformed input → `undefined` (falls through to UTF-8). **Line-ending agnostic:** splits on `/[\r\n]/` to correctly isolate segment 0 regardless of `\r`, `\n`, or `\r\n` raw Buffer style (prevents the Unix-input silent PARSE-09 regression blocker B-2 caught). Unknown aliases → `UNKNOWN_CHARSET` warning + UTF-8 fallback (already implemented in `normalizeBuffer`). |
| T-02-07-02 | DoS | `TextDecoder` on maliciously large Buffer | accept | Bounded by caller's input-size policy (parser has no size cap — this is a documented TOL-* boundary). Phase 7+ can add an input-size limit option if needed. |
| T-02-07-03 | Information Disclosure | `ENCODING_MISMATCH` message echoes both the `options.charset` and MSH-18 strings | mitigate | Both strings originate from the caller or the parsed payload — no secrets introduced by the parser. Message template is bounded to those two tokens plus fixed English prose. Document the echo in the factory's JSDoc (already does: "detail" parameter). |
| T-02-07-04 | Spoofing | Malicious MSH-18 declaring a legitimate but wrong charset (declares UTF-8, ships garbage) | accept | By design — the library cannot second-guess a declared charset. `options.charset` override is the documented escape hatch; `ENCODING_MISMATCH` surfaces the disagreement when both are supplied. |
| T-02-07-05 | Tampering | MLLP-framed Buffer with non-UTF-8 MSH-18 | accept | The current pipeline orders Buffer decode BEFORE MLLP strip; a Buffer whose raw bytes start with `\x0B` will cause the tentative decode to begin with `\x0B`, `startsWith("MSH")` fails in the shallow extractor, and MSH-18 is silently ignored (Buffer falls back to UTF-8). Accepted rather than reordered because (a) reordering would require MLLP strip to operate on raw bytes (not strings), which is a Phase 7+ architectural change, and (b) real-world MLLP traffic is typically pre-stripped by transport adapters before reaching this library. Test 9 pins the current behaviour as a known anchor so a future reordering surfaces as a deliberate test update rather than a silent behaviour change. |
</threat_model>

<verification>
Per-task automated verify runs the full 4-gate pipeline. Additionally:

1. Prove the RED gate fired correctly:
   ```bash
   git log --oneline | head -3
   # Must show: test(02-07) ... then feat(02-07) ...
   ```

2. Prove the MSH-18 extractor does NOT call `tokenize` / `readDelimiters`
   (Postel's Law — tentative decode must never throw):
   ```bash
   grep -n "tokenize\|readDelimiters" src/parser/index.ts
   # Must not appear within the `extractMsh18FromTentativeDecode` or
   # `resolveBufferCharset` function bodies.
   ```

3. Prove the Buffer decode call site changed:
   ```bash
   grep -n "normalizeBuffer(raw" src/parser/index.ts
   # Must not appear at the top-level parseHL7 body — only inside
   # resolveBufferCharset.
   ```

4. Prove `mapHl7Charset` is exported:
   ```bash
   grep -n "export function mapHl7Charset" src/parser/normalize.ts
   # Must show exactly one match.
   ```

5. Prove the MSH-18 extractor is line-ending agnostic (blocker B-2
   anti-regression gate — do NOT pin the literal `split("\r")`):
   ```bash
   grep -nE "extractMsh18FromTentativeDecode|split\(/\[\\\\r\\\\n\]/\)" src/parser/index.ts
   # Must show the helper defined AND the `/[\r\n]/` regex split used
   # inside it. A bare `.split("\r")` in the extractor body is a
   # blocker-B-2 regression.
   grep -n 'split("\\\\r")' src/parser/index.ts
   # Must NOT match inside extractMsh18FromTentativeDecode.
   ```
</verification>

<success_criteria>
Gap closure is complete when:

- [ ] PARSE-09 truth "Parser respects MSH-18 character set when set
      (Buffer input)" observable via `test/parser-public.test.ts`
      case 1 (ISO-8859-1 auto-discovery end-to-end).
- [ ] `options.charset` override works and is documented (JSDoc +
      `@example` on the `ParseOptions.charset` field).
- [ ] `ENCODING_MISMATCH` emitted exactly when override and MSH-18
      disagree after alias normalization — not on synonym pairs.
- [ ] `UNKNOWN_CHARSET` behaviour preserved (Plan 02 regression).
- [ ] `\n`-only line-ending Buffer input resolves MSH-18 correctly
      (case 8 — blocker B-2 anti-regression pin).
- [ ] MLLP-wrapped Buffer + non-UTF-8 MSH-18 behaviour pinned as
      accepted limitation (case 9 — T-02-07-05 anchor).
- [ ] Zero-regression on existing 123 tests; +9 new tests green.
- [ ] Four-gate pipeline green: typecheck, lint --max-warnings=0, test,
      build.
- [ ] Two atomic commits in order: RED (`test(02-07)`), GREEN
      (`feat(02-07)`). Optional REFACTOR only if extracted primitive
      adds testable value.
- [ ] Verifier re-run on `--gaps` produces `score: 19/19` with PARSE-09
      promoted from PARTIAL → VERIFIED (SC-5 / TOL-08 is handled by the
      deferral override in `02-VERIFICATION.md`).
</success_criteria>

<output>
After completion, create `.planning/phases/02-core-parser-and-tolerance/02-07-SUMMARY.md`
capturing:
- The chosen precedence rule and the rationale for approach (c).
- The exact `resolveBufferCharset` helper signature + 4-case flow.
- The `mapHl7Charset` export decision (versus duplicating the alias
  table).
- The 9 new test cases and what each pins (including the line-ending
  agnostic anti-regression pin for blocker B-2 and the MLLP-wrapped
  limitation anchor for T-02-07-05).
- RED + GREEN commit hashes.
- Phase 2 closing status: 19/19 REQ-IDs verified once this plan lands
  and the TOL-08 deferral override is in place.
</output>
