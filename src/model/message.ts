/**
 * `Hl7Message` — the immutable parsed-message model produced by `parseHL7`.
 * Phase 2 shipped the read-only shell; Phase 3 extends the same class with
 * the read-path traversal methods (`get`, `getAll`, `segments`,
 * `allSegments`) on top of lazy, referentially stable Segment/Field caches
 * (D-11/D-12). The constructor surface is unchanged (Phase 2 D-05 lock) —
 * `init.segments` is still the parser-side key, but the public raw-tree
 * field is now exposed as `rawSegments` to free up the name `segments` for
 * the typed `segments(type)` method.
 */

import { parsePath, resolvePath } from "./dot-path.js";
import { Segment } from "./segment.js";
import type {
  CustomSegmentDefinition,
  EncodingCharacters,
  RawComponent,
  RawField,
  RawRepetition,
  RawSegment,
} from "../parser/types.js";
import type { Hl7ParseWarning } from "../parser/warnings.js";
import { allergies as walkAllergies } from "../helpers/allergies.js";
import { diagnoses as walkDiagnoses } from "../helpers/diagnoses.js";
import type { IdentityEvent } from "../helpers/identity.js";
import { identityEvents as walkIdentityEvents } from "../helpers/identity.js";
import { immunizations as walkImmunizations } from "../helpers/immunizations.js";
import { insurance as walkInsurance } from "../helpers/insurance.js";
import { medications as walkMedications } from "../helpers/medications.js";
import { buildMeta } from "../helpers/meta.js";
import { nextOfKin as walkNextOfKin } from "../helpers/next-of-kin.js";
import { observations as walkObservations } from "../helpers/observations.js";
import { orders as walkOrders } from "../helpers/orders.js";
import { buildPatient } from "../helpers/patient.js";
import { buildStructure } from "../helpers/structure.js";
import type {
  Allergy,
  Diagnosis,
  Immunization,
  Insurance,
  Medication,
  Meta,
  NextOfKin,
  Observation,
  Order,
  Patient,
  Visit,
} from "../helpers/types.js";
import type { MessageStructure } from "../parser/message-structure.js";
import { buildVisit } from "../helpers/visit.js";
import { emitPrettyPrint } from "../serialize/pretty-print.js";
import { emitJson, type SerializedMessage } from "../serialize/to-json.js";
import { emitMessage } from "../serialize/to-string.js";

/**
 * HL7 segment-name shape: 3 characters, first an uppercase ASCII letter,
 * remaining two uppercase ASCII letters or digits — `[A-Z][A-Z0-9]{2}`.
 * This matches standard HL7 v2 segment names (MSH, PID, PV1, PV2, OBX,
 * OBR, NK1, AL1, DG1, IN1, IN2, IN3, …) AND Z-segment custom shapes
 * (ZPI, ZX1, …). Enforced symmetrically on `addSegment` and
 * `removeSegment` so consumers see consistent validation for any mutation
 * that takes a segment name.
 * @internal
 */
const SEGMENT_NAME_RE = /^[A-Z][A-Z0-9]{2}$/u;

/**
 * Shallow-copy a readonly array to a mutable one. Mutation methods rebuild
 * the affected path from leaf to root to keep the declared `readonly Raw*`
 * shapes honest — this helper is the one sanctioned bridge from readonly to
 * mutable for Phase 3 mutation.
 * @internal
 */
function toMutableArray<T>(arr: readonly T[]): T[] {
  return arr.slice();
}

/**
 * Constructor init shape for `Hl7Message`. Exposed for advanced use (e.g.
 * constructing synthetic messages in tests or higher-level builders) but
 * most consumers should rely on `parseHL7` to produce `Hl7Message`
 * instances.
 *
 * @remarks
 * With `exactOptionalPropertyTypes: true`, callers cannot pass
 * `{ profile: undefined }` — either omit the key or pass a real profile
 * descriptor. This matches the `Hl7Message.profile` public field shape
 * (`... | undefined`).
 *
 * The init key is still named `segments` (not `rawSegments`) so Phase 2
 * parser code that constructs `Hl7Message` does not need to change. Inside
 * the class body the raw tree is stored on `this.rawSegments`.
 *
 * @internal
 */
