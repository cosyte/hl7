---
phase: 02-core-parser-and-tolerance
plan: 04
type: execute
wave: 2
depends_on: [02-PLAN-01]
files_modified:
  - src/parser/escapes.ts
  - test/parser-escapes.test.ts
autonomous: true
requirements: [PARSE-03, TOL-10]

must_haves:
  truths:
    - "A developer calling `unescape(input, enc, emit, position)` on a string containing `\\F\\` receives the field-separator character (`enc.field`) substituted in."
    - "A developer's `\\S\\`, `\\T\\`, `\\R\\`, `\\E\\`, `\\.br\\` sequences expand to component/subcomponent/repetition/escape characters and newline respectively."
    - "A developer's `\\X1A2B\\` hex escape expands to the corresponding Unicode code points (2 hex digits per code-point byte)."
    - "A developer's unknown `\\Z99\\` or invalid escape receives the verbatim original preserved in output AND a `UNKNOWN_ESCAPE_SEQUENCE` warning via emit."
    - "A developer calling `reescape(input, enc)` on an unescaped string receives a string where the 5 encoding chars and newline are re-escaped back into their `\\X\\` tokens (re-escape is round-trip-clean for Phase 5)."
  artifacts:
    - path: "src/parser/escapes.ts"
      provides: "Unescape on access + re-escape helpers"
      exports: ["unescape", "reescape"]
  key_links:
    - from: "src/parser/escapes.ts"
      to: "src/parser/warnings.ts"
      via: "calls unknownEscapeSequence factory for any sequence not in the known set"
      pattern: "unknownEscapeSequence\\("
    - from: "src/parser/escapes.ts"
      to: "src/parser/types.ts"
      via: "consumes EncodingCharacters to know which chars each escape expands to"
      pattern: "EncodingCharacters"
---

<objective>
Ship HL7 escape-sequence handling: `unescape` (parser-side, on-access) and `reescape` (serializer-side, used by Phase 5).

