/**
 * Roadmap Phase V — FHIR-bridge readiness: the **coverage proof** for the
 * IR-stability contract (`docs-content/spec-notes-fhir-bridge.md`).
 *
 * This suite is the executable half of Phase V. It does **not** add any v2→FHIR
 * mapping — hl7 does not know about FHIR, and nothing here constructs a FHIR
 * resource, a ConceptMap, or a mapping table (that is `@cosyte/transform`'s
 * job). What it proves is narrow and honest:
 *
 *  1. **Addressability.** Every v2 source path the HL7 **v2-to-FHIR IG**
 *     references (the field-level `SEG-N` entries in the IG's segment-map
 *     "Identifier" column, read firsthand from the vendored raw CSVs) is
 *     addressable by hl7's dot-path model — `parsePath("SEG.N")` resolves to
 *     the same segment + field number. hl7 addresses every field generically,
 *     so there is **no hl7-side addressability gap**; any unaddressable ref is
 *     recorded, not hidden.
 *
 *  2. **Sample-corpus resolution.** Over the IG's **public sample corpus** —
 *     which, verified firsthand at commit {@link IG_COMMIT}, is exactly one v2
 *     message (`samples/messages/Message.hl7_MDM_T02.txt`) — every IG-referenced
 *     source path the sample actually populates resolves to a value through
 *     hl7's read model. The IG-referenced paths the single sample does **not**
 *     exercise are enumerated as recorded corpus-coverage gaps (a property of
 *     the thin public sample set, not of hl7).
 *
 *  3. **Datatype-IR surfacing.** The exact typed shapes the IG's *datatype*
 *     maps consume — XPN→HumanName, CX→Identifier (with assigning authority +
 *     type code), CWE/CE coded values with code-system provenance, DTM with
 *     precision + timezone, and decoded/rendered narrative text — are surfaced
 *     from the sample through the documented mapping-surface accessors.
 *
 *  4. **No-FHIR boundary.** The package exports carry no FHIR-typed symbol.
 *
 * Provenance: HL7/v2-to-fhir @ {@link IG_COMMIT} (published IG v1.0.0, FHIR R4;
 * code Apache-2.0, IG narrative CC0). The segment-map CSVs are vendored verbatim;
 * the sample message is a **PHI-safe synthetic transcription** of the IG's one
 * `MDM^T02` sample (field-population, code systems, datetimes, and narrative
 * escapes preserved verbatim, Safe-Harbor identifiers substituted). Exact upstream
 * paths + the transcription rationale are in `test/fixtures/fhir-bridge/PROVENANCE.md`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Segment } from "../src/model/segment.js";
import { parseDtm } from "../src/parser/dates.js";
import { parsePath } from "../src/model/dot-path.js";
import { parseHL7 } from "../src/parser/index.js";
import * as hl7 from "../src/index.js";

/** IG commit the vendored raw artifacts were fetched from (recorded in PROVENANCE.md). */
const IG_COMMIT = "873b331b3890c8bc5d62ef9b4dabb41801aac70d";

const FIXTURE_DIR = path.join(import.meta.dirname, "fixtures", "fhir-bridge");
const MAP_DIR = path.join(FIXTURE_DIR, "ig-segment-maps");

