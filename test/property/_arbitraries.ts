/**
 * Shared fast-check arbitraries for the `@cosyte/hl7` property-test layer.
 *
 * Two families of generators live here:
 *
 * 1. **Spec-valid** generators (`specCleanMessageRaw`, plus the `RawField`
 *    builders) produce HL7 that the serializer can emit and the parser can
 *    re-read with byte/structural fidelity. They deliberately AVOID the
 *    documented round-trip traps (trailing-empty strip D-02, whitespace
 *    trimming, the explicit-null `""` collision) so a structural-equality
 *    failure means a real bug, not a known lossy transform.
 *
 * 2. **Quirky / hostile** generators (`hostileInput`, `quirkyMessageRaw`)
 *    produce vendor-quirky and malformed bytes for the lenient-mode
 *    robustness invariant: random bytes, truncated segments, weird
 *    delimiters, unknown segments, extra fields.
 *
 * Nothing here is HL7-package-internal — these are exactly the kind of
 * arbitraries that would graduate into a shared `@cosyte/test-utils` once a
 * second parser (mllp, x12, …) needs the same round-trip/lenient harness.
 */

import fc from "fast-check";

import { buildMessage, type RawField } from "../../src/index.js";

/**
 * Leaf-string alphabet for spec-valid values. Plain printable ASCII letters,
 * digits, and a handful of safe punctuation — deliberately EXCLUDES the five
 * HL7 delimiters (`| ^ ~ \ &`), `\n`/`\r`, and the double-quote so a value can
 * never accidentally serialize to the HL7 explicit-null token `""`. Delimiter
 * round-tripping is exercised separately by {@link delimiterLadenValue}.
 */
const SAFE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.#/:";

/**
 * The five reserved HL7 delimiter characters plus the newline shorthand
 * source. Every one of these round-trips through `reescape` → `unescape`, so
 * embedding them in a leaf value is the point of the escaping invariant.
 */
const DELIMITER_CHARS = ["|", "^", "~", "\\", "&", "\n"] as const;

/**
 * A non-empty, trim-stable plain value drawn from {@link SAFE_CHARS}. No
 * leading/trailing ASCII whitespace (so `trimFields` never fires), never the
 * two-char string `""`, and never empty (so it survives the D-02
 * trailing-empty strip as its own subcomponent).
 */
export function safeValue(): fc.Arbitrary<string> {
  return fc
    .stringOf(fc.constantFrom(...SAFE_CHARS), { minLength: 1, maxLength: 12 })
    .filter((s) => s.trim() === s && s.length > 0 && s !== '""');
}

/**
 * A value that mixes safe characters with the reserved HL7 delimiters and the
 * newline shorthand, so serialization must escape (`\F\ \S\ \T\ \R\ \E\
 * \.br\`) and the parser must round-trip the escape back to the literal. Still
 * trim-stable and never empty / `""`.
 */
export function delimiterLadenValue(): fc.Arbitrary<string> {
  const alphabet = [...SAFE_CHARS.split(""), ...DELIMITER_CHARS];
  return fc
    .stringOf(fc.constantFrom(...alphabet), { minLength: 1, maxLength: 16 })
    .filter(
      (s) =>
        // trim-stable: no leading/trailing ASCII whitespace (incl. the \n we
        // may have inserted), and non-empty, and not the null token.
        s.trim() === s && s.length > 0 && s !== '""',
    );
}

/**
 * Either a plain safe value or a delimiter-laden one — the default leaf for
 * spec-valid generation. Weighted toward delimiter-laden so the escaping path
 * gets heavy exercise.
 */
export function leafValue(): fc.Arbitrary<string> {
  return fc.oneof({ weight: 1, arbitrary: safeValue() }, { weight: 2, arbitrary: delimiterLadenValue() });
}

/**
 * A single spec-valid `RawField`: 1–3 repetitions, each 1–3 components, each
 * 1–2 subcomponents, every leaf a non-empty {@link leafValue}. Because every
 * leaf is non-empty there are no trailing empties for the D-02 strip to
 * remove, so the field survives serialize→parse structurally unchanged.
 *
 * `isNull` is always `false` here; explicit-null behavior is covered by
 * {@link nullField}.
 */
export function structuredField(): fc.Arbitrary<RawField> {
  const subcomponents = fc.array(leafValue(), { minLength: 1, maxLength: 2 });
  const component = subcomponents.map((subs) => ({ subcomponents: subs }));
  const components = fc.array(component, { minLength: 1, maxLength: 3 });
  const repetition = components.map((comps) => ({ components: comps }));
  const repetitions = fc.array(repetition, { minLength: 1, maxLength: 3 });
  return repetitions.map((reps) => ({ repetitions: reps, isNull: false }));
}

/** The HL7 explicit-null field — round-trips as the two-char literal `""`. */
export function nullField(): fc.Arbitrary<RawField> {
  return fc.constant<RawField>({ repetitions: [], isNull: false });
}

/**
 * A field-or-string entry suitable for `addSegment`. Mixes plain safe strings,
 * full structured fields, and the empty string (absent field). Crucially it
 * does NOT emit a lone explicit-null because two adjacent absent fields and a
 * trailing absent field are positionally indistinguishable after the D-02
 * segment-level rules — using structured/non-empty values keeps the round-trip
 * exact while still covering repetitions, components, and subcomponents.
 */
