/**
 * Public entry point for the `@cosyte/hl7-parser` parser — composes every
 * parser stage built across Plans 01–05 (normalize, strip MLLP, split
 * segments, read delimiters, tokenize) and routes every Tier-2 warning
 * through a single `emitWarning` chokepoint. The four Tier-3 fatal codes
 * (`EMPTY_INPUT`, `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`,
 * `INVALID_ENCODING_CHARACTERS`) are thrown even in lenient mode; every
 * other recoverable deviation is a warning unless `{ strict: true }` is
 * passed.
 *
 * Pipeline order (locked by CONTEXT.md D-03): Buffer decode → EMPTY_INPUT
 * check → BOM strip → MLLP strip → re-check EMPTY_INPUT → line-ending
 * normalize → emitter build → MLLP warning → segment split → delimiter
 * discovery → tokenize → version extract → Hl7Message construct.
 */

import type { Buffer } from "node:buffer";

import { DEFAULT_ENCODING_CHARACTERS, readDelimiters } from "./delimiters.js";
import { FATAL_CODES, Hl7ParseError } from "./errors.js";
import { emitIfFramed, stripMllp } from "./mllp.js";
import { mapHl7Charset, normalize, normalizeBuffer } from "./normalize.js";
import { snippet as segmentSnippet, splitSegments } from "./segments.js";
import { tokenize } from "./tokenize.js";
import { encodingMismatch } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type { Hl7Position, ParseOptions, Profile, RawSegment } from "./types.js";

import { Hl7Message } from "../model/message.js";

/**
 * The canonical list of `ParseOptions` keys. Used by
 * `discriminateOptionsOrProfile` to decide whether an anonymous second
 * argument is a `ParseOptions` (has at least one of these keys) or a
 * `Profile` (no options-only key, has a string `name`). Kept as a readonly
 * tuple so future additions are type-checked against `ParseOptions`.
 *
 * @internal
 */
const OPTIONS_ONLY_KEYS: readonly (keyof ParseOptions)[] = [
  "strict",
  "onWarning",
  "dateFormats",
  "stripMllpFraming",
  "trimFields",
  "profile",
  "charset",
];

/**
 * Discriminate the optional second argument of `parseHL7` per CONTEXT.md
 * D-06. `undefined` → empty options. A bare `Profile` (object with
 * `name: string` and none of the options-only keys) → wrapped into
 * `{ profile }`. Anything else with an options-only key wins the
 * `ParseOptions` branch (even when it also has a `name` field) so callers
 * who pass `{ name: "epic", strict: true }` get options semantics.
 *
 * Uses `Object.prototype.hasOwnProperty.call` rather than the `in`
 * operator so a prototype-polluted object cannot trip the options-only
 * branch by inheriting a `strict` / `onWarning` key (T-02-06-01).
 *
 * @internal
 */
function discriminateOptionsOrProfile(
  arg: ParseOptions | Profile | undefined,
): ParseOptions {
  if (arg === undefined) return {};
  const hasOptionsKey = OPTIONS_ONLY_KEYS.some((k) =>
    Object.prototype.hasOwnProperty.call(arg, k),
  );
  if (hasOptionsKey) {
    return arg as ParseOptions;
  }
  if (typeof (arg as { name?: unknown }).name === "string") {
    return { profile: arg as Profile };
  }
  return {};
}

/**
 * Build the single `emit` chokepoint passed into every parser stage per
 * CONTEXT.md D-11. Lenient mode: push the warning to the accumulator
 * array and invoke `options.onWarning`. Strict mode: throw an
 * `Hl7ParseError` whose `code` carries the warning code and do NOT
 * invoke the callback or append to the array.
 *
 * @remarks
 * Under strict mode the thrown error's `code` is a `WarningCode` string
 * which is NOT in `FATAL_CODES`. This intentionally widens the runtime
 * set of values `Hl7ParseError.code` can take without widening the
 * compile-time type — consumers narrow on `err.code` after catching.
 * See the `as unknown as` comment in the implementation for the
 * justification (Plan 06 decision (b)).
 *
 * @internal
 */
