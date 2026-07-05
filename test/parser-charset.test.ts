/**
 * Phase O — MSH-18 / Table-0211 character-set decoding at the `parseHL7`
 * boundary. Exercises the Buffer-decode path end-to-end: UTF-8 and single-byte
 * ISO-8859 decode, the repeating-MSH-18 "first occurrence is the default" rule,
 * the verbatim fail-safe for recognized-but-undecoded and unrecognized sets,
 * the `\Mxxyyzz\` switch-escape recognition, and the `options.charset`
 * override / `ENCODING_MISMATCH` interaction.
 *
 * All fixtures are synthetic — no PHI. Latin-1 / multibyte byte streams are
 * built as raw Buffers here (a non-UTF-8 byte stream cannot be stored losslessly
 * in a UTF-8 text fixture).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";

import { parseHL7 } from "../src/parser/index.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "charset");

/** Codes of any charset-related warnings on a parsed message. */
function charsetWarnings(warnings: readonly Hl7ParseWarning[]): string[] {
  return warnings
    .map((w) => w.code)
    .filter(
      (c) =>
        c === WARNING_CODES.UNKNOWN_CHARSET ||
        c === WARNING_CODES.UNSUPPORTED_CHARSET ||
        c === WARNING_CODES.ENCODING_MISMATCH,
    );
}

/**
 * Build an ADT^A01 Buffer with a given MSH-18 declaration and a PID-5 family
 * name, encoded with the given Node encoding. `msh18` empty → the field is
 * omitted (blank MSH-18 = ASCII default).
 */
function buildBuffer(msh18: string, familyName: string, encoding: BufferEncoding): Buffer {
  const msh = `MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5||||||${msh18}`;
  const pid = `PID|1||123^^^HOSP^MR||${familyName}^^^^^^L`;
  return Buffer.from(`${msh}\r${pid}\r`, encoding);
}

describe("parseHL7 charset: UTF-8 decode", () => {
  it("decodes a declared UTF-8 Buffer with accented + CJK name, no charset warning", () => {
    const bytes = readFileSync(path.join(FIXTURE_DIR, "utf8-name.hl7"));
    const msg = parseHL7(bytes);
    expect(msg.get("PID.5.1")).toBe("Zörb");
    expect(msg.get("PID.5.2")).toBe("Renée");
    // Second repetition (0-indexed [1]) = the CJK name.
    expect(msg.get("PID.5[1].1")).toBe("山田");
    expect(charsetWarnings(msg.warnings)).toEqual([]);
  });

  it("treats a blank MSH-18 as ASCII decoded as its UTF-8 superset (no warning)", () => {
    // No MSH-18 declared, yet the payload is UTF-8 — the ASCII default decodes
    // it correctly (ASCII ⊂ UTF-8) rather than mojibaking common real traffic.
    const bytes = buildBuffer("", "Müller", "utf-8");
    const msg = parseHL7(bytes);
    expect(msg.get("PID.5.1")).toBe("Müller");
    expect(charsetWarnings(msg.warnings)).toEqual([]);
  });
});

describe("parseHL7 charset: single-byte ISO-8859 decode", () => {
  it("decodes a declared 8859/1 Buffer whose UTF-8 reading would corrupt the name", () => {
    // 0xE9 is 'é' in ISO-8859-1 but a lone (invalid) byte in UTF-8.
    const bytes = buildBuffer("8859/1", "Renée", "latin1");
    const msg = parseHL7(bytes);
    expect(msg.get("PID.5.1")).toBe("Renée");
    expect(charsetWarnings(msg.warnings)).toEqual([]);
  });
});

describe("parseHL7 charset: MSH-18 is repeating (first occurrence = default)", () => {
  it("decodes by the FIRST MSH-18 repetition and ignores the declared alternate", () => {
    // Default 8859/1, alternate ISO IR87 (only reachable via a \M..\ switch).
    // The whole-buffer decode uses the default; the alternate raises no warning.
    const bytes = buildBuffer("8859/1~ISO IR87", "Renée", "latin1");
    const msg = parseHL7(bytes);
    expect(msg.get("PID.5.1")).toBe("Renée");
    expect(charsetWarnings(msg.warnings)).toEqual([]);
  });
});

