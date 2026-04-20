/**
 * Derive the UPPER_SNAKE code name from a kebab-case fixture filename.
 * Used by vendor-quirks and malformed sweeps to map a filename like
 * `mllp-framing-stripped.hl7` to its expected enum value
 * `MLLP_FRAMING_STRIPPED`. Pure string transform — does not validate
 * against any enum, so it serves both `WarningCode` (Plan 04) and
 * `FatalCode` (Plan 05) sweeps.
 *
 * @example
 * ```ts
 * fileToCode("mllp-framing-stripped.hl7"); // "MLLP_FRAMING_STRIPPED"
 * fileToCode("empty-input.hl7");           // "EMPTY_INPUT"
 * ```
 */
export function fileToCode(filename: string): string {
  return filename
    .replace(/\.hl7$/, "")
    .replace(/-/g, "_")
    .toUpperCase();
}
