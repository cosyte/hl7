/**
 * Shared typed segment bodies for the emit path: the PID, PV1, EVN and OBX
 * assembly every typed builder repeats.
 *
 * Each function maps one typed body (the same shape the read helpers return)
 * onto its numbered HL7 positions through the encode-safe path: composites via
 * `encodeComposite`, scalars via `scalarField`, gaps via `assembleSegment`.
 * Nothing here fabricates: an omitted member becomes an absent field.
 *
 * Zero runtime deps: pure functions over the raw positional tree.
 */

import type { RawField, RawSegment } from "../parser/types.js";

import type { AdtEvent, AdtPatient, AdtVisit } from "./build-adt.js";
import type { OruObservation } from "./build-oru.js";
import { encodeComposite } from "./encode-composite.js";
import { assembleSegment, repField, scalarField } from "./segment-fields.js";

/**
 * PID from typed patient-identification content. Identical mapping across
 * every message family: the patient is the same patient wherever it appears.
 * @internal
 */
export function pidSegment(p: AdtPatient): RawSegment {
  return assembleSegment(
    "PID",
    new Map<number, RawField | undefined>([
      [1, p.setId !== undefined ? scalarField(p.setId) : undefined],
      [3, p.identifiers !== undefined ? repField("CX", p.identifiers) : undefined],
      [5, p.name !== undefined ? repField("XPN", p.name) : undefined],
      [
        6,
        p.mothersMaidenName !== undefined ? encodeComposite("XPN", p.mothersMaidenName) : undefined,
      ],
      [7, p.birthDateTime !== undefined ? encodeComposite("TS", p.birthDateTime) : undefined],
      [8, p.administrativeSex !== undefined ? scalarField(p.administrativeSex) : undefined],
      [11, p.address !== undefined ? repField("XAD", p.address) : undefined],
      [13, p.phoneHome !== undefined ? repField("XTN", p.phoneHome) : undefined],
      [18, p.accountNumber !== undefined ? encodeComposite("CX", p.accountNumber) : undefined],
    ]),
  );
}

/**
 * PV1 from typed visit content. `undefined` yields an EMPTY PV1 rather than no
 * segment: message families whose published structure requires the visit group
 * emit it regardless, and an empty PV1 is the structural fail-safe, never
 * fabricated content.
 * @internal
 */
export function pv1Segment(v: AdtVisit | undefined): RawSegment {
  return assembleSegment(
    "PV1",
    new Map<number, RawField | undefined>([
      [1, v?.setId !== undefined ? scalarField(v.setId) : undefined],
      [2, v?.patientClass !== undefined ? scalarField(v.patientClass) : undefined],
      [
        3,
        v?.assignedLocation !== undefined ? encodeComposite("PL", v.assignedLocation) : undefined,
      ],
      [7, v?.attendingDoctor !== undefined ? repField("XCN", v.attendingDoctor) : undefined],
      [8, v?.referringDoctor !== undefined ? repField("XCN", v.referringDoctor) : undefined],
      [19, v?.visitNumber !== undefined ? encodeComposite("CX", v.visitNumber) : undefined],
      [44, v?.admitDateTime !== undefined ? encodeComposite("TS", v.admitDateTime) : undefined],
    ]),
  );
}

/**
 * EVN from the trigger event plus optional typed event content. EVN-1 is the
 * caller-supplied trigger: not a fabricated value.
 * @internal
 */
export function evnSegment(event: string, evn: AdtEvent | undefined): RawSegment {
  return assembleSegment(
    "EVN",
    new Map<number, RawField | undefined>([
      [1, scalarField(event)],
      [
        2,
        evn?.recordedDateTime !== undefined
          ? encodeComposite("TS", evn.recordedDateTime)
          : undefined,
      ],
      [6, evn?.eventOccurred !== undefined ? encodeComposite("TS", evn.eventOccurred) : undefined],
    ]),
  );
}

/**
 * OBX from typed observation content. The same mapping the observation-result
 * builder uses, reused wherever a family carries an OBX body (a document's
 * narrative, an immunization's eligibility, an order's result).
 * @internal
 */
export function obxSegment(obs: OruObservation): RawSegment {
  return assembleSegment(
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
  );
}
