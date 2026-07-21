/**
 * `buildOru` — author a spec-clean HL7 v2 **ORU^R01** (observation result)
 * message from typed inputs (roadmap Phase T). The conservative-emit mirror of
 * the read helpers (`msg.orders`, `msg.observations`): a caller supplies a
 * typed patient, an optional order (OBR), and one or more typed observations
 * (OBX), and `buildOru` assembles `MSH + PID + OBR + OBX…` with correct
 * `^`/`&`/`~` structure via the HL7-R encode-safe path.
 *
 * **Structurally complete + zero-warning.** The emitted message carries the
 * ORU^R01 result group the parser's structure net marks Required (OBR/OBX), so
 * it re-parses with **zero warnings** and `msg.structure.missingGroups` empty.
 *
 * **Never fabricate.** Only supplied values are emitted; omitted fields become
 * empty/absent. `patient` and at least one `observations` entry are
 * **required** — an ORU with no subject or no result is a typed `TypeError`,
 * not a guessed PID or a fabricated OBX.
 *
 * Spec traceability: HL7 v2 Ch. 7 (ORU — MSH/PID/OBR/OBX), Ch. 2 datatypes.
 * Zero runtime deps.
 */

import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";
import type { CWE } from "../model/types/cwe.js";
import type { TS } from "../model/types/ts.js";
import type { XCN } from "../model/types/xcn.js";

import {
  encodeComposite,
  encodeCompositeReps,
  type CompositeKind,
  type CompositeValueByKind,
} from "./encode-composite.js";
import type { AdtPatient } from "./build-adt.js";
import {
  assembleSegment,
  buildMshSegment,
  scalarField,
  type MessageEnvelope,
} from "./segment-fields.js";

/**
 * Typed PID content for {@link buildOru}. Reuses {@link AdtPatient} — the
 * patient-identification shape is identical across message families.
 */
export type OruPatient = AdtPatient;

/** Typed OBR (observation request / order) content for {@link buildOru}. */
export interface OruOrder {
  /** OBR-1 Set ID. */
  readonly setId?: string;
  /** OBR-2 Placer Order Number. */
  readonly placerOrderNumber?: string;
  /** OBR-3 Filler Order Number. */
  readonly fillerOrderNumber?: string;
  /** OBR-4 Universal Service Identifier. */
  readonly universalServiceId?: CWE;
  /** OBR-7 Observation Date/Time. */
  readonly observationDateTime?: TS | string;
  /** OBR-16 Ordering Provider. */
  readonly orderingProvider?: XCN | readonly XCN[];
  /** OBR-25 Result Status (e.g. `"F"` final, `"P"` preliminary, `"C"` corrected). */
  readonly resultStatus?: string;
}

/** Typed OBX (observation / result) content for {@link buildOru}. */
export interface OruObservation {
  /** OBX-1 Set ID. */
  readonly setId?: string;
  /** OBX-2 Value Type (e.g. `"NM"`, `"ST"`, `"CE"`, `"TX"`). */
  readonly valueType?: string;
  /** OBX-3 Observation Identifier. */
  readonly identifier?: CWE;
  /** OBX-5 Observation Value (emitted verbatim — the caller owns its formatting). */
  readonly value?: string;
  /** OBX-6 Units. */
  readonly units?: CWE;
  /** OBX-7 References Range. */
  readonly referenceRange?: string;
  /** OBX-8 Abnormal Flags (e.g. `"H"`, `"L"`, `"N"`). */
  readonly abnormalFlags?: string;
  /** OBX-11 Observation Result Status (e.g. `"F"` final, `"P"` preliminary). */
  readonly observationResultStatus?: string;
  /** OBX-14 Date/Time of the Observation. */
  readonly observationDateTime?: TS | string;
}

/** Input for {@link buildOru}: the MSH envelope plus the typed segment bodies. */
export interface BuildOruInit extends MessageEnvelope {
  /** PID content. **Required** — never fabricated. */
  readonly patient: OruPatient;
  /** OBR content. Optional; an (empty) OBR is emitted regardless so the result group is well-formed. */
  readonly order?: OruOrder;
  /** OBX content. **Required, non-empty** — an ORU with no result is a typed error. */
  readonly observations: readonly OruObservation[];
}

/** @internal */
function repField<K extends CompositeKind>(
  kind: K,
  value: CompositeValueByKind[K] | readonly CompositeValueByKind[K][] | undefined,
): RawField {
  if (value === undefined) return { repetitions: [], isNull: false };
  if (Array.isArray(value)) {
    return encodeCompositeReps(kind, value as readonly CompositeValueByKind[K][]);
  }
  return encodeComposite(kind, value as CompositeValueByKind[K]);
}

