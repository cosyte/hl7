/**
 * Validation helpers for `defineProfile()`. Implements the Plan 06-01
 * D-05..D-08 throw paths.
 *
 * Every validator returns `void` on success and throws
 * `ProfileDefinitionError` on failure. The name validator (subject of
 * D-01 fail-fast) is split from the full options validator so
 * `defineProfile()` can call it FIRST and pass `opts.name` to every
 * subsequent throw site.
 *
 * Zero runtime deps — inlined Levenshtein (~15 LoC) + regex + token match.
 *
 * @internal
 */

import { SUPPORTED_DATE_TOKENS } from "../parser/dates.js";
import { ProfileDefinitionError } from "../parser/errors.js";
import type { CustomSegmentDefinition } from "../parser/types.js";

import type { DefineProfileOptions } from "./define.js";

/**
 * Z-segment shape: `Z` + 2 uppercase alphanumerics (D-05). Mirrors the
 * `SEGMENT_NAME_RE` convention used in `src/model/message.ts` for
 * addSegment validation — Z-segments are the allowed v1 overlay set.
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
 * Regex that matches any of the supported date-format tokens. Used by
 * `validateDateFormats` (D-08) to confirm each user-supplied format string
 * contains at least one recognised token — empty strings and dead formats
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
      curr.push(
        Math.min(
          (prev[j] ?? 0) + 1,
          (curr[j - 1] ?? 0) + 1,
          (prev[j - 1] ?? 0) + cost,
        ),
      );
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
      "defineProfile: options is required and must be an object. " +
        `Received: ${String(opts)}.`,
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
 * deferred to post-merge validation in Plan 02; for Plan 01's
 * single-profile path, object-literal syntax already rules out literal
 * duplicate keys so a simple presence check is sufficient here.
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
        `Profile '${profileName}' declares customSegments for '${key}' — only Z-segments ` +
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
 * Validate date-format strings (D-08) — each MUST contain at least one
 * supported token from `SUPPORTED_DATE_TOKENS`. Catches typos like
 * `"YYY/MM"` (missing a `Y`) and empty strings before they reach the
 * parser's timestamp cascade.
 *
 * @internal
 */
export function validateDateFormats(
  formats: readonly string[],
  profileName: string,
): void {
  for (let i = 0; i < formats.length; i++) {
    const f = formats[i] ?? "";
    if (!TOKEN_MATCH_RE.test(f)) {
      throw new ProfileDefinitionError(
        `Profile '${profileName}' dateFormats[${String(i)}] = ${JSON.stringify(f)} is malformed — ` +
          `must contain at least one of ${SUPPORTED_DATE_TOKENS.join("/")}.`,
        profileName,
      );
    }
  }
}
