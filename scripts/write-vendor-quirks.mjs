/**
 * One-shot script — authors the 13 vendor-quirks fixtures with exact byte
 * content (\r-separated, no trailing newline, synthetic data). Run once via
 * `node scripts/write-vendor-quirks.mjs`. Safe to re-run (idempotent).
 *
 * Each fixture maps to one Tier-2 WARNING_CODES entry. Filename is the
 * kebab-case of the UPPER_SNAKE code per Plan 07-04 D-12.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "test", "fixtures", "vendor-quirks");

mkdirSync(OUT_DIR, { recursive: true });

const CR = "\r";

/** Build a CR-separated fixture body from an array of segment strings. */
function body(segments) {
  return segments.join(CR);
}

// ─── MLLP_FRAMING_STRIPPED ────────────────────────────────────────────────
// Wrap a canonical ADT^A01 message in MLLP bytes: 0x0B prefix, 0x1C 0x0D
// suffix. Parser strips framing and emits MLLP_FRAMING_STRIPPED.
{
  const core = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100000||ADT^A01^ADT_A01|MSGVQ001|P|2.5",
    "EVN|A01|20260419100000",
    "PID|1||MRN-VQ-001^^^HOSP^MR||Doe^John||19800101|M",
    "PV1|1|I|UNIT^^^HOSP",
  ]);
  const buf = Buffer.concat([
    Buffer.from([0x0b]),
    Buffer.from(core, "utf-8"),
    Buffer.from([0x1c, 0x0d]),
  ]);
  writeFileSync(path.join(OUT_DIR, "mllp-framing-stripped.hl7"), buf);
}

// ─── FIELD_WHITESPACE_TRIMMED ─────────────────────────────────────────────
// PID-3 subcomponent with leading + trailing spaces triggers trim warning.
{
  const raw = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100000||ADT^A01^ADT_A01|MSGVQ002|P|2.5",
    "EVN|A01|20260419100000",
    "PID|1||  MRN-VQ-002  ^^^HOSP^MR||Doe^John||19800101|M",
    "PV1|1|I|UNIT^^^HOSP",
  ]);
  writeFileSync(path.join(OUT_DIR, "field-whitespace-trimmed.hl7"), raw);
}

// ─── UNKNOWN_ESCAPE_SEQUENCE ──────────────────────────────────────────────
// OBX-5 contains a \Z99\ vendor-escape the parser cannot expand — warns and
// preserves the sequence verbatim.
{
  const raw = body([
    "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419100000||ORU^R01^ORU_R01|MSGVQ003|P|2.5",
    "PID|1||MRN-VQ-003^^^HOSP^MR||Doe^John",
    "OBR|1|ORD-VQ-003|FLR-VQ-003|CBC^Complete Blood Count^LN",
    "OBX|1|TX|FREE^Free Text^L||Some text with \\Z99\\ embedded||||||F",
  ]);
  writeFileSync(path.join(OUT_DIR, "unknown-escape-sequence.hl7"), raw);
}

// ─── TIMESTAMP_FALLBACK_FORMAT ────────────────────────────────────────────
// MSH-7 in ISO-8601 format. NOTE: the current parser pipeline does NOT emit
// this warning during `parseHL7` — the emit site in `src/parser/dates.ts`
// fires only when a composite/helper actively parses the timestamp with an
// `emit` callback, which no lenient-default code path does. The fixture is
// authored for future completeness; the sweep tolerates non-emission via
// NON_EMITTING_CODES in test/parser-strict-mode-sweep.test.ts.
{
  const raw = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|2026-01-15T14:30:00||ADT^A01^ADT_A01|MSGVQ004|P|2.5",
    "EVN|A01|2026-01-15T14:30:00",
    "PID|1||MRN-VQ-004^^^HOSP^MR||Doe^John||19800101|M",
    "PV1|1|I|UNIT^^^HOSP",
  ]);
  writeFileSync(path.join(OUT_DIR, "timestamp-fallback-format.hl7"), raw);
}

// ─── SEGMENT_CASE ─────────────────────────────────────────────────────────
// Lowercase segment name `pid`. NOTE: current parser does NOT call the
// `segmentCase` factory anywhere — the lowercase name flows through
// splitSegments verbatim and surfaces as UNKNOWN_SEGMENT (since "pid" is not
// in KNOWN_SEGMENTS). Fixture authored for future completeness.
{
  const raw = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100000||ADT^A01^ADT_A01|MSGVQ005|P|2.5",
    "EVN|A01|20260419100000",
    "pid|1||MRN-VQ-005^^^HOSP^MR||Doe^John||19800101|M",
    "PV1|1|I|UNIT^^^HOSP",
  ]);
  writeFileSync(path.join(OUT_DIR, "segment-case.hl7"), raw);
}

// ─── EXTRA_FIELDS ─────────────────────────────────────────────────────────
// EVN padded beyond its spec width. NOTE: parser has no emit site for
// `extraFields` — all field excess is preserved without warning. Fixture
// authored for future completeness.
{
  const raw = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100000||ADT^A01^ADT_A01|MSGVQ006|P|2.5",
    "EVN|A01|20260419100000|||extra1|extra2|extra3|extra4|extra5",
    "PID|1||MRN-VQ-006^^^HOSP^MR||Doe^John||19800101|M",
    "PV1|1|I|UNIT^^^HOSP",
  ]);
  writeFileSync(path.join(OUT_DIR, "extra-fields.hl7"), raw);
}