export function segmentFieldEntry(): fc.Arbitrary<string | RawField> {
  return fc.oneof(
    { weight: 3, arbitrary: structuredField() },
    { weight: 1, arbitrary: safeValue() },
  );
}

/** Segment names that are real HL7 segments and accept free-form fields. */
const REPEATABLE_SEGMENT_NAMES = ["NTE", "OBX", "DG1", "AL1", "NK1", "IN1", "PV2"] as const;

/** One spec-valid non-MSH segment: a known name + 1–6 generated field entries. */
function segmentSpec(): fc.Arbitrary<{ name: string; fields: (string | RawField)[] }> {
  return fc.record({
    name: fc.constantFrom(...REPEATABLE_SEGMENT_NAMES),
    fields: fc.array(segmentFieldEntry(), { minLength: 1, maxLength: 6 }),
  });
}

/**
 * Build a complete, spec-valid {@link Hl7Message} from generated parts: a real
 * MSH (via `buildMessage`) plus 0–5 appended segments whose fields exercise
 * repetitions, components, subcomponents, and HL7 escape sequences. Returned
 * as the serialized HL7 string (the input to a round-trip assertion).
 *
 * The MSH-9 type is constrained to safe characters so the `^`-split inside
 * `buildMessage` stays well-formed.
 */
export function specCleanMessageRaw(): fc.Arbitrary<string> {
  const typeArb = fc
    .tuple(
      fc.constantFrom("ADT", "ORU", "ORM", "SIU", "MDM", "DFT"),
      fc.constantFrom("A01", "A04", "A08", "R01", "O01", "S12", "T02"),
    )
    .map(([code, trigger]) => `${code}^${trigger}`);

  return fc
    .record({
      type: typeArb,
      sendingApp: safeValue(),
      sendingFacility: safeValue(),
      receivingApp: safeValue(),
      receivingFacility: safeValue(),
      controlId: fc
        .stringOf(fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("")), {
          minLength: 1,
          maxLength: 20,
        })
        .filter((s) => s.length > 0),
      segments: fc.array(segmentSpec(), { minLength: 0, maxLength: 5 }),
    })
    .map(({ type, sendingApp, sendingFacility, receivingApp, receivingFacility, controlId, segments }) => {
      const msg = buildMessage({
        type,
        sendingApp,
        sendingFacility,
        receivingApp,
        receivingFacility,
        controlId,
        version: "2.5",
      });
      for (const seg of segments) {
        msg.addSegment(seg.name, seg.fields);
      }
      return msg.toString();
    });
}

/**
 * Arbitrary raw bytes as a JS string — the most hostile lenient-mode input.
 * Includes control characters, the HL7 delimiters, and arbitrary code points.
 */
export function randomBytes(): fc.Arbitrary<string> {
  return fc.string({ minLength: 0, maxLength: 200, unit: "binary" });
}

/**
 * Vendor-quirky / malformed message strings for the lenient-robustness
 * invariant. A grab-bag of: truncated segments, weird/swapped delimiters,
 * unknown segments, extra fields, segments out of order, lowercase segment
 * names, and embedded random bytes. Many of these produce warnings; a handful
 * (no MSH, truncated MSH, bad encoding chars, empty) legitimately throw a
 * Tier-3 fatal — the invariant accounts for both.
 */
export function quirkyMessageRaw(): fc.Arbitrary<string> {
  const weirdMsh = fc.constantFrom(
    "MSH|^~\\&|A|B|C|D|20250101||ADT^A01|1|P|2.5",
    "MSH#@$%#A#B#C#D#20250101##ADT^A01#1#P#2.5", // custom delimiters
    "MSH|^~\\&|A", // truncated tail
    "msh|^~\\&|A|B|C|D|20250101||ADT^A01|1|P|2.5", // lowercase name (still MSH-shaped? no)
    "MSH|^~\\&|", // minimal-ish
  );

  const quirkySegments = fc.array(
    fc.constantFrom(
      "PID|||MRN123||Doe^John",
      "pid|||mrn", // lowercase
      "ZZZ|unknown|segment", // unknown segment
      "OBX|1|NM|GLUC||120|mg/dL|||||F|||extra|fields|here|past|the|end", // extra fields
      "NTE|1||a note with \\F\\ escapes and \\Z99\\ unknowns",
      "PV1|1|I", // out of order vs typical
      "OBR|1|||TEST^Test", //
      "AL1|1|DA|PCN^Penicillin", //
      "GARBAGE LINE WITH NO DELIMITERS",
      "|||||", // pipes only
      "PID|" + "x".repeat(50), // long field
    ),
    { minLength: 0, maxLength: 8 },
  );

  const lineEnding = fc.constantFrom("\r", "\n", "\r\n");

  return fc
    .tuple(weirdMsh, quirkySegments, lineEnding)
    .map(([msh, segs, eol]) => [msh, ...segs].join(eol));
}

/**
 * Union of every hostile input shape: pure random bytes OR a quirky message.
 * This is the generator the lenient-mode "never throws (except Tier-3)"
 * invariant runs against.
 */
export function hostileInput(): fc.Arbitrary<string> {
  return fc.oneof(
    { weight: 1, arbitrary: randomBytes() },
    { weight: 2, arbitrary: quirkyMessageRaw() },
  );
}