/**
 * Build a spec-clean ORU^R01 observation-result message from typed inputs.
 *
 * The result is a real {@link Hl7Message}: `msg.toString()` serialises it,
 * `parseHL7(msg.toString())` round-trips with zero warnings, and
 * `msg.observations()` reads back the results supplied.
 *
 * @param init - the MSH envelope + typed PID/OBR/OBX content. `patient` and a
 *   non-empty `observations` list are required.
 * @throws TypeError when `patient` is absent or `observations` is empty.
 *
 * @example
 * ```ts
 * import { buildOru, parseHL7 } from "@cosyte/hl7";
 * const msg = buildOru({
 *   sendingApp: "LAB",
 *   receivingApp: "EHR",
 *   patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
 *              name: { familyName: "Test", givenName: "Ann" } },
 *   order: { universalServiceId: { identifier: "CBC", text: "Complete Blood Count", nameOfCodingSystem: "L" },
 *            resultStatus: "F" },
 *   observations: [
 *     { setId: "1", valueType: "NM",
 *       identifier: { identifier: "WBC", text: "White Blood Cells", nameOfCodingSystem: "LN" },
 *       value: "7.2", units: { identifier: "10*3/uL" }, observationResultStatus: "F" },
 *   ],
 * });
 * const round = parseHL7(msg.toString());
 * round.warnings.length;                  // 0
 * round.observations()[0]?.value;         // "7.2"
 * ```
 */
export function buildOru(init: BuildOruInit): Hl7Message {
  if (
    init === null ||
    (init as BuildOruInit | undefined) === undefined ||
    init.patient === undefined
  ) {
    throw new TypeError(
      "buildOru: `patient` is required — an ORU is never emitted with a fabricated subject.",
    );
  }
  // Note: intentionally NOT `Array.isArray` — that narrows a `readonly T[]` to
  // `any[]` and would poison `obs` in the loop below to `any`. An
  // undefined-or-empty check keeps the element type.
  if (
    (init.observations as readonly OruObservation[] | undefined) === undefined ||
    init.observations.length === 0
  ) {
    throw new TypeError(
      "buildOru: at least one `observations` entry (OBX) is required — an ORU with no " +
        "result is a typed error, never a fabricated observation.",
    );
  }

  const enc = DEFAULT_ENCODING_CHARACTERS;
  const version = init.version ?? "2.5";

  const segments: RawSegment[] = [buildMshSegment("ORU^R01", init)];

  // ── PID ──────────────────────────────────────────────────────────────────
  const p = init.patient;
  segments.push(
    assembleSegment(
      "PID",
      new Map<number, RawField | undefined>([
        [1, p.setId !== undefined ? scalarField(p.setId) : undefined],
        [3, p.identifiers !== undefined ? repField("CX", p.identifiers) : undefined],
        [5, p.name !== undefined ? repField("XPN", p.name) : undefined],
        [
          6,
          p.mothersMaidenName !== undefined
            ? encodeComposite("XPN", p.mothersMaidenName)
            : undefined,
        ],
        [7, p.birthDateTime !== undefined ? encodeComposite("TS", p.birthDateTime) : undefined],
        [8, p.administrativeSex !== undefined ? scalarField(p.administrativeSex) : undefined],
        [11, p.address !== undefined ? repField("XAD", p.address) : undefined],
        [13, p.phoneHome !== undefined ? repField("XTN", p.phoneHome) : undefined],
        [18, p.accountNumber !== undefined ? encodeComposite("CX", p.accountNumber) : undefined],
      ]),
    ),
  );

  // ── OBR ──────────────────────────────────────────────────────────────────
  // One OBR groups the OBX result children. Always emitted (empty when no order
  // supplied) so the result group is well-formed; never fabricated content.
  const o = init.order;
  segments.push(
    assembleSegment(
      "OBR",
      new Map<number, RawField | undefined>([
        [1, o?.setId !== undefined ? scalarField(o.setId) : undefined],
        [2, o?.placerOrderNumber !== undefined ? scalarField(o.placerOrderNumber) : undefined],
        [3, o?.fillerOrderNumber !== undefined ? scalarField(o.fillerOrderNumber) : undefined],
        [
          4,
          o?.universalServiceId !== undefined
            ? encodeComposite("CWE", o.universalServiceId)
            : undefined,
        ],
        [
          7,
          o?.observationDateTime !== undefined
            ? encodeComposite("TS", o.observationDateTime)
            : undefined,
        ],
        [16, o?.orderingProvider !== undefined ? repField("XCN", o.orderingProvider) : undefined],
        [25, o?.resultStatus !== undefined ? scalarField(o.resultStatus) : undefined],
      ]),
    ),
  );

  // ── OBX (one per observation) ──────────────────────────────────────────────
  for (const obs of init.observations) {
    segments.push(
      assembleSegment(
        "OBX",
        new Map<number, RawField | undefined>([
          [1, obs.setId !== undefined ? scalarField(obs.setId) : undefined],
          [2, obs.valueType !== undefined ? scalarField(obs.valueType) : undefined],
          [3, obs.identifier !== undefined ? encodeComposite("CWE", obs.identifier) : undefined],
          [5, obs.value !== undefined ? scalarField(obs.value) : undefined],
          [6, obs.units !== undefined ? encodeComposite("CWE", obs.units) : undefined],
          [7, obs.referenceRange !== undefined ? scalarField(obs.referenceRange) : undefined],
          [8, obs.abnormalFlags !== undefined ? scalarField(obs.abnormalFlags) : undefined],
          [
            11,
            obs.observationResultStatus !== undefined
              ? scalarField(obs.observationResultStatus)
              : undefined,
          ],
          [
            14,
            obs.observationDateTime !== undefined
              ? encodeComposite("TS", obs.observationDateTime)
              : undefined,
          ],
        ]),
      ),
    );
  }

  return new Hl7Message({
    segments,
    encodingCharacters: enc,
    version,
    warnings: [],
  });
}
