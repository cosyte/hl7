/**
 * The characters XML 1.0 does not allow in a document: C0 controls other than tab, line feed and
 * carriage return, an unpaired surrogate, and the noncharacters U+FFFE and U+FFFF.
 */

/** A C0 control other than tab, LF and CR, or an unpaired surrogate (the `u` flag pairs the rest). */
const CONTROL_OR_LONE_SURROGATE_RE = /[\0-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF]/u;

/** U+FFFE and U+FFFF. */
const NONCHARACTERS: readonly string[] = [String.fromCharCode(0xfffe), String.fromCharCode(0xffff)];

/**
 * The index of the first character XML 1.0 does not allow in `text`, or -1 when there is none.
 *
 * @internal
 */
export function forbiddenCharacterAt(text: string): number {
  let at = CONTROL_OR_LONE_SURROGATE_RE.exec(text)?.index ?? -1;
  for (const nonCharacter of NONCHARACTERS) {
    const index = text.indexOf(nonCharacter);
    if (index !== -1 && (at === -1 || index < at)) at = index;
  }
  return at;
}
