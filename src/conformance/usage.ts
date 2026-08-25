/**
 * The declarable-usage grammar for the conformance engine, and the two
 * PHI-safety helpers every usage diagnostic goes through.
 *
 * A rule's usage is either one of the seven {@link SimpleUsageCode}s or a
 * DECLARED-CONDITIONAL token of the exact form `C(t/f)` whose two outcomes are
 * each a simple code: uppercase, no whitespace anywhere inside the token, no
 * nesting. An OMITTED usage is not a usage at all: the grammar does not apply
 * to it, nothing refuses it, and it keeps its meaning of Optional.
 *
 * @internal (`usageOutcomes` is re-exported from the package root)
 */

import type { FieldRule, SegmentRule, SimpleUsageCode, UsageOutcomes } from "./types.js";

/**
 * The seven simple usage codes, in the order the exported vocabulary listing
 * carries them. This is the accept-set for a rule's usage and for either
 * outcome of a declared conditional; the exported `USAGE_CODES` listing is NOT
 * (it carries the `C(a/b)` notation, which no rule may declare).
 *
 * @internal
 */
export const SIMPLE_USAGE_CODES: readonly SimpleUsageCode[] = Object.freeze([
  "R",
  "RE",
  "C",
  "CE",
  "O",
  "X",
  "B",
]);

/**
 * The most characters of a profile-supplied token any finding or authoring
 * error may echo. A profile is author-supplied configuration rather than
 * message content, so echoing the token is what lets an author find their typo;
 * the bound keeps an unbounded author-supplied string out of a diagnostic all
 * the same.
 *
 * @internal
 */
export const MAX_ECHOED_TOKEN_LENGTH = 32;

/**
 * The shape of a token the grammar admits: a simple code, or a declared
 * conditional carrying its two outcomes.
 *
 * @internal
 */
export type ParsedUsage =
  | { readonly kind: "simple"; readonly code: SimpleUsageCode }
  | {
      readonly kind: "conditional";
      readonly whenTrue: SimpleUsageCode;
      readonly whenFalse: SimpleUsageCode;
    };

/**
 * A declared-conditional token. Neither outcome may contain a parenthesis or a
 * slash, so a nested conditional (`C(C(R/X)/O)`) and a three-outcome token
 * (`C(R/X/O)`) fail to match at all rather than matching partially. Whitespace
 * and lower-case spelling survive the match and are refused by the membership
 * check that follows it.
 *
 * @internal
 */
const DECLARED_CONDITIONAL_RE = /^C\(([^()/]*)\/([^()/]*)\)$/u;

/**
 * Is `value` a plain object (not null, not an array)?
 *
 * @internal
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Is `value` one of the seven simple usage codes?
 *
 * @internal
 */
function isSimpleUsageCode(value: string): value is SimpleUsageCode {
  return (SIMPLE_USAGE_CODES as readonly string[]).includes(value);
}

/**
 * Parse a usage token against the grammar. Returns `undefined` for anything the
 * grammar does not admit, the literal `C(a/b)` included: `a` and `b` are
 * placeholders for usage codes, not usage codes.
 *
 * @internal
 */
export function parseUsageToken(token: string): ParsedUsage | undefined {
  if (isSimpleUsageCode(token)) return { kind: "simple", code: token };
  const match = DECLARED_CONDITIONAL_RE.exec(token);
  if (match === null) return undefined;
  const whenTrue = match[1];
  const whenFalse = match[2];
  if (whenTrue === undefined || whenFalse === undefined) return undefined;
  if (!isSimpleUsageCode(whenTrue) || !isSimpleUsageCode(whenFalse)) return undefined;
  return { kind: "conditional", whenTrue, whenFalse };
}

/**
 * The at-most-32-character echo of a profile-supplied token, for a diagnostic
 * that names the offending token. Counts code points, so a surrogate pair is
 * never split in half. Never called on anything read from the message.
 *
 * @internal
 */
