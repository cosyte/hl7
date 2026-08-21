/**
 * Caller-supplied resolutions for declared-conditional rules: their shape
 * check, their diagnostics, and the index the engine applies.
 *
 * The engine evaluates no condition predicate and reads nothing from the
 * message to decide an outcome. A caller passes an ORDERED LIST of
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
 * 3. two or more resolutions share the locus (N duplicates are ONE defect and
 *    yield ONE finding however large N is, whether or not their outcomes agree).
 *
 * So a locus that is both duplicated and ambiguous yields exactly one finding,
 * rule 1's; a locus that is both duplicated and aimed at a non-conditional rule
 * yields exactly one finding, rule 2's.
 *
 * @internal
 */

import type { ProfileDefect } from "./profile-shape.js";
import type { FindingLocus, UsageResolution } from "./types.js";
import { boundedToken, describeValueType, isRecord, parseUsageToken } from "./usage.js";

/** A resolution the shape check accepted, with the locus key it targets. @internal */
interface WellFormedResolution {
  readonly key: string;
  readonly locus: FindingLocus;
  readonly outcome: boolean;
}

/** What one declared locus in the profile looks like to the resolution checks. @internal */
interface DeclaredLocus {
  /** How many declared rules sit at this locus (more than one ⇒ ambiguous). */
  readonly count: number;
  /** Whether the single declared rule's usage is a declared-conditional token. */
  readonly conditional: boolean;
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

  const record = (key: string, usage: unknown): void => {
    const conditional = typeof usage === "string" && parseUsageToken(usage)?.kind === "conditional";
    const seen = loci.get(key);
    loci.set(key, {
      count: (seen?.count ?? 0) + 1,
      // The `conditional` flag is only read when `count === 1`, so the first
      // rule at a locus is the only one whose usage can matter.
      conditional: seen === undefined ? conditional : seen.conditional,
    });
  };

  for (const segment of segments) {
    if (!isRecord(segment)) continue;
    const name = segment["segment"];
    if (typeof name !== "string") continue;
    record(locusKey(name, undefined), segment["usage"]);

    const fields = segment["fields"];
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      if (!isRecord(field)) continue;
      const position = field["field"];
      if (typeof position !== "number" || !Number.isInteger(position) || position < 1) continue;
      record(locusKey(name, position), field["usage"]);
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

  // Pass 1: shape. An ill-typed member is a defect at the profile-level
  // sentinel and is dropped from the locus checks below (there is no locus to
  // check it at); every other member carries on with its locus.
  const wellFormed: WellFormedResolution[] = [];
  for (let i = 0; i < resolutions.length; i++) {
    const member: unknown = resolutions[i];
    const detail = memberDefect(member, i);
    if (detail !== undefined) {
      defects.push({ locus: ROOT_LOCUS, detail });
      continue;
    }
    const resolution = member as UsageResolution;
    // The segment name is profile-supplied configuration, so the locus echoes
    // it under the same bound every other echoed token carries.
    const locus: FindingLocus =
      resolution.field === undefined
        ? { segment: boundedToken(resolution.segment) }
        : { segment: boundedToken(resolution.segment), field: resolution.field };
    wellFormed.push({
      key: locusKey(resolution.segment, resolution.field),
      locus,
      outcome: resolution.outcome,
    });
  }

  // Pass 2: one verdict per distinct locus, in the order the loci first appear.
  const byLocus = new Map<string, WellFormedResolution[]>();
  for (const resolution of wellFormed) {
    const group = byLocus.get(resolution.key);
    if (group === undefined) byLocus.set(resolution.key, [resolution]);
    else group.push(resolution);
  }

  const declared = collectDeclaredLoci(profile);
  const applied = new Map<string, boolean>();
  for (const [key, group] of byLocus) {
    const first = group[0];
    if (first === undefined) continue;
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