function makeEmitter(
  warnings: Hl7ParseWarning[],
  options: ParseOptions,
  input: string,
): (w: Hl7ParseWarning) => void {
  return (w) => {
    if (options.strict === true) {
      // Justification for `as unknown as FatalCode`: strict mode escalates
      // Tier-2 warnings into thrown `Hl7ParseError`s per TOL-01. The thrown
      // error reuses the existing error shape (code / message / position /
      // snippet) so consumers have one catch surface. The `code` field is
      // typed as `FatalCode` (the 4 Tier-3 codes) at compile time, but at
      // runtime under strict mode it also carries any `WarningCode`. We
      // preserve the narrow compile-time type so lenient-mode callers get
      // exhaustive-switch checks on `FatalCode`; strict-mode consumers
      // narrow on the runtime string. Alternative (a) — widening
      // FatalCode — would leak strict-mode semantics into the lenient-mode
      // type surface; alternative (c) — a separate Hl7StrictError class —
      // would introduce a third error class. (b) is the minimum-surface
      // change and matches Plan 06's recommendation.
      throw new Hl7ParseError(
        w.code as unknown as (typeof FATAL_CODES)[keyof typeof FATAL_CODES],
        w.message,
        w.position,
        buildSnippet(input, w.position),
      );
    }
    warnings.push(w);
    options.onWarning?.(w);
  };
}

/**
 * Build a bounded snippet of the input for attaching to a strict-mode
 * `Hl7ParseError`. Phase 2 does not track character offsets — positions
 * are segment/field/component indices — so we return a leading excerpt
 * of the input bounded by `segments.snippet`.
 *
 * @internal
 */
function buildSnippet(input: string, _position: Hl7Position): string {
  return segmentSnippet(input.slice(0, 80));
}

/**
 * Shallow MSH-18 extractor for the tentative-decode first pass of Buffer
 * charset resolution. Deliberately avoids calling `readDelimiters` or
 * `tokenize` — those can throw on malformed MSH, which would defeat the
 * "tentative" contract of the first pass.
 *
 * Line-ending agnostic: splits on `/[\r\n]/` so a Buffer that uses Unix
 * (`\n`), classic Mac (`\r`), or mixed line endings still isolates segment
 * 0 correctly. A bare split on `\r` alone here would silently regress
 * PARSE-09 on `\n`-only Buffer traffic (the whole message would become
 * segment 0, `parts[17]` would swallow subsequent segments, and the
 * charset token would become a garbage string that falls through to
 * UTF-8).
 *
 * Returns the trimmed MSH-18 token, or `undefined` on any failure (no
 * segment boundary, segment not `MSH`, `parts[17]` missing or empty). The
 * caller falls back to UTF-8 on `undefined`.
 *
 * @internal
 */