describe("parseHL7 charset: verbatim fail-safe (never guess an encoding)", () => {
  it("emits UNSUPPORTED_CHARSET and preserves bytes for a recognized multibyte set", () => {
    const bytes = buildBuffer("ISO IR87", "Yamada", "latin1");
    const msg = parseHL7(bytes);
    expect(charsetWarnings(msg.warnings)).toEqual([WARNING_CODES.UNSUPPORTED_CHARSET]);
    // ASCII content is preserved unchanged.
    expect(msg.get("PID.5.1")).toBe("Yamada");
  });

  it("emits UNKNOWN_CHARSET for a label that is not an HL7 Table-0211 code", () => {
    const bytes = buildBuffer("COBOL-EBCDIC", "Smith", "latin1");
    const msg = parseHL7(bytes);
    expect(charsetWarnings(msg.warnings)).toEqual([WARNING_CODES.UNKNOWN_CHARSET]);
  });

  it("preserves a non-ASCII byte losslessly (reversibly) under an undecoded set", () => {
    // Single-byte content stays byte-recoverable: a UTF-8 guess would have
    // replaced the lone 0xE9 with U+FFFD (irreversible data loss).
    const bytes = buildBuffer("ISO IR87", "Renée", "latin1");
    const msg = parseHL7(bytes);
    expect(msg.get("PID.5.1")).toBe("Renée");
    expect(Buffer.from(msg.get("PID.5.1") ?? "", "latin1")).toEqual(Buffer.from("Renée", "latin1"));
  });

  it("strict-decodes an ASCII-declared feed and falls back to latin1 on a non-UTF-8 byte (no silent U+FFFD)", () => {
    // MSH-18 = ASCII but the name carries a Latin-1 0xE9 (a ubiquitous quirk).
    // Strict UTF-8 fails → bytes preserved losslessly + flagged, never corrupted.
    const bytes = buildBuffer("US-ASCII", "Renée", "latin1");
    const msg = parseHL7(bytes);
    expect(charsetWarnings(msg.warnings)).toEqual([WARNING_CODES.UNSUPPORTED_CHARSET]);
    expect(msg.get("PID.5.1")).toBe("Renée");
    expect(msg.get("PID.5.1")).not.toContain("�");
  });
});

describe("parseHL7 charset: multibyte framing limitation (documented, pinned)", () => {
  it("an embedded CR byte in an undecoded multibyte field acts as a segment terminator", () => {
    // A recognized-but-undecoded multibyte set is preserved as latin1 and still
    // tokenized, so a content byte equal to CR (0x0D) is framed as a segment
    // terminator. This is the documented reason multibyte DECODE is deferred —
    // pinned here so the limitation is explicit, not silent. The UNSUPPORTED_CHARSET
    // warning tells the consumer the charset was not decoded.
    const head = Buffer.from(
      "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5||||||ISO IR87\rPID|1||123||Wang",
      "latin1",
    );
    const buf = Buffer.concat([
      head,
      Buffer.from([0x0d]), // a CR byte "inside" the multibyte field value
      Buffer.from("Lee^^^^^^L\r", "latin1"),
    ]);
    const msg = parseHL7(buf);
    expect(charsetWarnings(msg.warnings)).toContain(WARNING_CODES.UNSUPPORTED_CHARSET);
    // Known consequence: the CR framed a boundary, so PID-5.1 is truncated.
    expect(msg.get("PID.5.1")).toBe("Wang");
  });
});

describe("parseHL7 charset: switch escapes are recognized (preserved, not decoded)", () => {
  it("recognizes a \\Mxxyyzz\\ charset-switch escape (no UNKNOWN_ESCAPE_SEQUENCE) and preserves it", () => {
    // ISO-2022 charset switch inside a field: \M2442\ ... \M2842\. The escape
    // layer recognizes it (Phase A) — no warning — and the parsed value keeps
    // the sequence verbatim. Full stateful decode of the switched bytes is a
    // documented non-goal of this phase; byte-verbatim RE-EMIT of the escape is
    // tracked separately (HL7-ESC), so this asserts recognition + read-side
    // preservation, not serializer fidelity.
    const raw =
      "MSH|^~\\&|APP|FAC|APP|FAC|20250101||ADT^A01|1|P|2.5\rPID|1||123||\\M2442\\ABC\\M2842\\";
    const msg = parseHL7(raw);
    const escapeWarnings = msg.warnings.filter(
      (w) => w.code === WARNING_CODES.UNKNOWN_ESCAPE_SEQUENCE,
    );
    expect(escapeWarnings).toEqual([]);
    expect(msg.get("PID.5")).toBe("\\M2442\\ABC\\M2842\\");
  });
});

describe("parseHL7 charset: options.charset override + ENCODING_MISMATCH", () => {
  it("emits ENCODING_MISMATCH when the override disagrees with MSH-18", () => {
    const bytes = buildBuffer("UNICODE UTF-8", "Smith", "utf-8");
    const msg = parseHL7(bytes, { charset: "8859/1" });
    expect(charsetWarnings(msg.warnings)).toContain(WARNING_CODES.ENCODING_MISMATCH);
  });

  it("does NOT emit ENCODING_MISMATCH for a synonym pair (UNICODE UTF-8 vs UTF-8)", () => {
    const bytes = buildBuffer("UNICODE UTF-8", "Smith", "utf-8");
    const msg = parseHL7(bytes, { charset: "UTF-8" });
    expect(charsetWarnings(msg.warnings)).toEqual([]);
  });
});
