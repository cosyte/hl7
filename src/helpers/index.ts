/**
 * Internal barrel for the Phase 4 helpers. Re-exports the 9 helper type
 * interfaces and the 10 builder / walker functions (+ `pickMrn`). Consumed
 * by `src/model/message.ts` (for the getter / collection method wiring)
 * and indirectly by `src/index.ts` through selective named re-exports of
 * the types + `pickMrn`.
 *
 * Not part of the public package surface — `src/index.ts` is the sole
 * entry point for the `@cosyte/hl7` barrel.
 */

export type {
  Allergy,
  Appointment,
  AppointmentResource,
  Charge,
  ClinicalDocument,
  Diagnosis,
  Immunization,
  ImmunizationRecordOrigin,
  Insurance,
  Meta,
  NextOfKin,
  Observation,
  ObservationBase,
  Order,
  OrderTiming,
  Patient,
  RepeatPattern,
  RepeatPatternKind,
  TimingQuantity,
  Visit,
} from "./types.js";
export type { IdentityEvent, IdentityEventKind, IdentityParty, IdentityRole } from "./identity.js";
export { identityEvents } from "./identity.js";
export { buildMeta } from "./meta.js";
export { buildStructure } from "./structure.js";
export { buildPatient } from "./patient.js";
export { buildVisit } from "./visit.js";
export { observations, buildObservation } from "./observations.js";
export { orders } from "./orders.js";
export { appointments } from "./appointments.js";
export { documents } from "./documents.js";
export { charges } from "./charges.js";
export { notes } from "./notes.js";
export { immunizations } from "./immunizations.js";
export { nextOfKin } from "./next-of-kin.js";
export { allergies } from "./allergies.js";
export { diagnoses } from "./diagnoses.js";
export { insurance } from "./insurance.js";
export { pickMrn } from "./pick-mrn.js";
