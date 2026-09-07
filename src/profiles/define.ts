/**
 * `defineProfile()`: public factory for building `Profile` objects with
 * validation + `describe()` attached (PROF-01, PROF-04, PROF-05).
 *
 * `opts.extends` is honoured: parents are merged into the returned
 * profile (lineage, `dateFormats`, `customSegments`, `segmentOverrides`,
 * `description` and `onWarning`), and the merged result is re-validated before
 * it is frozen.
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
import type { DefinedProfile } from "./typed-fields.js";
import {
  composeOnWarning,
  mergeCustomSegments,
  mergeDateFormats,
  mergeLineage,
  mergeScalar,
  mergeSegmentOverrides,
  normaliseParents,
} from "./merge.js";
import {
  validateCustomSegments,
  validateDateFormats,
  validateOptionKeys,
  validateProfileName,
  validateSegmentOverrides,
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
  /**
   * Field names bound to positions on STANDARD HL7 v2 segments, keyed by
   * canonical segment name. Sibling of `customSegments`, never a relaxation of
   * it: a Z-segment key here is refused and pointed back at `customSegments`,
   * and a key that is not a standard segment name is refused outright.
   *
   * Every binding is a NEW read. Declaring one changes nothing an existing
   * caller sees; see {@link Profile.segmentOverrides}.
   */
  readonly segmentOverrides?: Readonly<Record<string, CustomSegmentDefinition>>;
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
 * `opts.extends` accepts a single parent `Profile` or an array of them.
 * Parents are merged into the result: `lineage` is the parents' lineages
 * followed by this profile's own name, `dateFormats`, `customSegments` and
 * `segmentOverrides` are merged, `description` inherits when not supplied, and
 * `onWarning` handlers are composed. With no parent, `lineage === [opts.name]`.
 *
 * `segmentOverrides` names fields on STANDARD segments and is ADDITIVE ONLY: a
 * declaration there gives `seg.get(name)` a new name to resolve and changes no
 * existing read. Keys must be standard segment names, so a Z-segment key is
 * refused and pointed back at `customSegments`.
 *
 * The returned profile CARRIES ITS DECLARED FIELD NAMES IN ITS TYPE: parse
 * with it and `seg.get(name)` on a declared segment type is checked against
 * the names declared for that type, a typo failing to compile instead of
 * silently reading `undefined`. That is additive, and the value stays
 * assignable to the general `Profile` interface with no cast; a caller who
 * annotates the variable `Profile` gives the narrowing up rather than hitting
 * an error, and one who passes an options object typed as
 * `DefineProfileOptions` never had it in the first place.
 *
 * @example
 * ```ts
 * import { defineProfile, parseHL7 } from "@cosyte/hl7";
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
 * const msg = parseHL7(raw, epic);
 * console.log(msg.part("ZDP")?.get("departmentCode")?.value); // narrowed
 * // msg.part("ZDP")?.get("resultStatus"); // does not compile: that is a ZRS name
 * ```
 */
export function defineProfile<O extends DefineProfileOptions>(opts: O): DefinedProfile<O> {
  // D-01 fail-fast: name validation FIRST so downstream throws can
  // include `opts.name` as the second `ProfileDefinitionError` ctor arg.
  validateProfileName(opts);
  validateOptionKeys(opts);

  // Pre-merge: validate self-declared customSegments + dateFormats in
  // isolation so errors surface with the offending profile's own name
  // (not "after merge": a user hitting D-05 should see their own
  // profile flagged, not the composed lineage).
  const selfCustomSegments = opts.customSegments ?? {};
  validateCustomSegments(selfCustomSegments, opts.name);
  const selfSegmentOverrides = opts.segmentOverrides ?? {};
  validateSegmentOverrides(selfSegmentOverrides, opts.name);
  const selfDateFormats = opts.dateFormats ?? [];
  validateDateFormats(selfDateFormats, opts.name);

  // D-03 + D-09..D-12: full merge. Plan 06-02 replaces the Wave-1
  // lineage stub with this block.
  const parents = normaliseParents(opts.extends);
  const lineage = mergeLineage(parents, opts.name);
  const dateFormats = mergeDateFormats(parents, selfDateFormats);
  const customSegments = mergeCustomSegments(parents, selfCustomSegments);
  const segmentOverrides = mergeSegmentOverrides(parents, selfSegmentOverrides);
  const description = mergeScalar(parents, opts.description, "description");
  const onWarning = composeOnWarning([...parents.map((p) => p.onWarning), opts.onWarning]);

  // Post-merge re-validation. `validateCustomSegments` catches the D-05
  // rogue-parent scenario (a hand-crafted Profile bypassing
  // defineProfile whose customSegments contains a non-Z key).
  // `validateUniqueFieldNames` is installed as DEFENSE-IN-DEPTH: it is
  // unreachable via the present mergeCustomSegments strategy (position-
  // indexed accumulator collapses same-name-different-position cases
  // to a single entry) but guards against future merge-strategy
  // changes. Both validators are O(N) over the merged map and run once
  // per defineProfile call.
  validateCustomSegments(customSegments, opts.name);
  validateUniqueFieldNames(customSegments, opts.name);
  validateSegmentOverrides(segmentOverrides, opts.name);
  validateUniqueFieldNames(segmentOverrides, opts.name, "segmentOverrides");

  // Assemble the frozen Profile. exactOptionalPropertyTypes discipline:
  // conditionally assign optional fields rather than writing
  // `description: undefined`. Mirrors `src/helpers/meta.ts::buildMeta`
  // lines 38-73: the consistent pattern across the codebase.
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const profile: Mutable<Profile> = {
    name: opts.name,
    lineage,
    customSegments,
    segmentOverrides,
    dateFormats,
  };
  if (description !== undefined) profile.description = description;
  if (onWarning !== undefined) profile.onWarning = onWarning;

  // D-04: `describe()` attached as a method: closes over the assembled
  // profile object so calling `.describe()` always reflects the
  // fully-assembled state (not a half-built intermediate).
  const finalised: Profile = profile as Profile;
  profile.describe = (): string => buildDescribe(finalised);

  // W5 boundary-freeze: top-level only. Inner `customSegments` /
  // `lineage` / `dateFormats` stay `readonly` at the type level but
  // mutable at runtime per D-30 cost doctrine (matches Phase 5
  // `src/serialize/to-json.ts:139`).
  //
  // The one assertion in this factory, and the only place the assembled value
  // meets its statically derived view. `mergeCustomSegments` above IS the
  // merge `DeclaredSegments<O>` describes -- parents in order, then self --
  // so the keys and field names in the frozen map are the keys and field
  // names in the type. Nothing narrower can be inferred from a `Map`
  // accumulator, and widening the return type instead would throw the
  // declaration away again, which is the whole point of carrying it.
  return Object.freeze(profile) as DefinedProfile<O>;
}
