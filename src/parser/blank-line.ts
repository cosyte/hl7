/**
 * The one rule the batch and stream readers share for a line that holds only whitespace, which
 * they skip between messages and never count as a message cut short.
 *
 * @internal
 */

import { Buffer } from "node:buffer";

/** Only whitespace and bytes above ASCII: a line that could be blank once read as UTF-8. */
const MAYBE_BLANK_BYTES = /^[\s\u0080-\u00ff]*$/u;

/**
 * Whether `line` holds only whitespace. Text is blank when `String.prototype.trim` leaves
 * nothing. A line of bytes, read one byte to one character, is blank when it is blank read that
 * way or read as UTF-8, so a line holding only a byte order mark (EF BB BF) or a no-break space
 * (C2 A0) is blank from bytes just as the same line is blank from text.
 *
 * @example
 * ```ts
 * isBlankLine("\ufeff", false); // true
 * isBlankLine("\u00ef\u00bb\u00bf", true); // true: the bytes EF BB BF, a byte order mark
 * isBlankLine("MSH|^~\\&", true); // false
 * ```
 */
export function isBlankLine(line: string, bytes: boolean): boolean {
  if (line.trim() === "") return true;
  if (!bytes || !MAYBE_BLANK_BYTES.test(line)) return false;
  return Buffer.from(line, "latin1").toString("utf8").trim() === "";
}