export interface Hl7MessageInit {
  readonly segments: readonly RawSegment[];
  readonly encodingCharacters: EncodingCharacters;
  readonly version: string;
  readonly warnings: readonly Hl7ParseWarning[];
  readonly profile?: { readonly name: string; readonly lineage: readonly string[] };
  /**
   * Merged customSegments map from the applied profile (D-16). Threaded
   * into Segment constructors so `seg.get(fieldName)` can resolve custom
   * positions (PROF-07). Absent when no profile was applied.
   */
  readonly customSegments?: Readonly<Record<string, CustomSegmentDefinition>>;
  /**
   * Merged `dateFormats` list — `options.dateFormats ++ profile.dateFormats`
   * deduped first-occurrence per D-21. Consumed by `msg.meta.timestamp` and
   * any future helper that calls `parseDtmCascade` directly. Absent when
   * neither `options.dateFormats` nor `profile.dateFormats` was supplied.
   */
  readonly dateFormats?: readonly string[];
}

/**
 * Parsed HL7 v2 message. Produced by `parseHL7`. Exposes the raw positional
 * tree (`rawSegments`), delimiter metadata, warnings, and a typed traversal
 * surface — `get(path)` for dot-paths, `getAll(type)` / `segments(type)` /
 * `allSegments()` for wrapper-level iteration.
 *
 * @remarks
 * The `warnings` array is frozen at the model boundary so downstream
 * traversal and helper phases cannot mutate parser output. The `profile`
 * field is populated by Phase 6 when a profile is passed; Phase 2 leaves
 * it `undefined` by default. Segment/Field wrappers are cached per-message
 * and invalidated wholesale by Plan 04 mutation methods.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * console.log(msg.get("PID.5.1"));         // "Smith"
 * for (const obx of msg.segments("OBX")) {
 *   console.log(obx.field(5).value);
 * }
 * for (const w of msg.warnings) console.warn(w.code);
 * ```
 */
export class Hl7Message {
  /**
   * Raw positional tree produced by the parser. 1-indexed per HL7 convention
   * (`fields[0]` is the segment-name / MSH separator placeholder slot). Use
   * `segments(type)` / `allSegments()` for typed wrapper access — this field
   * is exposed for advanced callers that need the raw tree directly (e.g.
   * future serialization phase 5).
   */
  public readonly rawSegments: readonly RawSegment[];

  public readonly encodingCharacters: EncodingCharacters;
  public readonly version: string;
  public readonly warnings: readonly Hl7ParseWarning[];
  public readonly profile:
    | { readonly name: string; readonly lineage: readonly string[] }
    | undefined;

  /**
   * Merged `dateFormats` list — `options.dateFormats ++ profile.dateFormats`
   * deduped first-occurrence per D-21. Empty array when neither source
   * supplied any formats. Exposed publicly so helpers (`msg.meta.timestamp`)
   * and advanced callers can introspect the active cascade.
   */
  public readonly dateFormats: readonly string[];

  /**
   * Merged `customSegments` map from the applied profile, stored so
   * `allSegments()` can hand per-segment slices to `Segment` constructors
   * (D-16). Undefined when no profile was applied.
   * @internal
   */
  private _customSegments: Readonly<Record<string, CustomSegmentDefinition>> | undefined;

  /**
   * Lazily built cache of Segment wrappers keyed by segment type. Built on
   * first `segments(type)` call and filtered from `_allSegments` so
   * individual Segment instances are identical across both caches (D-11).
   * Plan 04 mutation methods drop this cache wholesale.
   * @internal
   */
  private _segmentsByType: Map<string, readonly Segment[]> | undefined;

  /**
   * Lazily built cache of every Segment wrapper in document order. Built on
   * first `segments(type)` / `allSegments()` call. Plan 04 mutation methods
   * drop this cache wholesale.
   * @internal
   */
  private _allSegments: readonly Segment[] | undefined;

  /**
   * Lazily built `Meta` view (Phase 4 D-02 memoization). Dropped wholesale
   * by `invalidateCaches`. `Meta` is always defined (D-03 — MSH absence
   * throws `NO_MSH_SEGMENT` at parse time) so no null-sentinel is needed.
   * @internal
   */
  private _meta: Meta | undefined;

  /**
   * Lazily built `MessageStructure` view (Phase G). Dropped wholesale by
   * `invalidateCaches`. Always defined — `analyzeMessageStructure` returns an
   * `recognized: false` summary for unmodelled types rather than absence.
   * @internal
   */
  private _structure: MessageStructure | undefined;

  /**
   * Lazily built `Patient | undefined` view (Phase 4 D-02 memoization). Uses
   * a null-sentinel cache because `undefined` means "not yet computed" while
   * `null` means "computed, absent". D-04: no PID → public value `undefined`.
   * @internal
   */
  private _patient: Patient | null | undefined;

