/**
 * Caller-supplied resolutions for declared-conditional rules: their shape
 * check, their diagnostics, and the index the engine applies.
 *
 * A declared conditional's outcome comes from one of two sources, never both:
 * the rule's own condition predicate, which the engine evaluates against the
 * message, or a caller-supplied resolution, which decides it from outside. This
 * module is the second. A caller passes an ORDERED LIST of
 * {@link UsageResolution}s alongside the message and the profile, each naming a
 * LOCUS (segment name, plus the 1-indexed field position when the target is a
 * field rule) and a boolean outcome. A resolution applies to the RULE at that
 * locus, hence to every occurrence of the segment and every repetition of the
 * field.
 *
 * ## The container is an ordered list, deliberately
 *
 * Not a map keyed by locus. Two resolutions at ONE locus are a defect that has
 * to be REPORTED, and a keyed container cannot represent the input that
 * triggers it: the second write would silently overwrite the first and the
 * defect would be undiagnosable. An ordered list also gives the diagnostics a
 * stable supply order to report in.
 *
 * ## Nothing here ever degrades to "no resolutions supplied"
 *
 * Only an ABSENT argument (or `undefined`) means "no resolutions". Every other
 * value that is not a list of well-formed resolutions is a defect reported as
 * `PROFILE_MALFORMED`: a string, `null`, a number, a bare single resolution
 * rather than a list, or a list carrying a member that is not a well-formed
 * resolution. Reading a mis-typed argument as "none" would return a clean
 * zero-finding result for elements that were never checked.
 *
 * ## How many diagnostics co-occurring defects produce
 *
 * One `PROFILE_MALFORMED` finding per DEFECT, and a resolution defect counts
 * PER LOCUS rather than per resolution. Where two rules below both fire at one
 * locus, exactly one finding is emitted, and it is the one whose defect makes
 * the resolution unusable WHATEVER its outcome. In precedence order, highest
 * first:
 *
 * 1. the locus matches more than one declared rule (it identifies no single
 *    rule, so no outcome could be applied);
 * 2. the locus matches no declared rule, or matches one whose usage is not a
 *    declared conditional (there is no conditional to resolve);
 * 3. the rule at the locus declares its own condition predicate (the outcome
 *    already has a source, and preferring either source silently would decide a
 *    patient-safety question by accident of precedence);
 * 4. two or more resolutions share the locus (N duplicates are ONE defect and
 *    yield ONE finding however large N is, whether or not their outcomes agree).
 *
 * So a locus that is both duplicated and ambiguous yields exactly one finding,
 * rule 1's; a locus that is both duplicated and aimed at a non-conditional rule
 * yields exactly one finding, rule 2's; and a locus both duplicated and
 * colliding with a declared predicate yields exactly one, rule 3's.
 *
 * ## A member that is not a well-formed resolution counts PER MEMBER
 *
 * The per-locus rule above is about a LOCUS, and an ill-typed member has none:
 * it never reaches the locus checks, so it cannot be collapsed into a locus's
 * single verdict. N ill-typed members are therefore N defects and N findings,
 * every one of them reported at the profile-level sentinel `"(profile)"`. That
 * sentinel is a place to hang a finding with no locus of its own, NOT a locus
 * these defects share, so it never collapses them to one. Each names its own
 * index (`resolutions[2] must be ...`), which is what makes N findings useful
 * rather than repetitive: an author fixing three mistyped members is told about
 * all three at once instead of one per run.
 *
 * ## The order the diagnostics come back in
 *
 * Resolution defects are reported in SUPPLY ORDER: the order the caller wrote
 * the list, whatever KIND each defect is. An ill-typed member stands where it
 * was supplied, and a locus's verdict stands where that locus FIRST appeared -
 * so given `[{bad locus A}, 42, {bad locus B}]` the findings come back
 * `A`, `(profile)`, `B`, never with the ill-typed member hoisted to the front.
 * The two kinds are found in two passes (a member's shape has to be known
 * before its locus can be grouped), but the passes RESERVE positions rather
 * than emit, so the sequence handed back is one interleaved supply-ordered run.
 * Profile-SHAPE defects are a separate, earlier group and still precede every
 * resolution defect; `validate-against-profile.ts` concatenates the two groups
 * in that order.
 *
 * @internal
 */

import type { ProfileDefect } from "./profile-shape.js";
import type { FindingLocus, UsageResolution } from "./types.js";
import { boundedToken, describeValueType, isRecord, parseUsageToken } from "./usage.js";

/** A resolution the shape check accepted, with the locus it targets. @internal */
interface WellFormedResolution {
  readonly locus: FindingLocus;
  readonly outcome: boolean;
}

