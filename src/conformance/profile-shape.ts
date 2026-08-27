/**
 * Profile-shape validation for the conformance engine. A
 * conformance profile is **consumer-authored configuration**, so it can be
 * malformed. Two entry points share one total defect collector:
 *
 * - {@link collectProfileDefects}: **total over `unknown`, never throws.** It
 *   returns a list of structural {@link ProfileDefect}s (empty ⇒ well-formed).
 *   {@link validateAgainstProfile} calls it first and, on any defect, returns
 *   `PROFILE_MALFORMED` findings instead of validating a profile it cannot
 *   trust (never a silent pass).
 * - {@link defineConformanceProfile}: the **fail-fast authoring** helper. It
 *   runs the same collector and **throws {@link ProfileDefinitionError}** on the
 *   first-through-all defects, returning the profile typed on success. Use it at
 *   profile-authoring time; the engine itself never throws (task invariant).
 *
 * A defect `detail` describes the profile's SHAPE (`segments[2].fields[0].field
 * must be a positive integer`): profile structure only, never PHI.
 *
 * Three families of check here are about COHERENCE rather than shape, and all
 * three come from the HL7 conformance methodology rather than from this
 * library: the usage-to-cardinality relationship of section 5.2.1 plus the
 * not-supported terminus (see {@link checkUsageCardinalityCoherence}), the rule
 * that a component's cardinality is implied by its usage and may not be
 * declared beside it (see {@link checkComponentRules}), and the terminus an
 * IMPLEMENTABLE profile's own claim imposes on every element it declares (see
 * {@link checkImplementableUsage}). The first two are applied to what a rule
 * DECLARES, so a rule that declares nothing is refused nothing. The third is
 * the one deliberate exception, and only for a profile that asked for it: at
 * the implementable level a rule that declares NO usage is refused too, because
 * silence there means Optional and the level asserts optionality is gone.
 *
 * @internal (the two functions are re-exported from the package root)
 */

import { KNOWN_CODING_SYSTEMS, codingSystem } from "../model/coding-system.js";
import { ProfileDefinitionError } from "../parser/errors.js";

import { DEFAULT_PROFILE_LEVEL, claimsImplementable, usageIsImplementable } from "./level.js";
import { collectPredicateDefects } from "./predicate.js";
import { PROFILE_LEVELS, type ConformanceProfile, type FindingLocus } from "./types.js";
import {
  SIMPLE_USAGE_CODES,
  boundedToken,
  describeValueType,
  parseUsageToken,
  predicateOutcomes,
  usageIsAdmissible,
} from "./usage.js";

/** Segment-name shape: 3 chars, standard or `Z…` segment. Mirrors the model's rule. @internal */
const SEGMENT_NAME_RE = /^[A-Z][A-Z0-9]{2}$/u;

/** The three valid severities, for shape validation. @internal */
const SEVERITIES: readonly string[] = ["error", "warning", "info"];

/**
 * One structural defect in a profile: the PHI-free `detail` plus a best-effort
 * {@link FindingLocus} (so the engine can attach it to a `PROFILE_MALFORMED`
 * finding). When the defect is above segment level, `locus.segment` is the
 * sentinel `"(profile)"`.
 *
 * @internal
 */
export interface ProfileDefect {
  readonly locus: FindingLocus;
  readonly detail: string;
}

/** Is `v` a plain object (not null, not an array)? @internal */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validate a {@link Cardinality} value; append any defect to `out`. @internal */
function checkCardinality(card: unknown, locus: FindingLocus, out: ProfileDefect[]): void {
  if (card === undefined) return;
  if (!isObject(card)) {
    out.push({ locus, detail: `${describe(locus)} cardinality must be an object.` });
    return;
  }
  const min = card["min"];
  const max = card["max"];
  if (min !== undefined && (typeof min !== "number" || !Number.isInteger(min) || min < 0)) {
    out.push({
      locus,
      detail: `${describe(locus)} cardinality.min must be a non-negative integer.`,
    });
  }
  if (
    max !== undefined &&
    max !== "*" &&
    (typeof max !== "number" || !Number.isInteger(max) || max < 0)
  ) {
    out.push({
      locus,
      detail: `${describe(locus)} cardinality.max must be a non-negative integer or "*".`,
    });
  }
  if (
    typeof min === "number" &&
    typeof max === "number" &&
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    max < min
  ) {
    out.push({
      locus,
      detail: `${describe(locus)} cardinality.max (${String(max)}) is less than min (${String(min)}).`,
    });
  }
}