  /**
   * Lazily built `Visit | undefined` view (Phase 4 D-02 memoization). Same
   * null-sentinel convention as `_patient`. HELPERS-03: no PV1 → public
   * value `undefined`.
   * @internal
   */
  private _visit: Visit | null | undefined;

  /**
   * Construct a new `Hl7Message`. The constructor takes a plain init
   * object and freezes the warnings array so callers cannot mutate parser
   * output after handoff.
   *
   * @internal
   */
  public constructor(init: Hl7MessageInit) {
    this.rawSegments = init.segments;
    this.encodingCharacters = init.encodingCharacters;
    this.version = init.version;
    // Freeze the warnings array at the model boundary so downstream phases
    // cannot mutate parser output after handoff. `slice()` first to avoid
    // sharing a reference the parser may still hold internally.
    this.warnings = Object.freeze(init.warnings.slice());
    // exactOptionalPropertyTypes: `init.profile` is `{...} | undefined`
    // (the optional key was omitted or the caller passed the real value).
    // The public field declares `... | undefined`, so direct assignment is
    // sound.
    this.profile = init.profile;
    // D-16: stash the merged customSegments map so allSegments() can hand
    // per-segment slices to Segment constructors. Conditional assignment
    // under exactOptionalPropertyTypes — absent key stays undefined.
    if (init.customSegments !== undefined) this._customSegments = init.customSegments;
    // D-21: merged dateFormats list (options ++ profile). Empty array when
    // neither source supplied any formats so the public field is always
    // defined (simpler consumer contract than `readonly string[] | undefined`).
    this.dateFormats = init.dateFormats ?? [];
  }

  /**
   * Resolve a dot-path (e.g. `PID.5.1`, `OBX[2].5`, `PID.3[0].1`) to its
   * auto-unescaped leaf string. Returns `undefined` when the path doesn't
   * resolve — never throws on missing path (MODEL-05). Throws `TypeError`
   * on malformed path syntax (e.g. `"pid.5"`, empty string).
   *
   * @example
   * ```ts
   * const msg = parseHL7(raw);
   * msg.get("PID.5.1");  // "Smith"
   * msg.get("OBX[2].5"); // third OBX's 5th field
   * msg.get("NOT.9.9");  // undefined
   * msg.get("MSH.12");   // "2.5" — HL7 version string
   * ```
   */
  public get(path: string): string | undefined {
    return resolvePath(path, this.rawSegments, this.encodingCharacters);
  }

  /**
   * Return every `Segment` of `segmentType` in document order. Returns `[]`
   * (empty array, NEVER `undefined`) when no segment of that type exists
   * (MODEL-02). Alias for `segments(segmentType)` — shares the same cache.
   *
   * @example
   * ```ts
   * for (const obx of msg.getAll("OBX")) {
   *   console.log(obx.field(5).value);
   * }
   * ```
   */
  public getAll(segmentType: string): readonly Segment[] {
    return this.segments(segmentType);
  }

  /**
   * Return the cached array of `Segment` wrappers for `segmentType` in
   * document order. The returned array identity and the individual Segment
   * instances are both stable across calls (D-11). Invalidated wholesale
   * by Plan 04 mutation methods.
   *
   * @example
   * ```ts
   * const pid = msg.segments("PID")[0];
   * if (pid !== undefined) console.log(pid.field(5).value);
   * ```
   */
  public segments(segmentType: string): readonly Segment[] {
    if (this._segmentsByType === undefined) {
      this._segmentsByType = new Map();
    }
    const cached = this._segmentsByType.get(segmentType);
    if (cached !== undefined) return cached;

    // Build from the master `_allSegments` cache so individual Segment
    // wrappers are identical across both caches (D-11 cross-cache
    // stability). `allSegments()` builds the master cache on first call.
    const all = this.allSegments();
    const filtered: readonly Segment[] = all.filter((s) => s.type === segmentType);
    this._segmentsByType.set(segmentType, filtered);
    return filtered;
  }

