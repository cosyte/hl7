/**
 * Pure merge helpers consumed by `defineProfile()` when `opts.extends` is
 * supplied. Every helper takes a `readonly parents[]` + a self value and
 * returns the merged result; none mutate input. Implements D-03 (lineage),
 * D-09 (scalar last-wins), D-10 (dateFormats concat+dedupe), D-11
 * (customSegments deep-merge), D-12 (onWarning chain composition).
 *
 * Zero runtime deps. A local `Set` is used for first-occurrence dedup
 * tracking across lineage + dateFormats helpers; `mergeCustomSegments`
 * uses a position-indexed `Map` accumulator so later layers overwrite
 * same-position entries while non-colliding positions survive additively.
 *
 * Post-merge re-validation (D-05 Z-only; D-06 duplicate-name defense-in-
 * depth) is the CALLER's responsibility — these helpers are pure reducers.
 *
 * @internal
 */

import type {
  CustomSegmentDefinition,
  OnWarningCallback,
  Profile,
} from "../parser/types.js";

/**
 * Normalise the `extends` input to a readonly array. Accepts either a
 * single `Profile` or an array; returns `[]` for `undefined` so callers
 * can treat "no parents" identically to "zero parents".
 *
 * @internal
 */
export function normaliseParents(
  ext: Profile | readonly Profile[] | undefined,
): readonly Profile[] {
  if (ext === undefined) return [];
  if (Array.isArray(ext)) return ext as readonly Profile[];
  return [ext as Profile];
}

/**
 * Compute lineage per D-03: flatten parent lineages (or `[parent.name]`
 * when a parent has no lineage), append `selfName`, dedupe preserving
 * first occurrence.
 *
 * @internal
 */
export function mergeLineage(
  parents: readonly Profile[],
  selfName: string,
): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parents) {
    const parentLineage = p.lineage ?? [p.name];
    for (const n of parentLineage) {
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  if (!seen.has(selfName)) out.push(selfName);
  return Object.freeze(out);
}

/**
 * Merge dateFormats per D-10: concat parents (in order) then child,
 * dedupe preserving first occurrence. Parent formats come first so
 * they're tried FIRST by the TOL-08 cascade (compatible with the
 * "parent behavior, then child specialization" layering).
 *
 * @internal
 */
export function mergeDateFormats(
  parents: readonly Profile[],
  selfFormats: readonly string[],
): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parents) {
    for (const f of p.dateFormats ?? []) {
      if (!seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
  }
  for (const f of selfFormats) {
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return Object.freeze(out);
}

/**
 * Merge customSegments per D-11: deep-merge by segment name, then by
 * field position. Fields with distinct positions merge additively; child
 * wins on position conflict. Iteration order is: every parent in order
 * (left-to-right), then self. The child's fields map REPLACES any prior
 * entries whose position collides, but preserves parent entries at
 * non-colliding positions within the same Z-segment.
 *
 * Post-merge re-validation (D-05, D-06) is the CALLER's responsibility —
 * this helper is a pure reducer.
 *
 * @internal
 */
export function mergeCustomSegments(
  parents: readonly Profile[],
  selfMap: Readonly<Record<string, CustomSegmentDefinition>>,
): Readonly<Record<string, CustomSegmentDefinition>> {
  // Accumulate per-segment: position → field-name. Child overrides
  // position collisions; parent position entries at non-colliding
  // positions survive.
  const acc = new Map<string, Map<number, string>>();
  const layer = (
    map: Readonly<Record<string, CustomSegmentDefinition>> | undefined,
  ): void => {
    if (map === undefined) return;
    for (const segName of Object.keys(map)) {
      const entry = map[segName];
      if (entry === undefined) continue;
      let byPos = acc.get(segName);
      if (byPos === undefined) {
        byPos = new Map();
        acc.set(segName, byPos);
      }
      for (const fieldName of Object.keys(entry.fields)) {
        const pos = entry.fields[fieldName];
        if (pos === undefined) continue;
        byPos.set(pos, fieldName); // later layers overwrite earlier
      }
    }
  };
  for (const p of parents) {
    layer(p.customSegments);
  }
  layer(selfMap);

  const out: Record<string, CustomSegmentDefinition> = {};
  for (const [segName, byPos] of acc.entries()) {
    const fields: Record<string, number> = {};
    for (const [pos, fieldName] of byPos.entries()) {
      fields[fieldName] = pos;
    }
    out[segName] = Object.freeze({
      fields: Object.freeze(fields),
    }) as CustomSegmentDefinition;
  }
  return Object.freeze(out);
}

/**
 * Merge a scalar option per D-09: child value wins when explicitly
 * provided; otherwise the LAST parent with a non-undefined value.
 * Works for `description` today; signature is a generic-keyed shape so
 * future scalars reuse the same helper without rewrites.
 *
 * @internal
 */
export function mergeScalar<K extends keyof Profile>(
  parents: readonly Profile[],
  selfValue: Profile[K] | undefined,
  key: K,
): Profile[K] | undefined {
  if (selfValue !== undefined) return selfValue;
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i];
    if (p === undefined) continue;
    const v = p[key];
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * Compose an onWarning chain per D-12: invoke every non-undefined
 * handler from parents (in order) then self. Each handler's throws are
 * silently swallowed so a noisy profile cannot break downstream
 * handlers. Returns `undefined` when no handlers are supplied anywhere
 * in the lineage (so `Profile.onWarning` stays optional).
 *
 * @internal
 */
export function composeOnWarning(
  handlers: readonly (OnWarningCallback | undefined)[],
): OnWarningCallback | undefined {
  const concrete = handlers.filter(
    (h): h is OnWarningCallback => h !== undefined,
  );
  if (concrete.length === 0) return undefined;
  return (w) => {
    for (const h of concrete) {
      try {
        h(w);
      } catch {
        /* D-12 silent swallow */
      }
    }
  };
}