/**
 * One position in the supply-ordered diagnostic sequence, reserved while the
 * list is walked and filled in once every locus is known.
 *
 * A `member` slot is an ill-typed member: it stands where it was supplied. A
 * `locus` slot stands where its locus FIRST appeared, and is the only slot that
 * locus gets however many resolutions share it - that is the per-locus counting
 * rule, expressed as a position rather than only as a count. It carries the
 * first resolution at the locus and the LIVE group every later duplicate is
 * appended to, so the second pass needs no lookup that could come back empty.
 *
 * @internal
 */
type DefectSlot =
  | { readonly kind: "member"; readonly detail: string }
  | {
      readonly kind: "locus";
      readonly key: string;
      readonly first: WellFormedResolution;
      readonly group: readonly WellFormedResolution[];
    };

/** What one declared locus in the profile looks like to the resolution checks. @internal */
interface DeclaredLocus {
  /** How many declared rules sit at this locus (more than one ⇒ ambiguous). */
  readonly count: number;
  /** Whether the single declared rule's usage is a declared-conditional token. */
  readonly conditional: boolean;
  /** Whether the single declared rule carries its own condition predicate. */
  readonly predicated: boolean;
}

/**
 * The outcome of analysing a resolution argument: the defects to report, and
 * the outcome to apply per locus key. `applied` is only ever consulted when
 * `defects` is empty, so it can never carry an ambiguous or duplicated locus.
 *
 * @internal
 */
export interface ResolutionAnalysis {
  readonly defects: readonly ProfileDefect[];
  readonly applied: ReadonlyMap<string, boolean>;
}

/** The profile-level sentinel locus, for a defect above segment level. @internal */
const ROOT_LOCUS: FindingLocus = { segment: "(profile)" };

/** No defects and nothing to apply: the absent-argument answer. @internal */
const EMPTY_ANALYSIS: ResolutionAnalysis = {
  defects: [],
  applied: new Map<string, boolean>(),
};

/**
 * The key identifying a locus: the segment name, plus the 1-indexed field
 * position when the target is a field rule and nothing at all when it is a
 * segment rule. Two loci are equal exactly when their keys are.
 *
 * The pair is JSON-encoded rather than joined with a separator, because a
 * segment name is caller-supplied and could otherwise carry the separator
 * itself and collide with a different locus.
 *
 * @internal
 */
export function locusKey(segment: string, field: number | undefined): string {
  return JSON.stringify([segment, field ?? null]);
}

/**
 * Every locus the profile declares a rule at, with how many rules sit there.
 * Total over `unknown`: a malformed profile simply declares fewer loci.
 *
 * @internal
 */
function collectDeclaredLoci(profile: unknown): ReadonlyMap<string, DeclaredLocus> {
  const loci = new Map<string, DeclaredLocus>();
  if (!isRecord(profile)) return loci;
  const segments = profile["segments"];
  if (!Array.isArray(segments)) return loci;

  const record = (key: string, usage: unknown, condition: unknown): void => {
    const conditional = typeof usage === "string" && parseUsageToken(usage)?.kind === "conditional";
    const seen = loci.get(key);
    loci.set(key, {
      count: (seen?.count ?? 0) + 1,
      // The `conditional` and `predicated` flags are only read when
      // `count === 1`, so the first rule at a locus is the only one whose usage
      // or condition can matter.
      conditional: seen === undefined ? conditional : seen.conditional,
      predicated: seen === undefined ? condition !== undefined : seen.predicated,
    });
  };

  for (const segment of segments) {
    if (!isRecord(segment)) continue;
    const name = segment["segment"];
    if (typeof name !== "string") continue;
    record(locusKey(name, undefined), segment["usage"], segment["condition"]);

    const fields = segment["fields"];
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      if (!isRecord(field)) continue;
      const position = field["field"];
      if (typeof position !== "number" || !Number.isInteger(position) || position < 1) continue;
      record(locusKey(name, position), field["usage"], field["condition"]);
    }
  }
  return loci;
}

/**
 * Check one member of the resolution list. Returns the defect detail when the
 * member is not a well-formed resolution, naming the offending value's TYPE
 * rather than echoing its content.
 *
 * @internal
 */
function memberDefect(member: unknown, index: number): string | undefined {
  const at = `resolutions[${String(index)}]`;
  if (!isRecord(member)) {
    return `${at} must be an object with a segment name and a boolean outcome, not ${describeValueType(member)}.`;
  }
  const segment = member["segment"];
  if (typeof segment !== "string") {
    return `${at}.segment must be a segment name string, not ${describeValueType(segment)}.`;
  }
  if (segment.length === 0) {
    return `${at}.segment must be a non-empty segment name.`;
  }
  const field = member["field"];
  if (field !== undefined) {
    if (typeof field !== "number") {
      return `${at}.field must be a positive (1-indexed) integer or absent, not ${describeValueType(field)}.`;
    }
    if (!Number.isInteger(field) || field < 1) {
      return `${at}.field must be a positive (1-indexed) integer.`;
    }
  }
  if (typeof member["outcome"] !== "boolean") {
    return `${at}.outcome must be a boolean, not ${describeValueType(member["outcome"])}.`;
  }
  return undefined;
}

