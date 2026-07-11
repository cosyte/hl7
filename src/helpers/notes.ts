/**
 * `groupNotes` / `notes` — Phase P implementation of NTE narrative grouping.
 * Groups **NTE** (Notes and Comments) segments to their parent **by position**:
 * an NTE inherits its meaning entirely from the segment that immediately
 * precedes it (HL7 v2 Ch. 2 — the NTE carries no link field, so attachment is
 * purely positional). In an ORU the grammar is
 * `{ [ORC] OBR [{NTE}] [{ [OBX] [{NTE}] }] }`, so a note after OBR is
 * order-level and a note after OBX is *that* result-level (Ch. 7).
 *
 * Recognized parents and where their notes surface:
 *   - `PID` → the patient view (`msg.patient.notes`).
 *   - `ORC` / `OBR` → the order (`order.notes`).
 *   - `OBX` → that specific observation (`observation.notes`).
 *
 * Design decisions enforced here:
 *   - **Positional, never guessed.** The parent is the nearest *preceding
 *     non-NTE* segment (consecutive NTEs chain to the same parent). Any
 *     non-NTE segment that is NOT a recognized parent (e.g. `PV1`, `AL1`,
 *     `MSH`) resets the target — a subsequent NTE is then surfaced
 *     message-level, not attached to an unrelated earlier parent (fail safe;
 *     the spec's "profile-specific placement outside the common patterns is
 *     surfaced message-level, not guessed").
 *   - **Never dropped — even when the parent's helper projection is dropped.**
 *     A note whose recognized parent is *not* surfaced by any helper falls to
 *     the message-level `unattached` bucket rather than vanishing. Two such
 *     cases: (1) a **later PID** in a multi-patient ORU (`msg.patient` is the
 *     first PID only), and (2) an **ORC region that never opens an order** — a
 *     trailing/dangling ORC with no following OBR. To handle the ORC↔order
 *     relationship, notes seen after an `ORC` (before its OBR) are **buffered**
 *     and flushed onto the OBR that opens the order (in document order, ahead of
 *     the OBR's own notes) — exactly mirroring how `orders()` promotes a pending
 *     ORC. Several ORCs before one OBR all flush to that order; nothing is lost.
 *   - **Order preserved.** Note lines accumulate in document order per parent;
 *     across parents the walk is `msg.allSegments()` order. Order-level notes
 *     land on the OBR key in document order, so ORC-region notes precede
 *     OBR-region notes without any hardcoded assumption about ORC-vs-OBR order.
 *   - **Keyed by Segment reference.** `allSegments()` / `segments(type)` return
 *     referentially-stable `Segment` instances from one master cache, so a
 *     `Map<Segment, …>` lets `observations()` / `orders()` / `patient` look up
 *     a parent's notes without re-implementing the positional walk.
 *   - **NTE-3 (Comment, FT, repeating).** Each non-empty NTE-3 repetition is one
 *     note line. The FULL repetition text is reassembled (all components /
 *     subcomponents), HL7-unescaped — a non-conformant raw `^`/`&` in the FT
 *     narrative tokenizes into components, so reading only the first would
 *     truncate the note (silent clinical-text loss). NTE-1 (set id), NTE-2
 *     (source of comment), and NTE-4 (comment type) are intentionally deferred —
 *     FT formatting beyond the standard escape set is not specially rendered.
 *   - NTE free-text is high-PHI-risk clinical narrative — it is payload; no
 *     warning or log line echoes it.
 */

import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";

/**
 * Sentinel target for notes seen in the ORC→OBR region: they belong to the
 * order the next OBR opens, so they are buffered and flushed onto that OBR
 * (mirroring `orders()` ORC promotion). @internal
 */
const ORDER_SINK = Symbol("order-sink");

/**
 * Positional grouping of every NTE segment's note lines. `byParent` maps a
 * recognized parent `Segment` (by reference) to its accumulated note lines;
 * `unattached` holds message-level notes with no recognized preceding parent.
 */
export interface NoteGrouping {
  /** Recognized parent segment → its note lines, in document order. */
  readonly byParent: ReadonlyMap<Segment, readonly string[]>;
  /** Message-level notes (no recognized preceding parent), in document order. */
  readonly unattached: readonly string[];
}

/**
 * Extract the note lines from one NTE segment: each non-empty NTE-3 (Comment,
 * FT) repetition as one line, decoded, in order. An NTE carrying no NTE-3
 * text yields `[]`.
 *
 * The FULL repetition text is reassembled — a lenient parser tokenizes a
 * non-conformant raw `^`/`&` in the FT narrative into components/subcomponents,
 * so reading only the first would silently truncate the note. Each leaf is
 * already decoded by the tokenizer (parser-02) — it is used verbatim, NOT
 * re-unescaped (a second decode would double-decode a value whose bytes look
 * like an escape, HL7-VALUE-REDECODE) — and components/subcomponents are
 * rejoined with the literal delimiters so both the conformant (`\S\`-escaped)
 * and quirky (raw-caret) forms read to the same text.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const nte = parseHL7("MSH|^~\\&|A|B|||1||ORU^R01|1|T|2.5\rNTE|1||a~b\r").segments("NTE")[0];
 * if (nte !== undefined) extractNoteLines(nte); // ["a", "b"]
 * ```
 *
 * @internal
 */