// ─── UNKNOWN_SEGMENT ──────────────────────────────────────────────────────
// Z-segment with no profile claim — fires UNKNOWN_SEGMENT in the lenient path.
{
  const raw = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100000||ADT^A01^ADT_A01|MSGVQ007|P|2.5",
    "EVN|A01|20260419100000",
    "PID|1||MRN-VQ-007^^^HOSP^MR||Doe^John||19800101|M",
    "PV1|1|I|UNIT^^^HOSP",
    "ZZZ|1|customField",
  ]);
  writeFileSync(path.join(OUT_DIR, "unknown-segment.hl7"), raw);
}

// ─── DUPLICATE_REQUIRED_SEGMENT ───────────────────────────────────────────
// Two MSH segments. NOTE: parser has no emit site — the duplicate flows
// through as a raw second segment. Fixture authored for future completeness.
{
  const raw = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100000||ADT^A01^ADT_A01|MSGVQ008|P|2.5",
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100001||ADT^A01^ADT_A01|MSGVQ008B|P|2.5",
    "EVN|A01|20260419100000",
    "PID|1||MRN-VQ-008^^^HOSP^MR||Doe^John||19800101|M",
    "PV1|1|I|UNIT^^^HOSP",
  ]);
  writeFileSync(path.join(OUT_DIR, "duplicate-required-segment.hl7"), raw);
}

// ─── ENCODING_MISMATCH ────────────────────────────────────────────────────
// MSH-18 declares UTF-8; the sweep supplies options.charset="ASCII" so the
// two-pass Buffer decoder detects the mismatch and emits ENCODING_MISMATCH.
// (The mismatch emit site lives in resolveBufferCharset, not in the
// tokenizer — fixture PARSED as Buffer is required, and the sweep wires the
// override per filename.)
{
  const raw = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100000||ADT^A01^ADT_A01|MSGVQ009|P|2.5||||||UTF-8",
    "EVN|A01|20260419100000",
    "PID|1||MRN-VQ-009^^^HOSP^MR||Doe^John||19800101|M",
    "PV1|1|I|UNIT^^^HOSP",
  ]);
  writeFileSync(path.join(OUT_DIR, "encoding-mismatch.hl7"), raw);
}

// ─── MISSING_REQUIRED_FIELD ───────────────────────────────────────────────
// MSH-9 empty. NOTE: parser has no emit site — no required-field schema is
// wired at lenient-default level. Fixture authored for future completeness.
{
  const raw = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100000|||MSGVQ010|P|2.5",
    "EVN|A01|20260419100000",
    "PID|1||MRN-VQ-010^^^HOSP^MR||Doe^John||19800101|M",
    "PV1|1|I|UNIT^^^HOSP",
  ]);
  writeFileSync(path.join(OUT_DIR, "missing-required-field.hl7"), raw);
}

// ─── OUT_OF_ORDER_SEGMENT ─────────────────────────────────────────────────
// PID before EVN. NOTE: parser has no emit site — segment ordering is not
// validated at the lenient-default level. Fixture authored for future
// completeness.
{
  const raw = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100000||ADT^A01^ADT_A01|MSGVQ011|P|2.5",
    "PID|1||MRN-VQ-011^^^HOSP^MR||Doe^John||19800101|M",
    "EVN|A01|20260419100000",
    "PV1|1|I|UNIT^^^HOSP",
  ]);
  writeFileSync(path.join(OUT_DIR, "out-of-order-segment.hl7"), raw);
}

// ─── VERSION_MISMATCH ─────────────────────────────────────────────────────
// MSH-12 = 2.9. NOTE: parser has no emit site — there is no anchored
// "expected version" anywhere in the lenient default path. Fixture authored
// for future completeness.
{
  const raw = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100000||ADT^A01^ADT_A01|MSGVQ012|P|2.9",
    "EVN|A01|20260419100000",
    "PID|1||MRN-VQ-012^^^HOSP^MR||Doe^John||19800101|M",
    "PV1|1|I|UNIT^^^HOSP",
  ]);
  writeFileSync(path.join(OUT_DIR, "version-mismatch.hl7"), raw);
}

// ─── UNKNOWN_CHARSET ──────────────────────────────────────────────────────
// MSH-18 = "ISO IR 999" (unknown label). When parsed as Buffer, the
// normalizeBuffer fallback emits UNKNOWN_CHARSET and decodes as UTF-8.
{
  const raw = body([
    "MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260419100000||ADT^A01^ADT_A01|MSGVQ013|P|2.5||||||ISO IR 999",
    "EVN|A01|20260419100000",
    "PID|1||MRN-VQ-013^^^HOSP^MR||Doe^John||19800101|M",
    "PV1|1|I|UNIT^^^HOSP",
  ]);
  writeFileSync(path.join(OUT_DIR, "unknown-charset.hl7"), raw);
}

console.log("Wrote 13 vendor-quirks fixtures to", OUT_DIR);
