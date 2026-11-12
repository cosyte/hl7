/**
 * The characters XML 1.0 does not allow in a document: C0 controls other than tab, line feed and
 * carriage return, an unpaired surrogate, and the noncharacters U+FFFE and U+FFFF.
 */

/**
 * The index of the first character XML 1.0 does not allow in `text`, or -1 when there is none.
 *
 * @internal
 */
export function forbiddenCharacterAt(text: string): number {
  // A C0 control other than tab, LF and CR, or an unpaired surrogate (the `u` flag pairs the rest).
  const found = [
    /[\0-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF]/u.exec(text)?.index ?? -1,
    text.indexOf(String.fromCharCode(0xfffe)),
    text.indexOf(String.fromCharCode(0xffff)),
  ].filter((index) => index !== -1);
  return found.length === 0 ? -1 : Math.min(...found);
}
