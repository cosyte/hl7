/**
 * `identityEvents` — roadmap Phase K read-side helper that recognizes the ADT
 * patient-identity management trigger events and surfaces the MRG segment's
 * *prior* (non-surviving) identifiers alongside the PID/PV1 *surviving*
 * identifiers, each labelled by role.
 *
 * Spec traceability (HL7 v2 Ch. 3, Patient Administration):
 * - A18 "The PID segment contains the surviving patient ID information. The
 *   MRG segment contains the non-surviving information." The merge direction
 *   is spec-explicit and constant: **MRG (prior) → PID (surviving)** — this
 *   helper NEVER infers it from content and never reverses it.
 * - Merge family (§3.3.34–§3.3.42): A34/A35/A36 (v2.3-era merges), A39 merge
 *   person, A40 merge patient identifier list, A41 merge account, A42 merge
 *   visit; move family: A43 move patient info, A44 move account info; link
 *   family: A24 link / A37 unlink (two PID groups, NO MRG); person add/update:
 *   A28 / A31 (PID only, no MRG).
 * - MRG field map is **version-scoped** (v2.5.1 §3.4.10): MRG-1 prior patient
 *   identifier list (CX, repeating), MRG-3 prior patient account number (CX),
 *   MRG-4 prior patient ID (CX, backward-compat only — **withdrawn as of
 *   v2.7** in favour of MRG-1), MRG-5 prior visit number (CX), MRG-7 prior
 *   patient name (XPN). MRG-2 / MRG-6 (prior *alternate* patient/visit IDs,
 *   also withdrawn v2.7) are deliberately not surfaced. On a v2.7+ message
 *   (MSH-12) the withdrawn MRG-4 — and the symmetric withdrawn PID-2 — are
 *   NOT read as identity fields.
 *
 * Fail-safe: a merge/move event missing either side of the MRG→PID pair
 * surfaces what is present plus a `MERGE_MISSING_PRIOR_OR_SURVIVOR` warning on
 * the event — the MRG is **never dropped** (an orphaned MRG yields its own
 * event) and the direction is **never guessed**. The helper never throws.
 *
 * PHI note: identifiers and names are the *payload* of the typed view (by
 * design — the consumer needs them to apply the merge), but warning messages
 * carry only structural facts (event code + missing role), never a value.
 *
 * Applying the merge (re-pointing stored data to the survivor) is the
 * consumer's / integration engine's job — this helper only surfaces it.
 */

import type { Hl7Position } from "../parser/types.js";
import type { Hl7ParseWarning } from "../parser/warnings.js";
import { mergeMissingPriorOrSurvivor } from "../parser/warnings.js";
import type { Hl7Message } from "../model/message.js";
import type { Segment } from "../model/segment.js";
import type { CX } from "../model/types/cx.js";
import { parseCx } from "../model/types/cx.js";
import type { XPN } from "../model/types/xpn.js";

/**
 * Classification of a recognized identity trigger event.
 *
 * - `merge` — A18 / A34 / A35 / A36 / A39 / A40 / A41 / A42 (MRG expected)
 * - `move` — A43 / A44 (MRG expected)
 * - `link` / `unlink` — A24 / A37 (two PID groups, no MRG)
 * - `add` / `update` — A28 / A31 (person add/update, no MRG)
 *
 * @example
 * ```ts
 * import type { IdentityEventKind } from "@cosyte/hl7";
 * const kind: IdentityEventKind = "merge";
 * ```
 */
export type IdentityEventKind = "merge" | "move" | "link" | "unlink" | "add" | "update";

/**
 * Role of one party in an identity event. `surviving` / `subject` / `linked`
 * parties are ONLY ever sourced from PID (+ PV1); `prior` parties are ONLY
 * ever sourced from MRG — the role-labelling invariant Phase K exists for.
 *
 * @example
 * ```ts
 * import type { IdentityRole } from "@cosyte/hl7";
 * const role: IdentityRole = "surviving";
 * ```
 */
export type IdentityRole = "surviving" | "prior" | "linked" | "subject";

