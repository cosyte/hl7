/**
 * Bounded rendering of tokens **derived from input**.
 *
 * Shared by the warning factories and by the parsed model, which is the whole
 * point: the first version of this guard lived only in `warnings.ts`, and
 * bounding the diagnostics there left `Segment.type` on the model carrying the
 * same unbounded string. A downstream package read that "identifier" and wrote
 * clinical narrative into its own report. **A diagnostic-surface fix protects
 * this package's diagnostics; it does not protect a consumer that reads the
 * model and builds its own diagnostics from it.** Bounding at the model
 * protects both, so the primitive lives here rather than inside the warning
 * layer.
 *
 * ## Why a shape test rather than a length cap
 *
 * Truncating to N characters still emits the first N characters of a patient
 * name. A shape test refuses the whole token instead, and it can do that
 * safely because these tokens have narrow, spec-defined forms: HL7 v2 Ch. 2
 * §2.5 defines a segment identifier as exactly three alphanumeric characters,
 * and `defineProfile` independently validates custom Z-segments to
 * `/^Z[A-Z0-9]{2}$/`, so nothing legitimate is longer. Anything outside the
 * shape is, by construction, not the thing the field claims to hold.
 *
 * Conforming tokens are returned unchanged, so `PID`, `ZZZ`, `2.5.1` and every
 * legitimate Z-segment name are untouched and well-formed input sees no
 * behaviour change.
 *
 * ## Where a shape test bottoms out, stated rather than papered over
 *
 * A forged token that happens to match is still returned: a narrative line
 * whose entire content is `120` or `JQD` is indistinguishable from a real
 * segment identifier. The residue is bounded to three characters
 * beginning with a letter, which is why no absolute "never carries field
 * content" claim is made anywhere in this package. It is also why a charset label, whose table is closed and whose
 * warning fires exactly when the label is absent from it, is bounded on
 * **membership** instead (see `safeCharsetLabel`): a shape test there admitted
 * an 18-character patient name.
 */

const DERIVED_TOKEN_SHAPES = {
  /**
   * HL7 v2 Ch. 2 §2.5 segment identifier: three characters, the first
   * alphabetic.
   *
   * Two deliberate tightenings, each measured rather than assumed. The first
   * version allowed four characters as "vendor tolerance", which was invented
   * rather than grounded: all 91 `KNOWN_SEGMENTS` are exactly three, and
   * `defineProfile` independently validates custom Z-segments to
   * `/^Z[A-Z0-9]{2}$/`, so nothing legitimate is longer. The second requires a
   * leading letter, which every known segment and every legal Z-segment
   * satisfies, and which excludes a **bare numeric** residue. That matters out
   * of proportion to its size: a forged line reading `120` is a glucose, a
   * blood pressure or a dose, which is the most clinical meaning three
   * characters can carry.
   */
  segmentId: /^[A-Za-z][A-Za-z0-9]{2}$/,
  /** MSH-9 message type / trigger, e.g. `ADT^A01` or `A40`. */
  messageType: /^[A-Za-z0-9]{1,8}(?:\^[A-Za-z0-9]{1,8}){0,2}$/,
  /** MSH-12 version ID, e.g. `2.5` or `2.5.1`. */
  version: /^[0-9]{1,2}(?:\.[0-9]{1,3}){0,3}$/,
} as const;

/** Which spec-defined shape a derived token is required to match. */
export type DerivedTokenKind = keyof typeof DERIVED_TOKEN_SHAPES;

/**
 * Render a token derived from input, for a warning message or a model field.
 *
 * Returns the token unchanged when it matches the shape its `kind` promises,
 * and {@link WITHHELD} otherwise.
 *
 * @internal
 */
export function safeDerivedToken(value: string, kind: DerivedTokenKind): string {
  return DERIVED_TOKEN_SHAPES[kind].test(value) ? value : WITHHELD;
}

/**
 * What a message prints in place of a token it may not echo.
 *
 * Deliberately carries **no length**. An earlier version reported the
 * character count as "useful structural metadata", which contradicted the
 * policy `unterminatedEscapeSequence` already applies one screen below: it
 * withholds its length on the reasoning that the length of a truncated field
 * tail is itself derivable field-shape information. A forged segment name is a
 * truncated field tail, so the two must not hold opposite policies for the
 * same class of value, and the stricter of the two is the one to keep.
 */
export const WITHHELD = "<withheld>";

/**
 * Bound a **model** field that presents itself as an identifier.
 *
 * Distinct from {@link safeDerivedToken} only in preserving the empty string.
 * `Segment.type` and `MessageStructure.messageCode` already document `""` as
 * "absent", and an absent identifier is a different fact from a withheld one:
 * collapsing the two would report a genuinely empty segment as suppressed
 * content.
 *
 * @internal
 */
export function boundedIdentifier(value: string, kind: DerivedTokenKind): string {
  return value === "" ? "" : safeDerivedToken(value, kind);
}
