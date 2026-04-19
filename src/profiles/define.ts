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
 * module so `@cosyte/hl7-parser` consumers can reach it via either entry
 * point. Single source of truth; no circular type imports.
 */

import type {
  CustomSegmentDefinition,
  OnWarningCallback,
  Profile,
} from "../parser/types.js";

import { buildDescribe } from "./describe.js";
import {
  validateCustomSegments,
  validateDateFormats,
  validateOptionKeys,
  validateProfileName,
} from "./validate.js";

/**
 * Re-export of the canonical `CustomSegmentDefinition` type (declared in
 * `src/parser/types.ts`) so profile authors importing from the profile
 * module get the same type identity as those importing from the package
 * barrel. Profile authors annotate Z-segment declarations with this type.
 *
 * @example
 * ```ts
 * import type { CustomSegmentDefinition } from "@cosyte/hl7-parser";
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
 * import { defineProfile, type DefineProfileOptions } from "@cosyte/hl7-parser";
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
 * import { defineProfile } from "@cosyte/hl7-parser";
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

  const customSegments = opts.customSegments ?? {};
  validateCustomSegments(customSegments, opts.name);

  const dateFormats = opts.dateFormats ?? [];
  validateDateFormats(dateFormats, opts.name);

  // Wave-1 lineage stub: single-profile → lineage === [opts.name].
  // Plan 06-02 replaces this body with `mergeLineage(parents, opts.name)`.
  const lineage: readonly string[] = Object.freeze([opts.name]);

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
  if (opts.description !== undefined) profile.description = opts.description;
  if (opts.onWarning !== undefined) profile.onWarning = opts.onWarning;

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