/**
 * One party (one patient identity) in an identity event, labelled by role
 * with its source segment recorded as provenance. Absent fields are OMITTED
 * (exactOptionalPropertyTypes). All arrays and the object itself are frozen.
 *
 * Field sources by `sourceSegment`:
 * - `"PID"`: `identifiers` = PID-3 repetitions, `legacyPatientId` = PID-2
 *   (pre-v2.7 only), `accountNumber` = PID-18, `visitNumber` = PV1-19 (from
 *   the group's PV1, when present), `name` = PID-5 (first repetition).
 * - `"MRG"`: `identifiers` = MRG-1 repetitions, `legacyPatientId` = MRG-4
 *   (pre-v2.7 only), `accountNumber` = MRG-3, `visitNumber` = MRG-5,
 *   `name` = MRG-7 (first repetition).
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const ev = parseHL7(raw).identityEvents()[0];
 * if (ev?.prior) {
 *   console.log(ev.prior.role);          // "prior"
 *   console.log(ev.prior.sourceSegment); // "MRG"
 *   for (const cx of ev.prior.identifiers) console.log(cx.idNumber);
 * }
 * ```
 */
export interface IdentityParty {
  /** Role of this party in the event — the safety-critical label. */
  readonly role: IdentityRole;
  /** Segment this party was sourced from — provenance for the role label. */
  readonly sourceSegment: "PID" | "MRG";
  /** Identifier list (PID-3 / MRG-1), every non-empty CX repetition. */
  readonly identifiers: readonly CX[];
  /**
   * Legacy single patient ID (PID-2 / MRG-4). Backward-compat only; withdrawn
   * as of HL7 v2.7 — OMITTED (not read) when MSH-12 declares v2.7 or later.
   */
  readonly legacyPatientId?: CX;
  /** Patient account number (PID-18 / MRG-3). */
  readonly accountNumber?: CX;
  /** Visit number (PV1-19 for a PID party / MRG-5 for a prior party). */
  readonly visitNumber?: CX;
  /** Patient name (PID-5 / MRG-7, first repetition). */
  readonly name?: XPN;
}

/**
 * One recognized patient-identity event. For `merge` / `move` kinds the
 * `surviving` (PID/PV1-sourced) and `prior` (MRG-sourced) parties are also
 * exposed directly, with the spec-constant `direction: "MRG_TO_PID"` — the
 * prior identifiers are the ones being retired in favour of the surviving
 * ones, never the reverse (HL7 v2 Ch. 3, A18/A39/A40).
 *
 * `parties` is the complete role-labelled surface in document order — nothing
 * present in the message is dropped, including a nonconforming MRG in a
 * link/add message (surfaced as a `prior`-role party).
 *
 * `warnings` carries the event's own fail-safe warnings (currently
 * `MERGE_MISSING_PRIOR_OR_SURVIVOR`); they are scoped to the event and are
 * NOT appended to `Hl7Message.warnings` (a read-side helper never mutates
 * the message).
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * for (const ev of parseHL7(raw).identityEvents()) {
 *   if (ev.kind === "merge" && ev.prior && ev.surviving) {
 *     // retire ev.prior.identifiers in favour of ev.surviving.identifiers
 *   } else if (ev.warnings.length > 0) {
 *     // incomplete pair — do NOT apply; route for review
 *   }
 * }
 * ```
 */
export interface IdentityEvent {
  /** Trigger event code (MSH-9.2, falling back to EVN-1), e.g. `"A40"`. */
  readonly eventType: string;
  /** Classification of the trigger event. */
  readonly kind: IdentityEventKind;
  /** Every party in document order, role-labelled — the complete surface. */
  readonly parties: readonly IdentityParty[];
  /** The surviving party (merge/move) — ONLY ever sourced from PID/PV1. */
  readonly surviving?: IdentityParty;
  /** The prior (non-surviving) party (merge/move) — ONLY ever sourced from MRG. */
  readonly prior?: IdentityParty;
  /**
   * Spec-constant merge/move direction: the MRG (prior) identifiers merge
   * INTO the PID (surviving) identifiers. Present on `merge` / `move` events
   * only; never inferred from content.
   */
  readonly direction?: "MRG_TO_PID";
  /** Event-scoped fail-safe warnings (never PHI-bearing). */
  readonly warnings: readonly Hl7ParseWarning[];
}

