/**
 * Validation helpers for `defineProfile()`. Implements the
 * D-05..D-08 throw paths.
 *
 * Every validator returns `void` on success and throws
 * `ProfileDefinitionError` on failure. The name validator (subject of
 * D-01 fail-fast) is split from the full options validator so
 * `defineProfile()` can call it FIRST and pass `opts.name` to every
 * subsequent throw site.
 *
 * Zero runtime deps: inlined Levenshtein (~15 LoC) + regex + token match.
 *
 * @internal
 */

import {
  SUPPORTED_DATE_TOKENS,
  ambiguousAdjacency,
  isBareAlphanumericLiteral,
  tokeniseDateFormat,
} from "../parser/date-tokens.js";
import { ProfileDefinitionError } from "../parser/errors.js";
import type { DateFormatPart, DateFormatToken } from "../parser/date-tokens.js";
import type { CustomSegmentDefinition } from "../parser/types.js";

import type { DefineProfileOptions } from "./define.js";

/**
 * Z-segment shape: `Z` + 2 uppercase alphanumerics (D-05). Mirrors the
 * `SEGMENT_NAME_RE` convention used in `src/model/message.ts` for
 * addSegment validation: Z-segments are the allowed v1 overlay set.
 *
 * @internal
 */
const Z_SEGMENT_RE = /^Z[A-Z0-9]{2}$/u;

/**
 * Known top-level option keys accepted by `defineProfile()` (D-07). Any
 * key outside this list triggers a `ProfileDefinitionError` with an
 * optional Levenshtein-based "did you mean?" hint.
 *
 * @internal
 */
const KNOWN_OPTION_KEYS: readonly string[] = [
  "name",
  "description",
  "dateFormats",
  "customSegments",
  "onWarning",
  "extends",
];

/**
 * Iterative DP Levenshtein distance (edit distance) between two strings.
 * Used by `validateOptionKeys` to generate "did you mean?" hints. Zero
 * runtime deps per D-33; kept ≤ 15 LoC excluding the signature.
 *
 * @internal
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr.push(Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

/**
 * Validate the profile NAME (D-01 fail-fast). Throws on null/undefined
 * opts, non-string name, empty name, whitespace-only name. Separate from
 * the full options validator so callers can trust `opts.name` by the time
 * downstream throws fire.
 *
 * @internal
 */
export function validateProfileName(opts: DefineProfileOptions): void {
  if (opts === null || opts === undefined) {
    throw new ProfileDefinitionError(
      "defineProfile: options is required and must be an object. " + `Received: ${String(opts)}.`,
    );
  }
  if (typeof opts.name !== "string") {
    throw new ProfileDefinitionError(
      "defineProfile: 'name' is required and must be a non-empty string. " +
        `Received: ${JSON.stringify((opts as { name?: unknown }).name)}.`,
    );
  }
  if (opts.name.trim().length === 0) {
    throw new ProfileDefinitionError(
      "defineProfile: 'name' is required and must be a non-empty string. " +
        `Received: ${JSON.stringify(opts.name)}.`,
      opts.name,
    );
  }
}

/**
 * Validate TOP-LEVEL option keys (D-07). Throws on any unknown key with a
 * Levenshtein-based "did you mean?" hint when distance ≤ 2 from a known
 * key.
 *
 * @internal
 */
export function validateOptionKeys(opts: DefineProfileOptions): void {
  for (const key of Object.keys(opts)) {
    if (KNOWN_OPTION_KEYS.includes(key)) continue;
    let hint: string | undefined;
    for (const known of KNOWN_OPTION_KEYS) {
      if (levenshtein(key, known) <= 2) {
        hint = known;
        break;
      }
    }
    throw new ProfileDefinitionError(
      `Profile '${opts.name}' has unknown option key '${key}'. ` +
        (hint !== undefined ? `Did you mean '${hint}'? ` : "") +
        `Known keys: ${KNOWN_OPTION_KEYS.join(", ")}.`,
      opts.name,
    );
  }
}

/**
 * Validate a pre-merge customSegments map (D-05): every key MUST be a
 * Z-segment matching `/^Z[A-Z0-9]{2}$/u`, and every field position MUST
 * be a positive integer. Duplicate field-name detection (D-06) is
 * deferred to post-merge validation; on the single-profile path,
 * object-literal syntax already rules out literal duplicate keys, so a
 * simple presence check is sufficient here.
 *
 * @internal
 */
