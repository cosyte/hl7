/**
 * Profile-shape validation for the conformance engine (roadmap Phase U). A
 * conformance profile is **consumer-authored configuration**, so it can be
 * malformed. Two entry points share one total defect collector:
 *
 * - {@link collectProfileDefects} — **total over `unknown`, never throws.** It
 *   returns a list of structural {@link ProfileDefect}s (empty ⇒ well-formed).
 *   {@link validateAgainstProfile} calls it first and, on any defect, returns
 *   `PROFILE_MALFORMED` findings instead of validating a profile it cannot
 *   trust (never a silent pass).
 * - {@link defineConformanceProfile} — the **fail-fast authoring** helper. It
 *   runs the same collector and **throws {@link ProfileDefinitionError}** on the
 *   first-through-all defects, returning the profile typed on success. Use it at
 *   profile-authoring time; the engine itself never throws (task invariant).
 *
 * A defect `detail` describes the profile's SHAPE (`segments[2].fields[0].field
 * must be a positive integer`) — profile structure only, never PHI.
 *
 * @internal (the two functions are re-exported from the package root)
 */

import { ProfileDefinitionError } from "../parser/errors.js";

import { USAGE_CODES, type ConformanceProfile, type FindingLocus } from "./types.js";

/** Segment-name shape — 3 chars, standard or `Z…` segment. Mirrors the model's rule. @internal */
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
  return s;
}

/**
 * Collect every structural defect in a candidate conformance profile. **Total
 * over `unknown` and never throws** — a caller may pass any value (even one
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
    checkSeverity(seg["severity"], segLocus, out);
    checkCardinality(seg["cardinality"], segLocus, out);

    const fields = seg["fields"];
    if (fields !== undefined) {
      if (!Array.isArray(fields)) {
        out.push({ locus: segLocus, detail: `segment "${name}" fields must be an array.` });
        continue;
      }
      for (let j = 0; j < fields.length; j++) {
        checkFieldRule(fields[j], name, j, out);
      }
    }
  }
  return out;
}

/** Validate a usage code; append defect if present-and-invalid. @internal */
function checkUsage(usage: unknown, locus: FindingLocus, out: ProfileDefect[]): void {
  if (usage === undefined) return;
  if (typeof usage !== "string" || !USAGE_CODES.includes(usage as never)) {
    out.push({
      locus,
      detail: `${describe(locus)} usage must be one of ${USAGE_CODES.join("/")}.`,
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

/** Validate one field rule object. @internal */
function checkFieldRule(rule: unknown, segment: string, index: number, out: ProfileDefect[]): void {
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
  checkSeverity(rule["severity"], fieldLocus, out);
  checkCardinality(rule["cardinality"], fieldLocus, out);

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
}

/**
 * The **fail-fast authoring** gate for a conformance profile (roadmap Phase U's
 * "malformed profile → typed `ProfileDefinitionError`, build-time, before
 * validation"). Runs {@link collectProfileDefects}; on any defect, throws a
 * single {@link ProfileDefinitionError} listing every defect. On success,
 * returns the profile typed as {@link ConformanceProfile}.
 *
 * This is **optional** — {@link validateAgainstProfile} tolerates a raw profile
 * object and never throws — but it lets an author catch a typo when the profile
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
