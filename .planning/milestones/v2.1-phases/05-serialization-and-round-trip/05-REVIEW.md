---
phase: 05-serialization-and-round-trip
reviewed: 2026-04-19T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - src/serialize/emit-field.ts
  - src/serialize/to-string.ts
  - src/serialize/to-json.ts
  - src/serialize/pretty-print.ts
  - src/builder/build-message.ts
  - src/builder/format-timestamp.ts
  - src/builder/control-id.ts
  - src/parser/tokenize.ts
  - src/model/message.ts
  - src/index.ts
  - vitest.config.ts
  - test/serialize-emit-field.test.ts
  - test/serialize-to-string.test.ts
  - test/serialize-to-json.test.ts
  - test/serialize-pretty-print.test.ts
  - test/round-trip.test.ts
  - test/builder.test.ts
  - test/builder-format-timestamp.test.ts
  - test/builder-control-id.test.ts
  - test/fixtures/round-trip/canonical-adt-a01.hl7
  - test/fixtures/round-trip/decoded-br.hl7
  - test/fixtures/round-trip/embedded-delimiters.hl7
  - test/fixtures/round-trip/null-fields.hl7
  - test/fixtures/round-trip/oru-r01-repetitions.hl7
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-04-19
**Depth:** standard
**Files Reviewed:** 24 (incl. 5 fixtures)
**Status:** issues_found

## Summary

Phase 5 shipped a tightly scoped emit + builder surface on top of a load-bearing Phase 2 tokenize deviation (unescape-on-parse). The implementation is clean, well-documented, and honors every CLAUDE.md guardrail at the structural level: zero runtime deps, strict TS with `noUncheckedIndexedAccess`, no `any`, no unjustified `as`, no `console.*`, immutable-by-default, JSDoc `@example` on every public export, and the planned coverage thresholds for `src/serialize/**` and `src/builder/**` are declared in `vitest.config.ts`.

The emit pipeline (`emit-field` → `to-string` / `to-json` / `pretty-print`) is genuinely pure for non-MSH inputs, composes through a single re-escape chokepoint (`emitField`), and the D-06 MSH special case is isolated and documented. The builder (`buildMessage` + `formatHl7Timestamp` + `generateControlId`) is a thin factory with good defensive validation.

