/**
 * `buildVxu`: author a spec-clean HL7 v2 **VXU^V04** (unsolicited vaccination
 * record update) message from typed inputs. The conservative-emit mirror of
 * the read helper `msg.immunizations()`: a caller supplies a typed patient and
 * one or more typed immunizations, and `buildVxu` assembles
 * `MSH + PID + [ORC] RXA [RXR…] [OBX…]` per immunization with correct
 * `^`/`&`/`~` structure via the encode-safe path: never hand-assembling
 * delimiters, never injecting one.
 *
 * **Structurally complete + zero-warning.** The emitted message carries the
 * segments the published structure marks required for `VXU^V04` (MSH, PID), so
 * it re-parses with **zero warnings** and `msg.structure.missingGroups` empty.
 *
 * **Never fabricate.** Only values the caller supplies are emitted; an omitted
 * optional field becomes an empty/absent field, never a defaulted clinical
 * value. In particular RXA-21 (action code) and RXA-9 (information source) are
 * emitted only when supplied: a guessed add/delete/update or a guessed
 * administered-versus-historical claim corrupts a registry's deduplication.
 * `patient` and at least one `immunizations` entry are **required**: a
 * vaccination update with no subject or no dose is a typed `TypeError`.
 *
 * Spec traceability: HL7 v2 Ch. 4A (RXA/RXR), Ch. 2 datatypes.
 * Zero runtime deps.
 */

import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";
import type { CWE } from "../model/types/cwe.js";
import type { NM } from "../model/types/nm.js";
import type { TS } from "../model/types/ts.js";

import type { AdtPatient } from "./build-adt.js";
import type { OruObservation } from "./build-oru.js";
import { encodeComposite } from "./encode-composite.js";
import { obxSegment, pidSegment } from "./segment-bodies.js";
import {
  assembleSegment,
  buildMshSegment,
  scalarField,
  type MessageEnvelope,
} from "./segment-fields.js";
import { assertRequiredContent, assertTypedInit } from "./supported-messages.js";

/**
 * Typed PID content for {@link buildVxu}: the same shape every family shares.
 *
 * @example
 * ```ts
 * import type { VxuPatient } from "@cosyte/hl7";
 * const patient: VxuPatient = {
 *   identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
 *   name: { familyName: "Test", givenName: "Ann" },
 * };
 * ```
 */
export type VxuPatient = AdtPatient;

/**
 * Typed OBX content for {@link buildVxu} (eligibility, funding source, …).
 *
 * @example
 * ```ts
 * import type { VxuObservation } from "@cosyte/hl7";
 * const eligibility: VxuObservation = {
 *   setId: "1",
 *   valueType: "CE",
 *   identifier: { identifier: "64994-7", text: "Vaccine funding program eligibility" },
 *   value: "V02",
 * };
 * ```
 */
export type VxuObservation = OruObservation;

/**
 * Typed RXR (route/site) content grouped under one {@link VxuImmunization}.
 *
 * @example
 * ```ts
 * import type { VxuRoute } from "@cosyte/hl7";
 * const route: VxuRoute = {
 *   route: { identifier: "IM", text: "Intramuscular" },
 *   site: { identifier: "LD", text: "Left deltoid" },
 * };
 * ```
 */
export interface VxuRoute {
  /** RXR-1 Route (HL7 Table 0162). */
  readonly route?: CWE;
  /** RXR-2 Administration Site (HL7 Table 0163). */
  readonly site?: CWE;
}

/**
 * Typed RXA (administered dose) content for {@link buildVxu}.
 *
 * @example
 * ```ts
 * import type { VxuImmunization } from "@cosyte/hl7";
 * const dose: VxuImmunization = {
 *   orderControl: "RE",
 *   administeredDateTime: "20260801",
 *   vaccineCode: { identifier: "115", text: "Tdap", nameOfCodingSystem: "CVX" },
 *   doseAmount: "0.5",
 *   doseUnits: { identifier: "mL", nameOfCodingSystem: "UCUM" },
 *   completionStatus: "CP",
 *   actionCode: "A",
 * };
 * ```
 */
