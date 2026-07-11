/**
 * `buildPatient` — compose PID-derived patient demographics into the frozen
 * `Patient` view exposed by `Hl7Message.patient` (HELPERS-02). Composition
 * happens through the Phase 3 public surface (`msg.segments("PID")[0].field(N)`
 * + composite coercions + `parseCx` / `parseXtn` for multi-rep walks) —
 * never through `rawSegments` directly.
 *
 * Decisions honored here:
 * - D-01: `Object.freeze` the top-level object at the boundary.
 * - D-04: return `undefined` when no PID segment exists.
 * - D-07 / D-08 / D-10: MRN pick via `pickMrn` (isolated for Phase 6).
 * - D-09: `identifiers` is a frozen `readonly CX[]` — always present.
 * - D-17: `fullName` is Western order "Given Middle Family, Suffix", omitted
 *   parts cleanly joined, absent when no usable parts.
 * - Phase N: `dateOfBirth` is the fidelity `TS` (day-only DOB keeps `precision:
 *   "day"`, never a UTC-midnight instant that shifts the day).
 * - D-19: flat `familyName` / `givenName` / `middleName` convenience fields
 *   mirror XPN, with `middleName` mapped from `XPN.secondName`.
 * - D-20: `phoneNumbers` concatenates PID-13 then PID-14 repetitions.
 * - D-22: never throws — absent / malformed fields surface as omitted keys.
 * - D-23: string reads are decoded via `Field.value` / composite parsers (once at parse).
 */

import type { Hl7Message } from "../model/message.js";
import type { CX } from "../model/types/cx.js";
import { parseCx } from "../model/types/cx.js";
import type { XPN } from "../model/types/xpn.js";
import type { XTN } from "../model/types/xtn.js";
import { parseXtn } from "../model/types/xtn.js";

import { groupNotes } from "./notes.js";
import { pickMrn } from "./pick-mrn.js";
import type { Patient } from "./types.js";

/**
 * Compose the `fullName` string in Western order "Given Middle Family,
 * Suffix" from XPN parts (D-17). Missing parts are omitted cleanly — no
 * double spaces, no leading/trailing comma. Returns `undefined` when no
 * usable parts remain so the helper can omit the key entirely.
 *
 * @internal
 */
function composeFullName(name: XPN): string | undefined {
  const parts: string[] = [];
  if (name.givenName !== undefined && name.givenName !== "") parts.push(name.givenName);
  if (name.secondName !== undefined && name.secondName !== "") parts.push(name.secondName);
  if (name.familyName !== undefined && name.familyName !== "") parts.push(name.familyName);
  const base = parts.join(" ");
  const suffix = name.suffix;
  const hasSuffix = suffix !== undefined && suffix !== "";
  let full: string;
  if (hasSuffix) {
    full = base === "" ? suffix : `${base}, ${suffix}`;
  } else {
    full = base;
  }
  return full === "" ? undefined : full;
}

/**
 * Build the immutable `Patient` view from a parsed message's PID segment, or
 * return `undefined` when no PID exists (D-04). The returned object is
 * deeply frozen (D-01) and consumed through the memoized `Hl7Message.patient`
 * getter (D-02). Absent fields are OMITTED (exactOptionalPropertyTypes); the
 * `name`, `identifiers`, and `phoneNumbers` fields are ALWAYS present (D-09,
 * D-19, D-20).
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * console.log(msg.patient?.mrn);                        // first CX-5="MR" idNumber
 * console.log(msg.patient?.fullName);                   // "Jane Q Smith, Jr"
 * console.log(msg.patient?.dateOfBirth?.raw); // fidelity TS (Phase N) — e.g. "19800115"
 * for (const phone of msg.patient?.phoneNumbers ?? []) {
 *   console.log(phone.telephoneNumber);
 * }
 * ```
 *
 * @internal
 */
export function buildPatient(msg: Hl7Message): Patient | undefined {
  const pid = msg.segments("PID")[0];
  if (pid === undefined) return undefined; // D-04

  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Patient> = {};

  // ─── PID-3 identifiers (D-09) + MRN pick (D-07 / D-08 / D-10) ─────────
  const identifiers: CX[] = [];
  for (const rep of pid.field(3).repetitions) {
    const cx = parseCx(rep, msg.encodingCharacters);
    if (Object.keys(cx).length > 0) identifiers.push(cx);
  }
  const frozenIds = Object.freeze(identifiers);
  out.identifiers = frozenIds;

  const mrn = pickMrn(frozenIds);
  if (mrn !== undefined) out.mrn = mrn;

  // ─── PID-5 name (XPN) + flat D-19 shortcuts + D-17 fullName ───────────
  const name = pid.field(5).asXpn();
  out.name = name; // always present, may be `{}` on absent PID-5

  if (name.familyName !== undefined) out.familyName = name.familyName;
  if (name.givenName !== undefined) out.givenName = name.givenName;
  if (name.secondName !== undefined) out.middleName = name.secondName; // D-19 rename

  const fullName = composeFullName(name);
  if (fullName !== undefined) out.fullName = fullName;

  // ─── PID-7 date of birth (Phase N fidelity TS) ────────────────────────
  const dob = pid.field(7).asTs();
  if (dob.valid) out.dateOfBirth = dob;

  // ─── PID-8 administrative sex (flat string) ───────────────────────────
  const sex = pid.field(8).value;
  if (sex !== "") out.sex = sex;

  // ─── PID-11 address (XAD) — omit when empty ───────────────────────────
  const address = pid.field(11).asXad();
  if (Object.keys(address).length > 0) out.address = address;

  // ─── PID-13 home + PID-14 business phones, concatenated (D-20) ────────
  const phones: XTN[] = [];
  for (const rep of pid.field(13).repetitions) {
    const xtn = parseXtn(rep, msg.encodingCharacters);
    if (Object.keys(xtn).length > 0) phones.push(xtn);
  }
  for (const rep of pid.field(14).repetitions) {
    const xtn = parseXtn(rep, msg.encodingCharacters);
    if (Object.keys(xtn).length > 0) phones.push(xtn);
  }
  out.phoneNumbers = Object.freeze(phones);

  // ─── PID-10 race (CWE) ───────────────────────────────────────────────
  const race = pid.field(10).asCwe();
  if (Object.keys(race).length > 0) out.race = race;

  // ─── PID-22 ethnicity (CWE) ──────────────────────────────────────────
  const ethnicity = pid.field(22).asCwe();
  if (Object.keys(ethnicity).length > 0) out.ethnicity = ethnicity;

  // ─── PID-15 primary language (CE) ────────────────────────────────────
  const language = pid.field(15).asCe();
  if (Object.keys(language).length > 0) out.language = language;

  // ─── Phase P: NTE notes positionally attached to this PID ─────────────
  // Notes immediately following the (first) PID segment attach to the patient.
  // A second PID's group notes ride on that PID segment but are not surfaced
  // here (the patient view is the first PID — a documented single-patient model).
  // The array is already frozen by `groupNotes`; a later PID's notes are routed
  // to `msg.notes()` there, never mis-attached to this first-PID patient view.
  const patientNotes = groupNotes(msg).byParent.get(pid);
  if (patientNotes !== undefined && patientNotes.length > 0) out.notes = patientNotes;

  // D-01 freeze at boundary.
  return Object.freeze(out) as Patient;
}