The Rule-3 deviation — Phase 2 `tokenize.ts` now runs each subcomponent through `unescape()` so the raw tree stores decoded strings — is consistent across the codebase and backed by a strong round-trip test suite (5 fixtures × 2 assertions each = 10 structural + idempotency checks). The inverse symmetry (`unescape` at parse ↔ `reescape` at emit) is verified by `embedded-delimiters.hl7` and `decoded-br.hl7` fixtures covering all 5 active delimiters + `\.br\`.

Findings below are all non-blocking. No critical bugs, no security issues, no guardrail violations. Four warnings cover correctness edge cases around empty-segment emission, MSH-2/`encodingCharacters` drift, controlId collision under `Math.random()`, and the `compositeField` split behavior in `buildMessage`. Six info items are code-quality / doc-accuracy nits.

## Warnings

### WR-01: `emitMessage` emits a bare `"\r"` for an empty-segments message

**File:** `src/serialize/to-string.ts:42-53`
**Issue:** `emitMessage` joins `segmentStrings` with `"\r"` then unconditionally appends a trailing `"\r"`. When `msg.rawSegments` is empty (which the type system allows — `Hl7Message` can be constructed directly with `segments: []`, and `removeSegment` would let you reach near-empty states), the output is `"" + "\r" = "\r"` — a single bare CR with no segments. `parseHL7("\r")` will then hit `NO_MSH_SEGMENT`, so the round-trip fails for this synthetic case.

Parse-side protection (parser rejects construction without MSH) makes this unreachable from `parseHL7`, but `buildMessage` and direct `new Hl7Message({...})` callers can reach it. The guardrail says "serializer is conservative (always emits spec-clean HL7)." Emitting a bare `"\r"` that fails to round-trip is a mild spec-cleanness violation.

**Fix:** Either guard at the top of `emitMessage` (throw a typed error matching `emitSegment`'s MSH-guard pattern — "refusing to emit a message with zero segments"), or document the empty-segments case as undefined behavior on the `toString` JSDoc. The throw matches the D-06/D-07 "catch programmer misuse loudly at the call site rather than silently corrupting wire output" philosophy already used in `emitSegment`:

```ts
export function emitMessage(msg: Hl7Message): string {
  if (msg.rawSegments.length === 0) {
    throw new Error(
      "emitMessage: refusing to emit a message with zero segments. " +
        "Every HL7 message must contain at least an MSH segment.",
    );
  }
  // ...existing body
}
```

### WR-02: `emitMshSegment` silently ignores MSH-2 stored in `rawSegments[0].fields[1]` when it drifts from `msg.encodingCharacters`

**File:** `src/serialize/to-string.ts:72-88`
**Issue:** `emitMshSegment` reconstructs MSH-2 from `enc.component + enc.repetition + enc.escape + enc.subcomponent` rather than reading from `seg.fields[1]`. This is correct D-06 behavior for parsed messages (the parser guarantees these match), but for synthetic messages built via `new Hl7Message({...})` with mismatched `encodingCharacters` vs. `fields[1]` contents, the emit silently wins on `encodingCharacters` and discards the stored MSH-2 string. Round-trip still works (re-parse rebuilds `encodingCharacters` from the emitted MSH-2), but it's a surprising "ignore the raw tree" behavior that violates the general D-01 "walk `msg.rawSegments` verbatim" doctrine.

The same applies to `fields[0]` (the MSH-1 placeholder) — its content is ignored in favor of `enc.field`.

**Fix:** Document explicitly in the `emitMshSegment` JSDoc that `fields[0]` and `fields[1]` content is ignored — `encodingCharacters` is the single source of truth per D-06. Optionally add an invariant-assert-in-dev check that warns via the existing warnings channel when they diverge (though Phase 5's D-07 purity contract argues against that — leave the doc clarification):

```ts
/**
 * ... (existing docs)
 *
 * NOTE: `seg.fields[0]` and `seg.fields[1]` content is IGNORED — MSH-1 and
 * MSH-2 are emitted from `msg.encodingCharacters` per D-06. For parser-produced
 * messages these always match. For synthetic messages (direct `new Hl7Message`
 * construction) the burden is on the caller to keep `encodingCharacters`
 * aligned with the raw tree's MSH-1/MSH-2 placeholders.
 */
```

### WR-03: `generateControlId` uses `Math.random()` — collisions possible when >1 ID is generated within the same millisecond

**File:** `src/builder/control-id.ts:43-60`
**Issue:** The 17-char timestamp suffix is ms-precise; the 6-char suffix uses `Math.random()`. For callers that generate many IDs synchronously (e.g. a batch loop), two back-to-back calls can land in the same ms and the only differentiator is 6 random alphanumeric chars (62^6 ≈ 5.68×10^10). The test at `test/builder-control-id.test.ts:38-45` generates 100 IDs and asserts all distinct — probabilistically safe, but the probability is not 1.

The JSDoc calls out "strong enough for outbound test messages and small tools" and suggests high-uniqueness callers pass their own `controlId`, which is fair. But `Math.random()` is not cryptographically strong and could produce collisions under adversarial scheduling (many parallel workers all hitting `generateControlId()` in the same ms). Node 18+ has `crypto.randomBytes` / `crypto.randomUUID` in stdlib — zero-dep-compliant.

Per CLAUDE.md "Postel's Law: parser is liberal… serializer is conservative" — a conservative serializer should not produce duplicate controlIds under load.

**Fix:** Use `crypto.randomBytes(6)` mapped into the alnum alphabet (zero-deps; ships with Node's stdlib):

```ts
import { randomBytes } from "node:crypto";