export interface VxuImmunization {
  /**
   * ORC-1 Order Control of the ORC that opens this dose's order group. An ORC
   * is emitted only when this is supplied; the read side surfaces it as
   * `orderControl`.
   */
  readonly orderControl?: string;
  /** RXA-1 Give Sub-ID Counter. */
  readonly giveSubIdCounter?: string;
  /** RXA-2 Administration Sub-ID Counter. */
  readonly administrationSubIdCounter?: string;
  /** RXA-3 Date/Time Start of Administration. */
  readonly administeredDateTime?: TS | string;
  /** RXA-5 Administered Code (CVX, HL7 Table 0292). */
  readonly vaccineCode?: CWE;
  /** RXA-6 Administered Amount (emitted verbatim: the caller owns its precision). */
  readonly doseAmount?: NM | number | string;
  /** RXA-7 Administered Units. */
  readonly doseUnits?: CWE;
  /** RXA-9 Administration Notes: the immunization information source (HL7 Table NIP001). */
  readonly informationSource?: CWE;
  /** RXA-15 Substance Lot Number. */
  readonly lotNumber?: string;
  /** RXA-16 Substance Expiration Date. */
  readonly expirationDate?: TS | string;
  /** RXA-17 Substance Manufacturer Name (MVX, HL7 Table 0227). */
  readonly manufacturer?: CWE;
  /** RXA-18 Substance/Treatment Refusal Reason: a refused dose carries this. */
  readonly refusalReason?: CWE;
  /** RXA-20 Completion Status (`CP`, `RE`, `NA`, `PA`). */
  readonly completionStatus?: string;
  /** RXA-21 Action Code (`A` add, `D` delete, `U` update). Never defaulted. */
  readonly actionCode?: string;
  /** RXR children of this dose (route / administration site). */
  readonly routes?: readonly VxuRoute[];
  /** OBX children of this dose (eligibility, funding source, …). */
  readonly observations?: readonly VxuObservation[];
}

/**
 * Input for {@link buildVxu}: the MSH envelope plus the typed segment bodies.
 *
 * @example
 * ```ts
 * import type { BuildVxuInit } from "@cosyte/hl7";
 * const init: BuildVxuInit = {
 *   sendingApp: "CLINIC",
 *   receivingApp: "IIS",
 *   patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
 *   immunizations: [{ vaccineCode: { identifier: "115", nameOfCodingSystem: "CVX" } }],
 * };
 * ```
 */
export interface BuildVxuInit extends MessageEnvelope {
  /** PID content. **Required**: never fabricated. */
  readonly patient: VxuPatient;
  /** RXA content. **Required, non-empty**: a vaccination update with no dose is a typed error. */
  readonly immunizations: readonly VxuImmunization[];
}

/** One RXA segment from typed immunization content. @internal */
function rxaSegment(imm: VxuImmunization): RawSegment {
  return assembleSegment(
    "RXA",
    new Map<number, RawField | undefined>([
      [1, imm.giveSubIdCounter !== undefined ? scalarField(imm.giveSubIdCounter) : undefined],
      [
        2,
        imm.administrationSubIdCounter !== undefined
          ? scalarField(imm.administrationSubIdCounter)
          : undefined,
      ],
      [
        3,
        imm.administeredDateTime !== undefined
          ? encodeComposite("TS", imm.administeredDateTime)
          : undefined,
      ],
      [5, imm.vaccineCode !== undefined ? encodeComposite("CWE", imm.vaccineCode) : undefined],
      [6, imm.doseAmount !== undefined ? encodeComposite("NM", imm.doseAmount) : undefined],
      [7, imm.doseUnits !== undefined ? encodeComposite("CWE", imm.doseUnits) : undefined],
      [
        9,
        imm.informationSource !== undefined
          ? encodeComposite("CWE", imm.informationSource)
          : undefined,
      ],
      [15, imm.lotNumber !== undefined ? scalarField(imm.lotNumber) : undefined],
      [
        16,
        imm.expirationDate !== undefined ? encodeComposite("TS", imm.expirationDate) : undefined,
      ],
      [17, imm.manufacturer !== undefined ? encodeComposite("CWE", imm.manufacturer) : undefined],
      [18, imm.refusalReason !== undefined ? encodeComposite("CWE", imm.refusalReason) : undefined],
      [20, imm.completionStatus !== undefined ? scalarField(imm.completionStatus) : undefined],
      [21, imm.actionCode !== undefined ? scalarField(imm.actionCode) : undefined],
    ]),
  );
}

