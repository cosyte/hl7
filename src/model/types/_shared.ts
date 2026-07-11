/**
 * Internal helpers shared across the 10 composite parsers (XPN, XAD, CX, CWE,
 * CE, XTN, PL, TS, NM, HD). Centralizes the "read subcomponent, return undefined
 * on absent" pattern so composites stay short and every composite handles
 * missing/empty components identically.
 *
 * Subcomponents are returned VERBATIM: the tokenizer (parser-02) already
 * unescaped each one on parse, so the stored value is decoded — a second
 * `unescape` here would double-decode a value whose own bytes look like an
 * escape (HL7-VALUE-REDECODE). The `enc` params are retained for signature
 * uniformity across the composite read path.
 *
 * Not part of the public API — never re-exported from `src/index.ts`.
 */

import type { EncodingCharacters, RawComponent, RawRepetition } from "../../parser/types.js";

/**
 * Read `subcomponents[index]` from a component and return it (already decoded
 * by the tokenizer — see the module header). Returns `undefined` when:
 * - `component` is `undefined` (missing component).
 * - `index` is out of range.
 * - the subcomponent is the empty string `""`.
 *
 * The empty-string → undefined mapping is deliberate: composite interfaces
 * use OPTIONAL fields, which must be OMITTED when absent
 * (exactOptionalPropertyTypes). Callers use the `undefined` return as the
 * signal to skip assignment.
 *
 * @internal
 */
export function readSubcomponent(
  component: RawComponent | undefined,
  index: number,
  _enc: EncodingCharacters,
): string | undefined {
  if (component === undefined) return undefined;
  const sub = component.subcomponents[index];
  if (sub === undefined || sub === "") return undefined;
  // The tokenizer already unescaped every subcomponent on parse (parser-02), so
  // the stored value is decoded — return it directly. A second unescape would
  // double-decode a value whose own bytes look like an escape (wire `\E\F\E\` →
  // decoded `\F\`, which a second pass would wrongly turn into `|`). Emit
  // fidelity is handled separately by the raw overlay (HL7-ESC). `_enc` is
  // retained for signature uniformity across the composite read helpers.
  return sub;
}

/**
 * Read the first subcomponent of `components[index]` and return it (already
 * decoded by the tokenizer). Shorthand for
 * `readSubcomponent(rep.components[index], 0, enc)`. Most composite fields
 * are single-subcomponent values — this helper keeps composite parsers
 * declarative.
 *
 * @internal
 */
export function readComponent(
  rep: RawRepetition,
  index: number,
  enc: EncodingCharacters,
): string | undefined {
  return readSubcomponent(rep.components[index], 0, enc);
}

/**
 * Read every component at or beyond `fromIndex` — the components a fixed-shape
 * composite parser does NOT model — so a coded element that grew across HL7
 * versions (e.g. the v2.7 CWE second-alternate triplet + coding-system OIDs at
 * components 10–22) is never silently truncated. Each entry is the
 * first-subcomponent value (already decoded), positionally aligned: an absent
 * interior component is preserved as `""` so a caller can map an index back to
 * its HL7 component number (`fromIndex + i`).
 *
 * Trailing empties are stripped (D-02 parity), and the whole result is
 * `undefined` when there is nothing beyond `fromIndex` or every extra component
 * is empty — so the optional `extraComponents` key is OMITTED rather than set
 * to an empty array (exactOptionalPropertyTypes). The returned array is frozen.
 *
 * @internal
 */
export function readExtraComponents(
  rep: RawRepetition,
  fromIndex: number,
  enc: EncodingCharacters,
): readonly string[] | undefined {
  const total = rep.components.length;
  if (total <= fromIndex) return undefined;

  const collected: string[] = [];
  let lastContentAt = -1;
  for (let i = fromIndex; i < total; i++) {
    const value = readComponent(rep, i, enc);
    if (value !== undefined) {
      lastContentAt = collected.length;
      collected.push(value);
    } else {
      collected.push("");
    }
  }

  if (lastContentAt === -1) return undefined;
  return Object.freeze(collected.slice(0, lastContentAt + 1));
}
