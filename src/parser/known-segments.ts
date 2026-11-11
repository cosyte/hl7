/**
 * Registry of standard HL7 v2 segment names used for UNKNOWN_SEGMENT
 * warning detection. Any segment name NOT in this set AND NOT declared in
 * the active profile's customSegments map emits UNKNOWN_SEGMENT.
 *
 * Source. Every standard segment name of HL7 v2.1 through v2.9, each with the
 * version that introduced it, taken from two published lists vendored
 * verbatim or with their hashes under `vendor/segment-names/` (its README
 * records the commits and the extraction):
 *
 * - v2.1 to v2.8.2: the per-version segment tables of hl7apy
 *   (github.com/crs4/hl7apy, MIT, `hl7apy/v<version>/segments.py`). A
 *   segment's version below is the first of v2.1, 2.2, 2.3, 2.3.1, 2.4,
 *   2.5, 2.5.1, 2.6, 2.7, 2.8, 2.8.1 and 2.8.2 whose table lists it.
 *   hl7apy carries no v2.7.1, so a segment first published in v2.7.1 shows
 *   here as v2.8.
 * - v2.9: the segment list of HL7's own v2+ publication
 *   (github.com/HL7/v2ig, `input/sourceOfTruth/control-manifests/segments.json`).
 *   A name it lists that no hl7apy table carries is marked v2.9. We could not
 *   read the v2.9 text itself, so a segment marked v2.9 may have been added by
 *   a later v2+ ballot rather than by v2.9 proper.
 *
 * HAPI's per-version structures (github.com/hapifhir/hapi-hl7v2) agree with
 * hl7apy except that HAPI lists IN3 and PV2 from v2.1 rather than v2.2, and
 * lists a QCK segment in v2.3 alone, which no other version or source carries
 * and which is not included here.
 *
 * Segments later versions dropped stay (EQL, ERQ, SPR and VTQ leave the
 * tables at v2.6; ORO and RX1 after v2.1): a name some version of the
 * standard defined is never an unknown segment in a message of that version.
 * Z-segments (`/^Z[A-Z0-9]{2}$/`) are NOT in this set: they're always
 * user-defined and must be declared in a profile to avoid the warning.
 *
 * `test/known-segments-source.test.ts` checks this table against the
 * vendored lists, name by name and version by version.
 */

/**
 * The HL7 v2 versions that introduced at least one segment.
 *
 * @internal
 */
export type SegmentIntroducedIn =
  "2.1" | "2.2" | "2.3" | "2.4" | "2.5" | "2.6" | "2.7" | "2.8" | "2.8.2" | "2.9";

/**
 * Every standard segment name, grouped by the version that introduced it.
 * Each group is one space-separated, alphabetical string.
 *
 * @internal
 */
const SEGMENTS_BY_VERSION: Readonly<Record<SegmentIntroducedIn, string>> = {
  "2.1":
    "ACC ADD BHS BLG BTS DG1 DSC DSP ERR EVN FHS FT1 FTS GT1 IN1 MRG MSA MSH NCK NK1 NPU NSC " +
    "NST NTE OBR OBX ORC ORO PD1 PID PR1 PV1 QRD QRF RX1 UB1 URD URS",
  "2.2":
    "AL1 IN2 IN3 MFA MFE MFI ODS ODT OM1 OM2 OM3 OM4 OM5 OM6 PRA PV2 RQ1 RQD RXA RXC RXD RXE " +
    "RXG RXO RXR STF UB2",
  "2.3":
    "AIG AIL AIP AIS APR ARQ AUT CDM CM0 CM1 CM2 CSP CSR CSS CTD CTI DB1 DRG EQL ERQ FAC GOL " +
    "LCC LCH LDP LOC LRL PCR PDC PEO PES PRB PRC PRD PSH PTH QAK RDF RDT RF1 RGS ROL SCH SPR " +
    "TXA VAR VTQ",
  "2.4":
    "ABS AFF BLC CNS ECD ECR EDU EQP EQU GP1 GP2 IAM INV ISD LAN NDS OM7 ORG PDA QID QPD QRI " +
    "RCP RMI SAC SID TCC TCD",
  "2.5": "BPO BPX BTX CER CON IIM IPC OVR SFT SPM TQ1 TQ2",
  "2.6":
    "ADJ ARV DMI ILT IPR ITM IVC IVT PCE PKG PMT PSG PSL PSS PYE REL RFI SCD SCP SDD SLT STZ " +
    "UAC VND",
  "2.7": "IAR PAC PRT SHP",
  "2.8": "BUI CDO DON RXV SGH SGT",
  "2.8.2": "DPS MCP OMC PM1",
  "2.9": "CTR DEV DST GSC GSP GSR OH1 OH2 OH3 OH4",
};

/**
 * Each standard segment name with the HL7 v2 version that introduced it.
 *
 * @internal
 */
export const SEGMENT_INTRODUCED_IN: ReadonlyMap<string, SegmentIntroducedIn> = new Map(
  (Object.keys(SEGMENTS_BY_VERSION) as SegmentIntroducedIn[]).flatMap((version) =>
    SEGMENTS_BY_VERSION[version].split(" ").map((name) => [name, version] as const),
  ),
);

/**
 * Names recognised although neither source lists them, each kept because
 * removing it would start warning on messages that parse quietly today.
 *
 * - `FAM`: in this registry before it was derived from a source; no HL7 v2
 *   version in either list defines it.
 *
 * @internal
 */
export const RETAINED_UNLISTED_SEGMENTS: readonly string[] = ["FAM"];

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
  ...SEGMENT_INTRODUCED_IN.keys(),
  ...RETAINED_UNLISTED_SEGMENTS,
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