  /**
   * Iterate every `Segment` in document order (MSH first, then every
   * subsequent segment). Cached per-message; same array reference and same
   * Segment instances on repeat calls (D-11). Invalidated wholesale by
   * Plan 04 mutation methods.
   *
   * @example
   * ```ts
   * for (const seg of msg.allSegments()) {
   *   console.log(seg.type);
   * }
   * ```
   */
  public allSegments(): readonly Segment[] {
    if (this._allSegments !== undefined) return this._allSegments;
    const built: Segment[] = [];
    for (let i = 0; i < this.rawSegments.length; i++) {
      const raw = this.rawSegments[i];
      if (raw === undefined) continue;
      // D-16: hand each Segment its per-segment customFields slice so
      // `seg.get(name)` can resolve named positions. Conditional-pass under
      // exactOptionalPropertyTypes so the optional 4th ctor param stays
      // truly absent (not explicitly undefined) when no profile applied.
      const customFields = this._customSegments?.[raw.name]?.fields;
      if (customFields !== undefined) {
        built.push(new Segment(raw, this.encodingCharacters, i, customFields));
      } else {
        built.push(new Segment(raw, this.encodingCharacters, i));
      }
    }
    this._allSegments = built;
    return built;
  }

  /**
   * MSH-derived message metadata (type, controlId, timestamp, version, etc.).
   * D-01: plain object. D-02: memoized — `msg.meta === msg.meta` across
   * reads until mutation invalidates. D-03: always defined (MSH absence
   * throws `NO_MSH_SEGMENT` at parse time).
   *
   * @example
   * ```ts
   * console.log(msg.meta.type);                     // "ADT^A01"
   * console.log(msg.meta.timestamp?.raw);           // fidelity TS (Phase N)
   * console.log(msg.meta.controlId);                // "MSG001"
   * ```
   */
  public get meta(): Meta {
    return (this._meta ??= buildMeta(this));
  }

  /**
   * Structural-conformance summary for the common message types (roadmap
   * Phase G) — a misroute/truncation safety net, NOT a conformance validator.
   * Reports, per the message's recognized (MSH-9.1, MSH-9.2) type, which
   * Required segment groups are present and which are entirely absent
   * (`missingGroups` — the same set the parser flags as
   * `MISSING_EXPECTED_GROUP` warnings). For an unmodelled type, `recognized`
   * is `false` and `missingGroups` is empty. D-02: memoized.
   *
   * @example
   * ```ts
   * console.log(msg.structure.recognized);    // true for ORU^R01, ADT^A01, …
   * console.log(msg.structure.missingGroups); // e.g. ["result"] if no OBR/OBX
   * ```
   */
  public get structure(): MessageStructure {
    return (this._structure ??= buildStructure(this));
  }

  /**
   * PID-derived patient view, or `undefined` when no PID segment exists
   * (D-04). D-02: memoized. HELPERS-07: never throws — absent fields
   * surface as `undefined` on the returned `Patient` object.
   *
   * @example
   * ```ts
   * console.log(msg.patient?.mrn);
   * console.log(msg.patient?.fullName);
   * console.log(msg.patient?.dateOfBirth?.raw); // fidelity TS — e.g. "19800115"
   * ```
   */
  public get patient(): Patient | undefined {
    if (this._patient === undefined) {
      this._patient = buildPatient(this) ?? null;
    }
    return this._patient === null ? undefined : this._patient;
  }

  /**
   * PV1-derived visit view, or `undefined` when no PV1 segment exists
   * (HELPERS-03). D-02: memoized. HELPERS-07: never throws.
   *
   * @example
   * ```ts
   * console.log(msg.visit?.patientClass);                 // "I"
   * console.log(msg.visit?.admitDateTime?.raw); // fidelity TS
   * console.log(msg.visit?.attendingDoctor?.familyName);
   * ```
   */
  public get visit(): Visit | undefined {
    if (this._visit === undefined) {
      this._visit = buildVisit(this) ?? null;
    }
    return this._visit === null ? undefined : this._visit;
  }

  /**
   * Every OBX segment as a typed Observation in document order. D-05:
   * returns `[]` when no OBX present. D-06: NOT memoized — each call
   * re-walks `rawSegments`. Value type is discriminated per D-13.
   *
   * @example
   * ```ts
   * for (const obs of msg.observations()) {
   *   if (obs.valueType === "NM") console.log(obs.value); // number | undefined
   * }
   * ```
   */
  public observations(): readonly Observation[] {
    return walkObservations(this);
  }

  /**
   * Every OBR as an Order with its OBX children grouped positionally (D-12) and
   * its TQ1 / legacy embedded-TQ (ORC-7) `timings` (Phase M — the repeat pattern
   * surfaced verbatim, never resolved to a schedule). D-05: returns `[]` when no
   * OBR present. D-06: not memoized.
   *
   * @example
   * ```ts
   * for (const order of msg.orders()) {
   *   console.log(order.placerOrderNumber, order.observations.length);
   *   for (const t of order.timings) console.log(t.repeatPattern?.code); // e.g. "Q6H" — verbatim
   * }
   * ```
   */
  public orders(): readonly Order[] {
    return walkOrders(this);
  }

