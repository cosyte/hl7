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

import { SUPPORTED_DATE_TOKENS } from "../parser/dates.js";
import { ProfileDefinitionError } from "../parser/errors.js";
import { KNOWN_SEGMENTS, canonicalSegmentName } from "../parser/known-segments.js";
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
  "segmentOverrides",
  "onWarning",
  "extends",
];

/**
 * Regex that matches any of the supported date-format tokens. Used by
 * `validateDateFormats` (D-08) to confirm each user-supplied format string
 * contains at least one recognised token: empty strings and dead formats
 * (`"YYY/MM"`, `"foo"`) fail fast.
 *
 * @internal
 */
const TOKEN_MATCH_RE = new RegExp(`(${SUPPORTED_DATE_TOKENS.join("|")})`, "u");

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
    validateFieldMap(map[key], "customSegments", key, profileName);
  }
}

/**
 * Validate a `segmentOverrides` map: the standard-segment counterpart of
 * `validateCustomSegments`, and deliberately its MIRROR IMAGE on the key rule.
 * A key must be a standard HL7 v2 segment name in {@link KNOWN_SEGMENTS};
 * every field position must be a positive integer, checked by the same
 * `validateFieldMap` the custom-segment path uses so one shape rule serves both
 * maps.
 *
 * The two key refusals are separate because they need separate remedies. A
 * Z-segment key is a right declaration in the wrong map, so the message points
 * at `customSegments` rather than saying the name is unrecognized: the author
 * has the declaration, they just need the other option. Anything else
 * unrecognized names the key and, when only the SPELLING is wrong (a wire-cased
 * `pid`), names the canonical form: keys are matched exactly, so a
 * lowercase key would otherwise define a name that silently never resolves.
 *
 * Runs pre-merge and post-merge, exactly like the custom-segment validator, so
 * a hand-crafted parent profile that never went through `defineProfile` cannot
 * smuggle an unvalidated key in through `extends`.
 *
 * @internal
 */
export function validateSegmentOverrides(
  map: Readonly<Record<string, CustomSegmentDefinition>>,
  profileName: string,
): void {
  for (const key of Object.keys(map)) {
    if (Z_SEGMENT_RE.test(key)) {
      throw new ProfileDefinitionError(
        `Profile '${profileName}' declares segmentOverrides for '${key}': that is a Z-segment. ` +
          `Declare Z-segment fields with the 'customSegments' option instead; ` +
          `'segmentOverrides' names fields on STANDARD HL7 v2 segments.`,
        profileName,
      );
    }
    if (!KNOWN_SEGMENTS.has(key)) {
      const canonical = canonicalSegmentName(key);
      const hint = KNOWN_SEGMENTS.has(canonical) ? ` Did you mean '${canonical}'?` : "";
      throw new ProfileDefinitionError(
        `Profile '${profileName}' declares segmentOverrides for '${key}': not a standard HL7 v2 ` +
          `segment this library recognises.${hint} Keys must be a canonical segment name from ` +
          `KNOWN_SEGMENTS (for example 'PID', 'AL1', 'RXA').`,
        profileName,
      );
    }
    validateFieldMap(map[key], "segmentOverrides", key, profileName);
  }
}

/**
 * Shared shape rule for ONE segment declaration, whichever map it came from:
 * the entry is an object carrying a `fields` map, and every position in that
 * map is a positive integer (1-indexed, per the HL7 convention
 * `Segment.field(n)` reads). `optionKey` and `segmentName` only shape the
 * error text, so a reader is pointed at the exact declaration that is wrong.
 *
 * @internal
 */
function validateFieldMap(
  entry: CustomSegmentDefinition | undefined,
  optionKey: string,
  segmentName: string,
  profileName: string,
): void {
  if (
    entry === undefined ||
    entry === null ||
    typeof entry.fields !== "object" ||
    entry.fields === null
  ) {
    throw new ProfileDefinitionError(
      `Profile '${profileName}' ${optionKey}['${segmentName}'] must be an object with a 'fields' map.`,
      profileName,
    );
  }
  for (const fieldName of Object.keys(entry.fields)) {
    const pos = entry.fields[fieldName];
    if (typeof pos !== "number" || !Number.isInteger(pos) || pos < 1) {
      throw new ProfileDefinitionError(
        `Profile '${profileName}' ${optionKey}['${segmentName}'].fields['${fieldName}'] ` +
          `must be a positive integer (1-indexed). Received: ${JSON.stringify(pos)}.`,
        profileName,
      );
    }
  }
}

/**
 * Validate date-format strings (D-08): each MUST contain at least one
 * supported token from `SUPPORTED_DATE_TOKENS`. Catches typos like
 * `"YYY/MM"` (missing a `Y`) and empty strings before they reach the
 * parser's timestamp cascade.
 *
 * @internal
 */
export function validateDateFormats(formats: readonly string[], profileName: string): void {
  for (let i = 0; i < formats.length; i++) {
    const f = formats[i] ?? "";
    if (!TOKEN_MATCH_RE.test(f)) {
      throw new ProfileDefinitionError(
        `Profile '${profileName}' dateFormats[${String(i)}] = ${JSON.stringify(f)} is malformed: ` +
          `must contain at least one of ${SUPPORTED_DATE_TOKENS.join("/")}.`,
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
 * `optionKey` names the map under inspection in the error text. It defaults to
 * the custom-segment map so existing call sites read unchanged; the
 * standard-segment override map merges through the same reducer and so gets
 * the same guard, under its own name.
 *
 * @internal
 */
export function validateUniqueFieldNames(
  map: Readonly<Record<string, CustomSegmentDefinition>>,
  profileName: string,
  optionKey = "customSegments",
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
          `Profile '${profileName}' ${optionKey}['${segName}']: field name '${fieldName}' ` +
            `maps to BOTH position ${String(prior)} AND position ${String(pos)} after extends merge. ` +
            `Each field name within a segment must map to exactly one position.`,
          profileName,
        );
      }
      positionsByName.set(fieldName, pos);
    }
  }
}
