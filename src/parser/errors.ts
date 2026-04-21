/**
 * Fatal error taxonomy for the `@cosyte/hl7` parser pipeline. Four
 * Tier-3 codes cover every unrecoverable structural failure; anything less
 * severe is a Tier-2 warning (see `./warnings.ts`). `Hl7ParseError` is
 * thrown directly; consumers narrow via the `code` discriminant.
 *
 * `ProfileDefinitionError` is declared here so the error taxonomy is locked
 * before Phase 6 wires profile validation — keeping file ownership clean
 * across phases.
 */

import type { Hl7Position } from "./types.js";

/**
 * Stable string codes for every Tier-3 fatal the parser may throw. Locked
 * at four codes: anything else MUST be a Tier-2 warning. Consumers narrow
 * on `err.code` to react to specific structural failures.
 *
 * @example
 * ```ts
 * import { parseHL7, FATAL_CODES, Hl7ParseError } from "@cosyte/hl7";
 * try {
 *   parseHL7("");
 * } catch (err) {
 *   if (err instanceof Hl7ParseError && err.code === FATAL_CODES.EMPTY_INPUT) {
 *     // handle empty input
 *   }
 * }
 * ```
 */
export const FATAL_CODES = {
  NO_MSH_SEGMENT: "NO_MSH_SEGMENT",
  MSH_TOO_SHORT: "MSH_TOO_SHORT",
  INVALID_ENCODING_CHARACTERS: "INVALID_ENCODING_CHARACTERS",
  EMPTY_INPUT: "EMPTY_INPUT",
} as const;

/**
 * Discriminant type for `Hl7ParseError.code`. Narrowing a caught error by
 * this code lets consumers write exhaustive `switch` blocks (enabled by the
 * `switch-exhaustiveness-check` lint rule) and guarantees a typo-free
 * comparison against the `FATAL_CODES` registry.
 *
 * @example
 * ```ts
 * import type { FatalCode } from "@cosyte/hl7";
 * function describe(code: FatalCode): string {
 *   switch (code) {
 *     case "EMPTY_INPUT":
 *       return "input was empty";
 *     case "NO_MSH_SEGMENT":
 *       return "missing MSH";
 *     case "MSH_TOO_SHORT":
 *       return "MSH truncated";
 *     case "INVALID_ENCODING_CHARACTERS":
 *       return "bad MSH-1/MSH-2";
 *   }
 * }
 * ```
 */
export type FatalCode = (typeof FATAL_CODES)[keyof typeof FATAL_CODES];

/**
 * Thrown by `parseHL7` when the input violates one of the 4 unrecoverable
 * Tier-3 structural rules (missing MSH, truncated MSH, invalid encoding
 * characters, or empty input). Carries positional context plus a short
 * snippet of the offending input so consumers can log actionable errors.
 *
 * @remarks
 * Snippets may contain PHI when parsing real clinical messages — redact at
 * the call site if required by your compliance posture. The library does
 * not redact snippets itself.
 *
 * @example
 * ```ts
 * import { parseHL7, Hl7ParseError } from "@cosyte/hl7";
 * try {
 *   parseHL7("");
 * } catch (err) {
 *   if (err instanceof Hl7ParseError && err.code === "EMPTY_INPUT") {
 *     // handle empty input — err.position, err.snippet available
 *   }
 * }
 * ```
 */
export class Hl7ParseError extends Error {
  public readonly code: FatalCode;
  public readonly position: Hl7Position;
  public readonly snippet: string;

  /**
   * Construct a new `Hl7ParseError`. All four fields are required so every
   * thrower populates full positional context per the TOL-02 requirement.
   *
   * @internal
   */
  public constructor(code: FatalCode, message: string, position: Hl7Position, snippet: string) {
    super(message);
    this.name = "Hl7ParseError";
    this.code = code;
    this.position = position;
    this.snippet = snippet;
  }
}

/**
 * Thrown by `defineProfile()` and profile-validation code (Phase 6) when a
 * profile definition is structurally invalid — e.g. references an undefined
 * parent, declares a malformed custom segment, or includes an unsupported
 * date format. Declared in Phase 2 so the error taxonomy is locked before
 * Phase 6 lands; callers may optionally supply the offending profile name
 * for better diagnostics.
 *
 * @example
 * ```ts
 * import { ProfileDefinitionError } from "@cosyte/hl7";
 * throw new ProfileDefinitionError(
 *   "Unknown parent profile: epic-v7",
 *   "my-epic-extension",
 * );
 * ```
 */
export class ProfileDefinitionError extends Error {
  public readonly profileName: string | undefined;

  /**
   * Construct a new `ProfileDefinitionError`. `profileName` is optional so
   * Phase 6 callers may omit it when the offending profile cannot be named
   * (e.g. during initial validation before a name is parsed).
   *
   * @internal
   */
  public constructor(message: string, profileName?: string) {
    super(message);
    this.name = "ProfileDefinitionError";
    this.profileName = profileName;
  }
}