export function validateCustomSegments(
  map: Readonly<Record<string, CustomSegmentDefinition>>,
  profileName: string,
): void {
  for (const key of Object.keys(map)) {
    if (!Z_SEGMENT_RE.test(key)) {
      throw new ProfileDefinitionError(
        `Profile '${profileName}' declares customSegments for '${key}': only Z-segments ` +
          `(Z[A-Z0-9]{2}) are allowed in v1. Typed overlays are a v2 feature.`,
        profileName,
      );
    }
    const entry = map[key];
    if (
      entry === undefined ||
      entry === null ||
      typeof entry.fields !== "object" ||
      entry.fields === null
    ) {
      throw new ProfileDefinitionError(
        `Profile '${profileName}' customSegments['${key}'] must be an object with a 'fields' map.`,
        profileName,
      );
    }
    for (const fieldName of Object.keys(entry.fields)) {
      const pos = entry.fields[fieldName];
      if (typeof pos !== "number" || !Number.isInteger(pos) || pos < 1) {
        throw new ProfileDefinitionError(
          `Profile '${profileName}' customSegments['${key}'].fields['${fieldName}'] ` +
            `must be a positive integer (1-indexed). Received: ${JSON.stringify(pos)}.`,
          profileName,
        );
      }
    }
  }
}

/**
 * The vocabulary, rendered for an error message. Kept as one expression so a
 * token added to the grammar reaches every diagnostic that lists it.
 *
 * @internal
 */
const TOKEN_LIST = SUPPORTED_DATE_TOKENS.join(", ");

/** @internal `true` when the part is a bare, unescaped `Y` the tokeniser left over. */
function isBareY(part: DateFormatPart | undefined): boolean {
  return (
    part !== undefined && part.kind === "literal" && part.source === "bare" && part.value === "Y"
  );
}

/**
 * Length of the MAXIMAL run of consecutive bare `Y` literals beginning at
 * `index`, or 0 when `index` is not the start of one. This is how a two-digit
 * year is told apart from a `Y`-count typo: `YYYY` tokenises to one token and
 * leaves no run at all, `YY` leaves a run of exactly two, and `YYY` or `YYYYY`
 * leave runs of some other length. Measuring from the MIDDLE of a run would
 * read the tail of `YYY` as a `YY`, which is a typo reported as the wrong
 * refusal.
 *
 * @internal
 */
function bareYRunLength(parts: readonly DateFormatPart[], index: number): number {
  if (index > 0 && isBareY(parts[index - 1])) return 0;
  let run = 0;
  for (let i = index; i < parts.length && isBareY(parts[i]); i++) run += 1;
  return run;
}

/**
 * Validate ONE date-format string against the token grammar: every character
 * must be a token or a permitted literal, the `h`/`A` and `SSSS`/`ss` pairings
 * must hold, and two numeric tokens must not sit adjacent when either is
 * variable width. Returns the reason a format is unusable, or `undefined` when
 * it is well formed.
 *
 * The rules are checked in the order a reader would want them reported: the
 * escape that never closed, then the two-digit year (a refusal with its own
 * reason), then any other stray letter or digit, then a format holding no
 * token at all, then the pairings, then the adjacency.
 *
 * @internal
 */
function dateFormatProblem(format: string): string | undefined {
  const parts = tokeniseDateFormat(format);

  for (const part of parts) {
    if (part.kind === "literal" && part.source === "unterminated") {
      return (
        `the literal escape opened at position ${String(part.at)} is never closed. ` +
        `Write a literal letter or digit inside square brackets, e.g. [T].`
      );
    }
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === undefined || part.kind !== "literal") continue;
    if (!isBareAlphanumericLiteral(part)) continue;
    if (part.value === "Y" && bareYRunLength(parts, i) === 2) {
      return (
        `'YY' at position ${String(part.at)} is a two-digit year, which this vocabulary ` +
        `does not contain. No century window is applied, so a two-digit year cannot be ` +
        `resolved to a calendar year without guessing. Use 'YYYY'.`
      );
    }
  }

  for (const part of parts) {
    if (part.kind !== "literal" || !isBareAlphanumericLiteral(part)) continue;
    return (
      `'${part.value}' at position ${String(part.at)} is not part of any token. Every ` +
      `unescaped letter and digit must belong to one of ${TOKEN_LIST}; write a literal ` +
      `letter or digit inside square brackets, e.g. [${part.value}].`
    );
  }

  const tokens: DateFormatToken[] = [];
  for (const part of parts) if (part.kind === "token") tokens.push(part.token);
  if (tokens.length === 0) {
    return `it contains no date token. It must contain at least one of ${TOKEN_LIST}.`;
  }

  const has = (token: DateFormatToken): boolean => tokens.includes(token);
  const has12Hour = has("h") || has("hh");
  if (has12Hour && !has("A")) {
    return (
      `it uses a 12-hour token ('h' or 'hh') with no meridiem token 'A'. A 12-hour ` +
      `reading is not a clock hour until AM/PM is applied, so add 'A', or use 'H'/'HH' ` +
      `for a 24-hour clock.`
    );
  }
  if (has("A") && !has12Hour) {
    return (
      `it uses the meridiem token 'A' with no 12-hour token ('h' or 'hh'). 'A' only has ` +
      `meaning beside a 12-hour clock.`
    );
  }
  if (has("SSSS") && !has("ss")) {
    return (
      `it uses the fractional-seconds token 'SSSS' with no seconds token 'ss'. A fraction ` +
      `is only meaningful at full second precision.`
    );
  }

  const ambiguous = ambiguousAdjacency(parts);
  if (ambiguous !== undefined) {
    return (
      `the numeric tokens '${ambiguous.left}' and '${ambiguous.right}' are adjacent at ` +
      `position ${String(ambiguous.at)} with no literal between them, and at least one is ` +
      `variable width, so nothing can split the digit run deterministically. ` +
      (ambiguous.throughEmptyEscape
        ? `An empty escape '[]' matches the empty string, so it separates nothing. `
        : ``) +
      `Separate them with a literal that matches at least one character, or use fixed-width ` +
      `tokens.`
    );
  }

  return undefined;
}

