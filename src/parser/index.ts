/**
 * Public entry point for the `@cosyte/hl7` parser: composes every
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
import { KNOWN_SEGMENTS, canonicalSegmentName } from "./known-segments.js";
import { emitIfFramed, stripMllp } from "./mllp.js";
import { canonicalCharset } from "./charset.js";
import { normalize, normalizeBuffer } from "./normalize.js";
import { snippet as segmentSnippet, splitSegments } from "./segments.js";
import { tokenize } from "./tokenize.js";
import { analyzeMessageStructure, findMessageStructureDefinition } from "./message-structure.js";
import {
  encodingMismatch,
  missingRequiredSegment,
  safeCharsetLabel,
  segmentCase,
  unknownSegment,
} from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type {
  CustomSegmentDefinition,
  Hl7Position,
  ParseOptions,
  Profile,
  RawSegment,
} from "./types.js";

import { Hl7Message } from "../model/message.js";
import { getDefaultProfile } from "../profiles/default.js";

/**
 * The list of `ParseOptions` keys that are TRULY options-only: i.e. keys
 * that appear on `ParseOptions` but NOT on `Profile`. Used by
 * `discriminateOptionsOrProfile` to decide whether an anonymous second
 * argument is a `ParseOptions` (has at least one of these keys) or a
 * `Profile` (no options-only key, has a string `name`).
 *
 * Deliberately EXCLUDES `onWarning` and `dateFormats` even though they're
 * valid `ParseOptions` keys: those two also appear on `Profile` (Profile
 * carries `onWarning`/`dateFormats` fields), so checking for them would
 * mis-classify a `defineProfile()` output (which always has `dateFormats`,
 * even as `[]`) as a `ParseOptions` when a caller passes it as the second
 * arg. The subset below is the precise "disambiguates options from
 * profile" witness set: every key here is options-only.
 *
 * @internal
 */
const OPTIONS_ONLY_KEYS: readonly (keyof ParseOptions)[] = [
  "strict",
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
function discriminateOptionsOrProfile(arg: ParseOptions | Profile | undefined): ParseOptions {
  if (arg === undefined) return {};
  // A Profile is REQUIRED to have `name: string` (parser/types.ts locked
  // interface). Any arg without a string `name` is therefore unambiguously
  // ParseOptions: including bare option bags like `{ onWarning }` or
  // `{ dateFormats }` whose keys overlap with Profile but whose shape
  // lacks the required `name` witness.
  const hasStringName = typeof (arg as { name?: unknown }).name === "string";
  if (!hasStringName) {
    return arg;
  }
  // Arg has a string `name`. Check for TRULY options-only keys (keys that
  // cannot appear on a Profile) to decide whether the caller intended
  // options with a rogue `name` field (e.g. `{ name: "x", strict: true }`)
  // vs a real Profile. Uses hasOwnProperty.call against prototype
  // pollution per T-02-06-01.
  const hasOptionsOnlyKey = OPTIONS_ONLY_KEYS.some((k) =>
    Object.prototype.hasOwnProperty.call(arg, k),
  );
  if (hasOptionsOnlyKey) {
    return arg;
  }
  return { profile: arg as Profile };
}

/**
 * Build the single `emit` chokepoint passed into every parser stage per
 * CONTEXT.md D-11. Lenient mode: push the warning to the accumulator
 * array, invoke `effectiveProfile?.onWarning` FIRST (D-22) inside its own
 * try/catch so handler throws are swallowed silently, THEN invoke
 * `options.onWarning` inside its own try/catch (consistency with the
 * profile chain so a noisy caller handler cannot break the parser).
 * Strict mode: throw an `Hl7ParseError` whose `code` carries the warning
 * code; neither onWarning handler fires (preserves the existing
 * lenient-vs-strict split).
 *
 * D-22 ordering: profile handlers are observers that run FIRST; caller
 * handler runs LAST. Preserves the "profile behavior, then caller
 * behavior" layering pattern: the profile sees warnings as they arise;
 * the caller's handler sees post-profile-handler warnings (same object,
 * same time, just guaranteed ordering).
 *
 * @remarks
 * Under strict mode the thrown error's `code` is a `WarningCode` string
 * which is NOT in `FATAL_CODES`. This intentionally widens the runtime
 * set of values `Hl7ParseError.code` can take without widening the
 * compile-time type: consumers narrow on `err.code` after catching.
 * See the `as unknown as` comment in the implementation for the
 * justification.
 *
 * @internal
 */
function makeEmitter(
  warnings: Hl7ParseWarning[],
  options: ParseOptions,
  input: string,
  effectiveProfile: Profile | undefined,
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
      // narrow on the runtime string. Alternative (a): widening
      // FatalCode: would leak strict-mode semantics into the lenient-mode
      // type surface; alternative (c), a separate Hl7StrictError class,
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
    // D-22: profile.onWarning fires BEFORE options.onWarning. Each call is
    // wrapped in its own try/catch so a throw in one handler cannot prevent
    // the other from receiving the warning, and cannot bubble out of the
    // parser (consistent with the D-12 silent-swallow contract for the
    // profile-chain composer). Symmetric treatment of options.onWarning
    // keeps the contract uniform: a noisy caller handler is as contained
    // as a noisy profile handler.
    if (effectiveProfile?.onWarning !== undefined) {
      try {
        effectiveProfile.onWarning(w);
      } catch {
        /* D-22 silent swallow */
      }
    }
    if (options.onWarning !== undefined) {
      try {
        options.onWarning(w);
      } catch {
        /* D-22 symmetric silent swallow */
      }
    }
  };
}