/** Compact locus label for a defect detail. @internal */
function describe(locus: FindingLocus): string {
  if (locus.segment === "(profile)") return "profile";
  let s = `segment "${locus.segment}"`;
  if (locus.field !== undefined) s += ` field ${String(locus.field)}`;
  if (locus.component !== undefined) s += ` component ${String(locus.component)}`;
  return s;
}

/**
 * Is `v` a cardinality bound the shape check already accepts? The coherence
 * rules below read `min` / `max` as NUMBERS, so a bound that is not one has
 * nothing coherent to say about a usage code and is left to
 * {@link checkCardinality}, which has already reported it. Reporting both would
 * derive a second defect from the first.
 *
 * @internal
 */
function isCardinalityBound(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/**
 * The usage-to-cardinality coherence the HL7 conformance methodology states in
 * section 5.2.1 (Relationship between usage and cardinality) plus the
 * not-supported terminus, applied to segment rules and field rules alike.
 *
 * Three constraints, and the second carries the methodology's own exception:
 *
 * 1. **A Required element's minimum cardinality is 1 or greater.** `R` with a
 *    declared `min` of 0 says the element is required and permitted to be
 *    absent at once, which is not a constraint an author can have meant.
 * 2. **Any usage other than `R` takes a minimum of 0**, except that an author
 *    may pair `RE` with a minimum greater than 0 to say "not always present,
 *    but when present it occurs at least this many times". The methodology
 *    names `RE` specifically, so the exception is `RE`'s alone and does not
 *    extend to a declared conditional that happens to carry `RE` as an outcome:
 *    the outcome is selected per message, and this is a check on what the
 *    profile DECLARES.
 * 3. **`X` admits `[0..0]` and nothing else**, so a declared `max` other than 0
 *    contradicts the usage.
 *
 * **Applied to the usage a rule DECLARES, and only that.** An OMITTED usage is
 * not a usage: the rule means Optional, nothing is refused, and no profile that
 * authored cleanly before is newly refused for saying nothing. An omitted
 * cardinality bound is not a declared bound either, on the same terms: a rule
 * declaring `X` with no cardinality at all is accepted, because it constrains
 * the count nowhere and therefore contradicts nothing.
 *
 * A usage token the grammar does not admit is skipped: {@link checkUsage} has
 * already reported it and a coherence complaint derived from a token that means
 * nothing would only restate it.
 *
 * @internal
 */
function checkUsageCardinalityCoherence(
  usage: unknown,
  card: unknown,
  locus: FindingLocus,
  out: ProfileDefect[],
): void {
  if (usage === undefined || typeof usage !== "string") return;
  if (parseUsageToken(usage) === undefined) return;
  if (!isObject(card)) return;

  const min = card["min"];
  const max = card["max"];
  const where = describe(locus);

  if (usage === "R") {
    if (isCardinalityBound(min) && min === 0) {
      out.push({
        locus,
        detail:
          `${where} declares usage R with cardinality.min 0. ` +
          `The minimum cardinality of a Required element must be 1 or greater.`,
      });
    }
  } else if (usage !== "RE" && isCardinalityBound(min) && min > 0) {
    // The detail names the CONSTRAINT and the locus, never the offending token.
    // Every usage but R and RE is refused here on identical terms, and the
    // engine's substitution invariant (an unresolved conditional and B are
    // findings-identical to C) is pinned on the defect too: echoing the token
    // would make one profile's defect differ from another's for no reason an
    // author could act on, since the token is not what is wrong here. The
    // PAIRING is, and the locus plus the rule says so.
    out.push({
      locus,
      detail:
        `${where} declares a usage other than R with cardinality.min ${String(min)}. ` +
        `A usage other than R takes a minimum cardinality of 0. The one exception is RE, which may carry a minimum greater than 0 to say that the element is not always present but has that many occurrences when it is.`,
    });
  }

  if (usage === "X" && max !== undefined && (max === "*" || isCardinalityBound(max)) && max !== 0) {
    out.push({
      locus,
      detail:
        `${where} declares usage X with cardinality.max ${String(max)}. ` +
        `A not-supported element admits the cardinality [0..0] and no other, so its maximum must be 0 or left undeclared.`,
    });
  }
}

/**
 * Validate the level a profile claims: absent, or one of the three
 * {@link PROFILE_LEVELS}.
 *
 * **An OMITTED level is not a claim**: it is not refused, and the profile is
 * assessed and echoed as `constrainable`, so no profile that authored cleanly
 * before the declaration existed is newly refused.
 *
 * A level that is not one of the three is a defect however it is wrong: a token
 * outside the set, a mis-spelling, or a value of another type entirely reaching
 * the engine through an unchecked cast. The detail names the offending
 * declaration the way {@link checkUsage} names an offending usage token, which
 * is to say bounded and by type where there is no token worth echoing. A
 * profile's level is author-supplied configuration rather than message content,
 * so echoing it is what lets an author find their typo.
 *
 * @internal
 */
function checkLevel(level: unknown, out: ProfileDefect[]): void {
  if (level === undefined) return;
  const locus: FindingLocus = { segment: "(profile)" };
  const expected = `Expected one of ${PROFILE_LEVELS.join("/")}, or no level at all (which claims ${DEFAULT_PROFILE_LEVEL}).`;
  if (typeof level !== "string") {
    out.push({
      locus,
      detail: `profile.level must be a string, not ${describeValueType(level)}. ${expected}`,
    });
    return;
  }
  if ((PROFILE_LEVELS as readonly string[]).includes(level)) return;
  out.push({
    locus,
    detail: `profile.level "${boundedToken(level)}" is not a conformance profile level. ${expected}`,
  });
}

/**
 * The methodology's implementable-level terminus, as the sentence every refusal
 * of that claim ends with. Written out rather than derived from the code set
 * `level.ts` holds: those codes are a set the check reads, this is prose about a
 * rule, and joining a frozen array into English reads worse than the English
 * does.
 *
 * @internal
 */
const IMPLEMENTABLE_TERMINUS =
  "An implementable profile has removed all optionality, so each element is either supported (R or RE) or it is not (X), " +
  "and a declared conditional's outcomes are drawn from the same three.";

/**
 * The IMPLEMENTABLE-level gate on one rule's usage, applied to segment, field
 * and component rules alike, and applied ONLY when the profile claims that
 * level.
 *
 * The methodology's terminus is that in an implementable profile ultimately
 * only two possibilities are allowed: either a specific element is supported
 * (`R` or `RE`) or it is not (`X`), and a conditional usage's true and false
 * outcomes must also be defined only as `R`, `RE` or `X`. So the level is a
 * checkable claim rather than a label, and the two ways to break it are the two
 * defects below.
 *
 * 1. **A rule that declares no usage at all.** An omitted usage means Optional,
 *    and the level asserts optionality has been removed, so silence is a claim
 *    the profile cannot make here. This is the one place an omitted usage is
 *    refused, and it is refused because the profile ASKED to be held to it.
 * 2. **A usage the level does not admit**: `C`, `CE`, `O` or `B`, or a declared
 *    conditional carrying any of them as an outcome. `C` and `CE` are refused
 *    even though this engine knows outcomes for them, because the methodology
 *    requires an implementable profile's conditional outcomes to be DEFINED,
 *    and a bare code defines them nowhere in the profile. An author who means
 *    `C` at this level writes `C(R/X)` and says so.
 *
 * A token the declarable-usage grammar does not admit at all is skipped:
 * {@link checkUsage} has already reported it, and a level complaint derived
 * from a token that means nothing would only restate it.
 *
 * @internal
 */
function checkImplementableUsage(usage: unknown, locus: FindingLocus, out: ProfileDefect[]): void {
  const where = describe(locus);

  if (usage === undefined) {
    out.push({
      locus,
      detail:
        `${where} declares no usage, and this profile claims the implementable level. ` +
        `An omitted usage means Optional. ${IMPLEMENTABLE_TERMINUS}`,
    });
    return;
  }
  if (typeof usage !== "string" || parseUsageToken(usage) === undefined) return;
  if (usageIsImplementable(usage)) return;
  out.push({
    locus,
    detail:
      `${where} declares usage "${boundedToken(usage)}", which this profile's claim of the implementable level does not admit. ` +
      IMPLEMENTABLE_TERMINUS,
  });
}

/**
 * Validate a field rule's declared component rules: the list itself, each
 * entry's index, usage and severity, and the one constraint a component rule
 * may NOT carry.
 *
 * **A component's cardinality is implied by its usage, never declared.** The
 * methodology requires an explicit cardinality range for segment groups,
 * segments and field elements and states that component and sub-component
 * elements do not include one: the range is implicitly associated with the
 * element and follows from its usage code. So a `cardinality` here is a defect
 * rather than an extra constraint the engine quietly honours, because honouring
 * it would let a profile declare a component range the methodology says a
 * component cannot have.
 *
 * **A duplicate index is a defect rather than a last-wins merge.** Two rules at
 * one component are two answers to one question, and picking either by array
 * order would decide an element's usage by accident of authoring order.
 *
 * An OMITTED `components` is not a declaration, so it is not walked and no
 * field rule that authored cleanly before is newly refused. An EMPTY list is
 * not a declaration either and is accepted on the same terms: a rule carrying
 * no component rules declares no depth, the validator checks it exactly as it
 * checks a rule that omits the list, and refusing it here would newly refuse a
 * profile whose only fault is saying nothing. There is nothing to walk, so this
 * function has nothing to report about it.
 *
 * @internal
 */
function checkComponentRules(
  rule: Record<string, unknown>,
  fieldLocus: FindingLocus,
  implementable: boolean,
  out: ProfileDefect[],
): void {
  const comps = rule["components"];
  if (comps === undefined) return;
  const where = describe(fieldLocus);
  if (!Array.isArray(comps)) {
    out.push({
      locus: fieldLocus,
      detail: `${where} components must be an array of component rules, not ${describeValueType(comps)}.`,
    });
    return;
  }

  const seen = new Set<number>();
  for (let k = 0; k < comps.length; k++) {
    const at = `${where} components[${String(k)}]`;
    const comp: unknown = comps[k];
    if (!isObject(comp)) {
      out.push({
        locus: fieldLocus,
        detail: `${at} must be an object, not ${describeValueType(comp)}.`,
      });
      continue;
    }
    const index = comp["component"];
    if (typeof index !== "number" || !Number.isInteger(index) || index < 1) {
      out.push({
        locus: fieldLocus,
        detail: `${at}.component must be a positive (1-indexed) integer.`,
      });
      continue;
    }
    const compLocus: FindingLocus = { ...fieldLocus, component: index };
    if (seen.has(index)) {
      out.push({
        locus: compLocus,
        detail:
          `${at} declares component ${String(index)}, which an earlier component rule on this field already declares. ` +
          `Declare each component once: two rules at one component are two answers to one question.`,
      });
    }
    seen.add(index);
    checkUsage(comp["usage"], compLocus, out);
    if (implementable) checkImplementableUsage(comp["usage"], compLocus, out);
    checkSeverity(comp["severity"], compLocus, out);
    if (comp["cardinality"] !== undefined) {
      out.push({
        locus: compLocus,
        detail:
          `${at} declares a cardinality. A component's cardinality is implied by its usage and may not be declared: ` +
          `R implies [1..1], RE and O imply [0..1], and X implies [0..0].`,
      });
    }
  }
}

/**
 * Collect every structural defect in a candidate conformance profile. **Total
 * over `unknown` and never throws**: a caller may pass any value (even one
 * cast through `any`) and get back a defect list rather than an exception. An
 * empty result means the profile is well-formed enough to validate against.
 *
 * @internal
 */
export function collectProfileDefects(profile: unknown): readonly ProfileDefect[] {
  const out: ProfileDefect[] = [];
  const root: FindingLocus = { segment: "(profile)" };

  if (!isObject(profile)) {
    out.push({ locus: root, detail: "profile must be an object with `name` and `segments`." });
    return out;
  }
  if (typeof profile["name"] !== "string" || profile["name"].trim().length === 0) {
    out.push({ locus: root, detail: "profile.name must be a non-empty string." });
  }
  checkLevel(profile["level"], out);
  // A claim of standard or constrainable imposes nothing on any element: both
  // levels are DEFINED as leaving optionality in place, so there is nothing to
  // check. Only the implementable claim opens the gate below.
  const implementable = claimsImplementable(profile);
  const segments = profile["segments"];
  if (!Array.isArray(segments)) {
    out.push({ locus: root, detail: "profile.segments must be an array of segment rules." });
    return out;
  }

  for (let i = 0; i < segments.length; i++) {
    const seg: unknown = segments[i];
    if (!isObject(seg)) {
      out.push({ locus: root, detail: `segments[${String(i)}] must be an object.` });
      continue;
    }
    const name = seg["segment"];
    if (typeof name !== "string" || !SEGMENT_NAME_RE.test(name)) {
      out.push({
        locus: root,
        detail: `segments[${String(i)}].segment must be a valid segment name ([A-Z][A-Z0-9]{2}).`,
      });
      continue;
    }
    const segLocus: FindingLocus = { segment: name };
    checkUsage(seg["usage"], segLocus, out);
    if (implementable) checkImplementableUsage(seg["usage"], segLocus, out);
    checkCondition(seg["condition"], seg["usage"], segLocus, out);
    checkSeverity(seg["severity"], segLocus, out);
    checkCardinality(seg["cardinality"], segLocus, out);
    checkUsageCardinalityCoherence(seg["usage"], seg["cardinality"], segLocus, out);

    const fields = seg["fields"];
    if (fields !== undefined) {
      if (!Array.isArray(fields)) {
        out.push({ locus: segLocus, detail: `segment "${name}" fields must be an array.` });
        continue;
      }
      for (let j = 0; j < fields.length; j++) {
        checkFieldRule(fields[j], name, j, implementable, out);
      }
    }
  }
  return out;
}

/**
 * Validate a rule's usage against the declarable-usage grammar; append a defect
 * if it is present and the grammar does not admit it.
 *
 * **An OMITTED usage is not a usage**: the grammar does not apply to it, this
 * check returns before anything else, and the rule keeps its meaning of
 * Optional. So no profile that authored cleanly before is newly refused.
 *
 * **One defect per rule, never two.** A rule declares exactly one usage token,
 * so a token the grammar rejects is ONE defect however many ways it is wrong.
 * The literal `C(a/b)` is the case worth naming: it is at once the reserved
 * placeholder notation and a token whose outcomes are not simple codes, and it
 * yields exactly ONE `PROFILE_MALFORMED` finding, not one for each reading.
 *
 * The defect names the offending token AS A WHOLE (rather than only its bad
 * part) so an author can find their typo, bounded to the first 32 characters; a
 * usage that is not a string at all has no token worth echoing, so that defect
 * names the value's TYPE instead.
 *
 * @internal
 */
function checkUsage(usage: unknown, locus: FindingLocus, out: ProfileDefect[]): void {
  if (usage === undefined) return;
  if (typeof usage !== "string") {
    out.push({
      locus,
      detail: `${describe(locus)} usage must be a string, not ${describeValueType(usage)}.`,
    });
    return;
  }
  if (parseUsageToken(usage) !== undefined) return;
  out.push({
    locus,
    detail:
      `${describe(locus)} usage "${boundedToken(usage)}" is not a usage code this profile may declare. ` +
      `Expected one of ${SIMPLE_USAGE_CODES.join("/")}, or a declared conditional written C(<true>/<false>) with both outcomes drawn from them.`,
  });
}

/**
 * Validate a rule's declared condition predicate: its own shape, and the one
 * pairing rule that governs where a predicate may be declared at all.
 *
 * **A predicate may only sit on a rule whose usage is conditional** (`C`, `CE`
 * or a declared conditional). Anywhere else there is no conditional usage for
 * it to decide, and the engine reports that rather than ignoring the predicate:
 * the same discipline that makes a caller resolution aimed at a non-conditional
 * rule a defect instead of a silent no-op. An OMITTED condition is not a
 * condition, so no rule that authored cleanly before is newly refused.
 *
 * The pairing complaint is suppressed when the usage token is itself
 * inadmissible, because {@link checkUsage} has already reported that and a
 * second defect derived from it would only restate the first.
 *
 * @internal
 */
function checkCondition(
  condition: unknown,
  usage: unknown,
  locus: FindingLocus,
  out: ProfileDefect[],
): void {
  if (condition === undefined) return;
  const where = `${describe(locus)} condition`;
  collectPredicateDefects(condition, where, locus, out);
  if (!usageIsAdmissible(usage)) return;
  if (predicateOutcomes(usage) === undefined) {
    out.push({
      locus,
      detail:
        `${where} is declared on a rule whose usage is not conditional, so there is no conditional usage for it to decide. ` +
        `A condition predicate belongs on C, CE, or a declared conditional written C(<true>/<false>).`,
    });
  }
}

/** Validate a severity; append defect if present-and-invalid. @internal */
function checkSeverity(sev: unknown, locus: FindingLocus, out: ProfileDefect[]): void {
  if (sev === undefined) return;
  if (typeof sev !== "string" || !SEVERITIES.includes(sev)) {
    out.push({
      locus,
      detail: `${describe(locus)} severity must be one of ${SEVERITIES.join("/")}.`,
    });
  }
}

/**
 * The recognized coding-system identifiers, listed for a defect detail so an
 * author who is refused can see what they may bind to. Read off the library's
 * own provenance map rather than re-derived, so the list cannot drift from the
 * oracle the comparison actually uses.
 *
 * @internal
 */
const RECOGNIZED_CODING_SYSTEMS: string = KNOWN_CODING_SYSTEMS.map((s) => s.id).join("/");

/**
 * Validate a rule's coding-system binding: the identifier itself, the component
 * that carries it, and the one pairing rule that governs where a binding may be
 * declared at all.
 *
 * **A binding needs a value set.** It binds a value set to the system its codes
 * are drawn from, so a binding on a rule that declares none is a defect rather
 * than a system-only check: checking provenance without checking membership is
 * a different constraint, and inventing it here would decide by silence what an
 * author never asked for. An OMITTED binding is not a binding, so no rule that
 * authored cleanly before is newly refused.
 *
 * **A component with no identifier is refused for the same reason**: it names
 * where to read a system nothing is compared against, and ignoring it would be
 * a silent no-op.
 *
 * **Recognition is the library's own frozen provenance map**, which is a
 * deliberate SUBSET of the published registry rather than all of it. So the
 * detail says the identifier is not one this library recognizes: it is not a
 * claim that the identifier is unregistered, and refusing at authoring time is
 * the fail-safe direction against silently comparing a message to a system that
 * cannot be resolved.
 *
 * @internal
 */
function checkCodingSystem(
  rule: Record<string, unknown>,
  locus: FindingLocus,
  out: ProfileDefect[],
): void {
  const bound = rule["codingSystem"];
  const comp = rule["codingSystemComponent"];

  if (comp !== undefined && (typeof comp !== "number" || !Number.isInteger(comp) || comp < 1)) {
    out.push({
      locus,
      detail: `${describe(locus)} codingSystemComponent must be a positive (1-indexed) integer.`,
    });
  }

  if (bound === undefined) {
    if (comp !== undefined) {
      out.push({
        locus,
        detail:
          `${describe(locus)} declares codingSystemComponent without a codingSystem, so it names where to read a coding system that nothing is compared against. ` +
          `Declare codingSystem alongside it, or drop it.`,
      });
    }
    return;
  }

  if (typeof bound !== "string") {
    out.push({
      locus,
      detail: `${describe(locus)} codingSystem must be a string, not ${describeValueType(bound)}.`,
    });
  } else if (bound.trim().length === 0) {
    out.push({
      locus,
      detail: `${describe(locus)} codingSystem must be a non-empty coding-system identifier.`,
    });
  } else if (codingSystem(bound)?.known !== true) {
    out.push({
      locus,
      detail:
        `${describe(locus)} codingSystem "${boundedToken(bound)}" is not a coding-system identifier this library recognizes. ` +
        `Recognized identifiers (and their well-known aliases): ${RECOGNIZED_CODING_SYSTEMS}.`,
    });
  }

  if (rule["valueSet"] === undefined) {
    out.push({
      locus,
      detail:
        `${describe(locus)} declares codingSystem on a rule that declares no valueSet. ` +
        `A coding-system binding binds a value set to the system its codes are drawn from, so there is nothing here for it to bind.`,
    });
  }
}

/** Validate one field rule object. @internal */
function checkFieldRule(
  rule: unknown,
  segment: string,
  index: number,
  implementable: boolean,
  out: ProfileDefect[],
): void {
  const locus: FindingLocus = { segment };
  if (!isObject(rule)) {
    out.push({ locus, detail: `segment "${segment}" fields[${String(index)}] must be an object.` });
    return;
  }
  const field = rule["field"];
  if (typeof field !== "number" || !Number.isInteger(field) || field < 1) {
    out.push({
      locus,
      detail: `segment "${segment}" fields[${String(index)}].field must be a positive (1-indexed) integer.`,
    });
    return;
  }
  const fieldLocus: FindingLocus = { segment, field };
  checkUsage(rule["usage"], fieldLocus, out);
  if (implementable) checkImplementableUsage(rule["usage"], fieldLocus, out);
  checkCondition(rule["condition"], rule["usage"], fieldLocus, out);
  checkSeverity(rule["severity"], fieldLocus, out);
  checkCardinality(rule["cardinality"], fieldLocus, out);
  checkUsageCardinalityCoherence(rule["usage"], rule["cardinality"], fieldLocus, out);

  const len = rule["length"];
  if (len !== undefined && (typeof len !== "number" || !Number.isInteger(len) || len < 0)) {
    out.push({
      locus: fieldLocus,
      detail: `${describe(fieldLocus)} length must be a non-negative integer.`,
    });
  }
  const comp = rule["component"];
  if (comp !== undefined && (typeof comp !== "number" || !Number.isInteger(comp) || comp < 1)) {
    out.push({
      locus: fieldLocus,
      detail: `${describe(fieldLocus)} component must be a positive (1-indexed) integer.`,
    });
  }
  const vs = rule["valueSet"];
  if (vs !== undefined) {
    if (!Array.isArray(vs)) {
      out.push({
        locus: fieldLocus,
        detail: `${describe(fieldLocus)} valueSet must be an array of strings.`,
      });
    } else if (!vs.every((c) => typeof c === "string")) {
      out.push({
        locus: fieldLocus,
        detail: `${describe(fieldLocus)} valueSet entries must all be strings.`,
      });
    }
  }
  checkCodingSystem(rule, fieldLocus, out);
  checkComponentRules(rule, fieldLocus, implementable, out);
}

/**
 * The **fail-fast authoring** gate for a conformance profile: a malformed
 * profile raises a typed `ProfileDefinitionError` at build time, before any
 * validation runs. Runs {@link collectProfileDefects}; on any defect, throws a
 * single {@link ProfileDefinitionError} listing every defect. On success,
 * returns the profile typed as {@link ConformanceProfile}.
 *
 * This is **optional**: {@link validateAgainstProfile} tolerates a raw profile
 * object and never throws: but it lets an author catch a typo when the profile
 * is written rather than when it is run.
 *
 * @throws {ProfileDefinitionError} when the profile is structurally malformed.
 *
 * @example
 * ```ts
 * import { defineConformanceProfile } from "@cosyte/hl7";
 * const profile = defineConformanceProfile({
 *   name: "example-adt-min",
 *   segments: [{ segment: "PID", usage: "R" }],
 * });
 * // A typo throws at authoring time:
 * // defineConformanceProfile({ name: "x", segments: [{ segment: "pid" }] });
 * //   → ProfileDefinitionError: segments[0].segment must be a valid segment name…
 * ```
 */
export function defineConformanceProfile(profile: unknown): ConformanceProfile {
  const defects = collectProfileDefects(profile);
  if (defects.length > 0) {
    const name =
      isObject(profile) && typeof profile["name"] === "string" ? profile["name"] : undefined;
    throw new ProfileDefinitionError(
      `Conformance profile has ${String(defects.length)} defect(s): ` +
        defects.map((d) => d.detail).join("; "),
      name,
    );
  }
  return profile as ConformanceProfile;
}