// inside generateControlId:
const bytes = randomBytes(6);
let suffix = "";
for (let i = 0; i < 6; i++) {
  suffix += ALNUM_ALPHABET.charAt(bytes[i]! % ALNUM_ALPHABET.length);
}
```

(The `bytes[i]! % ALNUM_ALPHABET.length` has a mild modulo-bias — for 62 buckets from 256 it's negligible. If pedantic, switch to rejection sampling.)

Alternatively, bump the timestamp to nanosecond precision via `process.hrtime.bigint()`. Or simply document that `Math.random()` is not collision-proof and recommend caller-supplied controlIds for concurrent use — but the current JSDoc's "strong enough" phrasing undersells the risk.

### WR-04: `compositeField` in `buildMessage` splits `type` on `^` unconditionally — cannot represent a literal `^` in the message code

**File:** `src/builder/build-message.ts:268-275`
**Issue:** `compositeField(init.type)` splits on `^` and creates one component per part. This is correct for the standard shapes (`ADT^A01`, `ORU^R01^ORU_R01`), but means there is no way via `BuildMessageInit.type` to emit an MSH-9 where any component contains a literal `^` char — that's an unusual case (the HL7 spec forbids it in message codes), but a caller could hit it by accident with a weird custom profile.

More concretely: if a caller passes `type: "X"` (single component, no `^`), the split yields `["X"]` → one component, no trailing empties — fine. If they pass `type: "^A01"` (empty message code, only trigger), split yields `["", "A01"]` → MSH-9 emits as `^A01` which round-trips but is arguably malformed input that should be rejected.

The D-16 validation only checks `typeof === "string"` + non-whitespace. Passing `"   ^   "` passes the `.trim()` check but produces garbage.

**Fix:** Tighten D-16 validation to also reject strings whose trimmed components are all empty:

```ts
const parts = init.type.split("^");
if (parts.every((p) => p.trim().length === 0)) {
  throw new TypeError(
    `buildMessage: \`type\` must contain at least one non-empty component. ` +
      `Received: ${JSON.stringify(init.type)}.`,
  );
}
```

Or just document the constraint in the `BuildMessageInit.type` JSDoc: "the string is split on `^` into MSH-9 components; each component is emitted verbatim. Literal `^` characters in a component are not representable via this field."

## Info

### IN-01: `resolveTimestamp` in `buildMessage` passes user strings verbatim — no shape validation

**File:** `src/builder/build-message.ts:229-233`
**Issue:** When `init.timestamp` is a string, it's passed through to MSH-7 verbatim. A malformed string (e.g. `"not-a-date"` or one containing `|`, `^`, etc.) will corrupt the wire. This is the documented behavior per D-13 ("pre-formatted HL7 TS string passed through verbatim"), and the D-07 purity contract argues against throwing, but a cheap shape check (e.g. regex `/^\d{8,17}(\.\d{1,4})?([-+]\d{4})?$/`) would catch 99% of typos at a negligible cost.

**Fix:** Document more prominently in `BuildMessageInit.timestamp` JSDoc that callers bear responsibility for string shape. Or add a very loose validator that rejects obviously-bad strings (contains `|`, `^`, `~`, `\`, `&`).

### IN-02: `reescape` side-steps `^` → `\S\` when the serializer needs a literal `^` separator for MSH-9 composites

**File:** `src/builder/build-message.ts:268-275` + `src/parser/escapes.ts:145-158`
**Issue:** Splitting `type` on `^` in `compositeField` produces multiple components. On emit, `emitRepetition` joins them back with `enc.component`. The individual subcomponent strings (`"ADT"`, `"A01"`) contain no reserved chars, so `reescape` is a no-op and the output is clean `ADT^A01`. This is correct — but subtle, and worth a one-line comment in `compositeField` to explain why splitting on `^` works: because the individual parts are then emitted as separate components joined by the component delimiter, not as a single subcomponent that would get its `^` escaped.

**Fix:** Add a one-line comment to `compositeField` (`src/builder/build-message.ts:268-275`):

```ts
// Each split part becomes a separate RawComponent; the component delimiter
// is re-inserted by emitRepetition's join. If we built this as a single
// subcomponent with the raw `ADT^A01` string, reescape would convert `^` →
// `\S\` and emit `ADT\S\A01` (wrong — a single MSH-9 component containing
// the escape sequence).
```

### IN-03: `toJSON`'s `Mutable<T>` trick + `as SerializedMessage` cast

**File:** `src/serialize/to-json.ts:107-139`
**Issue:** The `Mutable<T>` type + `as SerializedMessage` cast on the return is a justified `as` (not an `any`), but it's the kind of thing CLAUDE.md wants flagged: it's working around `exactOptionalPropertyTypes` + readonly propagation. The workaround is correct and well-commented (`mirrors src/helpers/meta.ts::buildMeta`), just noting it as a place where the type system is being navigated explicitly.

**Fix:** No change needed — the comment at L106-107 already explains why. Optionally consider factoring the `Mutable<T>` + conditional-assign pattern into a tiny shared utility if it proliferates across the codebase (currently used in `buildMeta` + here, so not yet worth factoring).

### IN-04: `emitPrettyPrint`'s `buildHeaderLine` uses string concatenation over template literals for no clear reason

**File:** `src/serialize/pretty-print.ts:64-74`
**Issue:** `buildHeaderLine` builds the header via `"HL7 " + type + "  controlId=" + controlId + ...`. The same file uses template literals freely in tests. Style consistency nit — template literals would be marginally more readable:

```ts
return `HL7 ${type}  controlId=${controlId}  timestamp=${timestamp}  (${segCount} segments)`;
```

**Fix:** Purely stylistic; leave as-is if the concatenation was a perf micro-choice (no measurable difference on V8). Mentioning only for consistency.

### IN-05: JSDoc for `Hl7Message.toJSON` claims "Re-walks `rawSegments` on every call (D-30 no caching)" — verify `D-30` reference

**File:** `src/model/message.ts:460-462` + `src/serialize/to-json.ts:71`
**Issue:** Both JSDocs cite `D-30` for "no caching" / "each call re-walks `rawSegments`." The test at `test/serialize-to-json.test.ts:227-230` verifies this ("two calls return NEW references"). Just flagging that the decision registry reference should be checked against the final `05-CONTEXT.md` — this is a doc-accuracy concern, not a bug.

**Fix:** Spot-check `.planning/phases/05-serialization-and-round-trip/05-CONTEXT.md` D-30 and confirm it's "no caching / re-walk per call" and not a different decision. Trivial.

### IN-06: Round-trip fixture files have no trailing newline after the final `\r`

**File:** `test/fixtures/round-trip/*.hl7`
**Issue:** All 5 round-trip fixtures end with `\r` (no trailing `\n`). `readFileSync(path, "utf8")` returns the exact bytes. `parseHL7` tolerates this (correctly), and the tests work. Just noting that editor-normalizing these files (e.g. on a Windows CRLF autoconvert or a text-editor "add final newline" step) would silently introduce an `\n` after the last `\r` that would change the idempotency test's byte-exact assertion. Consider either `.gitattributes` pinning the fixtures to `binary` / `lf`, or adding a test that explicitly asserts the fixture's last char is `\r`.

**Fix:** Add to `.gitattributes`:
```
test/fixtures/**/*.hl7 binary
```

Or add an assertion in `test/round-trip.test.ts` that each fixture string ends with `\r` so a future normalization doesn't silently break the byte-identical idempotency test.

---

_Reviewed: 2026-04-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