/**
 * Build a bounded snippet of the input for attaching to a strict-mode
 * `Hl7ParseError`. The parser does not track character offsets: positions
 * are segment/field/component indices, so we return a leading excerpt
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
 * `tokenize`: those can throw on malformed MSH, which would defeat the
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
 * MSH-18 is a **repeating** field (HL7 v2 Ch. 2): the **first** occurrence is
 * the message's default encoding; later occurrences are alternates activated
 * mid-message by the charset-switch escapes. Only the first repetition governs
 * the whole-buffer decode, so this returns it: split on the message's own
 * repetition separator (MSH-2 char 2, default `~`).
 *
 * Returns the trimmed first MSH-18 repetition, or `undefined` on any failure
 * (no segment boundary, segment not `MSH`, `parts[17]` missing or empty). The
 * caller applies the ASCII default on `undefined`.
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
  // encoding characters (MSH-2 = `^~\&`), ..., parts[17] = MSH-18.
  const raw = parts[17];
  if (raw === undefined) return undefined;
  // Repetition separator = MSH-2 character 2 (0-indexed 1); default `~` when
  // MSH-2 is short/malformed. Take the first repetition = the message default.
  const repSep = (parts[1] ?? "").charAt(1) || "~";
  const firstRep = raw.split(repSep)[0] ?? raw;
  const trimmed = firstRep.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve the effective charset for a `Buffer` input and return the
 * decoded, line-ending-normalized text. Implements the locked precedence
 * rule (design decision (c)):
 *
 *   1. If `options.charset` is supplied AND MSH-18 is declared, emit
 *      `ENCODING_MISMATCH` when they disagree after canonicalization;
 *      always honour the override.
 *   2. Else if `options.charset` is supplied, use it.
 *   3. Else if MSH-18 is declared, use it (a recognized-but-undecoded set
 *      trips `UNSUPPORTED_CHARSET`, an unrecognized label `UNKNOWN_CHARSET`,
 *      both preserving bytes verbatim inside `normalizeBuffer`).
 *   4. Else fall through to `normalizeBuffer`'s ASCII default (decoded as its
 *      UTF-8 superset), which emits nothing.
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
  // Pass 1: tentative UTF-8 decode to read MSH-18. This is cheap: for
  // UTF-8 payloads the tentative decode is exactly what `normalizeBuffer`
  // would produce anyway; for non-UTF-8 payloads the MSH header bytes are
  // ASCII so MSH-18 still surfaces correctly even if the body garbles.
  const tentative = new TextDecoder("utf-8").decode(raw);
  const declared = extractMsh18FromTentativeDecode(tentative);

  if (override !== undefined && declared !== undefined) {
    const overrideNorm = canonicalCharset(override);
    const declaredNorm = canonicalCharset(declared);
    if (overrideNorm !== declaredNorm) {
      emit(
        encodingMismatch(
          { segmentIndex: 0 },
          // `declared` is MSH-18 read off the wire. On a message with no
          // segment terminators it is not MSH-18 at all but the 18th
          // `|`-token of the flattened message, commonly a data field, so it
          // is shape-checked before it reaches a log surface. `override` is
          // the caller's own `options.charset`, not input, and is left alone.
          `options.charset="${override}" disagrees with MSH-18="${safeCharsetLabel(declared)}"`,
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
 * HL7 1-indexed convention, `fields[0]` is the
 * separator/name placeholder, `fields[1]` is MSH-2 (encoding chars),
 * `fields[11]` is MSH-12 (version). Returns the empty string when the
 * first segment is absent, not an MSH, or MSH-12 has no content: the
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
 * Read MSH-9.1 (message code) and MSH-9.2 (trigger event) from the first
 * tokenized segment for the structure safety net. MSH-9 is
 * `fields[8]` under the unified 1-indexed convention (`fields[0]` is the
 * name/separator placeholder). Returns empty strings when the first segment is
 * absent, not an MSH, or the components have no content: every intermediate
 * index guard is explicit under `noUncheckedIndexedAccess`.
 *
 * @internal
 */
