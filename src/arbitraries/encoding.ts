import type { EncodingCharacters } from "@cosyte/hl7";
import fc from "fast-check";
import type { Arbitrary } from "fast-check";

/**
 * The standard delimiters, `|^~\&`, with `#` as the v2.7 truncation character.
 *
 * @internal
 */
const STANDARD = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
  truncation: "#",
} as const;

/**
 * The characters a generated delimiter is drawn from: ASCII punctuation, never a letter or a
 * digit (escape sequences are spelled in those), never whitespace, never `"` (the explicit null
 * is written `""`), and never `.` (the formatting escapes are spelled with it, as in `\.br\`).
 *
 * @internal
 */
export const DELIMITER_POOL: readonly string[] = [..."|^~\\&#!$%*+/:;<=>?@[]{}`'"];

/** Options for {@link encodingCharacters}. */
export interface EncodingCharactersOptions {
  /**
   * `"standard"` always gives `|^~\&`; `"any"` (the default) gives the standard set about half
   * the time and six distinct punctuation characters otherwise.
   */
  readonly delimiters?: "standard" | "any";
  /**
   * Whether to declare the v2.7 truncation character (a fifth MSH-2 character). `true` always
   * declares one, `false` never does, and leaving it out declares one about half the time.
   */
  readonly truncation?: boolean;
}

/**
 * Generate a set of HL7 encoding characters: the field separator (MSH-1) and the MSH-2
 * characters, all distinct, optionally with the v2.7 truncation character.
 *
 * @param options Which delimiters to draw and whether to declare a truncation character.
 * @returns An arbitrary of {@link EncodingCharacters}.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { encodingCharacters } from "@cosyte/hl7/arbitraries";
 *
 * const [enc] = fc.sample(encodingCharacters({ delimiters: "standard", truncation: false }), 1);
 * // enc is { field: "|", component: "^", repetition: "~", escape: "\\", subcomponent: "&" }
 * ```
 */
export function encodingCharacters(
  options: EncodingCharactersOptions = {},
): Arbitrary<EncodingCharacters> {
  const truncation =
    options.truncation === undefined ? fc.boolean() : fc.constant(options.truncation);
  const standard = truncation.map((withTruncation): EncodingCharacters => {
    const { truncation: trunc, ...rest } = STANDARD;
    return withTruncation ? { ...rest, truncation: trunc } : rest;
  });
  if (options.delimiters === "standard") return standard;
  const custom = fc
    .tuple(fc.shuffledSubarray([...DELIMITER_POOL], { minLength: 6, maxLength: 6 }), truncation)
    .map(([chars, withTruncation]): EncodingCharacters => {
      const [field, component, repetition, escape, subcomponent, trunc] = chars as [
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const base = { field, component, repetition, escape, subcomponent };
      return withTruncation ? { ...base, truncation: trunc } : base;
    });
  return fc.oneof(standard, custom);
}

/** The standard set with no truncation character, the default for {@link escapeSequence}. */
const STANDARD_NO_TRUNCATION: EncodingCharacters = {
  field: STANDARD.field,
  component: STANDARD.component,
  repetition: STANDARD.repetition,
  escape: STANDARD.escape,
  subcomponent: STANDARD.subcomponent,
};

/** Options for {@link escapeSequence}. */
export interface EscapeSequenceOptions {
  /**
   * The encoding characters the sequence is written with. Defaults to the standard set, with no
   * truncation character, so `\P\` is never generated.
   */
  readonly encodingCharacters?: EncodingCharacters;
}

/** The highlight, formatting, character set and local escape bodies the parser preserves. */
const PRESERVED_BODIES = [
  "H",
  "N",
  ".sp",
  ".in",
  ".ti",
  ".ce",
  ".fi",
  ".nf",
  "C2842",
  "C2D42",
  "M2442",
  "M824041",
] as const;

/**
 * Generate one HL7 escape sequence as it is written on the wire, delimited by the escape
 * character: a delimiter escape (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`, and `\P\` when a truncation
 * character is declared), the line break `\.br\`, a hex escape (`\X41\`), a highlight, formatting
 * or character set escape (`\H\`, `\.sp\`, `\C2842\`), or a local `\Z..\` escape.
 *
 * @param options The encoding characters to write it with.
 * @returns An arbitrary of the escape sequence's wire text.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { escapeSequence } from "@cosyte/hl7/arbitraries";
 *
 * const [token] = fc.sample(escapeSequence(), 1);
 * // token is one sequence, such as "\\F\\" or "\\X0D\\"
 * ```
 */
export function escapeSequence(options: EscapeSequenceOptions = {}): Arbitrary<string> {
  const enc = options.encodingCharacters ?? STANDARD_NO_TRUNCATION;
  const delimiterBodies = enc.truncation === undefined ? "FSTRE" : "FSTREP";
  const hexDigit = fc.constantFrom(..."0123456789ABCDEFabcdef");
  const hexByte = fc.tuple(hexDigit, hexDigit).map(([a, b]) => a + b);
  const body = fc.oneof(
    { weight: 4, arbitrary: fc.constantFrom(...delimiterBodies) },
    { weight: 1, arbitrary: fc.constant(".br") },
    {
      weight: 2,
      arbitrary: fc
        .array(hexByte, { minLength: 1, maxLength: 4 })
        .map((bytes) => "X" + bytes.join("")),
    },
    { weight: 2, arbitrary: fc.constantFrom(...PRESERVED_BODIES) },
    {
      weight: 1,
      arbitrary: fc
        .string({ unit: fc.constantFrom(..."ABCXYZ0189abcxyz"), minLength: 1, maxLength: 6 })
        .map((local) => "Z" + local),
    },
  );
  return body.map((b) => enc.escape + b + enc.escape);
}
