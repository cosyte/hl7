/**
 * Tokenizer stage for the `@cosyte/hl7-parser` parser pipeline. Decomposes
 * an ordered list of segment strings into the nested positional tree that
 * `Hl7Message` holds — `RawSegment` -> `RawField` -> `RawRepetition` ->
 * `RawComponent` -> subcomponent strings. Honors custom encoding characters
 * so PARSE-02 (non-default delimiters) flows through downstream stages
 * without re-derivation.
 *
 * Adopts the unified HL7 1-indexed convention for ALL segments:
 * `fields[0]` is the segment-name / separator placeholder slot (never a
 * data field); `fields[N]` for N >= 1 is the HL7 N-th field. MSH: `fields[0]`
 * holds the field separator char (MSH-1), `fields[1]` holds the encoding
 * chars string (MSH-2). Non-MSH (PID, EVN, ZPI, ...): `fields[0]` holds the
 * segment name, `fields[1]` holds the HL7 first field (PID-1).
 *
 * Escape sequences (`\F\`, `\S\`, ...) are NOT expanded here — Plan 04's
 * escape stage handles unescape on-access so the raw tree is byte-faithful
 * to the input for Plan 05's serializer round-trips.
 */

import { fieldWhitespaceTrimmed } from "./warnings.js";
import type { Hl7ParseWarning } from "./warnings.js";
import type {
  EncodingCharacters,
  Hl7Position,
  RawComponent,
  RawField,
  RawRepetition,
  RawSegment,
} from "./types.js";

/**
 * Decompose an ordered list of segment strings into the raw positional tree
 * consumed by `Hl7Message`. Honors custom encoding characters from `enc`.
 * Empty field (`||`) vs HL7 explicit null (`""`) are distinguished via
 * `RawField.isNull`.
 *
 * When `trimFields` is true and a field value had non-trivial leading or
 * trailing whitespace (i.e. whitespace around non-whitespace content), a
 * `FIELD_WHITESPACE_TRIMMED` warning is emitted via `emit`. All-whitespace
 * fields and fields without surrounding whitespace do not emit. Escape
 * sequence expansion is deferred to Plan 04's on-access escape stage.
 *
 * @example
 * ```ts
 * import { tokenize, DEFAULT_ENCODING_CHARACTERS } from "@cosyte/hl7-parser";
 * const tree = tokenize(
 *   ["MSH|^~\\&|APP", "PID|1||Doe^Jane"],
 *   DEFAULT_ENCODING_CHARACTERS,
 *   () => {},
 *   true,
 * );
 * // tree[1].name === "PID"
 * // tree[1].fields[3].repetitions[0].components[0].subcomponents[0] === "Doe"
 * ```
 */
export function tokenize(
  segments: readonly string[],
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  trimFields: boolean,
): readonly RawSegment[] {
  const out: RawSegment[] = [];
  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const segStr = segments[sIdx];
    if (segStr === undefined) continue;

    // Preserve empty middle segments (from consecutive \r) as zero-field,
    // empty-name RawSegment so segmentIndex stays stable downstream.
    if (segStr.length === 0) {
      out.push({ name: "", fields: [] });
      continue;
    }

    const firstSepIdx = segStr.indexOf(enc.field);
    const name = firstSepIdx === -1 ? segStr : segStr.slice(0, firstSepIdx);
    const rest = firstSepIdx === -1 ? "" : segStr.slice(firstSepIdx + 1);

    if (name === "MSH") {
      out.push(tokenizeMshSegment(segStr, enc, emit, sIdx, trimFields));
    } else {
      const namePlaceholder: RawField = {
        repetitions: [{ components: [{ subcomponents: [name] }] }],
        isNull: false,
      };
      const dataFields =
        rest.length === 0 ? [] : splitAndTokenizeFields(rest, enc, emit, sIdx, 0, trimFields);
      out.push({ name, fields: [namePlaceholder, ...dataFields] });
    }
  }
  return out;
}

