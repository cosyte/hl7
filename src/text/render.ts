/**
 * Formatted-text rendering for `@cosyte/hl7` — turns HL7 v2 §2.7
 * escape/formatting-bearing field content into a **normalized display model**
 * a human (or a downstream display / FHIR `.text`) can read, instead of the
 * raw `\H\`/`\.br\` sentinels the lenient parser preserves.
 *
 * This is the read-projection half of Phase R: `renderText` never mutates the
 * raw field value (rendering is opt-in on top of the tolerant parse), and it
 * **never fabricates** — an escape it cannot render is preserved as its literal
 * characters AND flagged in {@link RenderedText.unrenderedSequences}, never
 * dropped and never replaced with a guessed glyph.
 *
 * **Clinical-safety angle.** A lab/clinical narrative surfaced with raw
 * `\.br\` / `\H\` sentinels is *misread* by a human; that is the harm this
 * prevents. Formatting commands become real whitespace/line-breaks and
 * highlight boundaries are dropped from the plain text (and exposed as
 * `highlighted` runs for consumers that want emphasis), so what a reader sees
 * is the intended text — never a sentinel and never an invented character.
 *
 * ## Spec traceability (HL7 v2 Chapter 2, §2.7 — confirmed firsthand
 * 2026-07-21 against the v2.5.1 and v2.8.2 chapter text; section numbers shift
 * by version)
 *
 * - **§2.7.1 formatting codes** — the delimiter/escape substitutions
 *   `\F\ \S\ \T\ \R\ \E\` (→ the message's own field/component/subcomponent/
 *   repetition/escape characters), the highlight pair `\H\` (start) / `\N\`
 *   (normal, i.e. end), and (v2.7+) `\P\` (the truncation character).
 * - **§2.7.2/2.7.3 charset switch** — `\Cxxyy\` (single-byte) / `\Mxxyyzz\`
 *   (multi-byte, `zz` optional): selects an alternate MSH-18 character set for
 *   the following run. Decoding requires stateful charset context this module
 *   does not have, so a switch is **preserved + flagged**, never guessed.
 * - **§2.7.5/2.7.6 hex** — `\Xdddd…\`: consecutive **pairs** of hex digits,
 *   each pair one 8-bit byte.
 * - **§2.7.6/2.7.7 formatting commands** (FT data type) — `\.br\` `\.sp\`
 *   `\.in\` `\.ti\` `\.fi\` `\.nf\` `\.ce\` `\.sk\`; `.sp` takes an optional
 *   positive count, `.in`/`.ti` a signed indent, `.sk` a space count. Rendered
 *   to a conservative plain-text normalization (see the table below).
 * - **§2.7.7/2.7.8 locally-defined** — `\Zdddd…\`: opaque, meaning is a
 *   sender/receiver agreement, so **preserved + flagged**, never interpreted.
 *
 * ## Normalization policy (conservative, documented — not a page-layout engine)
 *
 * | Escape                      | Rendered as                                   |
 * | --------------------------- | --------------------------------------------- |
 * | `\F\ \S\ \T\ \R\ \E\ \P\`   | the literal delimiter / escape / trunc char   |
 * | `\Xdddd…\`                  | the decoded byte(s)                           |
 * | `\H\` / `\N\`               | dropped from text; toggles a `highlighted` run |
 * | `\.br\`                     | one line break                                |
 * | `\.sp\` / `\.sp <n>\`       | `n` line breaks (default 1, clamped to 100)    |
 * | `\.ce\`                     | one line break (centering dropped)            |
 * | `\.in <n>\` / `\.ti <n>\`   | dropped (indentation — exact column math is a defer) |
 * | `\.fi\` / `\.nf\`           | dropped (word-wrap mode — no content)         |
 * | `\.sk <n>\`                 | `n` spaces (default 1, clamped to 100)         |
 * | `\Cxxyy\` `\Mxxyyzz\` `\Zdddd…\`, malformed / unterminated | literal chars, **preserved + flagged** |
 *
 * A raw CR / LF / CRLF already present in the input (e.g. a `\.br\` the parser
 * already decoded to `\n`, or a hex-encoded `\X0D\`/`\X0A\`) is normalized to
 * one line break too, so rendering a pre-decoded `Field.value` and rendering
 * the wire text agree. A `\.sp <n>\`/`\.sk <n>\` count is clamped to a small
 * maximum (a conservative renderer need not honor a pathological skip, and an
 * unbounded count is a memory / `RangeError` foot-gun on a hostile feed).
 *
 * @packageDocumentation
 */

import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { EncodingCharacters } from "../parser/types.js";

/**
 * One contiguous run of rendered display text, tagged with whether it fell
 * inside a `\H\`…\`\N\` highlight span. Runs preserve emphasis boundaries that
 * the flat {@link RenderedText.text} intentionally drops.
 */
export interface TextRun {
  /**
   * The literal display text of this run — escape sentinels already resolved
   * (delimiter/hex decoded, formatting → whitespace/line breaks). Never
   * contains a formatting sentinel; may contain the newline used for breaks.
   */
  readonly text: string;
  /** `true` when this run is inside a `\H\`…`\N\` highlight span. */
  readonly highlighted: boolean;
}

