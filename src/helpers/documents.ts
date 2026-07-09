/**
 * `documents` — Phase Q (document breadth) implementation of the MDM
 * document extractor. Walks the message in document order and projects each
 * TXA (Transcription Document Header) segment into a typed
 * {@link ClinicalDocument}, grouping the OBX narrative body that follows it
 * positionally under that TXA — the same open-a-group-on-the-anchor state
 * machine `immunizations()` uses for RXA→[OBX]. Covers the common MDM trigger
 * events (T02 original / T04 status change / T06 addendum).
 *
 * Field map (HL7 v2 Ch. 9 — medical records / MDM):
 *   - TXA-2  document type (IS — Table 0270; verbatim)
 *   - TXA-4  activity date/time (TS)
 *   - TXA-12 unique document number (EI; first component surfaced verbatim)
 *   - TXA-13 parent document number (EI; addendum/replacement link)
 *   - TXA-17 document COMPLETION status (ID — Table 0271)
 *   - TXA-19 document AVAILABILITY status (ID — Table 0273)
 *   - OBX    the transcribed narrative body, grouped under the TXA
 *
 * Safety rules enforced here (Phase Q §Fail-safe — the load-bearing one):
 *   - **TXA-17 completion status and TXA-19 availability status are surfaced as
 *     DISTINCT fields and NEVER conflated.** A document can be *available*
 *     (TXA-19 = `AV`) before it is *authenticated / legally authenticated*
 *     (TXA-17 = `AU`/`LA`); a still-*preliminary* completion is a different
 *     axis from availability. Reading a preliminary document as final is the
 *     clinical harm this split exists to prevent. Both are verbatim,
 *     provenance-only — never validated, never merged, never defaulted.
 *   - Never throws — a malformed TXA surfaces as omitted keys (HELPERS-07).
 *   - Missing fields → keys omitted; `observations` is ALWAYS a (possibly
 *     empty) array.
 *   - Output is frozen at the boundary (D-01); NOT memoized (D-06).
 *
 * Known limitations: `documents()` surfaces the document header + narrative body
 * only. It does NOT verify authentication signatures (TXA-22), resolve the
 * parent-document chain, or interpret confidentiality. See KNOWN-LIMITATIONS.md.
 */

import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";

import { groupNotes } from "./notes.js";
import { buildObservation } from "./observations.js";
import type { ClinicalDocument, Observation } from "./types.js";

/** Normalize HL7 empty-string to `undefined` for the helper layer. @internal */
function stringOrUndefined(v: string): string | undefined {
  return v === "" ? undefined : v;
}

/** Build a frozen {@link ClinicalDocument} from one TXA + its grouped OBX body. @internal */
function finalizeDocument(txa: Segment, observations: readonly Observation[]): ClinicalDocument {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<ClinicalDocument> = { observations: Object.freeze(observations.slice()) };

  // TXA-2 document type (Table 0270) — verbatim.
  const documentType = stringOrUndefined(txa.field(2).value);
  if (documentType !== undefined) out.documentType = documentType;

  // TXA-4 activity date/time (fidelity TS, Phase N).
  const activity = txa.field(4).asTs();
  if (activity.raw !== "") out.activityDateTime = activity;

  // TXA-12 unique document number (EI) — first component verbatim.
  const uniqueDoc = stringOrUndefined(txa.field(12).value);
  if (uniqueDoc !== undefined) out.uniqueDocumentNumber = uniqueDoc;

  // TXA-13 parent document number (EI) — addendum/replacement link.
  const parentDoc = stringOrUndefined(txa.field(13).value);
  if (parentDoc !== undefined) out.parentDocumentNumber = parentDoc;

  // TXA-17 completion status (Table 0271) — DISTINCT from availability (TXA-19).
  const completion = stringOrUndefined(txa.field(17).value);
  if (completion !== undefined) out.completionStatus = completion;

  // TXA-19 availability status (Table 0273) — DISTINCT from completion (TXA-17).
  const availability = stringOrUndefined(txa.field(19).value);
  if (availability !== undefined) out.availabilityStatus = availability;

  return Object.freeze(out) as ClinicalDocument;
}

/**
 * Every TXA of an MDM message as a typed {@link ClinicalDocument}, with the OBX
 * narrative body grouped positionally under that TXA. Document order. Returns
 * `[]` when no TXA is present. NOT memoized — each call re-walks
 * `msg.allSegments()`. Never throws (HELPERS-07).
 *
 * TXA-17 completion status and TXA-19 availability status are surfaced as
 * **distinct** fields (`completionStatus` vs `availabilityStatus`) and are never
 * merged — a document can be available before it is authenticated, and reading a
 * preliminary document as final is the harm. See {@link ClinicalDocument}.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const doc of msg.documents()) {
 *   console.log(doc.documentType, doc.completionStatus, doc.availabilityStatus);
 *   for (const obx of doc.observations) console.log(obx.value); // narrative body
 * }
 * ```
 *
 * @internal
 */
export function documents(msg: Hl7Message): readonly ClinicalDocument[] {
  const noteIndex = groupNotes(msg); // Phase P: positional NTE grouping (by Segment ref)
  const out: ClinicalDocument[] = [];

  let currentTxa: Segment | undefined;
  let observations: Observation[] = [];

  const closeCurrent = (): void => {
    if (currentTxa !== undefined) out.push(finalizeDocument(currentTxa, observations));
  };

  for (const seg of msg.allSegments()) {
    if (seg.type === "TXA") {
      closeCurrent();
      currentTxa = seg;
      observations = [];
      continue;
    }
    if (currentTxa === undefined) continue; // OBX before any TXA — dropped (still on msg.observations()).
    if (seg.type === "OBX") {
      observations.push(buildObservation(seg, noteIndex.byParent.get(seg)));
    }
  }

  closeCurrent();

  return Object.freeze(out);
}