function extractMsh18FromTentativeDecode(tentativeText: string): string | undefined {
  const firstSegment = tentativeText.split(/[\r\n]/)[0];
  if (firstSegment === undefined) return undefined;
  if (!firstSegment.startsWith("MSH")) return undefined;
  // HL7 field-separator character is at index 3 of the MSH segment (after
  // the three-letter segment name).
  const fieldSep = firstSegment.charAt(3);
  if (fieldSep === "") return undefined;
  const parts = firstSegment.split(fieldSep);
  // Per the unified 1-indexed convention: parts[0] = "MSH", parts[1] =
  // encoding characters (MSH-2), ..., parts[17] = MSH-18.
  const raw = parts[17];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve the effective charset for a `Buffer` input and return the
 * decoded, line-ending-normalized text. Implements the locked precedence
 * rule (design decision (c)):
 *
 *   1. If `options.charset` is supplied AND MSH-18 is declared, emit
 *      `ENCODING_MISMATCH` when they disagree after alias normalization;
 *      always honour the override.
 *   2. Else if `options.charset` is supplied, use it.
 *   3. Else if MSH-18 is declared, use it (triggers `UNKNOWN_CHARSET`
 *      fallback inside `normalizeBuffer` when the label is unsupported).
 *   4. Else fall through to `normalizeBuffer`'s UTF-8 default.
 *
 * Two-pass mechanics: MSH-1 through MSH-18 are always 7-bit ASCII in real
 * HL7 traffic, so a tentative UTF-8 decode reliably surfaces MSH-18 even
 * when the payload declares a non-UTF-8 charset. The second pass
 * (`normalizeBuffer`) re-decodes with the resolved charset.
 *
 * @internal
 */
function resolveBufferCharset(
  raw: Buffer,
  options: ParseOptions,
  emit: (w: Hl7ParseWarning) => void,
): string {
  const override = options.charset;
  // Pass 1: tentative UTF-8 decode to read MSH-18. This is cheap — for
  // UTF-8 payloads the tentative decode is exactly what `normalizeBuffer`
  // would produce anyway; for non-UTF-8 payloads the MSH header bytes are
  // ASCII so MSH-18 still surfaces correctly even if the body garbles.
  const tentative = new TextDecoder("utf-8").decode(raw);
  const declared = extractMsh18FromTentativeDecode(tentative);

  if (override !== undefined && declared !== undefined) {
    const overrideNorm = mapHl7Charset(override);
    const declaredNorm = mapHl7Charset(declared);
    if (overrideNorm !== declaredNorm) {
      emit(
        encodingMismatch(
          { segmentIndex: 0 },
          `options.charset="${override}" disagrees with MSH-18="${declared}"`,
        ),
      );
    }
    return normalizeBuffer(raw, override, emit);
  }
  if (override !== undefined) {
    return normalizeBuffer(raw, override, emit);
  }
  if (declared !== undefined) {
    return normalizeBuffer(raw, declared, emit);
  }
  return normalizeBuffer(raw, undefined, emit);
}

/**
 * Read MSH-12 (version) from the first tokenized segment. Per the unified
 * HL7 1-indexed convention locked in Plan 03, `fields[0]` is the
 * separator/name placeholder, `fields[1]` is MSH-2 (encoding chars),
 * `fields[11]` is MSH-12 (version). Returns the empty string when the
 * first segment is absent, not an MSH, or MSH-12 has no content — the
 * `noUncheckedIndexedAccess` strictness flag forces every intermediate
 * index guard to be explicit.
 *
 * @internal
 */
function extractVersion(msh: RawSegment | undefined): string {
  if (msh === undefined || msh.name !== "MSH") return "";
  const versionField = msh.fields[11];
  if (versionField === undefined) return "";
  const firstRep = versionField.repetitions[0];
  if (firstRep === undefined) return "";
  const firstComp = firstRep.components[0];
  if (firstComp === undefined) return "";
  const firstSub = firstComp.subcomponents[0];
  return firstSub ?? "";
}

/**
 * Parse a raw HL7 v2 message (string or `Buffer`) into an `Hl7Message`.
 * The parser is lenient by default: recoverable deviations from the HL7
 * spec are reported via `msg.warnings` and (optionally)
 * `options.onWarning` but do not throw. Four unrecoverable structural
 * errors throw `Hl7ParseError`: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`,
 * `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Opt into strict mode
 * with `{ strict: true }` to escalate every Tier-2 warning into an
 * `Hl7ParseError`.
 *
 * @example
 * ```ts
 * import { parseHL7, WARNING_CODES } from "@cosyte/hl7-parser";
 *
 * const msg = parseHL7(
 *   "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|||123",
 * );
 * console.log(msg.version); // "2.5"
 * console.log(msg.warnings.length); // 0
 * for (const w of msg.warnings) {
 *   if (w.code === WARNING_CODES.MLLP_FRAMING_STRIPPED) {
 *     // handle MLLP-framed sender
 *   }
 * }
 * ```
 */
export function parseHL7(raw: string | Buffer): Hl7Message;
export function parseHL7(raw: string | Buffer, profile: Profile): Hl7Message;
export function parseHL7(raw: string | Buffer, options: ParseOptions): Hl7Message;
/** @internal — implementation signature; overload signatures above carry the public JSDoc + @example. */
export function parseHL7(
  raw: string | Buffer,
  optionsOrProfile?: ParseOptions | Profile,
): Hl7Message {
  const options = discriminateOptionsOrProfile(optionsOrProfile);
  const warnings: Hl7ParseWarning[] = [];

  // Step 1: Buffer → string decode (if needed). UNKNOWN_CHARSET warnings
  // captured here are forwarded through the real emitter after the
  // fatal checks pass.
  const bufferWarnings: Hl7ParseWarning[] = [];
  const bufferEmit = (w: Hl7ParseWarning): void => {
    bufferWarnings.push(w);
  };
  let text: string;
  if (typeof raw === "string") {
    text = raw;
  } else {
    text = resolveBufferCharset(raw, options, bufferEmit);
  }

  // Step 2: EMPTY_INPUT fatal check at the top of the pipeline (D-03).
  if (text.length === 0) {
    throw new Hl7ParseError(
      FATAL_CODES.EMPTY_INPUT,
      "Input is empty.",
      { segmentIndex: 0 },
      "",
    );
  }

  // Step 3: Strip UTF-8 BOM silently (Tier-1; no warning).
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // Step 4: Strip MLLP framing bytes. Even if `stripMllpFraming` is
  // disabled we still strip — leaving VT/FS in the buffer would corrupt
  // segment splitting — but we suppress the warning in that case.
  const mllpResult = stripMllp(text);
  text = mllpResult.stripped;

  // Step 5: Re-check EMPTY_INPUT — MLLP strip may have emptied the payload.
  if (text.length === 0) {
    throw new Hl7ParseError(
      FATAL_CODES.EMPTY_INPUT,
      "Input is empty after MLLP framing was stripped.",
      { segmentIndex: 0 },
      "",
    );
  }

  // Step 6: Normalize line endings to `\r` (Tier-1 silent).
  const inputForPipeline = normalize(text);

  // Step 7: All Tier-3 fatals are past. Build the real emitter and
  // forward any warnings captured during the Buffer decode.
  const emit = makeEmitter(warnings, options, inputForPipeline);
  for (const pre of bufferWarnings) emit(pre);

  // Step 8: MLLP framing warning (Tier-2) — fired AFTER the fatal checks
  // so `EMPTY_INPUT` always takes precedence over
  // `MLLP_FRAMING_STRIPPED` (D-03 ordering).
  if ((options.stripMllpFraming ?? true) === true) {
    emitIfFramed(mllpResult, emit, { segmentIndex: 0 });
  }

  // Step 9: Segment split.
  const segments = splitSegments(inputForPipeline);
  if (segments.length === 0) {
    // Defensive: splitSegments returning [] implies empty input, which the
    // earlier EMPTY_INPUT checks would have caught. Fall through with a
    // NO_MSH_SEGMENT fatal so the invariant "first segment exists" holds.
    throw new Hl7ParseError(
      FATAL_CODES.NO_MSH_SEGMENT,
      "No segments found after normalization.",
      { segmentIndex: 0 },
      "",
    );
  }

  // Step 10: Delimiter discovery (may throw NO_MSH_SEGMENT / MSH_TOO_SHORT
  // / INVALID_ENCODING_CHARACTERS).
  const firstSegment = segments[0] ?? "";
  const encoding = readDelimiters(firstSegment);

  // Step 11: Tokenize (may emit FIELD_WHITESPACE_TRIMMED).
  const rawSegments: readonly RawSegment[] = tokenize(
    segments,
    encoding,
    emit,
    options.trimFields ?? true,
  );

  // Step 12: Version extraction — Phase 4 extends this via msg.meta.
  const version = extractVersion(rawSegments[0]);

  // Step 13: Profile attribution (PROF-08 opt-out: profile === null).
  const profileOpt = options.profile;
  const profileInit =
    profileOpt !== undefined && profileOpt !== null
      ? {
          name: profileOpt.name,
          lineage: profileOpt.lineage ?? [profileOpt.name],
        }
      : undefined;

  // `exactOptionalPropertyTypes` forces an omit-when-undefined discipline:
  // the init shape's `profile?: {...}` cannot be set to `undefined`
  // explicitly — we must conditionally build the init object.
  if (profileInit === undefined) {
    return new Hl7Message({
      segments: rawSegments,
      encodingCharacters: encoding,
      version,
      warnings,
    });
  }
  return new Hl7Message({
    segments: rawSegments,
    encodingCharacters: encoding,
    version,
    warnings,
    profile: profileInit,
  });
}

// Re-export DEFAULT_ENCODING_CHARACTERS so consumers who need it do not
// have to reach into `./delimiters.js`.
export { DEFAULT_ENCODING_CHARACTERS };