/** Compact locus label for a resolution defect detail. @internal */
function describeTarget(locus: FindingLocus): string {
  return locus.field === undefined
    ? `segment "${locus.segment}"`
    : `segment "${locus.segment}" field ${String(locus.field)}`;
}

/**
 * Analyse a caller-supplied resolution argument against the profile: collect
 * every defect (see this module's header for the counting rules) and build the
 * per-locus outcome index for the ones that survive.
 *
 * **Total over `unknown` and never throws**: any argument, any profile.
 *
 * @internal
 */
export function analyzeResolutions(resolutions: unknown, profile: unknown): ResolutionAnalysis {
  if (resolutions === undefined) return EMPTY_ANALYSIS;

  const defects: ProfileDefect[] = [];
  if (!Array.isArray(resolutions)) {
    defects.push({
      locus: ROOT_LOCUS,
      detail: `resolutions must be a list of resolutions, not ${describeValueType(resolutions)}.`,
    });
    return { defects, applied: EMPTY_ANALYSIS.applied };
  }

  // Pass 1: walk the list ONCE, in supply order, reserving a slot per defect
  // the list can produce. An ill-typed member is a defect at the profile-level
  // sentinel and is dropped from the locus checks below (there is no locus to
  // check it at); every other member joins its locus group, and the FIRST
  // member of a group reserves that locus's single slot.
  const slots: DefectSlot[] = [];
  const byLocus = new Map<string, WellFormedResolution[]>();
  for (let i = 0; i < resolutions.length; i++) {
    const member: unknown = resolutions[i];
    const detail = memberDefect(member, i);
    if (detail !== undefined) {
      slots.push({ kind: "member", detail });
      continue;
    }
    const resolution = member as UsageResolution;
    // The segment name is profile-supplied configuration, so the locus echoes
    // it under the same bound every other echoed token carries.
    const locus: FindingLocus =
      resolution.field === undefined
        ? { segment: boundedToken(resolution.segment) }
        : { segment: boundedToken(resolution.segment), field: resolution.field };
    const key = locusKey(resolution.segment, resolution.field);
    const wellFormed: WellFormedResolution = { locus, outcome: resolution.outcome };
    const group = byLocus.get(key);
    if (group === undefined) {
      const opened: WellFormedResolution[] = [wellFormed];
      byLocus.set(key, opened);
      slots.push({ kind: "locus", key, first: wellFormed, group: opened });
    } else {
      group.push(wellFormed);
    }
  }

  // Pass 2: fill each reserved slot IN SUPPLY ORDER - one verdict per distinct
  // locus, emitted where that locus first appeared, interleaved with the
  // ill-typed members exactly as the caller supplied them.
  const declared = collectDeclaredLoci(profile);
  const applied = new Map<string, boolean>();
  for (const slot of slots) {
    if (slot.kind === "member") {
      defects.push({ locus: ROOT_LOCUS, detail: slot.detail });
      continue;
    }
    const { key, first, group } = slot;
    const target = declared.get(key);
    if (target !== undefined && target.count > 1) {
      defects.push({
        locus: first.locus,
        detail: `resolution for ${describeTarget(first.locus)} matches ${String(target.count)} declared rules, so it identifies no single rule.`,
      });
      continue;
    }
    if (target === undefined) {
      defects.push({
        locus: first.locus,
        detail: `resolution for ${describeTarget(first.locus)} matches no rule the profile declares.`,
      });
      continue;
    }
    if (!target.conditional) {
      defects.push({
        locus: first.locus,
        detail: `resolution for ${describeTarget(first.locus)} targets a rule whose usage is not a declared conditional, so there is no condition to resolve.`,
      });
      continue;
    }
    if (target.predicated) {
      defects.push({
        locus: first.locus,
        detail: `resolution for ${describeTarget(first.locus)} targets a rule that declares its own condition predicate; a rule takes its outcome from the predicate or from a resolution, never from both.`,
      });
      continue;
    }
    if (group.length > 1) {
      defects.push({
        locus: first.locus,
        detail: `${String(group.length)} resolutions were supplied for ${describeTarget(first.locus)}; a locus may be resolved at most once.`,
      });
      continue;
    }
    applied.set(key, first.outcome);
  }

  return { defects, applied };
}