Purpose: HL7 reserves 5 delimiters (`| ^ ~ \ &`) and optionally newline (`\.br\`). When those characters appear inside field data, senders escape them with `\F\`, `\S\`, `\T\`, `\E\`, `\R\`, `\.br\`, `\X..\`, or vendor-specific `\Z..\`. The parser must round-trip these cleanly while warning on sequences it doesn't recognize (TOL-10).

Output:
- `src/parser/escapes.ts` — two pure functions sharing the escape map.
- Test file covering all 8 escape-sequence classes (`F`, `S`, `T`, `R`, `E`, `.br`, `X..`, `Z..`), invalid/unknown sequences, empty input, strings with no escapes (pass-through), and round-trip (`reescape(unescape(x)) === x`).
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

From src/parser/types.ts:
```typescript
export interface EncodingCharacters { readonly field: string; readonly component: string; readonly repetition: string; readonly escape: string; readonly subcomponent: string; }
export interface Hl7Position { readonly segmentIndex: number; readonly fieldIndex?: number; ... }
```

From src/parser/warnings.ts:
```typescript
export function unknownEscapeSequence(position: Hl7Position, sequence: string): Hl7ParseWarning;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/parser/escapes.ts with unescape + reescape</name>
  <files>src/parser/escapes.ts, test/parser-escapes.test.ts</files>
  <read_first>
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-CONTEXT.md (D-01 layered pipeline — escapes are their own module; Claude's Discretion notes escapes.ts ships both unescape and re-escape paths)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/phases/02-core-parser-and-tolerance/02-PATTERNS.md (section: "src/parser/escapes.ts" — full escape table: F/S/T/R/E/.br/X../Z..)
    - /home/nschatz/projects/cosyte/hl7-parser/.planning/REQUIREMENTS.md (PARSE-03 — all escape sequences; TOL-10 — unknown escapes preserved verbatim + warn)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/warnings.ts (unknownEscapeSequence factory signature)
    - /home/nschatz/projects/cosyte/hl7-parser/src/parser/types.ts (EncodingCharacters, Hl7Position)
    - /home/nschatz/projects/cosyte/hl7-parser/CLAUDE.md (short testable functions; no any; JSDoc @example required on exports; no console)
  </read_first>
  <behavior>
    - Test 1: `unescape("abc", defaultEnc, emit, pos)` returns `"abc"` unchanged and emits no warnings (pass-through).
    - Test 2: `unescape("a\\F\\b", enc, emit, pos)` returns `"a|b"` (the default field separator).
    - Test 3: `unescape("\\S\\\\T\\\\R\\\\E\\", enc, emit, pos)` returns `"^&~\\"` (component, subcomponent, repetition, escape — in that order).
    - Test 4: `unescape("line1\\.br\\line2", enc, emit, pos)` returns `"line1\nline2"` (newline character `\n`).
    - Test 5: `unescape("\\X0A\\", enc, emit, pos)` returns `"\n"` (hex → character; 2 hex digits → one byte/code-point in the 0x00–0xFF range).
    - Test 6: `unescape("\\X48656C6C6F\\", enc, emit, pos)` returns `"Hello"` (5 bytes → 5 ASCII chars).
    - Test 7: `unescape("\\Z99\\", enc, emit, pos)` returns `"\\Z99\\"` (preserved verbatim) AND emits exactly one `UNKNOWN_ESCAPE_SEQUENCE` warning with sequence `"Z99"`.
    - Test 8: `unescape("\\UNKNOWN\\", enc, emit, pos)` preserves verbatim + warns with sequence `"UNKNOWN"`.
    - Test 9: `unescape("a\\Xzz\\b", enc, emit, pos)` (invalid hex — non-hex chars) emits UNKNOWN_ESCAPE_SEQUENCE and preserves the `\\Xzz\\` verbatim.
    - Test 10: `unescape("a\\Xabc\\b", enc, emit, pos)` (odd-length hex) emits UNKNOWN_ESCAPE_SEQUENCE.
    - Test 11: `unescape("lonely \\ backslash", enc, emit, pos)` — an unterminated escape (no closing `\`) is left verbatim and warns once. (The implementation must not infinite-loop on unterminated sequences.)
    - Test 12: Custom encoding chars — `unescape("\\F\\", { field: "#", component: "$", repetition: "%", escape: "*", subcomponent: "@" }, emit, pos)` — CRITICAL: with a custom escape char `*`, the `\F\` sequence no longer uses `\` as the escape; it must be `*F*`. The `unescape` function uses `enc.escape` as the delimiter character. Verify: `unescape("a*F*b", customEnc, emit, pos)` returns `"a#b"`.
    - Test 13: `reescape("a|b", defaultEnc)` returns `"a\\F\\b"`.
    - Test 14: `reescape("|^~\\&", defaultEnc)` returns `"\\F\\\\S\\\\R\\\\E\\\\T\\"` (order-preserving for each delimiter per the re-escape loop: `|` → `\F\`, `^` → `\S\`, `~` → `\R\`, `\` → `\E\`, `&` → `\T\`; newline also rescaped via `\.br\`).
    - Test 15: Round-trip: for a random ASCII string with embedded delimiters, `reescape(s, enc)` produces output where every delimiter char is escaped, and `unescape(reescape(s, enc), enc, emit, pos)` returns `s` unchanged with zero warnings.
  </behavior>
  <action>
Create `src/parser/escapes.ts`.

File-level JSDoc: plain prose NOT starting with `@`. Example: "HL7 escape-sequence handling for the `@cosyte/hl7-parser` parser pipeline — expands reserved-delimiter escapes on parse, re-escapes them on serialize."

Imports:
```typescript
import { unknownEscapeSequence } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type { EncodingCharacters, Hl7Position } from "./types.js";
```

Core `unescape`:

```typescript
export function unescape(
  input: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  position: Hl7Position,
): string {
  const esc = enc.escape;
  // Fast path: no escape char present at all
  if (!input.includes(esc)) return input;

  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (ch !== esc) {
      out += ch;
      i++;
      continue;
    }
    // Find the closing escape char
    const close = input.indexOf(esc, i + 1);
    if (close === -1) {
      // Unterminated escape — preserve the rest verbatim, warn once, stop.
      emit(unknownEscapeSequence(position, input.slice(i)));
      out += input.slice(i);
      break;
    }
    const seq = input.slice(i + 1, close);
    const expanded = expandSequence(seq, enc);
    if (expanded !== null) {
      out += expanded;
    } else {
      // Unknown escape — preserve verbatim (with surrounding escape chars) and warn.
      emit(unknownEscapeSequence(position, seq));
      out += esc + seq + esc;
    }
    i = close + 1;
  }
  return out;
}

/** Expand a known escape body (the characters between two escape delimiters). Returns null if unknown. @internal */
function expandSequence(seq: string, enc: EncodingCharacters): string | null {
  if (seq === "F") return enc.field;
  if (seq === "S") return enc.component;
  if (seq === "T") return enc.subcomponent;
  if (seq === "R") return enc.repetition;
  if (seq === "E") return enc.escape;
  if (seq === ".br") return "\n";
  if (seq.startsWith("X")) {
    const hex = seq.slice(1);
    if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/u.test(hex)) return null;
    let decoded = "";
    for (let j = 0; j < hex.length; j += 2) {
      const byte = parseInt(hex.slice(j, j + 2), 16);
      decoded += String.fromCharCode(byte);
    }
    return decoded;
  }
  // \Z..\ is vendor-specific; Phase 2 does not maintain an allow-list, so every \Z..\ warns.
  // (A future Phase 6 profile can register its own \Z..\ handlers — out of scope here.)
  return null;
}
```

Core `reescape`:

```typescript
export function reescape(input: string, enc: EncodingCharacters): string {
  if (input.length === 0) return input;
  // Re-escape in the order: ESCAPE first (so subsequent replacements don't double-escape it),
  // then the other four delimiters, then newline.
  let out = "";
  for (const ch of input) {
    if (ch === enc.escape) out += enc.escape + "E" + enc.escape;
    else if (ch === enc.field) out += enc.escape + "F" + enc.escape;
    else if (ch === enc.component) out += enc.escape + "S" + enc.escape;
    else if (ch === enc.subcomponent) out += enc.escape + "T" + enc.escape;
    else if (ch === enc.repetition) out += enc.escape + "R" + enc.escape;
    else if (ch === "\n") out += enc.escape + ".br" + enc.escape;
    else out += ch;
  }
  return out;
}
```

JSDoc blocks with `@example` on `unescape` AND `reescape`. Example for `unescape`:

```typescript
/**
 * Expands HL7 escape sequences (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`, `\.br\`,
 * `\X..\`, vendor-specific `\Z..\`) inside a field / component / subcomponent
 * string. Uses the escape character from `enc.escape` (default `\\`).
 *
 * Unknown sequences are preserved VERBATIM in the output and emit an
 * `UNKNOWN_ESCAPE_SEQUENCE` warning via `emit`. Unterminated escapes are
 * preserved in full (no infinite loop) and also emit the warning.
 *
 * @example
 * ```ts
 * import { unescape, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7-parser";
 * unescape("a\\F\\b", DEFAULT_ENCODING_CHARACTERS, () => {}, { segmentIndex: 0 }); // "a|b"
 * ```
 */
export function unescape(...) { ... }
```

CRITICAL — `noUncheckedIndexedAccess: true`: `input.charAt(i)` returns `string` (empty string if out-of-bounds — NOT undefined), so no guard needed. `parseInt(hex.slice(...), 16)` returns `number | NaN`; NaN-check is not strictly needed here because `String.fromCharCode(NaN)` returns `"\u0000"` — but we already guard via the regex `^[0-9A-Fa-f]+$`, so the parseInt result is always finite.

CRITICAL — `for (const ch of input)` iterates by Unicode code points (not UTF-16 code units) — this is the correct choice for user-supplied content that may include non-BMP characters. `reescape` does NOT need to handle surrogate pairs specially.

CRITICAL — no `console.*`; no `any`; no non-null `!` assertions; no object-literal `as` casts.

Test file `test/parser-escapes.test.ts` with the 15 cases above:

```typescript
import { describe, expect, it } from "vitest";

import { unescape, reescape } from "../src/parser/escapes.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";
import type { EncodingCharacters, Hl7Position } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;
const pos: Hl7Position = { segmentIndex: 0, fieldIndex: 1 };

function collect(): { emit: (w: Hl7ParseWarning) => void; warnings: Hl7ParseWarning[] } {
  const warnings: Hl7ParseWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("parser/escapes: unescape", () => {
  it("passes through strings with no escape char unchanged", () => {
    const { emit, warnings } = collect();
    expect(unescape("abc", enc, emit, pos)).toBe("abc");
    expect(warnings).toHaveLength(0);
  });

  it("expands \\F\\ to field separator", () => {
    const { emit } = collect();
    expect(unescape("a\\F\\b", enc, emit, pos)).toBe("a|b");
  });

  it("expands \\S\\ \\T\\ \\R\\ \\E\\ to component, subcomponent, repetition, escape", () => {
    const { emit } = collect();
    expect(unescape("\\S\\\\T\\\\R\\\\E\\", enc, emit, pos)).toBe("^&~\\");
  });

  it("expands \\.br\\ to newline", () => {
    const { emit } = collect();
    expect(unescape("line1\\.br\\line2", enc, emit, pos)).toBe("line1\nline2");
  });

  it("expands \\X0A\\ to a single LF character", () => {
    const { emit } = collect();
    expect(unescape("\\X0A\\", enc, emit, pos)).toBe("\n");
  });

  it("expands \\X48656C6C6F\\ to 'Hello'", () => {
    const { emit } = collect();
    expect(unescape("\\X48656C6C6F\\", enc, emit, pos)).toBe("Hello");
  });

  it("preserves \\Z99\\ verbatim and emits UNKNOWN_ESCAPE_SEQUENCE", () => {
    const { emit, warnings } = collect();
    expect(unescape("\\Z99\\", enc, emit, pos)).toBe("\\Z99\\");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE);
  });

  it("preserves \\UNKNOWN\\ verbatim and warns", () => {
    const { emit, warnings } = collect();
    expect(unescape("\\UNKNOWN\\", enc, emit, pos)).toBe("\\UNKNOWN\\");
    expect(warnings).toHaveLength(1);
  });

  it("rejects invalid hex (non-hex chars) and preserves verbatim", () => {
    const { emit, warnings } = collect();
    expect(unescape("a\\Xzz\\b", enc, emit, pos)).toBe("a\\Xzz\\b");
    expect(warnings).toHaveLength(1);
  });

  it("rejects odd-length hex and preserves verbatim", () => {
    const { emit, warnings } = collect();
    expect(unescape("a\\Xabc\\b", enc, emit, pos)).toBe("a\\Xabc\\b");
    expect(warnings).toHaveLength(1);
  });

  it("handles unterminated escapes without infinite loop and warns once", () => {
    const { emit, warnings } = collect();
    const out = unescape("lonely \\ backslash", enc, emit, pos);
    expect(out).toBe("lonely \\ backslash");
    expect(warnings).toHaveLength(1);
  });

  it("honors custom escape character from EncodingCharacters", () => {
    const customEnc: EncodingCharacters = { field: "#", component: "$", repetition: "%", escape: "*", subcomponent: "@" };
    const { emit, warnings } = collect();
    expect(unescape("a*F*b", customEnc, emit, pos)).toBe("a#b");
    expect(warnings).toHaveLength(0);
  });
});

describe("parser/escapes: reescape", () => {
  it("re-escapes field separator to \\F\\", () => {
    expect(reescape("a|b", enc)).toBe("a\\F\\b");
  });

  it("re-escapes all 5 delimiters and newline", () => {
    expect(reescape("|^~\\&", enc)).toBe("\\F\\\\S\\\\R\\\\E\\\\T\\");
    expect(reescape("line1\nline2", enc)).toBe("line1\\.br\\line2");
  });

  it("unescape(reescape(x)) round-trips with zero warnings", () => {
    const { emit, warnings } = collect();
    const original = "Hello|World^Foo~Bar\\Baz&Qux\nNext";
    const roundTripped = unescape(reescape(original, enc), enc, emit, pos);
    expect(roundTripped).toBe(original);
    expect(warnings).toHaveLength(0);
  });
});
```

Note on Test 14's expected string: the reescape order loops over characters in input order, so `"|^~\\&"` produces `"\F\" + "\S\" + "\R\" + "\E\" + "\T\"` = `"\\F\\\\S\\\\R\\\\E\\\\T\\"`. Verify the expected string matches the implementation literally.
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; pnpm lint src/parser/escapes.ts test/parser-escapes.test.ts --max-warnings=0 &amp;&amp; pnpm test -- --run parser-escapes</automated>
  </verify>
  <acceptance_criteria>
    - File `src/parser/escapes.ts` exists and exports exactly `unescape` and `reescape` — verify: `grep -E "^export function" src/parser/escapes.ts | wc -l` returns 2.
    - All 8 HL7 escape forms are handled in `expandSequence` — verify: `grep -cE '(seq === "F"|seq === "S"|seq === "T"|seq === "R"|seq === "E"|seq === "\\.br"|seq.startsWith\\("X"\\))' src/parser/escapes.ts` >= 7.
    - `unknownEscapeSequence` factory is called in the unknown-sequence path — verify: `grep -c "unknownEscapeSequence(" src/parser/escapes.ts` >= 1.
    - `reescape` covers all 5 delimiters + newline — verify: `grep -c "enc.escape" src/parser/escapes.ts` >= 6 (used in all re-escape cases).
    - No `console.*` — `grep -c "console\\." src/parser/escapes.ts` returns 0.
    - No `any` — `grep -cE "(: any(\\s|,|\\))|<any>)" src/parser/escapes.ts` returns 0.
    - File-level JSDoc does NOT start with `@` — `awk 'NR<=3 && /^\s*\* @/{print "FAIL";exit 1}' src/parser/escapes.ts` prints nothing.
    - `@example` on both exports — `grep -c "@example" src/parser/escapes.ts` >= 2.
    - `pnpm typecheck`, `pnpm lint ... --max-warnings=0`, `pnpm test -- --run parser-escapes` all exit 0 with 15 passing cases.
    - Round-trip test passes (unescape/reescape are inverses for delimiter-bearing ASCII content).
  </acceptance_criteria>
  <done>All 8 HL7 escape forms expand correctly; unknown sequences preserve verbatim + warn; unterminated escapes do not hang; re-escape covers all 5 delimiters + newline. 15 tests pass. Typecheck + lint + test green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| untrusted field content → unescape | Field strings (post-tokenize) may contain arbitrary user content including malformed escapes; unescape must be bounded and non-recursive. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-04-01 | Denial of Service | `unescape` scanning loop | mitigate | Linear scan with explicit `i++` advance; unterminated-escape path short-circuits with `break`. No recursion. No backtracking regex. Guaranteed O(n). |
| T-02-04-02 | Tampering | `\X..\` hex decode | mitigate | Strict regex validation (`/^[0-9A-Fa-f]+$/u`) + even-length requirement before `parseInt`. Non-hex or odd-length input is rejected and warned; no silent misdecoding. |
| T-02-04-03 | Information Disclosure | Vendor `\Z..\` sequences passed through to output | accept | Phase 2 has no vendor allow-list (locked in PATTERNS.md — "for Phase 2 the allow-list is empty"). Downstream consumers receive verbatim `\Z..\` content + a warning; they can strip or filter in user code. Phase 6 profiles may register vendor handlers. |
</threat_model>

<verification>
Run after the task:

```bash
pnpm typecheck
pnpm lint --max-warnings=0
pnpm test -- --run parser-escapes
pnpm build
```

All four exit 0.
</verification>

<success_criteria>
- `src/parser/escapes.ts` ships `unescape` (on-access expansion) and `reescape` (serializer-side compression).
- 15 tests passing, including round-trip sanity.
- PARSE-03 (all escape sequences) and TOL-10 (unknown escape warning + preserve verbatim) both demonstrated.
- Zero overlap with Plans 01/02/03 files.
- No `src/index.ts` changes.
</success_criteria>

<output>
After completion, create `.planning/phases/02-core-parser-and-tolerance/02-04-SUMMARY.md` describing:
- What shipped (1 source file, 1 test file).
- REQ-IDs closed (PARSE-03, TOL-10).
- The escape-table implementation choice: full switch-style mapping in `expandSequence` (easier to extend than a Map).
- Notes for Phase 3 (typed composite parsers): `unescape` is how component/subcomponent strings get un-escaped when read via `msg.get(path)` — Phase 3's dot-path resolver will call `unescape` at leaf access, not during tokenize (keeps raw tree exactly as input).
- Notes for Phase 5: `reescape` is ready for consumption by `toString()`.
</output>
