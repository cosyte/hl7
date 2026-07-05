/**
 * `buildMeta` — compose MSH-derived message metadata into the frozen `Meta`
 * view exposed by `Hl7Message.meta` (HELPERS-01). Implementation composes on
 * the Phase 3 public surface (`msg.get`, `msg.segments("MSH")[0].field(N)`) —
 * never walks `rawSegments` directly (CONTEXT.md §domain "Compose, don't
 * reach through").
 *
 * D-01 freeze at boundary. D-02 memoization is handled by the caller
 * (`Hl7Message.meta` getter). D-03 Meta is always defined — MSH absence
 * throws `NO_MSH_SEGMENT` at parse time, so the MSH guard here is purely for
 * TS narrowing. Phase N: `timestamp` is the fidelity `TS` (precision +
 * timezone preserved), never an eager UTC-assuming `Date`. D-21 silent. D-22
 * never throws. D-23 string fields are auto-unescaped by routing through
 * `msg.get()` / `field.value`.
 */

import type { Hl7Message } from "../model/message.js";
import { parseDtmCascade } from "../parser/dates.js";

import type { Meta } from "./types.js";

/**
 * Build the immutable `Meta` view from a parsed message's MSH segment. The
 * result is deeply frozen (D-01) and consumed through the memoized
 * `Hl7Message.meta` getter (D-02). Absent fields are OMITTED from the
 * resulting object (exactOptionalPropertyTypes semantics) — never set to
 * `undefined`.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * console.log(msg.meta.type);                     // "ADT^A01^ADT_A01"
 * console.log(msg.meta.controlId);                // "MSG001"
 * console.log(msg.meta.timestamp?.raw); // fidelity TS (Phase N)
 * ```
 *
 * @internal
 */
export function buildMeta(msg: Hl7Message): Meta {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<Meta> = {};

  // D-03: MSH is always present on a parsed Hl7Message. The optional-chain
  // here is purely for TS narrowing under noUncheckedIndexedAccess.
  const msh = msg.segments("MSH")[0];

  // ─── MSH-9 message type (full string + per-component shortcuts) ────────
  // msg.get("MSH.9") returns the first subcomponent of the first component —
  // i.e. MSH-9.1. To emit the FULL typed string (e.g. "ADT^A01^ADT_A01") we
  // reconstruct it from each component's first subcomponent, joined on '^'
  // and trimmed of trailing empties so "ADT^A01" doesn't render as
  // "ADT^A01^".
  if (msh !== undefined) {
    const typeField = msh.field(9);
    const firstRep = typeField.repetitions[0];
    if (firstRep !== undefined) {
      const parts: string[] = [];
      for (let i = 0; i < firstRep.components.length; i++) {
        const sub = msg.get(`MSH.9.${String(i + 1)}`);
        parts.push(sub ?? "");
      }
      while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
      const fullType = parts.join("^");
      if (fullType !== "") out.type = fullType;
    }
  }
  const messageCode = msg.get("MSH.9.1");
  if (messageCode !== undefined && messageCode !== "") out.messageCode = messageCode;
  const triggerEvent = msg.get("MSH.9.2");
  if (triggerEvent !== undefined && triggerEvent !== "") out.triggerEvent = triggerEvent;
  const messageStructure = msg.get("MSH.9.3");
  if (messageStructure !== undefined && messageStructure !== "") {
    out.messageStructure = messageStructure;
  }

  // ─── MSH-10 message control ID ────────────────────────────────────────
  const controlId = msg.get("MSH.10");
  if (controlId !== undefined && controlId !== "") out.controlId = controlId;

  // ─── MSH-7 timestamp (Phase N fidelity TS + D-21 merged dateFormats) ───
  // Call parseDtmCascade DIRECTLY (not via .asTs() which hard-codes the strict
  // HL7 shape) so Phase 6 D-21 `options.dateFormats ++ profile.dateFormats` is
  // honoured for MSH-7. .asTs() stays strict for composite callers (Phase 3
  // D-10 "zero duplicate date logic"); meta.ts is the non-composite caller that
  // benefits from the lenient cascade. Phase N: `timestamp` is the fidelity
  // TS (precision + timezone preserved), never an eager UTC-assuming Date.
  if (msh !== undefined) {
    const tsField = msh.field(7);
    const tsRaw = tsField.value;
    if (tsRaw !== "") {
      const parsed = parseDtmCascade(tsRaw, { userFormats: msg.dateFormats });
      // `parseDtmCascade` already returns a frozen `DtmParts`.
      if (parsed.valid) out.timestamp = parsed;
    }
  }

  // ─── MSH-12 version ───────────────────────────────────────────────────
  const version = msg.get("MSH.12");
  if (version !== undefined && version !== "") out.version = version;

  // ─── MSH-3/-4/-5/-6 apps + facilities (first component = namespace id) ─
  const sendingApp = msg.get("MSH.3.1");
  if (sendingApp !== undefined && sendingApp !== "") out.sendingApp = sendingApp;
  const sendingFacility = msg.get("MSH.4.1");
  if (sendingFacility !== undefined && sendingFacility !== "") {
    out.sendingFacility = sendingFacility;
  }
  const receivingApp = msg.get("MSH.5.1");
  if (receivingApp !== undefined && receivingApp !== "") out.receivingApp = receivingApp;
  const receivingFacility = msg.get("MSH.6.1");
  if (receivingFacility !== undefined && receivingFacility !== "") {
    out.receivingFacility = receivingFacility;
  }

  // ─── MSH-11 processing ID (first component) ───────────────────────────
  const processingId = msg.get("MSH.11.1");
  if (processingId !== undefined && processingId !== "") out.processingId = processingId;

  // D-01: freeze at boundary — callers see an immutable view.
  return Object.freeze(out);
}
