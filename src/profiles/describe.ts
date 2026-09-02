/**
 * Build the multi-line `describe()` output per D-04. Omits
 * lines for absent fields (exactOptionalPropertyTypes idiom: mirrors
 * `src/helpers/meta.ts::buildMeta`); lineage rendered as `a → b → c`
 * when more than one name is present.
 *
 * Guaranteed non-empty and always starts with `Profile '<name>'` so the
 * PROF-05 "contains the profile name" contract is observable regardless
 * of which lines are omitted.
 *
 * @internal
 */

import type { Profile } from "../parser/types.js";

/**
 * Format a `Profile` as a multi-line human-readable description. Always
 * starts with `Profile '<name>'`: see module-level JSDoc for the full
 * line-per-field layout.
 *
 * @internal
 */
export function buildDescribe(p: Profile): string {
  const lines: string[] = [`Profile '${p.name}'`];
  if (p.description !== undefined) {
    lines.push(`  description: ${p.description}`);
  }
  const lineage = p.lineage ?? [p.name];
  lines.push(`  lineage: ${lineage.join(" → ")}`);
  if (p.customSegments !== undefined) {
    const keys = Object.keys(p.customSegments);
    lines.push(
      `  customSegments: ${String(keys.length)}` + (keys.length > 0 ? ` (${keys.join(", ")})` : ""),
    );
  }
  // Its own line, under its own label, rather than folded in with the
  // custom segments above: these names sit on STANDARD clinical segments, and
  // a reader skimming a description to see what a profile touches should not
  // have to know which of a joint list was which.
  if (p.segmentOverrides !== undefined) {
    const keys = Object.keys(p.segmentOverrides);
    lines.push(
      `  segmentOverrides: ${String(keys.length)}` +
        (keys.length > 0 ? ` (${keys.join(", ")})` : ""),
    );
  }
  if (p.dateFormats !== undefined && p.dateFormats.length > 0) {
    lines.push(`  dateFormats: ${String(p.dateFormats.length)}`);
  }
  if (p.onWarning !== undefined) {
    lines.push("  onWarning: registered");
  }
  return lines.join("\n");
}
