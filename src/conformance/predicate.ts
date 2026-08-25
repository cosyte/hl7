/**
 * Condition predicates: their shape check, and their evaluation against a
 * parsed message.
 *
 * A conditionally-used element's usage is decided by a computable predicate
 * "based on other values within the message" (HL7 v2 conformance methodology,
 * Predicate Definition). This module is that computation. It reads the message
 * in front of it and nothing else: **no network call, and no bundled code
 * set**, so every value a comparison tests against is one the profile author
 * wrote down.
 *
 * ## The three-valued answer
 *
 * A predicate does not decide true or false; it decides TRUE, FALSE, or
 * UNEVALUATABLE. The third is the whole point of this module. A conditional the
 * message cannot decide must not be reported as satisfied, because an element
 * nothing assessed is exactly the case an empty findings list must not cover
 * silently.
 *
 * The split is not a judgement call, it follows from what each statement asks:
 *
 * - A **presence** statement (`is valued` / `is not valued`) is ALWAYS
 *   determinate. An element the message does not carry is simply not valued,
 *   which is an answer.
 * - A **comparison** statement (the six verbs) against an element the message
 *   does not carry is UNEVALUATABLE. The language compares content and there is
 *   no content to compare; deciding it false would be a fabricated answer, and
 *   for a `C(R/X)` rule a fabricated false turns a required element into a
 *   permitted absence.
 * - A **connected** predicate is unevaluatable exactly when its result DEPENDS
 *   on an unevaluatable operand: `AND` is false as soon as one side is false,
 *   `OR` is true as soon as one side is true, and `XOR` always needs both.
 *
 * ## Where a location reads, and what "valued" means there
 *
 * A location is a structural coordinate that narrows from the outside in:
 * segment, then field, then component, then subcomponent. Two questions get two
 * readings of it, matching the language's own split between proposition
 * statements and content statements:
 *
 * - **Valued** asks whether there is ANY content at or below the coordinate.
 *   A field-only location is valued when any subcomponent of any component of
 *   any repetition is non-empty, which is exactly the reading the engine's `R`
 *   and `X` checks already use for a field; a segment-only location is valued
 *   when the segment occurs.
 * - **The value** a comparison tests is the subcomponent AT the coordinate,
 *   with an omitted component and subcomponent both defaulting to `1`, exactly
 *   as a field rule's own `component` default does. A segment-only location has
 *   no value at all, which is why a comparison must name a field.
 *
 * ## One answer per rule, over the whole message
 *
 * A predicate is evaluated ONCE for the rule that declares it, not once per
 * occurrence: its location is message-wide. Where the location names a
 * repeating field or a segment that occurs more than once, the statement is
 * decided TRUE when one or more of those repetitions or occurrences satisfies
 * it, which is the language's default occurrence semantics ("at least one
 * occurrence of"). That existential covers the negative verbs too: `is not` is
 * true when SOME repetition is not one of the listed values, and not when every
 * repetition is not one. So a verb and its negative are complements value by
 * value but NOT statement by statement, and at a repeating location both can
 * decide true. The published types say so; do not "restore" a complement claim
 * here without changing `satisfies` to quantify the negatives universally,
 * which is a different language.
 *
 * @internal
 */

import type { Hl7Message } from "../model/message.js";
import type { RawRepetition } from "../parser/types.js";

import type { ProfileDefect } from "./profile-shape.js";
import type {
  ComparisonPredicate,
  ConditionPredicate,
  ConnectedPredicate,
  FindingLocus,
  PredicateLocation,
  PresencePredicate,
} from "./types.js";
import { PREDICATE_CONNECTORS, PREDICATE_VERBS } from "./types.js";
import { describeValueType, isRecord } from "./usage.js";

/** Segment-name shape a predicate location must satisfy. Mirrors the profile's rule. @internal */
const SEGMENT_NAME_RE = /^[A-Z][A-Z0-9]{2}$/u;

/**
 * How deep a connected predicate may nest before the language stops defining
 * it. A bound rather than unbounded recursion, for two reasons that are really
 * one: a profile is author-supplied configuration and can arrive through `any`,
 * so it can be arbitrarily deep or even self-referential, and the engine's
 * never-throws invariant does not survive a stack overflow. Anything deeper is
 * a shape the language does not define, reported as `PROFILE_MALFORMED`.
 *
 * @internal
 */
export const MAX_PREDICATE_DEPTH = 16;

/**
 * The answer a predicate gives: decided true, decided false, or not decidable
 * against this message.
 *
 * @internal
 */
export type PredicateOutcome = "true" | "false" | "unevaluatable";