  /**
   * Every recognized ADT patient-identity event (merge / move / link /
   * unlink / person add/update — roadmap Phase K), with the MRG-sourced
   * `prior` and PID/PV1-sourced `surviving` parties labelled by role and the
   * spec-constant `direction: "MRG_TO_PID"` on merge/move events. Returns
   * `[]` when the trigger event is not in the identity family. D-06: not
   * memoized. Never throws; incomplete merge pairs surface a
   * `MERGE_MISSING_PRIOR_OR_SURVIVOR` warning on the event.
   *
   * @example
   * ```ts
   * for (const ev of msg.identityEvents()) {
   *   if (ev.kind === "merge" && ev.prior && ev.surviving) {
   *     // retire ev.prior.identifiers in favour of ev.surviving.identifiers
   *   }
   * }
   * ```
   */
  public identityEvents(): readonly IdentityEvent[] {
    return walkIdentityEvents(this);
  }

  /**
   * Every RXO/RXE/RXD/RXA as a typed `Medication`, with RXR (route) and RXC
   * (component) segments grouped positionally under their parent (Phase D,
   * P0 safety). D-05: returns `[]` when no RX* parent present. D-06: not
   * memoized. The give *amount* and give *strength* are surfaced separately
   * and never reconciled (Phase D §4).
   *
   * Each medication also carries its TQ1 / legacy embedded-TQ (RXE-1) `timings`
   * (Phase M — repeat pattern verbatim, never resolved to a schedule).
   *
   * @example
   * ```ts
   * for (const med of msg.medications()) {
   *   console.log(med.context, med.giveCode?.identifier, med.giveCode?.nameOfCodingSystem);
   *   console.log(med.amount?.minimum, med.strength?.value);
   *   for (const t of med.timings) console.log(t.repeatPattern?.code, t.totalOccurrences);
   * }
   * ```
   */
  public medications(): readonly Medication[] {
    return walkMedications(this);
  }

  /**
   * Every RXA of a VXU^V04 as a typed `Immunization`, with RXR (route/site)
   * and OBX children grouped positionally under the RXA and `orderControl`
   * from the preceding ORC of the VXU order group (Phase E, P0 safety). D-05:
   * returns `[]` when no RXA present. D-06: not memoized. The vaccine code
   * carries its own provenance; the action code (RXA-21) is surfaced verbatim
   * and `recordOrigin` (administered vs historical) is derived only from the
   * well-known NIP001 RXA-9.1 codes — never guessed.
   *
   * @example
   * ```ts
   * for (const imm of msg.immunizations()) {
   *   console.log(imm.vaccineCode?.identifier, imm.doseAmount, imm.recordOrigin);
   *   console.log(imm.actionCode, imm.completionStatus);
   * }
   * ```
   */
  public immunizations(): readonly Immunization[] {
    return walkImmunizations(this);
  }

  /**
   * Every NK1 as a NextOfKin entry in document order. D-05: returns `[]`
   * when no NK1 present.
   *
   * @example
   * ```ts
   * for (const nk of msg.nextOfKin()) {
   *   console.log(nk.name?.familyName, nk.relationship?.text);
   * }
   * ```
   */
  public nextOfKin(): readonly NextOfKin[] {
    return walkNextOfKin(this);
  }

  /**
   * Every AL1 as an Allergy in document order. D-05: returns `[]` when no
   * AL1 present.
   *
   * @example
   * ```ts
   * for (const al of msg.allergies()) console.log(al.code?.text, al.severity);
   * ```
   */
  public allergies(): readonly Allergy[] {
    return walkAllergies(this);
  }

  /**
   * Every DG1 as a Diagnosis in document order. D-05: returns `[]` when no
   * DG1 present.
   *
   * @example
   * ```ts
   * for (const dg of msg.diagnoses()) console.log(dg.code?.identifier);
   * ```
   */
  public diagnoses(): readonly Diagnosis[] {
    return walkDiagnoses(this);
  }

  /**
   * Every IN1 as an Insurance entry with positional IN2/IN3 presence flags.
   * D-05: returns `[]` when no IN1 present.
   *
   * @example
   * ```ts
   * for (const ins of msg.insurance()) console.log(ins.planId?.text);
   * ```
   */
  public insurance(): readonly Insurance[] {
    return walkInsurance(this);
  }