function extractMessageType(msh: RawSegment | undefined): {
  readonly messageCode: string;
  readonly triggerEvent: string;
} {
  if (msh === undefined || msh.name !== "MSH") return { messageCode: "", triggerEvent: "" };
  const typeField = msh.fields[8];
  if (typeField === undefined) return { messageCode: "", triggerEvent: "" };
  const firstRep = typeField.repetitions[0];
  if (firstRep === undefined) return { messageCode: "", triggerEvent: "" };
  const messageCode = firstRep.components[0]?.subcomponents[0] ?? "";
  const triggerEvent = firstRep.components[1]?.subcomponents[0] ?? "";
  return { messageCode, triggerEvent };
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
 * import { parseHL7, WARNING_CODES } from "@cosyte/hl7";
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
/** @internal implementation signature; overload signatures above carry the public JSDoc + @example. */
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
    throw new Hl7ParseError(FATAL_CODES.EMPTY_INPUT, "Input is empty.", { segmentIndex: 0 }, "");
  }

  // Step 3: Strip UTF-8 BOM silently (Tier-1; no warning).
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // Step 4: Strip MLLP framing bytes. Even if `stripMllpFraming` is
  // disabled we still strip: leaving VT/FS in the buffer would corrupt
  // segment splitting: but we suppress the warning in that case.
  const mllpResult = stripMllp(text);
  text = mllpResult.stripped;

  // Step 5: Re-check EMPTY_INPUT: MLLP strip may have emptied the payload.
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

  // Step 6.5 (Plan 04 extends): Resolve effectiveProfile BEFORE makeEmitter
  // so the D-22 onWarning chain is wired from the VERY FIRST emission
  // (Buffer-decode warnings in Step 7 replay included). Plan 04 extends
  // Plan 03's single-line assignment into a 3-branch discrimination per
  // D-19 "explicit wins; null opts out; undefined falls back to default":
  //   - options.profile === null → explicit opt-out for this call (D-19).
  //     Registered default is IGNORED; msg.profile === undefined.
  //   - options.profile !== undefined → explicit Profile wins over any
  //     registered default.
  //   - options.profile === undefined → fall back to the registered default
  //     via getDefaultProfile() (which may itself be undefined, in which
  //     case effectiveProfile stays undefined and parseHL7 behaves exactly
  //     like the no-profile case: zero semantic change for unregistered
  //     consumers).
  let effectiveProfile: Profile | undefined;
  if (options.profile === null) {
    effectiveProfile = undefined;
  } else if (options.profile !== undefined) {
    effectiveProfile = options.profile;
  } else {
    effectiveProfile = getDefaultProfile();
  }

  // Step 7: All Tier-3 fatals are past. Build the real emitter (now
  // profile-aware per D-22) and forward any warnings captured during the
  // Buffer decode. Buffer-decode warnings route through BOTH profile and
  // options handlers: full fidelity from the first warning onwards.
  const emit = makeEmitter(warnings, options, inputForPipeline, effectiveProfile);
  for (const pre of bufferWarnings) emit(pre);

  // Step 8: MLLP framing warning (Tier-2): fired AFTER the fatal checks
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

  // Step 11.5: Emit UNKNOWN_SEGMENT for any non-standard segment name that
  // is not declared in the active profile (D-31), and SEGMENT_CASE for any
  // name that is not already the canonical ASCII-uppercase spelling. Uses the
  // already-resolved effectiveProfile for customSegments suppression. O(N):
  // one Set.has + one hasOwnProperty per segment. Uses
  // Object.prototype.hasOwnProperty.call to guard against prototype pollution
  // (matches the T-02-06-01 mitigation in discriminateOptionsOrProfile).
  //
  // Both checks read the CANONICAL name, so `pid` resolves as PID rather than
  // reading as an unknown segment: the defect that silently dropped a flagged
  // lab result from `observations()` because the sender shipped `obx`. Profile
  // customSegments keys are validated to /^Z[A-Z0-9]{2}$/ at defineProfile
  // time, so they are already canonical and need no folding on that side.
  //
  // The two warnings are MUTUALLY EXCLUSIVE, which is what keeps each of them
  // honest. SEGMENT_CASE says "this is a real segment, merely miscased", so it
  // fires only when the canonical name actually resolves. Emitting it on any
  // lowercase text would make it fire on a forged segment name -- an unescaped
  // line break inside a narrative field hands the parser a line of clinical
  // prose as a "segment name" -- and tell the reader it had been resolved as
  // something, which is the same misdirection this slice removed from the
  // UNKNOWN_SEGMENT text. A name that resolves to nothing gets UNKNOWN_SEGMENT
  // alone, whose message already states that the comparison ignored case.
  //
  // Because they cannot both fire, strict mode (where the first emit throws)
  // reports the same code it always did for an unrecognized segment, and
  // SEGMENT_CASE only for a known segment that used to be misreported as
  // unknown. Strict keeps throwing on every input it threw on before and
  // accepts nothing new.
  const profileCustomSegments = effectiveProfile?.customSegments;
  for (let segIdx = 0; segIdx < rawSegments.length; segIdx++) {
    const rawSeg = rawSegments[segIdx];
    if (rawSeg === undefined) continue;
    const canonicalName = canonicalSegmentName(rawSeg.name);
    // The profile claim is checked under BOTH spellings. `defineProfile`
    // validates customSegments keys to /^Z[A-Z0-9]{2}$/, so a declared key is
    // canonical and the folded lookup is the one that matters. But `parseHL7`
    // also accepts a hand-rolled `Profile` literal, which gets no such
    // validation, and a literal keyed `zpi` was the only way to claim a
    // lowercase Z-feed before this change. Checking the raw name too keeps
    // those callers working rather than silently unclaiming their segment.
    const isKnown = KNOWN_SEGMENTS.has(canonicalName);
    const isProfileClaimed =
      profileCustomSegments !== undefined &&
      (Object.prototype.hasOwnProperty.call(profileCustomSegments, canonicalName) ||
        Object.prototype.hasOwnProperty.call(profileCustomSegments, rawSeg.name));
    if (!isKnown && !isProfileClaimed) {
      emit(unknownSegment({ segmentIndex: segIdx }, rawSeg.name));
    } else if (canonicalName !== rawSeg.name) {
      emit(segmentCase({ segmentIndex: segIdx }, rawSeg.name));
    }
  }

  // Step 11.6 (Phase G): structural-conformance safety net. For the message
  // types the registry recognizes, warn ADDITIVELY when a segment the PUBLISHED
  // structure definition gives a minimum of one is absent (e.g. ORU^R01 with no
  // OBR), the signature of a truncated or misrouted feed. Warning-only (Tier-2);
  // lenient parse never throws, `strict` may promote via the emitter. The
  // warning carries only structural identifiers (message type, segment name,
  // published structure id): never a field value, so no PHI is exposed.
  // Conservative by construction: an unrecognized type yields no expected
  // segments and emits nothing.
  const { messageCode, triggerEvent } = extractMessageType(rawSegments[0]);
  if (messageCode !== "") {
    // Canonical names: a sender shipping `obx` still satisfies an OBX
    // expectation, so the safety net does not report a segment as missing when
    // it is present and merely miscased.
    const presentSegmentNames = new Set<string>();
    for (const seg of rawSegments) {
      if (seg !== undefined) presentSegmentNames.add(canonicalSegmentName(seg.name));
    }
    const structure = analyzeMessageStructure(messageCode, triggerEvent, presentSegmentNames);
    const messageType = triggerEvent !== "" ? `${messageCode}^${triggerEvent}` : messageCode;
    // The structure id is registry data, not anything read off the message, so
    // it is interpolated as-is; the message type is shape-checked inside the
    // warning factory.
    const structureId =
      findMessageStructureDefinition(messageCode, triggerEvent)?.structureId ?? "";
    for (const segmentName of structure.missingSegments) {
      emit(
        missingRequiredSegment(
          { segmentIndex: 0, fieldIndex: 9 },
          messageType,
          segmentName,
          structureId,
        ),
      );
    }
  }

  // Step 12: Version extraction: Phase 4 extends this via msg.meta.
  const version = extractVersion(rawSegments[0]);

  // Step 13: Profile attribution + merged customSegments / dateFormats for
  // Hl7Message init. Step 13 is a CONSUMER of the already-resolved
  // effectiveProfile (resolution moved to Step 6.5 per Plan 03 Option A).
  const profileInit =
    effectiveProfile !== undefined
      ? {
          name: effectiveProfile.name,
          lineage: effectiveProfile.lineage ?? [effectiveProfile.name],
        }
      : undefined;

  // D-21: options.dateFormats precede profile.dateFormats in the try-order.
  // Dedupe preserving first occurrence. `mergedDateFormats` stays undefined
  // when neither source supplied any formats so the Hl7MessageInit omission
  // discipline (exactOptionalPropertyTypes) is honoured.
  const optionFormats = options.dateFormats ?? [];
  const profileFormats = effectiveProfile?.dateFormats ?? [];
  const mergedFormats: string[] = [];
  const seenFormats = new Set<string>();
  for (const f of optionFormats) {
    if (!seenFormats.has(f)) {
      seenFormats.add(f);
      mergedFormats.push(f);
    }
  }
  for (const f of profileFormats) {
    if (!seenFormats.has(f)) {
      seenFormats.add(f);
      mergedFormats.push(f);
    }
  }
  const mergedDateFormats: readonly string[] | undefined =
    mergedFormats.length > 0 ? Object.freeze(mergedFormats) : undefined;

  const mergedCustomSegments = effectiveProfile?.customSegments;

  // exactOptionalPropertyTypes: conditionally assign each optional init key.
  type Init = {
    segments: readonly RawSegment[];
    encodingCharacters: typeof encoding;
    version: string;
    warnings: readonly Hl7ParseWarning[];
    profile?: { readonly name: string; readonly lineage: readonly string[] };
    customSegments?: Readonly<Record<string, CustomSegmentDefinition>>;
    dateFormats?: readonly string[];
  };
  const init: Init = {
    segments: rawSegments,
    encodingCharacters: encoding,
    version,
    warnings,
  };
  if (profileInit !== undefined) init.profile = profileInit;
  if (mergedCustomSegments !== undefined) init.customSegments = mergedCustomSegments;
  if (mergedDateFormats !== undefined) init.dateFormats = mergedDateFormats;

  return new Hl7Message(init);
}

// Re-export DEFAULT_ENCODING_CHARACTERS so consumers who need it do not
// have to reach into `./delimiters.js`.
export { DEFAULT_ENCODING_CHARACTERS };