export function extractNoteLines(nte: Segment): string[] {
  const field = nte.field(3);
  const enc = field.enc;
  const lines: string[] = [];
  for (const rep of field.repetitions) {
    // Subcomponents are already decoded by the tokenizer — join them verbatim,
    // never a second `unescape` (HL7-VALUE-REDECODE).
    const text = rep.components
      .map((c) => c.subcomponents.join(enc.subcomponent))
      .join(enc.component);
    if (text !== "") lines.push(text);
  }
  return lines;
}

/**
 * Walk the message once and group NTE note lines to their positional parent.
 * The returned maps/arrays are frozen at the boundary. NOT memoized — each
 * caller (`observations()` / `orders()` / `buildPatient()` / `msg.notes()`)
 * re-walks, mirroring the non-memoized collection helpers.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * const grouping = groupNotes(msg);
 * grouping.unattached;                    // message-level notes
 * grouping.byParent.get(msg.segments("OBX")[0]!); // that OBX's notes
 * ```
 *
 * @internal
 */
export function groupNotes(msg: Hl7Message): NoteGrouping {
  const byParent = new Map<Segment, string[]>();
  const unattached: string[] = [];
  // Notes buffered in an ORC→OBR region; flushed onto the OBR that opens the
  // order, or to message level if no OBR follows (trailing/dangling ORC).
  let pendingOrderNotes: string[] = [];
  let sawPid = false;
  // Where the NEXT NTE's lines go: a recognized parent Segment (PID#1 / OBR /
  // OBX), the ORC sink, or `undefined` (message-level).
  let target: Segment | typeof ORDER_SINK | undefined;

  /** Append `lines` to a parent's accumulator (first write owns the array). */
  const attach = (parent: Segment, lines: string[]): void => {
    const existing = byParent.get(parent);
    if (existing === undefined) byParent.set(parent, lines);
    else existing.push(...lines);
  };

  for (const seg of msg.allSegments()) {
    const type = seg.type;

    if (type === "NTE") {
      const lines = extractNoteLines(seg);
      if (lines.length === 0) continue; // an empty NTE contributes nothing
      if (target === ORDER_SINK) pendingOrderNotes.push(...lines);
      else if (target === undefined) unattached.push(...lines);
      else attach(target, lines);
      continue;
    }

    if (type === "OBR") {
      // Open the order: seed its notes with the buffered ORC-region notes (in
      // document order, ahead of the OBR's own), then collect onto this OBR.
      if (pendingOrderNotes.length > 0) {
        attach(seg, pendingOrderNotes);
        pendingOrderNotes = []; // hand ownership to byParent; start a fresh buffer
      }
      target = seg;
      continue;
    }

    if (type === "ORC") {
      target = ORDER_SINK; // following notes belong to the order this ORC opens
      continue;
    }

    if (type === "OBX") {
      target = seg;
      continue;
    }

    if (type === "PID") {
      // Only the first PID is surfaced by `msg.patient`; a later PID's notes
      // have no dedicated surface, so route them to message level rather than
      // dropping them or mis-attaching them to the first patient.
      target = sawPid ? undefined : seg;
      sawPid = true;
      continue;
    }

    // Any other segment (MSH, PV1, AL1, …) re-scopes the immediate target to
    // message level (fail-safe — never guess). A buffered ORC region survives:
    // it still belongs to the order its OBR will open.
    target = undefined;
  }

  // A trailing ORC region that never opened an order → message level (never dropped).
  if (pendingOrderNotes.length > 0) unattached.push(...pendingOrderNotes);

  const frozenByParent = new Map<Segment, readonly string[]>();
  for (const [parent, lines] of byParent) frozenByParent.set(parent, Object.freeze(lines));

  return {
    byParent: frozenByParent,
    unattached: Object.freeze(unattached),
  };
}

/**
 * Message-level notes — surfaced verbatim in document order so nothing is ever
 * dropped. This bucket holds an NTE with **no recognized preceding parent**
 * (not immediately following a `PID` / `ORC` / `OBR` / `OBX`), plus the notes
 * whose recognized parent has **no surfaced projection**: a later `PID`'s notes
 * in a multi-patient ORU (`msg.patient` is the first PID only) and an ORC region
 * that never opens an order (a trailing/dangling `ORC` with no following OBR).
 * Notes that DO attach to a specific patient / order / result are exposed on
 * those helper outputs (`msg.patient?.notes`, `order.notes`, `observation.notes`)
 * — not here. D-05: returns `[]` when there are none. NOT memoized.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const note of msg.notes()) console.log(note); // message-level narrative
 * ```
 *
 * @internal
 */
export function notes(msg: Hl7Message): readonly string[] {
  return groupNotes(msg).unattached;
}