  /**
   * Emit this message as spec-clean HL7 (SER-01). Re-walks `rawSegments`
   * on every call (D-30 no caching). Segments are joined with `\r` per
   * D-05; MSH-1 and MSH-2 are inlined verbatim from
   * `this.encodingCharacters` per D-06; every field string passes through
   * `reescape` per D-04. `RawField.isNull === true` is preserved as the
   * HL7 literal `""` (D-02). Pure — never warns, never throws (D-07).
   *
   * @example
   * ```ts
   * import { parseHL7 } from "@cosyte/hl7";
   * const msg = parseHL7(raw);
   * console.log(msg.toString()); // spec-clean, CR-separated HL7
   * ```
   */
  public toString(): string {
    return emitMessage(this);
  }

  /**
   * Emit this message as a structured `SerializedMessage` JSON projection
   * (SER-03). Invoked automatically by `JSON.stringify(msg)` (D-18).
   * Re-walks `rawSegments` on every call (D-30 no caching). Mirrors the
   * raw tree one-for-one, preserves `isNull`, always includes
   * `warnings: []`, and includes `profile: { name, lineage }` only when
   * `this.profile` is truthy (D-19/D-20). Pure — never warns, never throws.
   *
   * @example
   * ```ts
   * import { parseHL7 } from "@cosyte/hl7";
   * const msg = parseHL7(raw);
   * const snap = msg.toJSON();
   * console.log(snap.segments[0]?.name); // "MSH"
   * console.log(JSON.stringify(msg));     // same content, auto-invokes toJSON
   * ```
   */
  public toJSON(): SerializedMessage {
    return emitJson(this);
  }

  /**
   * Emit this message as a human-readable multi-line string for logs and
   * debugging (SER-04). Single opinionated format (D-22 no options):
   * header line with type / controlId / timestamp / segment count, then
   * one line per segment with labeled `[N]=value` fields (D-23). Composite
   * values render as their raw HL7 string — depth stops at field level
   * (D-24). Pure — never warns, never throws (D-26).
   *
   * **Field values render as their raw HL7 string representation.**
   * Embedded delimiters in user data appear as escape sequences — e.g.
   * a patient family name containing `|` renders as `Smith\F\Jones`
   * (NOT `Smith|Jones`). This preserves round-trip fidelity: copy-pasting
   * prettyPrint output into `parseHL7` yields a structurally equivalent
   * message. For un-escaped human display, parse the composite first via
   * typed accessors (e.g. `msg.patient?.familyName`) — those return
   * already-decoded strings.
   *
   * @example
   * ```ts
   * import { parseHL7 } from "@cosyte/hl7";
   * const msg = parseHL7(raw);
   * console.log(msg.prettyPrint());
   * // HL7 ADT^A01  controlId=MSG001  timestamp=2026-04-19T10:15:00Z  (5 segments)
   * // MSH  [3]=SENDAPP  [4]=SENDFAC  ...
   * // PID  [1]=1  [3]=MRN123  [5]=Doe^John
   * ```
   */
  public prettyPrint(): string {
    return emitPrettyPrint(this);
  }