/**
 * The normalized display model produced by {@link renderText}: a flat
 * plain-text string plus the structured highlight-aware runs, plus an
 * honesty list of the escape sequences that were preserved rather than
 * rendered.
 */
export interface RenderedText {
  /**
   * The full plain-text normalization: formatting commands become
   * whitespace / line breaks and highlight boundaries are dropped. This is
   * the string to show a human or feed a downstream `.text`. Equal to the
   * concatenation of every {@link runs} entry's `text`.
   */
  readonly text: string;
  /**
   * The structured, highlight-aware form: `{ text, highlighted }` runs in
   * document order. Empty runs are elided. Use this to preserve emphasis
   * (bold / reverse-video / etc.) that the flat {@link text} drops.
   */
  readonly runs: readonly TextRun[];
  /**
   * The escape sequences `renderText` **preserved verbatim instead of
   * rendering** — vendor `\Zdddd…\`, charset switches `\Cxxyy\`/`\Mxxyyzz\`,
   * and any malformed / unterminated sequence. Their literal characters ALSO
   * appear in {@link text}/{@link runs} (never silently dropped); this list
   * exists so a consumer can detect that a non-render decision was made and
   * surface or route those sequences deliberately. Empty when everything
   * rendered cleanly.
   */
  readonly unrenderedSequences: readonly string[];
}

/** Options for {@link renderText}. */
export interface RenderTextOptions {
  /**
   * The string emitted for each line break (`\.br\`, `\.sp\`, `\.ce\`, and a
   * raw CR/LF/CRLF in the input). Defaults to `"\n"`. Set `"\r\n"` for
   * Windows-style display, or `" "` to flatten a note to a single line.
   */
  readonly newline?: string;
}

/** The eight FT formatting commands and their argument shapes. @internal */
const FORMATTING_RE = /^\.(br|sp|in|ti|fi|nf|ce|sk)[ +]?([+-]?\d+)?$/u;

/** Spec-default truncation char (HL7 v2.7+ §2.5.5.2) when MSH-2 declared none. */
const DEFAULT_TRUNCATION_CHAR = "#";

/**
 * Upper bound on a `\.sp <n>\` / `\.sk <n>\` repeat count. A conservative
 * normalization does not need to honor a pathological vertical/horizontal skip,
 * and an unbounded count is a memory-exhaustion / `RangeError` foot-gun on a
 * corrupted or adversarial feed (a ~15-byte field could otherwise demand a
 * multi-hundred-MB allocation). Clamped, documented, and fail-safe.
 * @internal
 */
const MAX_FORMAT_REPEAT = 100;

/** Normalize any CR / LF / CRLF inside decoded output to the break string. @internal */
function normalizeBreaks(s: string, newline: string): string {
  return s.replace(/\r\n|\r|\n/gu, newline);
}

/** Parse and clamp a formatting-command repeat count to `[1, MAX_FORMAT_REPEAT]`. @internal */
function clampCount(arg: string | undefined): number {
  if (arg === undefined) return 1;
  // `arg` is regex-validated as `[+-]?\d+`, so Number is finite; a value < 1
  // (absent or negative skip) is meaningless → treat as 1.
  const n = Math.trunc(Number(arg));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_FORMAT_REPEAT);
}

/**
 * Render an HL7 v2 escape/formatting-bearing string into a normalized display
 * model (plain text + highlight-aware runs). A **read projection** — it never
 * mutates the underlying field, and it never fabricates: an escape it cannot
 * render is preserved as literal characters and flagged in
 * {@link RenderedText.unrenderedSequences}.
 *
 * `input` is the field's escape-bearing text. Pass the **wire form** (e.g.
 * `Field.text`, byte-verbatim for parsed content) for the most faithful
 * result — a wire `\E\H\E\` (an escaped literal backslash-H-backslash) then
 * renders as the three literal characters `\H\`, never as a highlight. Passing
 * an already-decoded `Field.value` also works: its `\.br\` is already a
 * newline (rendered as one line break) and its `\H\`/formatting sentinels are
 * still recognized.
 *
 * Never throws for any input.
 *
 * @param input - the escape-bearing field text to render.
 * @param enc - the message's encoding characters (for `\F\`/`\S\`/… targets);
 *   defaults to the HL7 standard `|^~\&`.
 * @param opts - see {@link RenderTextOptions}.
 * @returns the normalized {@link RenderedText}.
 *
 * @example
 * ```ts
 * import { renderText } from "@cosyte/hl7";
 *
 * const r = renderText("Specimen received.\\.br\\Gross exam \\H\\normal\\N\\.");
 * r.text;
 * // "Specimen received.\nGross exam normal."
 * r.runs;
 * // [ { text: "Specimen received.\nGross exam ", highlighted: false },
 * //   { text: "normal",                          highlighted: true  },
 * //   { text: ".",                               highlighted: false } ]
 * r.unrenderedSequences; // []
 * ```
 */
