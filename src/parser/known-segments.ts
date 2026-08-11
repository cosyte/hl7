/**
 * Registry of standard HL7 v2 segment names used for UNKNOWN_SEGMENT
 * warning detection. Any segment name NOT in this set AND NOT declared in
 * the active profile's customSegments map emits UNKNOWN_SEGMENT per D-31.
 *
 * Derived from HL7 v2.5.1 chapters 3-7 (core message segments, order/result
 * tree, financial tree, scheduling, master files). Z-segments
 * (`/^Z[A-Z0-9]{2}$/`) are NOT in this set: they're always user-defined
 * and must be declared in a profile to avoid the warning.
 *
 * Frozen as `ReadonlySet<string>` for O(1) lookup without mutation risk.
 */

/**
 * Frozen set of every standard HL7 v2 segment name the library recognises.
 * Consumers parsing any segment whose name is neither in this set nor
 * declared by the active profile will see `UNKNOWN_SEGMENT` in
 * `msg.warnings`.
 *
 * @example
 * ```ts
 * import { KNOWN_SEGMENTS } from "@cosyte/hl7";
 * console.log(KNOWN_SEGMENTS.has("PID")); // true
 * console.log(KNOWN_SEGMENTS.has("ZPI")); // false
 * ```
 */
export const KNOWN_SEGMENTS: ReadonlySet<string> = new Set<string>([
  // Core message header + event + acknowledgement
  "MSH",
  "MSA",
  "EVN",
  "ERR",
  "SFT",
  // Patient identifiers + demographics + visit
  "PID",
  "PD1",
  "MRG",
  "PV1",
  "PV2",
  "PDA",
  "PDC",
  "PEO",
  "DB1",
  // Next of kin / guarantor / contacts / insurance
  "NK1",
  "GT1",
  "IN1",
  "IN2",
  "IN3",
  "ACC",
  // Allergy / diagnosis / problem / history / goal
  "AL1",
  "DG1",
  "PRB",
  "IAM",
  "FAM",
  "GOL",
  "PR1",
  // Observation / order / result / timing
  "OBR",
  "OBX",
  "ORC",
  "SPM",
  "TQ1",
  "TQ2",
  "NTE",
  "UB1",
  "UB2",
  "FT1",
  // Pharmacy / treatment
  "RXA",
  "RXC",
  "RXD",
  "RXE",
  "RXG",
  "RXO",
  "RXR",
  "RXV",
  // Scheduling
  "SCH",
  "AIG",
  "AIL",
  "AIP",
  "AIS",
  "ARQ",
  "APR",
  "RGS",
  // Document / master files
  "TXA",
  "MFE",
  "MFI",
  "MFA",
  "MCP",
  "LDP",
  "LCH",
  "LOC",
  "LRL",
  "LCC",
  // Roles / staff / organizations
  "ROL",
  "STF",
  "PRA",
  "EDU",
  "CER",
  "CTD",
  "CTI",
  "ORG",
  "PRC",
  "PRD",
  // Query + response
  "QAK",
  "QPD",
  "QRF",
  "QRI",
  "QID",
  "RDF",
  "RDT",
  "DSC",
  "DSP",
  "EQL",
  "OMC",
  // Batch / header envelope (out-of-scope per project OOS but valid tokens)
  "FHS",
  "BHS",
  "BTS",
  "FTS",
  // Other legacy / clinical study
  "CSR",
  "CSP",
  "CSS",
]);

/**
 * Length of every segment identifier this library can match. HL7 v2 Ch. 2 §2.5
 * defines a segment identifier as three characters; all
 * {@link KNOWN_SEGMENTS} are three, `defineProfile` validates custom
 * Z-segments to `/^Z[A-Z0-9]{2}$/`, and the `segmentId` shape guard in
 * `tokens.ts` requires exactly three. So nothing longer can ever match
 * anything, whatever its case.
 *
 * @internal
 */
const SEGMENT_NAME_LENGTH = 3;

/**
 * Fold a segment identifier to its canonical HL7 spelling: **ASCII** uppercase.
 *
 * Segment identifiers in the HL7 v2 standard are three characters and are
 * uniformly uppercase, but real senders ship `pid`, `Pid` and `obx`, and
 * `README.md` advertises mixed-case segment names as a tolerated real-world
 * violation. Every lookup that asks "which segment is this?" therefore compares
 * canonical forms, so a miscased name resolves to the segment it names. The
 * wire spelling itself is never rewritten: it stays on `RawSegment.name`, which
 * is what serialization emits, so the byte-verbatim round-trip is unaffected.
 *
 * **ASCII-only, deliberately, and this is the whole reason the function
 * exists rather than a bare `.toUpperCase()`.** JavaScript's `toUpperCase` is
 * Unicode-aware and locale-independent, so `"pıd".toUpperCase()` is `"PID"`:
 * a dotless Turkish i would silently forge a **PID**, and the patient
 * demographics of a segment the sender never sent would be read as real. The
 * same trap exists for `"ı"`, `"ﬁ"` and the Kelvin sign. Only `a`-`z` are
 * mapped here, so a non-ASCII lookalike stays unrecognized and falls out as
 * `UNKNOWN_SEGMENT`, which is the honest answer.
 *
 * **Anything not exactly {@link SEGMENT_NAME_LENGTH} characters is returned
 * untouched, and that bound is load-bearing rather than a micro-optimization.**
 * A segment name is whatever precedes the first field separator, so an
 * unescaped line break inside a narrative field, which HL7 requires to be sent
 * as `\.br\` and which real senders send raw anyway, hands this function an
 * entire clinical report as a "segment name". Folding it character by
 * character is O(len) work that a sender controls the size of, on a path that
 * runs once per segment per lookup: a 100 KB forged name cost 1.5 ms per
 * comparison, turning a `msg.get()` loop into an availability problem. Nothing
 * of that length can match a segment anyway, so the bound costs no behaviour.
 *
 * Returns the input unchanged when it holds no ASCII lowercase letter, so the
 * overwhelmingly common spec-clean case allocates nothing.
 *
 * @internal
 */
export function canonicalSegmentName(name: string): string {
  if (name.length !== SEGMENT_NAME_LENGTH) return name;
  let out: string | undefined;
  for (let i = 0; i < SEGMENT_NAME_LENGTH; i++) {
    const code = name.charCodeAt(i);
    // 97..122 = 'a'..'z'. Nothing else is touched: not `ı`, not `ﬁ`, not `K`.
    if (code >= 97 && code <= 122) {
      out ??= name.slice(0, i);
      out += String.fromCharCode(code - 32);
    } else if (out !== undefined) {
      out += name.charAt(i);
    }
  }
  return out ?? name;
}