  /**
   * Set the string value at a dot-path. Mutates the underlying tree and
   * returns `this` for chaining (D-15). Auto-creates missing repetitions,
   * components, and subcomponents WITHIN an existing field, but does NOT
   * auto-create segments — callers must `addSegment` first (throws
   * `TypeError` with an actionable message otherwise).
   *
   * The value is accepted verbatim: unescaped delimiter characters are NOT
   * rejected on input (D-18). Re-escaping on serialize is Phase 5's concern.
   *
   * MSH-1 / MSH-2 follow the user-facing HL7 convention — `setField("MSH.3", ...)`
   * targets MSH-3 (sending application), matching `msg.get("MSH.3")`.
   *
   * Segment/Field wrapper caches are invalidated wholesale on success (D-17).
   * The frozen `warnings` array is never touched (D-16).
   *
   * @example
   * ```ts
   * msg.setField("PID.8", "F");           // patient sex → F
   * msg.setField("PID.5.1", "Jones");     // family name
   * msg.setField("PID.4[2].1", "MRN2");   // create third repetition of PID-4
   * ```
   */
  public setField(path: string, value: string): this {
    // D-18: parsePath throws TypeError on malformed path.
    const parsed = parsePath(path);

    // Find the target segment by type + 0-indexed occurrence.
    let seen = 0;
    let segIdx = -1;
    for (let i = 0; i < this.rawSegments.length; i++) {
      const s = this.rawSegments[i];
      if (s === undefined) continue;
      if (s.name === parsed.segmentType) {
        if (seen === parsed.segmentIndex) {
          segIdx = i;
          break;
        }
        seen++;
      }
    }
    if (segIdx === -1) {
      throw new TypeError(
        `setField: segment "${parsed.segmentType}" (occurrence ${String(parsed.segmentIndex)}) not found. ` +
          `Add it first with addSegment("${parsed.segmentType}", [...]).`,
      );
    }

    // MSH offset: HL7 MSH-3 lives at fields[2], MSH-12 at fields[11]. Non-MSH
    // segments keep straight 1-indexed access (fields[0] = name placeholder).
    const rawFieldIndex = parsed.segmentType === "MSH" ? parsed.fieldIndex - 1 : parsed.fieldIndex;

    // Rebuild the affected path from leaf to root, keeping every Raw* shape
    // structurally immutable. The only readonly bypass is reassigning the
    // `rawSegments` reference on `this` — per D-16, the tree is mutable
    // through the mutation API.
    const mutSegments = toMutableArray(this.rawSegments);
    const seg = mutSegments[segIdx];
    // Exhaustive guard — the index was just located above.
    if (seg === undefined) {
      throw new Error("setField: internal invariant — segment disappeared after lookup.");
    }

    const mutFields = toMutableArray(seg.fields);
    while (mutFields.length <= rawFieldIndex) {
      mutFields.push({ repetitions: [], isNull: false });
    }
    const field = mutFields[rawFieldIndex];
    if (field === undefined) {
      throw new Error("setField: internal invariant — field missing after growth.");
    }

    const mutReps = toMutableArray(field.repetitions);
    const repIdx = parsed.repetitionIndex ?? 0;
    while (mutReps.length <= repIdx) {
      mutReps.push({ components: [] });
    }
    const rep = mutReps[repIdx];
    if (rep === undefined) {
      throw new Error("setField: internal invariant — repetition missing after growth.");
    }

    const mutComps = toMutableArray(rep.components);
    const compIdx = (parsed.componentIndex ?? 1) - 1;
    while (mutComps.length <= compIdx) {
      mutComps.push({ subcomponents: [] });
    }
    const comp = mutComps[compIdx];
    if (comp === undefined) {
      throw new Error("setField: internal invariant — component missing after growth.");
    }

    const mutSubs = toMutableArray(comp.subcomponents);
    const subIdx = (parsed.subcomponentIndex ?? 1) - 1;
    while (mutSubs.length <= subIdx) {
      mutSubs.push("");
    }
    mutSubs[subIdx] = value;

    const newComp: RawComponent = { subcomponents: mutSubs };
    mutComps[compIdx] = newComp;
    const newRep: RawRepetition = { components: mutComps };
    mutReps[repIdx] = newRep;
    const newField: RawField = { repetitions: mutReps, isNull: field.isNull };
    mutFields[rawFieldIndex] = newField;
    const newSeg: RawSegment = { name: seg.name, fields: mutFields };
    mutSegments[segIdx] = newSeg;

    // One readonly bypass — reassign the rawSegments reference. Consumers are
    // warned by D-16 that the tree is mutable via the mutation API.
    (this as { -readonly [K in keyof this]: this[K] }).rawSegments = mutSegments;

    this.invalidateCaches();
    return this;
  }