/** One RXR segment from typed route content. @internal */
function rxrSegment(r: VxuRoute): RawSegment {
  return assembleSegment(
    "RXR",
    new Map<number, RawField | undefined>([
      [1, r.route !== undefined ? encodeComposite("CWE", r.route) : undefined],
      [2, r.site !== undefined ? encodeComposite("CWE", r.site) : undefined],
    ]),
  );
}

/**
 * Build a spec-clean `VXU^V04` vaccination-record-update message from typed
 * inputs.
 *
 * The result is a real {@link Hl7Message}: `msg.toString()` serialises it,
 * `parseHL7(msg.toString())` round-trips with zero warnings, and
 * `msg.immunizations()` reads back the doses supplied, in the order supplied.
 *
 * @param init - the MSH envelope + typed PID/RXA content. `patient` and a
 *   non-empty `immunizations` list are required.
 * @throws TypeError when `init` is not an object, when `patient` is absent, or
 *   when `immunizations` is absent or empty.
 *
 * @example
 * ```ts
 * import { buildVxu, parseHL7 } from "@cosyte/hl7";
 * const msg = buildVxu({
 *   sendingApp: "CLINIC",
 *   receivingApp: "IIS",
 *   patient: {
 *     identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
 *     name: { familyName: "Test", givenName: "Ann" },
 *   },
 *   immunizations: [
 *     {
 *       orderControl: "RE",
 *       administeredDateTime: "20260801",
 *       vaccineCode: { identifier: "115", text: "Tdap", nameOfCodingSystem: "CVX" },
 *       doseAmount: "0.5",
 *       doseUnits: { identifier: "mL", nameOfCodingSystem: "UCUM" },
 *       completionStatus: "CP",
 *       actionCode: "A",
 *       routes: [{ route: { identifier: "IM", text: "Intramuscular" } }],
 *     },
 *   ],
 * });
 * const round = parseHL7(msg.toString());
 * round.warnings.length;                              // 0
 * round.immunizations()[0]?.vaccineCode?.identifier;  // "115"
 * ```
 */
export function buildVxu(init: BuildVxuInit): Hl7Message {
  assertTypedInit("buildVxu", init);
  if (init.patient === undefined) {
    throw new TypeError(
      "buildVxu: VXU^V04 requires `patient` (PID). A vaccination record update is never emitted " +
        "with a fabricated subject.",
    );
  }
  if (
    (init.immunizations as readonly VxuImmunization[] | undefined) === undefined ||
    init.immunizations.length === 0
  ) {
    throw new TypeError(
      "buildVxu: VXU^V04 requires at least one `immunizations` entry (RXA). A vaccination " +
        "record update with no dose is a typed error, never a fabricated administration.",
    );
  }

  const segments: RawSegment[] = [buildMshSegment("VXU^V04", init), pidSegment(init.patient)];

  for (const imm of init.immunizations) {
    if (imm.orderControl !== undefined) {
      segments.push(
        assembleSegment(
          "ORC",
          new Map<number, RawField | undefined>([[1, scalarField(imm.orderControl)]]),
        ),
      );
    }
    segments.push(rxaSegment(imm));
    for (const route of imm.routes ?? []) segments.push(rxrSegment(route));
    for (const obs of imm.observations ?? []) segments.push(obxSegment(obs));
  }

  assertRequiredContent(
    "buildVxu",
    "VXU",
    "V04",
    new Set(segments.map((s) => s.name)),
    new Map([
      ["PID", "patient"],
      ["RXA", "immunizations"],
    ]),
  );

  return new Hl7Message({
    segments,
    encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
    version: init.version ?? "2.5",
    warnings: [],
  });
}