/** Trigger-event → kind map for the recognized identity family. @internal */
const IDENTITY_TRIGGERS: ReadonlyMap<string, IdentityEventKind> = new Map<
  string,
  IdentityEventKind
>([
  ["A18", "merge"], // merge patient information (backward-compat)
  ["A34", "merge"], // merge patient info - patient ID only
  ["A35", "merge"], // merge patient info - account number only
  ["A36", "merge"], // merge patient info - patient ID & account number
  ["A39", "merge"], // merge person - patient ID
  ["A40", "merge"], // merge patient - patient identifier list
  ["A41", "merge"], // merge account - patient account number
  ["A42", "merge"], // merge visit - visit number
  ["A43", "move"], // move patient information - patient identifier list
  ["A44", "move"], // move account information - patient account number
  ["A24", "link"], // link patient information
  ["A37", "unlink"], // unlink patient information
  ["A28", "add"], // add person information
  ["A31", "update"], // update person information
]);

/**
 * True when MSH-12 declares HL7 v2.7 or later — the era in which the
 * backward-compat single-ID fields (PID-2, MRG-2/4/6) are withdrawn. An
 * absent or unparseable version is treated as pre-v2.7 (the lenient default:
 * real-world ADT traffic is overwhelmingly v2.3–v2.5.1, where those fields
 * are still legal). @internal
 */