  /**
   * Append a new segment to the end of the message. `name` must match
   * `/^(?:[A-Z]{3}|Z[A-Z0-9]{2})$/u` — throws `TypeError` otherwise (D-19).
   *
   * `fields` is interpreted in HL7 1-indexed terms: `addSegment("NTE", [a, b, c])`
   * produces a segment whose `NTE-1 = a`, `NTE-2 = b`, `NTE-3 = c`. The
   * internal `RawSegment.fields[0]` name/separator placeholder is synthesized
   * by this method.
   *
   * Each entry may be a plain string (treated as a single-subcomponent
   * single-component single-repetition field) or a full `RawField` object
   * for advanced callers who need structured content.
   *
   * Invalidates caches on return; warnings untouched (D-16).
   *
   * @example
   * ```ts
   * msg.addSegment("NTE", ["", "note text"]);
   * msg.get("NTE.2"); // "note text"
   * ```
   */
  public addSegment(name: string, fields: readonly (string | RawField)[]): this {
    if (!SEGMENT_NAME_RE.test(name)) {
      throw new TypeError(
        `addSegment: invalid segment name "${name}". ` +
          `Expected 3 chars matching [A-Z][A-Z0-9]{2} (e.g. "PID", "PV1", "OBX", "ZPI").`,
      );
    }

    // fields[0] is the name-placeholder slot; user-supplied fields start at
    // position 1. An empty string becomes an empty field (no repetitions),
    // matching the natural HL7 "empty field between pipes" semantics.
    const rawFields: RawField[] = [{ repetitions: [], isNull: false }];
    for (const f of fields) {
      if (typeof f === "string") {
        if (f === "") {
          rawFields.push({ repetitions: [], isNull: false });
        } else {
          rawFields.push({
            repetitions: [{ components: [{ subcomponents: [f] }] }],
            isNull: false,
          });
        }
      } else {
        rawFields.push(f);
      }
    }

    const newSegment: RawSegment = { name, fields: rawFields };
    const mut = toMutableArray(this.rawSegments);
    mut.push(newSegment);
    (this as { -readonly [K in keyof this]: this[K] }).rawSegments = mut;

    this.invalidateCaches();
    return this;
  }

  /**
   * Remove segments by type + occurrence or by type + all. Call shapes:
   *
   * - `removeSegment("NTE")` — remove the FIRST NTE (occurrence 0).
   * - `removeSegment("OBX", 1)` — remove the SECOND OBX (0-indexed per D-01).
   * - `removeSegment("OBX", { all: true })` — remove ALL OBX segments.
   *
   * `MSH` is protected — `removeSegment("MSH")` throws `TypeError` (every
   * HL7 message must retain its MSH segment). Unknown segment types are a
   * no-op (idempotent; no throw). Segment name must match the D-19 shape
   * regex — invalid shapes throw `TypeError` for symmetry with `addSegment`.
   *
   * Invalidates caches on return; warnings untouched (D-16).
   *
   * @example
   * ```ts
   * msg.removeSegment("NTE");                // remove first NTE
   * msg.removeSegment("OBX", 1);             // remove second OBX
   * msg.removeSegment("OBX", { all: true }); // remove all remaining OBX
   * ```
   */
  public removeSegment(
    segmentType: string,
    occurrenceOrOptions?: number | { readonly all?: boolean },
  ): this {
    if (!SEGMENT_NAME_RE.test(segmentType)) {
      throw new TypeError(
        `removeSegment: invalid segment name "${segmentType}". ` +
          `Expected 3 chars matching [A-Z][A-Z0-9]{2} (e.g. "PID", "PV1", "OBX", "ZPI").`,
      );
    }
    if (segmentType === "MSH") {
      throw new TypeError(
        `removeSegment: refusing to remove MSH (every HL7 message must have exactly one MSH segment).`,
      );
    }

    const all = typeof occurrenceOrOptions === "object" && occurrenceOrOptions.all === true;
    const targetOccurrence = typeof occurrenceOrOptions === "number" ? occurrenceOrOptions : 0;

    const mut = toMutableArray(this.rawSegments);
    if (all) {
      const filtered = mut.filter((s) => s.name !== segmentType);
      (this as { -readonly [K in keyof this]: this[K] }).rawSegments = filtered;
    } else {
      let seen = 0;
      let removeAt = -1;
      for (let i = 0; i < mut.length; i++) {
        const s = mut[i];
        if (s === undefined) continue;
        if (s.name === segmentType) {
          if (seen === targetOccurrence) {
            removeAt = i;
            break;
          }
          seen++;
        }
      }
      if (removeAt !== -1) {
        mut.splice(removeAt, 1);
        (this as { -readonly [K in keyof this]: this[K] }).rawSegments = mut;
      }
      // else: no-op — unknown segment type or occurrence out of range.
    }

    this.invalidateCaches();
    return this;
  }

  /**
   * Drop every wrapper AND helper cache wholesale (Phase 3 D-17 + Phase 4
   * D-02). Called by every mutation method so subsequent `segments(type)` /
   * `allSegments()` / `meta` / `patient` / `visit` reads rebuild from the
   * mutated `rawSegments` tree.
   * @internal
   */
  private invalidateCaches(): void {
    this._segmentsByType = undefined;
    this._allSegments = undefined;
    this._meta = undefined;
    this._structure = undefined;
    this._patient = undefined;
    this._visit = undefined;
  }
}
