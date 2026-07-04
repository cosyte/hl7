/**
 * Registry of standard HL7 v2 segment names used for UNKNOWN_SEGMENT
 * warning detection. Any segment name NOT in this set AND NOT declared in
 * the active profile's customSegments map emits UNKNOWN_SEGMENT per D-31.
 *
 * Derived from HL7 v2.5.1 chapters 3-7 (core message segments, order/result
 * tree, financial tree, scheduling, master files). Z-segments
 * (`/^Z[A-Z0-9]{2}$/`) are NOT in this set — they're always user-defined
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