export function boundedToken(token: string): string {
  const points = Array.from(token);
  if (points.length <= MAX_ECHOED_TOKEN_LENGTH) return token;
  return points.slice(0, MAX_ECHOED_TOKEN_LENGTH).join("");
}

/**
 * Name a value's TYPE for a diagnostic, never its content. Used wherever a
 * profile-supplied value is of the wrong type entirely, so there is no token
 * worth echoing and echoing one would say nothing useful.
 *
 * @internal
 */
export function describeValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Is `usage` something a rule may legally declare (an admissible token, or
 * nothing at all)? Used to suppress a downstream diagnostic that would only
 * restate a usage defect already reported.
 *
 * @internal
 */
export function usageIsAdmissible(usage: unknown): boolean {
  if (usage === undefined) return true;
  return typeof usage === "string" && parseUsageToken(usage) !== undefined;
}

/**
 * The two usage outcomes a declared CONDITION PREDICATE selects between for a
 * rule carrying this usage token, or `undefined` when the usage is not
 * conditional at all and therefore admits no predicate.
 *
 * Three tokens admit one. A declared conditional `C(t/f)` carries its outcomes
 * explicitly. The bare conditional codes carry theirs by definition rather than
 * by declaration, and IHE ITI TF Vol.2 Appendix C states both branches for each
 * one: a `C` element SHALL be populated when the predicate is satisfied and
 * SHALL NOT be when it is not, which is `R` against `X`; a `CE` element is
 * populated when the predicate is satisfied AND the sender knows the value,
 * which is `RE`, against the same `X`.
 *
 * `B` is deliberately absent. The methodology lists it among the allowable
 * indicators and carries no definition text for it, so no source says what a
 * predicate on a `B` element would decide, and inventing one is exactly the
 * guess this engine refuses to make.
 *
 * @internal
 */
export function predicateOutcomes(usage: unknown): UsageOutcomes | undefined {
  if (typeof usage !== "string") return undefined;
  const parsed = parseUsageToken(usage);
  if (parsed === undefined) return undefined;
  if (parsed.kind === "conditional") {
    return { whenTrue: parsed.whenTrue, whenFalse: parsed.whenFalse };
  }
  if (parsed.code === "C") return { whenTrue: "R", whenFalse: "X" };
  if (parsed.code === "CE") return { whenTrue: "RE", whenFalse: "X" };
  return undefined;
}

/** Read a rule's `usage` without assuming the argument really is a rule. @internal */
function readUsage(rule: unknown): unknown {
  if (!isRecord(rule)) return undefined;
  return rule["usage"];
}

/**
 * The true and false usage outcomes a rule's declared conditional records, as
 * two separate simple codes: for `C(RE/X)`, `{ whenTrue: "RE", whenFalse: "X" }`.
 *
 * Returns `undefined` when the rule's usage is a simple code or is absent,
 * which is how it reports "this rule has no outcomes". **It never throws**,
 * including for a value forced through `any`.
 *
 * @param rule - a segment rule or a field rule from a conformance profile.
 * @returns the two outcomes, or `undefined` when the rule declares none.
 *
 * @example
 * ```ts
 * import { usageOutcomes, type FieldRule } from "@cosyte/hl7";
 *
 * const conditional: FieldRule = { field: 8, usage: "C(RE/X)" };
 * usageOutcomes(conditional); // { whenTrue: "RE", whenFalse: "X" }
 *
 * const simple: FieldRule = { field: 8, usage: "R" };
 * usageOutcomes(simple); // undefined (a simple usage records no outcomes)
 * ```
 */
export function usageOutcomes(rule: SegmentRule | FieldRule): UsageOutcomes | undefined {
  const usage = readUsage(rule);
  if (typeof usage !== "string") return undefined;
  const parsed = parseUsageToken(usage);
  if (parsed === undefined || parsed.kind === "simple") return undefined;
  return { whenTrue: parsed.whenTrue, whenFalse: parsed.whenFalse };
}
