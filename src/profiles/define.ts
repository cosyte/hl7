/**
 * `defineProfile()` — public factory for building `Profile` objects with
 * validation + `describe()` attached (PROF-01, PROF-04, PROF-05).
 *
 * Wave 1 (Plan 06-01) ships the single-profile (no-extends) path;
 * Wave 2 (Plan 06-02) fills in `extends` + merge semantics by extending
 * this factory's body. For Wave 1, `opts.extends` is ACCEPTED but
 * IGNORED, resulting in `lineage === [opts.name]` regardless.
 *
 * Zero runtime deps. Matches CLAUDE.md engineering guardrails: no `any`,
 * JSDoc `@example` on every public export, immutability at the return
 * boundary via `Object.freeze`, short testable helpers split across
 * `validate.ts` + `describe.ts`.
 *
 * Type ownership: `CustomSegmentDefinition` is declared CANONICALLY in
 * `src/parser/types.ts` (alongside `Profile`) and re-exported from THIS
 * module so `@cosyte/hl7` consumers can reach it via either entry
 * point. Single source of truth; no circular type imports.
 */

import type { CustomSegmentDefinition, OnWarningCallback, Profile } from "../parser/types.js";

import { buildDescribe } from "./describe.js";
import {
  composeOnWarning,
  mergeCustomSegments,
  mergeDateFormats,
  mergeLineage,
  mergeScalar,
  normaliseParents,
} from "./merge.js";
import {
  validateCustomSegments,
  validateDateFormats,
  validateOptionKeys,
  validateProfileName,
  validateUniqueFieldNames,
} from "./validate.js";

/**
 * Re-export of the canonical `CustomSegmentDefinition` type (declared in
 * `src/parser/types.ts`) so profile authors importing from the profile
 * module get the same type identity as those importing from the package
 * barrel. Profile authors annotate Z-segment declarations with this type.
 *
 * @example
 * ```ts
 * import type { CustomSegmentDefinition } from "@cosyte/hl7";
 * const zdp: CustomSegmentDefinition = {
 *   fields: { departmentCode: 3, departmentName: 4 },
 * };
 * ```
 */
export type { CustomSegmentDefinition } from "../parser/types.js";

/**
 * Options accepted by `defineProfile()` (D-02). Mirrors the locked
 * `Profile` shape plus the `extends` input key. Every field except
 * `name` is optional.
 *
 * @example
 * ```ts
 * import { defineProfile, type DefineProfileOptions } from "@cosyte/hl7";
 * const opts: DefineProfileOptions = {
 *   name: "my-lab",
 *   dateFormats: ["MM/DD/YYYY"],
 *   customSegments: { ZLB: { fields: { noteText: 3 } } },
 * };
 * const profile = defineProfile(opts);
 * ```
 */
export interface DefineProfileOptions {
  readonly name: string;
  readonly description?: string;
  readonly dateFormats?: readonly string[];
  readonly customSegments?: Readonly<Record<string, CustomSegmentDefinition>>;
  readonly onWarning?: OnWarningCallback;
  readonly extends?: Profile | readonly Profile[];
}

/**
 * Build a readonly `Profile` from a validated options object. Invalid
 * input throws `ProfileDefinitionError` with an actionable message
 * (PROF-02): bad Z-segment names (D-05), malformed date formats (D-08),
 * unknown top-level keys with typo hints (D-07), and missing/empty
 * name.
 *
 * Wave 1 (Plan 06-01) ships the no-extends path — `opts.extends` is
 * ACCEPTED but IGNORED, resulting in `lineage === [opts.name]`
 * regardless. Wave 2 (Plan 06-02) adds full lineage computation + merge
 * semantics.
 *
 * @example
 * ```ts
 * import { defineProfile } from "@cosyte/hl7";
 * const epic = defineProfile({
 *   name: "epic",
 *   description: "Epic-specific quirks and ADT date formats",
 *   dateFormats: ["MM/DD/YYYY HH:mm:ss", "MM/DD/YYYY"],
 *   customSegments: {
 *     ZDP: { fields: { departmentCode: 3, departmentName: 4 } },
 *     ZRS: { fields: { resultStatus: 1, statusDateTime: 2 } },
 *   },
 * });
 * console.log(epic.name); // "epic"
 * console.log(epic.lineage); // ["epic"]
 * console.log(epic.describe?.());
 * ```
 */
export function defineProfile(opts: DefineProfileOptions): Profile {
  // D-01 fail-fast: name validation FIRST so downstream throws can
  // include `opts.name` as the second `ProfileDefinitionError` ctor arg.
  validateProfileName(opts);
  validateOptionKeys(opts);

  // Pre-merge: validate self-declared customSegments + dateFormats in
  // isolation so errors surface with the offending profile's own name
  // (not "after merge" — a user hitting D-05 should see their own
  // profile flagged, not the composed lineage).
  const selfCustomSegments = opts.customSegments ?? {};
  validateCustomSegments(selfCustomSegments, opts.name);
  const selfDateFormats = opts.dateFormats ?? [];
  validateDateFormats(selfDateFormats, opts.name);

  // D-03 + D-09..D-12 — full merge. Plan 06-02 replaces the Wave-1
  // lineage stub with this block.
  const parents = normaliseParents(opts.extends);
  const lineage = mergeLineage(parents, opts.name);
  const dateFormats = mergeDateFormats(parents, selfDateFormats);
  const customSegments = mergeCustomSegments(parents, selfCustomSegments);
  const description = mergeScalar(parents, opts.description, "description");
  const onWarning = composeOnWarning([...parents.map((p) => p.onWarning), opts.onWarning]);

  // Post-merge re-validation. `validateCustomSegments` catches the D-05
  // rogue-parent scenario (a hand-crafted Profile bypassing
  // defineProfile whose customSegments contains a non-Z key).
  // `validateUniqueFieldNames` is installed as DEFENSE-IN-DEPTH — it is
  // unreachable via the present mergeCustomSegments strategy (position-
  // indexed accumulator collapses same-name-different-position cases
  // to a single entry) but guards against future merge-strategy
  // changes. Both validators are O(N) over the merged map and run once
  // per defineProfile call.
  validateCustomSegments(customSegments, opts.name);
  validateUniqueFieldNames(customSegments, opts.name);

  // Assemble the frozen Profile. exactOptionalPropertyTypes discipline:
  // conditionally assign optional fields rather than writing
  // `description: undefined`. Mirrors `src/helpers/meta.ts::buildMeta`
  // lines 38-73 — the consistent pattern across the codebase.
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const profile: Mutable<Profile> = {
    name: opts.name,
    lineage,
    customSegments,
    dateFormats,
  };
  if (description !== undefined) profile.description = description;
  if (onWarning !== undefined) profile.onWarning = onWarning;

  // D-04: `describe()` attached as a method — closes over the assembled
  // profile object so calling `.describe()` always reflects the
  // fully-assembled state (not a half-built intermediate).
  const finalised: Profile = profile as Profile;
  profile.describe = (): string => buildDescribe(finalised);

  // W5 boundary-freeze: top-level only. Inner `customSegments` /
  // `lineage` / `dateFormats` stay `readonly` at the type level but
  // mutable at runtime per D-30 cost doctrine (matches Phase 5
  // `src/serialize/to-json.ts:139`).
  return Object.freeze(profile) as Profile;
}