/**
 * Minimal RFC-4180 CSV reader — the IG segment-map sheets carry quoted,
 * comma- and newline-bearing narrative cells, so a naïve line split would
 * corrupt record boundaries. Returns records as string[][].
 */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (c === "\r") {
      // swallow — a following \n closes the record
    } else {
      field += c;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/** A field-level `SEG-N` reference in the IG's segment-map "Identifier" column. */
const FIELD_REF_RE = /^([A-Z][A-Z0-9]{1,2})-(\d+)$/u;

/**
 * The vendored IG segment maps, one canonical target-resource map per segment
 * the sample exercises, with the count of unique field-level source paths each
 * references (pinned so a silent extraction/IG drift fails the suite). Other
 * target-resource maps exist per segment (e.g. `OBX[DocumentReference]`,
 * `PID[Account]`); the primary mapping per segment is vendored here — see the
 * contract doc's coverage table and PROVENANCE.md.
 */
const SEGMENT_MAPS = [
  { file: "MSH-MessageHeader.csv", segment: "MSH", uniqueRefs: 28 },
  { file: "EVN-Provenance.csv", segment: "EVN", uniqueRefs: 7 },
  { file: "PID-Patient.csv", segment: "PID", uniqueRefs: 40 },
  { file: "PV1-Encounter.csv", segment: "PV1", uniqueRefs: 54 },
  { file: "ORC-ServiceRequest.csv", segment: "ORC", uniqueRefs: 38 },
  { file: "TQ1-ServiceRequest.csv", segment: "TQ1", uniqueRefs: 14 },
  { file: "OBR-DiagnosticReport.csv", segment: "OBR", uniqueRefs: 54 },
  { file: "TXA-DocumentReference.csv", segment: "TXA", uniqueRefs: 28 },
  { file: "OBX-Observation.csv", segment: "OBX", uniqueRefs: 33 },
] as const;

/** Extract the unique field-level source-path field numbers from one segment map. */
function referencedFields(file: string, segment: string): number[] {
  const records = parseCsv(readFileSync(path.join(MAP_DIR, file), "utf8"));
  const fields = new Set<number>();
  // Row 0 is the group header, row 1 the column header ("Identifier" at col 1).
  for (const rec of records.slice(2)) {
    const ident = (rec[1] ?? "").trim();
    const m = FIELD_REF_RE.exec(ident);
    if (m === null) continue;
    if (m[1] !== segment) continue;
    fields.add(Number(m[2]));
  }
  return [...fields].sort((a, b) => a - b);
}

/**
 * The exact set of IG-referenced field numbers the single public sample
 * populates, per segment — the pinned coverage matrix. Any drift (a parser
 * regression that stops surfacing a field, or a fixture edit) fails the suite.
 */
const SAMPLE_POPULATED: Readonly<Record<string, readonly number[]>> = {
  MSH: [1, 2, 3, 4, 7, 9, 10, 11, 12],
  EVN: [2],
  PID: [3, 5, 7, 8, 11, 13, 18],
  PV1: [2, 3, 7, 19, 44],
  ORC: [1, 2, 3, 4, 5, 9, 12, 17, 29],
  TQ1: [1, 2],
  OBR: [1, 3, 4, 7, 8, 16, 25],
  TXA: [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 16, 17, 18, 19, 23, 25],
  OBX: [1, 2, 3, 4, 5, 11, 14],
};

/** Pinned per-segment populated set, guarded against a missing key. */
function expectedPopulated(segment: string): readonly number[] {
  return SAMPLE_POPULATED[segment] ?? [];
}

const sampleRaw = readFileSync(path.join(FIXTURE_DIR, "sample-mdm-t02.hl7"), "utf8");
const msg = parseHL7(sampleRaw);

/** First occurrence of a segment, throwing (never a `!`) when the sample lacks it. */
function firstSegment(type: string): Segment {
  const seg = msg.segments(type)[0];
  if (seg === undefined) throw new Error(`sample is missing a ${type} segment`);
  return seg;
}

/** Nth occurrence of a segment (0-based), throwing when absent. */
function nthSegment(type: string, occ: number): Segment {
  const seg = msg.segments(type)[occ];
  if (seg === undefined) throw new Error(`sample is missing ${type}[${String(occ)}]`);
  return seg;
}

/** Field numbers populated (non-empty wire text) across every occurrence of a segment. */
function populatedFields(segment: string): number[] {
  const populated = new Set<number>();
  for (const seg of msg.segments(segment)) {
    // 60 covers the widest segment referenced by the IG here (PV1/OBR at 54).
    for (let n = 1; n <= 60; n++) {
      if (seg.field(n).text !== "") populated.add(n);
    }
  }
  return [...populated].sort((a, b) => a - b);
}

describe("Phase V — FHIR-bridge IR: firsthand IG grounding", () => {
  it("vendored the IG's public sample corpus, which is exactly one v2 message", () => {
    // The vendored artifacts are pinned to a 40-char IG commit sha (PROVENANCE.md).
    expect(IG_COMMIT).toHaveLength(40);
    // Firsthand finding, recorded honestly: the IG repo ships ONE v2 sample
    // message (MDM^T02). The coverage proof runs over it — the roadmap's
    // optimistic "samples/ (ADT/ORU/…)" is not matched by the published repo.
    expect(msg.version).toBe("2.5.1");
    expect(msg.meta.type).toBe("MDM^T02^MDM_T02");
    // A clean parse: the mapping source must be warning-free for this corpus.
    expect(msg.warnings).toEqual([]);
  });

  it("every vendored segment map references the pinned count of unique v2 source paths", () => {
    for (const { file, segment, uniqueRefs } of SEGMENT_MAPS) {
      const fields = referencedFields(file, segment);
      expect(fields.length, `${file}: unique field-level source paths`).toBe(uniqueRefs);
      // Field numbers are contiguous from 1 (the IG grids one row per field).
      expect(fields[0]).toBe(1);
    }
  });
});

describe("Phase V — invariant 1: addressability of every IG source path", () => {
  it("hl7's dot-path model addresses every IG-referenced field-level source path", () => {
    const unaddressable: string[] = [];
    for (const { file, segment } of SEGMENT_MAPS) {
      for (const n of referencedFields(file, segment)) {
        const dotPath = `${segment}.${String(n)}`;
        try {
          const parsed = parsePath(dotPath);
          if (parsed.segmentType !== segment || parsed.fieldIndex !== n) {
            unaddressable.push(dotPath);
          }
        } catch {
          unaddressable.push(dotPath);
        }
      }
    }
    // No hl7-side addressability gap — hl7 addresses every v2 field generically.
    expect(unaddressable).toEqual([]);
  });
});

describe("Phase V — invariant 2: sample-corpus resolution + recorded gaps", () => {
  it("the sample populates exactly the pinned IG-referenced fields per segment", () => {
    for (const { file, segment } of SEGMENT_MAPS) {
      const igReferenced = new Set(referencedFields(file, segment));
      // Restrict the observed populated set to IG-referenced fields (the sample
      // may carry a field the IG map does not reference, and vice-versa).
      const populatedIgFields = populatedFields(segment).filter((n) => igReferenced.has(n));
      expect(populatedIgFields, `${segment}: populated IG-referenced fields`).toEqual([
        ...expectedPopulated(segment),
      ]);
    }
  });

  it("every populated IG-referenced source path resolves through hl7's read model", () => {
    const unreachable: string[] = [];
    for (const { segment } of SEGMENT_MAPS) {
      for (const n of expectedPopulated(segment)) {
        const occurrences = msg.segments(segment);
        const reachable =
          occurrences.some((seg) => seg.field(n).text !== "") ||
          // MSH-1/MSH-2 are the delimiter-definition fields — their mapping
          // input is `msg.encodingCharacters`, not re-serialized field text.
          (segment === "MSH" && (n === 1 || n === 2));
        if (!reachable) unreachable.push(`${segment}.${String(n)}`);
      }
    }
    expect(unreachable).toEqual([]);
  });

  it("enumerates the IG-referenced source paths the single sample does not exercise (recorded gaps)", () => {
    let totalReferenced = 0;
    let totalExercised = 0;
    const gapsBySegment: Record<string, number> = {};
    for (const { file, segment } of SEGMENT_MAPS) {
      const referenced = referencedFields(file, segment);
      const exercised = new Set(expectedPopulated(segment));
      const gaps = referenced.filter((n) => !exercised.has(n));
      gapsBySegment[segment] = gaps.length;
      totalReferenced += referenced.length;
      totalExercised += exercised.size;
    }
    // Pinned coverage totals — the honest headline: hl7 surfaces 100% of the
    // paths the sample exercises; the remainder are corpus-coverage gaps (the
    // single public sample does not populate them), NOT hl7 reachability gaps.
    expect(totalReferenced).toBe(296);
    expect(totalExercised).toBe(63);
    expect(totalReferenced - totalExercised).toBe(233);
    // Spot-check the per-segment gap arithmetic stays consistent.
    expect(gapsBySegment["PV1"]).toBe(54 - 5);
    expect(gapsBySegment["OBX"]).toBe(33 - 7);
  });
});

describe("Phase V — invariant 3: datatype-IR the IG datatype maps consume", () => {
  it("MSH-1/MSH-2 delimiter inputs surface via encodingCharacters", () => {
    expect(msg.encodingCharacters.field).toBe("|");
    expect(msg.encodingCharacters.component).toBe("^");
  });

  it("XPN→HumanName (PID-5) surfaces as a typed composite", () => {
    // The IG's XPN[HumanName] datatype map consumes these components; hl7
    // surfaces them positionally and verbatim (it does not reorder or invent).
    const name = firstSegment("PID").field(5).asXpn();
    expect(name.familyName).toBe("JOHN");
    expect(name.givenName).toBe("DOE");
    expect(name.suffix).toBe("JR.");
    expect(name.nameTypeCode).toBe("D");
  });

  it("CX→Identifier (PID-3) surfaces id + assigning authority + type code", () => {
    const cx = firstSegment("PID").field(3).asCx();
    expect(cx.idNumber).toBe("MRN0003223");
    expect(cx.assigningAuthority?.namespaceId).toBe("REDDING HOSPITAL");
    expect(cx.assigningAuthority?.universalId).toBe("1.1.1.1");
    expect(cx.identifierTypeCode).toBe("MR");
  });

  it("DTM surfaces with precision + timezone (PID-7 date, MSH-7 second, OBR-7 fraction+tz)", () => {
    const dob = parseDtm(firstSegment("PID").field(7).value);
    expect(dob.precision).toBe("day");
    expect(dob.year).toBe(1980);

    const msh7 = parseDtm(msg.get("MSH.7") ?? "");
    expect(msh7.precision).toBe("second");

    const obr7 = parseDtm(firstSegment("OBR").field(7).value);
    expect(obr7.precision).toBe("fraction");
    expect(obr7.hasTimezone).toBe(true);
    expect(obr7.offsetMinutes).toBe(0);
  });

  it("CWE code-system provenance (OBX-3) surfaces primary + alternate systems", () => {
    // OBX[4] carries a dual-coded CWE (local "L" + LOINC "LN") — the exact
    // provenance the IG's CWE[CodeableConcept] map needs to build .coding[].
    const cwe = nthSegment("OBX", 3).field(3).asCwe();
    expect(cwe.identifier).toBe("1111.2");
    expect(cwe.nameOfCodingSystem).toBe("L");
    expect(cwe.alternateIdentifier).toBe("44249-1");
    expect(cwe.nameOfAlternateCodingSystem).toBe("LN");
  });

  it("decoded/rendered narrative text (OBX-5 FT with formatting escapes) surfaces without sentinels", () => {
    // OBX[2] is an FT critical-value note laden with `\.br\` line breaks — the
    // IG's `.text`/narrative maps need this rendered, not raw sentinels.
    const rendered = nthSegment("OBX", 1).field(5).render();
    expect(rendered.text).toContain("Critical Values Entered On");
    expect(rendered.text).toContain("\n");
    expect(rendered.text).not.toContain("\\.br\\");
  });
});

describe("Phase V — invariant 4: no v2→FHIR mapping added (scope boundary)", () => {
  it("the package exports carry no FHIR-typed symbol", () => {
    const fhirish = /fhir|bundle|conceptmap|\bresource\b|valueset/iu;
    const offenders = Object.keys(hl7).filter((k) => fhirish.test(k));
    expect(offenders).toEqual([]);
  });
});