/**
 * Tokenize an MSH segment. MSH is the one segment where the field separator
 * is encoded in-band as MSH-1: `MSH|^~\&|APP|...`. We synthesize `fields[0]`
 * as a single-component holding the separator char and `fields[1]` as a
 * single-component holding the raw MSH-2 encoding chars string; the
 * remainder (MSH-3, MSH-4, ...) is parsed by `splitAndTokenizeFields` with
 * `fieldStartOffset = 2` so the 1-indexed `fieldIndex` on emitted warnings
 * matches the HL7 position (MSH-3 emits `fieldIndex: 3`).
 *
 * @internal
 */
function tokenizeMshSegment(
  segStr: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  sIdx: number,
  trimFields: boolean,
): RawSegment {
  const msh1: RawField = {
    repetitions: [{ components: [{ subcomponents: [enc.field] }] }],
    isNull: false,
  };

  const sepAfterMsh2 = segStr.indexOf(enc.field, 4);
  const msh2RawEnd = sepAfterMsh2 === -1 ? segStr.length : sepAfterMsh2;
  const msh2Raw = segStr.slice(4, msh2RawEnd);
  const msh2: RawField = {
    repetitions: [{ components: [{ subcomponents: [msh2Raw] }] }],
    isNull: false,
  };

  const remainder = sepAfterMsh2 === -1 ? "" : segStr.slice(sepAfterMsh2 + 1);
  const tailFields =
    remainder.length === 0 ? [] : splitAndTokenizeFields(remainder, enc, emit, sIdx, 2, trimFields);
  return { name: "MSH", fields: [msh1, msh2, ...tailFields] };
}

/**
 * Split a segment's post-name field region into `RawField[]` using the
 * caller-supplied field-index offset so warning positions stay on the HL7
 * 1-indexed convention. Non-MSH callers pass `fieldStartOffset = 0` so the
 * first data field (PID-1) emits `fieldIndex: 1`; MSH callers pass
 * `fieldStartOffset = 2` so the first tail field (MSH-3) emits
 * `fieldIndex: 3`.
 *
 * The returned array is DATA-ONLY — the caller is responsible for
 * prepending the `fields[0]` name/separator placeholder so the unified
 * 1-indexed convention holds on the final `RawSegment.fields`.
 *
 * @internal
 */
function splitAndTokenizeFields(
  region: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  sIdx: number,
  fieldStartOffset: number,
  trimFields: boolean,
): RawField[] {
  const fields = region.split(enc.field);
  const out: RawField[] = [];
  for (let fIdx = 0; fIdx < fields.length; fIdx++) {
    const raw = fields[fIdx];
    if (raw === undefined) continue;
    out.push(
      tokenizeField(
        raw,
        enc,
        emit,
        { segmentIndex: sIdx, fieldIndex: fieldStartOffset + fIdx + 1 },
        trimFields,
      ),
    );
  }
  return out;
}

/**
 * Tokenize a single field string into a `RawField`. Handles the empty
 * (`""`-the-JS-empty-string) vs explicit-null (`""`-the-HL7-literal) split
 * per PARSE-06, then performs optional whitespace trim with warning
 * emission, then delegates repetition splitting.
 *
 * @internal
 */
function tokenizeField(
  raw: string,
  enc: EncodingCharacters,
  emit: (w: Hl7ParseWarning) => void,
  position: Hl7Position,
  trimFields: boolean,
): RawField {
  if (raw === "") return { repetitions: [], isNull: false };
  if (raw === '""') return { repetitions: [], isNull: true };

  let value = raw;
  if (trimFields) {
    const trimmed = raw.trim();
    if (trimmed.length > 0 && trimmed !== raw) {
      emit(fieldWhitespaceTrimmed(position, raw, trimmed));
      value = trimmed;
    }
  }

  const reps = value.split(enc.repetition);
  const repetitions: RawRepetition[] = [];
  for (const rep of reps) repetitions.push(tokenizeRepetition(rep, enc));
  return { repetitions, isNull: false };
}

/** @internal */
function tokenizeRepetition(raw: string, enc: EncodingCharacters): RawRepetition {
  const comps = raw.split(enc.component);
  const components: RawComponent[] = [];
  for (const c of comps) components.push(tokenizeComponent(c, enc));
  return { components };
}

/** @internal */
function tokenizeComponent(raw: string, enc: EncodingCharacters): RawComponent {
  const subs = raw.split(enc.subcomponent);
  return { subcomponents: subs };
}