/**
 * Validate date-format strings (D-08): EVERY character of each format must be
 * a supported token or a permitted literal, and the grammar's pairing and
 * adjacency rules must hold. A format that cannot be honoured is refused here,
 * at profile definition time, rather than accepted and then silently never
 * matched at parse time.
 *
 * @internal
 */
export function validateDateFormats(formats: readonly string[], profileName: string): void {
  for (let i = 0; i < formats.length; i++) {
    const f = formats[i] ?? "";
    const problem = dateFormatProblem(f);
    if (problem !== undefined) {
      throw new ProfileDefinitionError(
        `Profile '${profileName}' dateFormats[${String(i)}] = ${JSON.stringify(f)} is ` +
          `malformed: ${problem}`,
        profileName,
      );
    }
  }
}

/**
 * Post-merge D-06 DEFENSE-IN-DEPTH check: within a single segment, the
 * SAME field name MUST NOT resolve to DIFFERENT positions. Cross-
 * position aliasing (two names, same position) is allowed: that's
 * intentional convenience.
 *
 * **Runtime observation:** Given the current `mergeCustomSegments`
 * strategy (accumulator keyed by position, where later layers overwrite
 * same-position entries), a name cannot survive at two positions: if a
 * parent has `{ a: 3 }` and a child has `{ a: 5 }`, the accumulator
 * produces `{ 3: "a", 5: "a" }` which lowers to `{ a: 5 }` (the second
 * assignment wins inside the final `Record`). If a parent has
 * `{ a: 3, b: 3 }` (two names at the same position: legal) and the
 * child has `{ a: 5 }`, the accumulator produces `{ 3: "b", 5: "a" }` →
 * output `{ a: 5, b: 3 }`; `a` maps to ONE position (5), no violation.
 * Therefore this validator never fires under the present strategy.
 *
 * It stays as code-level defense-in-depth because (a) it is cheap
 * (O(N) over fields of the merged map) and (b) if a future contributor
 * changes `mergeCustomSegments` to a name-keyed accumulator (e.g. to
 * preserve "last write per name" semantics that could allow a name to
 * remain at two positions), this validator becomes reachable and
 * catches the bug before the profile ships. The test suite asserts
 * the validator's presence and contract; it intentionally does NOT
 * assert that `defineProfile` throws through the current merge path for
 * a duplicate-name-different-position case, because that case is
 * unreachable today.
 *
 * @internal
 */
export function validateUniqueFieldNames(
  map: Readonly<Record<string, CustomSegmentDefinition>>,
  profileName: string,
): void {
  for (const segName of Object.keys(map)) {
    const entry = map[segName];
    if (entry === undefined) continue;
    const positionsByName = new Map<string, number>();
    for (const fieldName of Object.keys(entry.fields)) {
      const pos = entry.fields[fieldName];
      if (pos === undefined) continue;
      const prior = positionsByName.get(fieldName);
      if (prior !== undefined && prior !== pos) {
        throw new ProfileDefinitionError(
          `Profile '${profileName}' customSegments['${segName}']: field name '${fieldName}' ` +
            `maps to BOTH position ${String(prior)} AND position ${String(pos)} after extends merge. ` +
            `Each field name within a segment must map to exactly one position.`,
          profileName,
        );
      }
      positionsByName.set(fieldName, pos);
    }
  }
}
