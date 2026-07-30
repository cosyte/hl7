/**
 * Fatal error taxonomy for the `@cosyte/hl7` parser pipeline. Four
 * Tier-3 codes cover every unrecoverable structural failure; anything less
 * severe is a Tier-2 warning (see `./warnings.ts`). `Hl7ParseError` is
 * thrown directly; consumers narrow via the `code` discriminant.
 *
 * `ProfileDefinitionError` is declared here so the whole error taxonomy
 * lives in one module.
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
 * `snippet` may contain PHI when parsing real clinical messages, and the
 * library does not redact it: redact at the call site if required by your
 * compliance posture. **It is the only field carrying input verbatim and
 * unfiltered** (capped at 40 characters plus an ellipsis, but not shape-checked
 * in any way), so it is the one to redact first.
 *
 * `message` is bounded but not absolutely content-free, and the difference is
 * worth stating because `message` is what a logger prints by default and what
 * `stack` embeds. A token lifted from the input is echoed only when it matches
 * the form the spec defines for it: a three-character segment identifier, an
 * MSH-9 type, an MSH-12 version, or a charset label the closed Table 0211
 * actually contains. Anything else becomes `<withheld>`. So a message cannot
 * carry a field's value, but it can carry a residue of up to three characters
 * when a malformed line happens to look like a segment identifier. The other
 * shapes are narrower in practice than their patterns allow, because the
 * library only ever feeds them registry-matched values, but the patterns
 * themselves admit more (a message type up to 26 characters, a version up to
 * 14), which matters if you construct warnings yourself.
 *
 * Under `{ strict: true }` an escalated Tier-2 warning is thrown as this
 * error, carrying the warning's own bounded message and a `snippet` of the
 * **first 40 characters of the input**. That snippet is the head of the
 * message rather than the deviation's own segment, so it is usually the MSH
 * header; it is deliberately not re-pointed at the offending segment, since
 * doing so would move more clinical content into the unredacted field.
 *
 * @example
 * ```ts
 * import { parseHL7, Hl7ParseError } from "@cosyte/hl7";
 * try {
 *   parseHL7("");
 * } catch (err) {
 *   if (err instanceof Hl7ParseError && err.code === "EMPTY_INPUT") {
 *     // handle empty input: err.position, err.snippet available
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
 * Thrown by `defineProfile()` and profile-validation code when a
 * profile definition is structurally invalid: e.g. references an undefined
 * parent, declares a malformed custom segment, or includes an unsupported
 * date format. Callers may optionally supply the offending profile name for
 * better diagnostics.
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
   * callers may omit it when the offending profile cannot be named
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