function isV27OrLater(version: string | undefined): boolean {
  if (version === undefined) return false;
  const match = /^(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = match[2] === undefined ? 0 : Number(match[2]);
  return major > 2 || (major === 2 && minor >= 7);
}

/** Parse a single-CX field into a CX, or `undefined` when empty. @internal */
function cxOrUndefined(seg: Segment, fieldIndex: number): CX | undefined {
  const cx = seg.field(fieldIndex).asCx();
  return Object.keys(cx).length > 0 ? cx : undefined;
}

/** Parse every non-empty CX repetition of a field. @internal */
function cxList(seg: Segment, fieldIndex: number, msg: Hl7Message): readonly CX[] {
  const out: CX[] = [];
  for (const rep of seg.field(fieldIndex).repetitions) {
    const cx = parseCx(rep, msg.encodingCharacters);
    if (Object.keys(cx).length > 0) out.push(cx);
  }
  return Object.freeze(out);
}

/**
 * Build the PID/PV1-sourced party for a group. `role` distinguishes the
 * surviving (merge/move), linked (link/unlink), and subject (add/update)
 * uses of the same field map. @internal
 */
function buildPidParty(
  pid: Segment,
  pv1: Segment | undefined,
  msg: Hl7Message,
  role: IdentityRole,
  legacyWithdrawn: boolean,
): IdentityParty {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<IdentityParty> = {
    role,
    sourceSegment: "PID",
    identifiers: cxList(pid, 3, msg),
  };

  if (!legacyWithdrawn) {
    const legacy = cxOrUndefined(pid, 2);
    if (legacy !== undefined) out.legacyPatientId = legacy;
  }

  const account = cxOrUndefined(pid, 18);
  if (account !== undefined) out.accountNumber = account;

  if (pv1 !== undefined) {
    const visit = cxOrUndefined(pv1, 19);
    if (visit !== undefined) out.visitNumber = visit;
  }

  const name = pid.field(5).asXpn();
  if (Object.keys(name).length > 0) out.name = name;

  return Object.freeze(out) as IdentityParty;
}

/** Build the MRG-sourced `prior` party (version-scoped field map). @internal */
function buildMrgParty(mrg: Segment, msg: Hl7Message, legacyWithdrawn: boolean): IdentityParty {
  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const out: Mutable<IdentityParty> = {
    role: "prior",
    sourceSegment: "MRG",
    identifiers: cxList(mrg, 1, msg),
  };

  if (!legacyWithdrawn) {
    const legacy = cxOrUndefined(mrg, 4);
    if (legacy !== undefined) out.legacyPatientId = legacy;
  }

  const account = cxOrUndefined(mrg, 3);
  if (account !== undefined) out.accountNumber = account;

  const visit = cxOrUndefined(mrg, 5);
  if (visit !== undefined) out.visitNumber = visit;

  const name = mrg.field(7).asXpn();
  if (Object.keys(name).length > 0) out.name = name;

  return Object.freeze(out) as IdentityParty;
}

/** One PID-led (or orphan-MRG) segment group. @internal */
interface IdentityGroup {
  pid?: Segment;
  pv1?: Segment;
  mrg?: Segment;
}

/**
 * Split the message into PID-led groups (spec shape: `PID [PD1] MRG [PV1]`,
 * repeating). An MRG or PV1 attaches to the currently-open PID group; an MRG
 * with no open group — or arriving when the open group already holds one —
 * opens/continues an orphan group so it is NEVER dropped. @internal
 */
function splitGroups(msg: Hl7Message): IdentityGroup[] {
  const groups: IdentityGroup[] = [];
  let current: IdentityGroup | undefined;

  for (const seg of msg.allSegments()) {
    if (seg.type === "PID") {
      current = { pid: seg };
      groups.push(current);
      continue;
    }
    if (seg.type === "MRG") {
      if (current === undefined || current.mrg !== undefined) {
        current = { mrg: seg };
        groups.push(current);
      } else {
        current.mrg = seg;
      }
      continue;
    }
    if (seg.type === "PV1" && current !== undefined && current.pv1 === undefined) {
      current.pv1 = seg;
    }
  }
  return groups;
}

/** Does the CX carry a usable ID number (Ch. 2A: CX.1 is the identifier)? @internal */
function hasUsableId(cx: CX | undefined): boolean {
  return cx !== undefined && cx.idNumber !== undefined && cx.idNumber !== "";
}

/**
 * Does a party carry at least one usable identity field? A CX with no ID
 * number (e.g. `^^^HOSP`, assigning authority only) is not a usable
 * identifier. Account and visit numbers count on BOTH sides — they are the
 * merge keys of A41/A42 — but a name alone never does. @internal
 */
function hasIdentityField(party: IdentityParty): boolean {
  return (
    party.identifiers.some(hasUsableId) ||
    hasUsableId(party.legacyPatientId) ||
    hasUsableId(party.accountNumber) ||
    hasUsableId(party.visitNumber)
  );
}

/** Position of a segment for warning context. @internal */
function positionOf(seg: Segment | undefined): Hl7Position {
  return { segmentIndex: seg === undefined ? 0 : seg.absoluteIndex };
}

/** Finalize one merge/move event from one group. @internal */
function buildMergeEvent(
  group: IdentityGroup,
  eventType: string,
  kind: "merge" | "move",
  msg: Hl7Message,
  legacyWithdrawn: boolean,
): IdentityEvent {
  const parties: IdentityParty[] = [];
  const warnings: Hl7ParseWarning[] = [];
  let surviving: IdentityParty | undefined;
  let prior: IdentityParty | undefined;

  if (group.pid !== undefined) {
    surviving = buildPidParty(group.pid, group.pv1, msg, "surviving", legacyWithdrawn);
    parties.push(surviving);
  }
  if (group.mrg !== undefined) {
    prior = buildMrgParty(group.mrg, msg, legacyWithdrawn);
    parties.push(prior);
  }

  // Fail-safe (roadmap Phase K): surface what is present + a typed warning
  // when either role of the MRG→PID pair is missing OR carries no usable
  // identity field (e.g. a v2.7+ MRG whose only content was the gated
  // MRG-4 — the consumer must not read an empty prior as "nothing to
  // retire"); never guess direction.
  if (prior === undefined || !hasIdentityField(prior)) {
    warnings.push(
      mergeMissingPriorOrSurvivor(positionOf(group.mrg ?? group.pid), eventType, "prior"),
    );
  }
  if (surviving === undefined || !hasIdentityField(surviving)) {
    warnings.push(
      mergeMissingPriorOrSurvivor(positionOf(group.pid ?? group.mrg), eventType, "survivor"),
    );
  }

  const out: IdentityEvent = {
    eventType,
    kind,
    parties: Object.freeze(parties),
    ...(surviving !== undefined ? { surviving } : {}),
    ...(prior !== undefined ? { prior } : {}),
    direction: "MRG_TO_PID",
    warnings: Object.freeze(warnings),
  };
  return Object.freeze(out);
}

/**
 * Recognize the message's identity trigger event and surface every party
 * labelled by role. Returns `[]` when the trigger (MSH-9.2, falling back to
 * EVN-1) is not in the identity family. Never throws; the result and every
 * nested view are deeply frozen. NOT memoized — each call re-walks the
 * message (mirrors `orders()`).
 *
 * Event shapes:
 * - `merge` / `move` — one event per PID-led group (repeating groups yield
 *   one event each); `surviving` + `prior` + constant `direction`.
 * - `link` / `unlink` — ONE event; every PID group is a `linked` party.
 * - `add` / `update` — one event per PID group; the party role is `subject`.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(rawA40);
 * const [ev] = msg.identityEvents();
 * ev?.kind;                      // "merge"
 * ev?.direction;                 // "MRG_TO_PID" — spec-constant, never guessed
 * ev?.surviving?.sourceSegment;  // "PID"
 * ev?.prior?.sourceSegment;      // "MRG"
 * ```
 *
 * @internal
 */
export function identityEvents(msg: Hl7Message): readonly IdentityEvent[] {
  const trigger = msg.meta.triggerEvent ?? msg.get("EVN.1");
  if (trigger === undefined || trigger === "") return Object.freeze([]);

  const eventType = trigger.toUpperCase();
  const kind = IDENTITY_TRIGGERS.get(eventType);
  if (kind === undefined) return Object.freeze([]);

  const legacyWithdrawn = isV27OrLater(msg.meta.version);
  const groups = splitGroups(msg);
  const events: IdentityEvent[] = [];

  if (kind === "merge" || kind === "move") {
    if (groups.length === 0) {
      // Trigger says merge/move but the message carries neither PID nor MRG:
      // one event recording both missing roles (position falls back to MSH).
      events.push(buildMergeEvent({}, eventType, kind, msg, legacyWithdrawn));
    } else {
      for (const group of groups) {
        events.push(buildMergeEvent(group, eventType, kind, msg, legacyWithdrawn));
      }
    }
  } else if (kind === "link" || kind === "unlink") {
    // A24/A37: the PID groups are peers being (un)linked — no survivor/prior
    // semantics. A nonconforming MRG is still surfaced (never dropped) as a
    // prior-role party in document order.
    const parties: IdentityParty[] = [];
    for (const group of groups) {
      if (group.pid !== undefined) {
        parties.push(buildPidParty(group.pid, group.pv1, msg, "linked", legacyWithdrawn));
      }
      if (group.mrg !== undefined) {
        parties.push(buildMrgParty(group.mrg, msg, legacyWithdrawn));
      }
    }
    const out: IdentityEvent = {
      eventType,
      kind,
      parties: Object.freeze(parties),
      warnings: Object.freeze([]),
    };
    events.push(Object.freeze(out));
  } else {
    // add / update (A28/A31): one subject party per PID group. A
    // nonconforming MRG is surfaced on the same event (never dropped).
    for (const group of groups) {
      const parties: IdentityParty[] = [];
      let subject: IdentityParty | undefined;
      if (group.pid !== undefined) {
        subject = buildPidParty(group.pid, group.pv1, msg, "subject", legacyWithdrawn);
        parties.push(subject);
      }
      if (group.mrg !== undefined) {
        parties.push(buildMrgParty(group.mrg, msg, legacyWithdrawn));
      }
      if (parties.length === 0) continue;
      const out: IdentityEvent = {
        eventType,
        kind,
        parties: Object.freeze(parties),
        warnings: Object.freeze([]),
      };
      events.push(Object.freeze(out));
    }
  }

  return Object.freeze(events);
}