/**
 * Compile one `matches` / `does not match` value as an anchored regular
 * expression, or `undefined` when the platform cannot compile it.
 *
 * Anchored over the WHOLE value, per the language's reading of a regular
 * expression as the content's required form (`MR\d{5}` describes `MR83452`, not
 * every string that happens to contain one). Read in Unicode mode, so a pattern
 * that is not valid Unicode-mode source is refused as a profile defect rather
 * than silently reinterpreted.
 *
 * @internal
 */
export function compileAnchored(source: string): RegExp | undefined {
  try {
    return new RegExp(`^(?:${source})$`, "u");
  } catch {
    return undefined;
  }
}

/**
 * Render a {@link PredicateLocation} as a compact structural string for a
 * finding message: `PID`, `PID-8`, `RXA-9 component 1`, `PID-5 component 1
 * subcomponent 2`. Indices and a segment name only: never a value, and never
 * anything drawn from the predicate's value list.
 *
 * @internal
 */
export function describeLocation(location: PredicateLocation): string {
  let s = location.segment;
  if (location.field !== undefined) s += `-${String(location.field)}`;
  if (location.component !== undefined) s += ` component ${String(location.component)}`;
  if (location.subcomponent !== undefined) {
    s += ` subcomponent ${String(location.subcomponent)}`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Which statement is this? Asked ONCE, by the shape check and the evaluator
// alike, because two readings of one union is how a predicate gets admitted as
// one kind of statement and then evaluated as another.
// ---------------------------------------------------------------------------

/**
 * The three keys that say WHICH statement a candidate predicate is: a presence
 * statement, a comparison statement, or two of those joined by a connector.
 *
 * @internal
 */
const DISCRIMINANT_KEYS = ["presence", "verb", "connector"] as const;

/** One of {@link DISCRIMINANT_KEYS}. @internal */
type DiscriminantKey = (typeof DISCRIMINANT_KEYS)[number];

/**
 * Which of {@link DISCRIMINANT_KEYS} a candidate predicate CARRIES, read by key
 * presence rather than by value.
 *
 * This is a function so that the shape check and the evaluator cannot drift
 * apart, because they did: the check counted keys whose VALUE was not
 * `undefined` while the evaluator asked `"connector" in predicate`. A statement
 * carrying a discriminant key set to `undefined` therefore passed the check as
 * one kind of statement and was then read as another - crashing on
 * `connector: undefined` and, worse, silently evaluating a comparison carrying
 * `presence: undefined` as `is not valued` at the comparison's location, which
 * decides a conditional element's usage from a question the profile never
 * asked. Neither needed a cast to reach: a union target's excess-property check
 * admits any property declared by ANY member, so
 * `{ connector: undefined, location, verb: "is", values: [...] }` type-checks
 * against {@link ConditionPredicate} as written.
 *
 * Key presence is the reading that fails safe. A statement carrying two
 * discriminant keys is ambiguous however either one is valued, so it is
 * refused as `PROFILE_MALFORMED` and the author is told to omit the key rather
 * than to set it to nothing. Guessing which question was meant is the one thing
 * this engine will not do: a conditional decided from the wrong question turns a
 * required element into a permitted absence, silently.
 *
 * Total over `unknown` and never throws, like everything else a profile's own
 * content reaches: a candidate predicate that is not a record at all declares no
 * statement, which is a shape the shape check reports and the evaluator refuses
 * to decide.
 *
 * @internal
 */
function declaredKinds(predicate: unknown): readonly DiscriminantKey[] {
  if (!isRecord(predicate)) return [];
  return DISCRIMINANT_KEYS.filter((key) => key in predicate);
}

// ---------------------------------------------------------------------------
// Shape check. Total over `unknown`: a predicate can arrive as any value at all.
// ---------------------------------------------------------------------------

/** Is `v` a positive (1-indexed) integer? @internal */
function isPosition(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

/** Validate a predicate location; append any defect. @internal */
function checkLocation(
  location: unknown,
  where: string,
  needsField: boolean,
  locus: FindingLocus,
  out: ProfileDefect[],
): void {
  if (!isRecord(location)) {
    out.push({
      locus,
      detail: `${where} location must be an object naming a segment, not ${describeValueType(location)}.`,
    });
    return;
  }
  const segment = location["segment"];
  if (typeof segment !== "string" || !SEGMENT_NAME_RE.test(segment)) {
    out.push({
      locus,
      detail: `${where} location.segment must be a valid segment name ([A-Z][A-Z0-9]{2}).`,
    });
    return;
  }
  const field = location["field"];
  const component = location["component"];
  const subcomponent = location["subcomponent"];
  if (field !== undefined && !isPosition(field)) {
    out.push({ locus, detail: `${where} location.field must be a positive (1-indexed) integer.` });
    return;
  }
  if (component !== undefined && !isPosition(component)) {
    out.push({
      locus,
      detail: `${where} location.component must be a positive (1-indexed) integer.`,
    });
    return;
  }
  if (subcomponent !== undefined && !isPosition(subcomponent)) {
    out.push({
      locus,
      detail: `${where} location.subcomponent must be a positive (1-indexed) integer.`,
    });
    return;
  }
  // The coordinate narrows from the outside in, so a level may not be skipped:
  // a component with no field, or a subcomponent with no component, addresses
  // nothing in the message.
  if (component !== undefined && field === undefined) {
    out.push({
      locus,
      detail: `${where} location names a component with no field, which addresses no element.`,
    });
    return;
  }
  if (subcomponent !== undefined && component === undefined) {
    out.push({
      locus,
      detail: `${where} location names a subcomponent with no component, which addresses no element.`,
    });
    return;
  }
  if (needsField && field === undefined) {
    out.push({
      locus,
      detail: `${where} compares content, so its location must name a field; a segment on its own has no content to compare.`,
    });
  }
}

/** Validate a comparison statement's value list; append any defect. @internal */
function checkValues(
  statement: Record<string, unknown>,
  verb: string,
  where: string,
  locus: FindingLocus,
  out: ProfileDefect[],
): void {
  const values = statement["values"];
  if (!Array.isArray(values)) {
    out.push({
      locus,
      detail: `${where} must carry a values list, not ${describeValueType(values)}.`,
    });
    return;
  }
  if (values.length === 0) {
    out.push({ locus, detail: `${where} must carry at least one value to compare against.` });
    return;
  }
  // Holes first, because `every`, `some` and `includes` all SKIP them: a sparse
  // array (`const v: string[] = []; v.length = 2;`) reads to those three as "no
  // entry disagrees", which is a length wearing no values at all, and
  // `does not contain` against one then decides a fabricated TRUE. An index
  // walk sees the hole for what it is. Named by INDEX and never by content, on
  // the same terms as the regular-expression check below.
  for (let i = 0; i < values.length; i++) {
    if (!(i in values)) {
      out.push({
        locus,
        detail: `${where} values[${String(i)}] is missing; a sparse list declares a length without declaring a value.`,
      });
      return;
    }
  }
  if (!values.every((v) => typeof v === "string")) {
    out.push({ locus, detail: `${where} values must all be strings.` });
    return;
  }
  if (verb !== "matches" && verb !== "does not match") return;
  // A regular-expression value is refused BY INDEX rather than by echoing the
  // pattern: a predicate's value list is profile content that no finding may
  // carry, and the index is what an author needs to find it anyway.
  for (let i = 0; i < values.length; i++) {
    const source = values[i];
    if (typeof source === "string" && compileAnchored(source) === undefined) {
      out.push({
        locus,
        detail: `${where} values[${String(i)}] is not a regular expression this platform can compile.`,
      });
      return;
    }
  }
}

/**
 * Collect every structural defect in a candidate condition predicate. **Total
 * over `unknown` and never throws**: a predicate may arrive as `null`, an
 * array, a wrong-typed value list, or any shape forced through `any`.
 *
 * `where` is the caller's PHI-free label for the rule that declares it
 * (`segment "PID" field 8 condition`), extended here with the path into the
 * predicate so a defect inside a connector says which side it is on.
 *
 * @internal
 */
export function collectPredicateDefects(
  predicate: unknown,
  where: string,
  locus: FindingLocus,
  out: ProfileDefect[],
  depth = 1,
): void {
  if (depth > MAX_PREDICATE_DEPTH) {
    out.push({
      locus,
      detail: `${where} nests deeper than ${String(MAX_PREDICATE_DEPTH)} connectors, which the language does not define.`,
    });
    return;
  }
  if (!isRecord(predicate)) {
    out.push({
      locus,
      detail: `${where} must be a presence statement, a comparison statement, or two of those joined by a connector, not ${describeValueType(predicate)}.`,
    });
    return;
  }

  // Exactly one of the three discriminants may be present, read the one way
  // `declaredKinds` reads them. A statement carrying two is a shape the
  // language does not define, and guessing which one the author meant is the
  // one thing this engine will not do.
  const kinds = declaredKinds(predicate);
  if (kinds.length !== 1) {
    out.push({
      locus,
      detail:
        kinds.length === 0
          ? `${where} declares no presence, verb or connector, so it states nothing.`
          : `${where} declares ${String(kinds.length)} of presence, verb and connector at once, which the language does not define. A key set to undefined still declares it: omit the key instead.`,
    });
    return;
  }

  const [kind] = kinds;
  if (kind === "connector") {
    const connector = predicate["connector"];
    if (typeof connector !== "string" || !PREDICATE_CONNECTORS.includes(connector as never)) {
      out.push({
        locus,
        detail: `${where} connector must be one of ${PREDICATE_CONNECTORS.join("/")}.`,
      });
      return;
    }
    for (const side of ["left", "right"] as const) {
      if (predicate[side] === undefined) {
        out.push({ locus, detail: `${where} ${connector} is missing its ${side} operand.` });
        continue;
      }
      collectPredicateDefects(predicate[side], `${where} ${side}`, locus, out, depth + 1);
    }
    return;
  }

  if (kind === "presence") {
    const presence = predicate["presence"];
    if (presence !== "is valued" && presence !== "is not valued") {
      out.push({ locus, detail: `${where} presence must be "is valued" or "is not valued".` });
      return;
    }
    checkLocation(predicate["location"], where, false, locus, out);
    return;
  }

  const verb = predicate["verb"];
  if (typeof verb !== "string" || !PREDICATE_VERBS.includes(verb as never)) {
    out.push({ locus, detail: `${where} verb must be one of ${PREDICATE_VERBS.join("/")}.` });
    return;
  }
  checkLocation(predicate["location"], where, true, locus, out);
  checkValues(predicate, verb, where, locus, out);
}

// ---------------------------------------------------------------------------
// Evaluation. Reached only for a predicate the shape check admitted, so the
// narrowing below is a read rather than a re-validation.
// ---------------------------------------------------------------------------

/** Every repetition of the located field, across every occurrence of its segment. @internal */
function locatedRepetitions(
  message: Hl7Message,
  location: PredicateLocation,
): readonly RawRepetition[] {
  const field = location.field;
  if (field === undefined) return [];
  const reps: RawRepetition[] = [];
  for (const segment of message.segments(location.segment)) {
    reps.push(...segment.field(field).repetitions);
  }
  return reps;
}

/**
 * Does the message carry ANY content at or below the location? A field-only
 * location asks about the whole field, a component-scoped one about that
 * component, a segment-only one about the segment occurring at all.
 *
 * @internal
 */
function isValued(message: Hl7Message, location: PredicateLocation): boolean {
  if (location.field === undefined) return message.segments(location.segment).length > 0;
  return locatedRepetitions(message, location).some((rep) => {
    if (location.component === undefined) {
      return rep.components.some((c) => c.subcomponents.some((s) => s !== ""));
    }
    const component = rep.components[location.component - 1];
    if (component === undefined) return false;
    if (location.subcomponent === undefined) {
      return component.subcomponents.some((s) => s !== "");
    }
    return (component.subcomponents[location.subcomponent - 1] ?? "") !== "";
  });
}

/**
 * The non-empty values a comparison at this location has to compare, one per
 * repetition per occurrence. An empty result means the message carries no
 * content there, which is what makes a comparison unevaluatable.
 *
 * @internal
 */
function comparableValues(message: Hl7Message, location: PredicateLocation): readonly string[] {
  const component = location.component ?? 1;
  const subcomponent = location.subcomponent ?? 1;
  const values: string[] = [];
  for (const rep of locatedRepetitions(message, location)) {
    const value = rep.components[component - 1]?.subcomponents[subcomponent - 1] ?? "";
    if (value !== "") values.push(value);
  }
  return values;
}

/** Is this verb one whose value list is read as regular expressions? @internal */
function isPatternVerb(verb: ComparisonPredicate["verb"]): boolean {
  return verb === "matches" || verb === "does not match";
}

/**
 * Does one value stand in the verb's relation to the value list?
 *
 * `patterns` is the value list already compiled, positionally, and is read only
 * by the two pattern verbs; an entry is `undefined` where the platform cannot
 * compile that source, which the shape check has already refused, so here it
 * simply never matches. Passed in rather than compiled here because this is
 * called once per repetition per occurrence and the compilation does not depend
 * on the value being tested.
 *
 * @internal
 */
function satisfies(
  verb: ComparisonPredicate["verb"],
  value: string,
  values: readonly string[],
  patterns: readonly (RegExp | undefined)[],
) {
  switch (verb) {
    case "is":
      return values.includes(value);
    case "is not":
      return !values.includes(value);
    case "contains":
      return values.some((v) => value.includes(v));
    case "does not contain":
      return !values.some((v) => value.includes(v));
    case "matches":
      return patterns.some((p) => p?.test(value) === true);
    case "does not match":
      return !patterns.some((p) => p?.test(value) === true);
  }
}

/**
 * What evaluating a predicate produced: the outcome, plus the locations a
 * comparison could not be decided at. `undecided` is populated ONLY when the
 * whole predicate came back unevaluatable, so it always names locations the
 * answer actually depended on: an `AND` whose other side is false, for
 * instance, is decided false and names none.
 *
 * @internal
 */
export interface PredicateEvaluation {
  readonly outcome: PredicateOutcome;
  readonly undecided: readonly PredicateLocation[];
}

/** A decided outcome names no undecided location. @internal */
function decided(outcome: PredicateOutcome): PredicateEvaluation {
  return { outcome, undecided: [] };
}

/** Evaluate a presence statement. Always determinate. @internal */
function evaluatePresence(message: Hl7Message, statement: PresencePredicate): PredicateEvaluation {
  const valued = isValued(message, statement.location);
  const held = statement.presence === "is valued" ? valued : !valued;
  return decided(held ? "true" : "false");
}

/** Evaluate a comparison statement. Unevaluatable when there is no content. @internal */
function evaluateComparison(
  message: Hl7Message,
  statement: ComparisonPredicate,
): PredicateEvaluation {
  const values = comparableValues(message, statement.location);
  if (values.length === 0) {
    return { outcome: "unevaluatable", undecided: [statement.location] };
  }
  // Compile a pattern list ONCE per statement rather than once per listed
  // pattern per repetition per occurrence. Identical answer, and the work it
  // removes grows with how often the location repeats. Done after the emptiness
  // check above, so a location the message does not carry compiles nothing.
  const patterns = isPatternVerb(statement.verb) ? statement.values.map(compileAnchored) : [];
  // "At least one occurrence of" is the language's default: one repetition or
  // occurrence satisfying the statement decides it true, negative verbs
  // included (`is not` is true when SOME repetition is not a listed value, NOT
  // when every repetition is not one, so at a repeating location a verb and its
  // negative can both decide true).
  return decided(
    values.some((v) => satisfies(statement.verb, v, statement.values, patterns)) ? "true" : "false",
  );
}

/** Combine two operand outcomes under a connector. @internal */
function combine(
  connector: ConnectedPredicate["connector"],
  left: PredicateOutcome,
  right: PredicateOutcome,
): PredicateOutcome {
  switch (connector) {
    case "AND":
      // False on either side settles it, whatever the other side is: the result
      // does not DEPEND on an operand it cannot see.
      if (left === "false" || right === "false") return "false";
      if (left === "unevaluatable" || right === "unevaluatable") return "unevaluatable";
      return "true";
    case "OR":
      if (left === "true" || right === "true") return "true";
      if (left === "unevaluatable" || right === "unevaluatable") return "unevaluatable";
      return "false";
    case "XOR":
      // Exactly one, so both sides always matter.
      if (left === "unevaluatable" || right === "unevaluatable") return "unevaluatable";
      return left === right ? "false" : "true";
  }
}

/**
 * Evaluate a condition predicate against the message: TRUE, FALSE, or
 * UNEVALUATABLE.
 *
 * **Never throws and never mutates the message.** Reads it only, and reads
 * nothing else: no network call, no code set.
 *
 * @internal
 */
export function evaluatePredicate(
  message: Hl7Message,
  predicate: ConditionPredicate,
  depth = 1,
): PredicateEvaluation {
  // Defence in depth: the shape check already refused anything deeper, so this
  // can only fire for a predicate that never went through it.
  if (depth > MAX_PREDICATE_DEPTH) return { outcome: "unevaluatable", undecided: [] };
  // Defence in depth again, and the same shape check's other guarantee: exactly
  // one discriminant KEY, counted by the same function, so the `in` tests below
  // read the statement the check admitted rather than a second opinion about
  // which statement it is. A predicate that never went through the check is
  // undecidable here, never guessed at and never a throw.
  if (declaredKinds(predicate).length !== 1) return { outcome: "unevaluatable", undecided: [] };
  if ("connector" in predicate) {
    const left = evaluatePredicate(message, predicate.left, depth + 1);
    const right = evaluatePredicate(message, predicate.right, depth + 1);
    const outcome = combine(predicate.connector, left.outcome, right.outcome);
    if (outcome !== "unevaluatable") return decided(outcome);
    return { outcome, undecided: [...left.undecided, ...right.undecided] };
  }
  if ("presence" in predicate) return evaluatePresence(message, predicate);
  return evaluateComparison(message, predicate);
}