export function renderText(
  input: string,
  enc: EncodingCharacters = DEFAULT_ENCODING_CHARACTERS,
  opts?: RenderTextOptions,
): RenderedText {
  const esc = enc.escape;
  const newline = opts?.newline ?? "\n";
  const runs: TextRun[] = [];
  const unrendered: string[] = [];

  let highlighted = false;
  let current = "";

  const flush = (): void => {
    if (current !== "") {
      runs.push({ text: current, highlighted });
      current = "";
    }
  };

  let i = 0;
  const len = input.length;
  while (i < len) {
    const ch = input.charAt(i);

    // Already-decoded line breaks (raw CR / LF / CRLF, e.g. a \.br\ the parser
    // decoded upstream) normalize to one break so wire-form and decoded-form
    // input agree.
    if (ch === "\r" || ch === "\n") {
      current += newline;
      i += ch === "\r" && input.charAt(i + 1) === "\n" ? 2 : 1;
      continue;
    }

    if (ch !== esc) {
      current += ch;
      i++;
      continue;
    }

    // An escape character: find its closing partner.
    const close = input.indexOf(esc, i + 1);
    if (close === -1) {
      // Unterminated — preserve the remainder verbatim and flag it. Never a
      // throw; the scan is strictly O(n).
      const tail = input.slice(i);
      current += tail;
      unrendered.push(tail);
      break;
    }

    const body = input.slice(i + 1, close);
    const literal = esc + body + esc;

    if (body === "H") {
      flush();
      highlighted = true;
    } else if (body === "N") {
      flush();
      highlighted = false;
    } else {
      const decoded = decodeBody(body, enc, newline);
      if (decoded !== null) {
        current += decoded;
      } else {
        // Known-but-unrenderable (charset switch), vendor (\Z..\), or
        // malformed/garbage: preserve literal + flag. Never dropped, never
        // guessed.
        current += literal;
        unrendered.push(literal);
      }
    }
    i = close + 1;
  }

  flush();
  const text = runs.reduce((acc, r) => acc + r.text, "");
  return { text, runs, unrenderedSequences: unrendered };
}

/**
 * Decode one escape body to its rendered display text, or `null` when the body
 * is not renderable (charset switch, vendor `\Z..\`, or malformed) and must be
 * preserved + flagged by the caller.
 *
 * @internal
 */
function decodeBody(body: string, enc: EncodingCharacters, newline: string): string | null {
  // §2.7.1 delimiter / escape / truncation substitutions → the literal char.
  switch (body) {
    case "F":
      return enc.field;
    case "S":
      return enc.component;
    case "T":
      return enc.subcomponent;
    case "R":
      return enc.repetition;
    case "E":
      return enc.escape;
    case "P":
      return enc.truncation ?? DEFAULT_TRUNCATION_CHAR;
    default:
      break;
  }

  // §2.7.6 formatting commands (FT) → conservative whitespace normalization.
  if (body.charAt(0) === ".") {
    const m = FORMATTING_RE.exec(body);
    if (m !== null) return renderFormatting(m[1] ?? "", m[2], newline);
    // A dot body that is not one of the eight known commands is not a
    // formatting command — fall through to unknown handling.
    return null;
  }

  // §2.7.5 hex — consecutive hex-digit PAIRS, each pair one byte.
  if (body.charAt(0) === "X") {
    const hex = body.slice(1);
    if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/u.test(hex)) {
      return null;
    }
    let out = "";
    for (let j = 0; j < hex.length; j += 2) {
      out += String.fromCharCode(parseInt(hex.slice(j, j + 2), 16));
    }
    // A hex-encoded CR/LF (a legitimate wire encoding of a line break) must
    // normalize to a break exactly like a raw CR/LF, so rendering the wire form
    // and a pre-decoded value agree.
    return normalizeBreaks(out, newline);
  }

  // §2.7.2/2.7.3 charset switch and §2.7.7 vendor \Z..\ are recognized but
  // cannot be rendered without state we do not carry → preserve + flag.
  return null;
}

/**
 * Render one recognized FT formatting command to conservative whitespace.
 * `cmd` is the command letters (`br`/`sp`/…); `arg` the optional numeric
 * argument (already validated as an integer by {@link FORMATTING_RE}).
 *
 * @internal
 */
function renderFormatting(cmd: string, arg: string | undefined, newline: string): string {
  switch (cmd) {
    case "br":
    case "ce":
      // Hard line break (centering is dropped — we are not a layout engine).
      return newline;
    case "sp":
      // Vertical skip: n line breaks, default 1 (clamped — see MAX_FORMAT_REPEAT).
      return newline.repeat(clampCount(arg));
    case "sk":
      // Horizontal skip: n spaces, default 1 (clamped — see MAX_FORMAT_REPEAT).
      return " ".repeat(clampCount(arg));
    case "in":
    case "ti":
    case "fi":
    case "nf":
    default:
      // Indentation and word-wrap mode toggles carry no textual content in a
      // plain-text projection; exact column math is a documented defer.
      return "";
  }
}
