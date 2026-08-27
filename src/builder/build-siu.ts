/**
 * `buildSiu`: author a spec-clean HL7 v2 **SIU** (scheduling information
 * unsolicited) message from typed inputs. The conservative-emit mirror of the
 * read helper `msg.appointments()`: a caller supplies typed appointment
 * identifiers, timing and one or more resource groups, and `buildSiu` assembles
 * `MSH + SCH + [PID [PV1]] + RGS [AIS|AIG|AIL|AIP…]…` with correct `^`/`&`/`~`
 * structure via the encode-safe path: never hand-assembling delimiters, never
 * injecting one.
 *
 * **Structurally complete + zero-warning.** The emitted message carries the
 * segments the published structure marks required for the SIU events it
 * recognises (SCH and the RGS resource group), so it re-parses with **zero
 * warnings** and `msg.structure.missingGroups` empty. At least one resource
 * group is therefore **required**: a scheduling notification with no resource
 * group is a typed `TypeError`, not a message that arrives incomplete.
 *
 * **Never fabricate.** Only values the caller supplies are emitted; the filler
 * status code (SCH-25) in particular is emitted verbatim and never defaulted,
 * because a guessed appointment status is a wrong appointment.
 *
 * Spec traceability: HL7 v2 Ch. 10 (scheduling: SCH/RGS/AIS/AIG/AIL/AIP),
 * Ch. 2 datatypes. Zero runtime deps.
 */

import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";
import type { CWE } from "../model/types/cwe.js";
import type { TS } from "../model/types/ts.js";
import type { XCN } from "../model/types/xcn.js";

import type { AdtPatient, AdtVisit } from "./build-adt.js";
import { encodeComposite } from "./encode-composite.js";
import { pidSegment, pv1Segment } from "./segment-bodies.js";
import {
  assembleSegment,
  buildMshSegment,
  scalarField,
  structuredField,
  type MessageEnvelope,
} from "./segment-fields.js";
import {
  assertRequiredContent,
  assertTriggerEvent,
  assertTypedInit,
} from "./supported-messages.js";

/**
 * Typed PID content for {@link buildSiu}: the same shape every family shares.
 *
 * @example
 * ```ts
 * import type { SiuPatient } from "@cosyte/hl7";
 * const patient: SiuPatient = { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } };
 * ```
 */
export type SiuPatient = AdtPatient;

/**
 * Which AI* segment carries one {@link SiuResource}: AIS, AIG, AIL or AIP.
 *
 * @example
 * ```ts
 * import type { SiuResourceKind } from "@cosyte/hl7";
 * const kind: SiuResourceKind = "location"; // emitted as AIL
 * ```
 */
export type SiuResourceKind = "service" | "general" | "location" | "personnel";

/**
 * Typed AI* (appointment resource) content for {@link buildSiu}.
 *
 * @example
 * ```ts
 * import type { SiuResource } from "@cosyte/hl7";
 * const theatre: SiuResource = { kind: "location", code: { identifier: "OR-1" } };
 * const surgeon: SiuResource = {
 *   kind: "personnel",
 *   person: { idNumber: "9990", familyName: "Welby", identifierTypeCode: "NPI" },
 * };
 * ```
 */
export interface SiuResource {
  /** Which resource segment to emit: AIS, AIG, AIL or AIP. */
  readonly kind: SiuResourceKind;
  /** AI*-1 Set ID. */
  readonly setId?: string;
  /**
   * AI*-3 resource identifier for a service, general resource or location
   * (AIS-3 / AIG-3 are coded elements; AIL-3 is a location, whose first
   * component is the location id). Ignored for a `personnel` resource, which
   * carries {@link person} instead.
   */
  readonly code?: CWE;
  /** AIP-3 personnel resource: the appointment provider. Personnel resources only. */
  readonly person?: XCN;
}

/**
 * Typed RGS (resource group) content for {@link buildSiu}.
 *
 * @example
 * ```ts
 * import type { SiuResourceGroup } from "@cosyte/hl7";
 * const group: SiuResourceGroup = {
 *   setId: "1",
 *   resourceGroupId: { identifier: "RG-1", text: "Theatre" },
 *   resources: [{ kind: "location", code: { identifier: "OR-1" } }],
 * };
 * ```
 */
export interface SiuResourceGroup {
  /** RGS-1 Set ID. */
  readonly setId?: string;
  /** RGS-2 Segment Action Code. */
  readonly actionCode?: string;
  /** RGS-3 Resource Group ID. */
  readonly resourceGroupId?: CWE;
  /** The AI* resources belonging to this group, in the order supplied. */
  readonly resources?: readonly SiuResource[];
}

/**
 * Typed SCH (scheduling activity information) content for {@link buildSiu}.
 *
 * @example
 * ```ts
 * import type { SiuAppointment } from "@cosyte/hl7";
 * const appointment: SiuAppointment = {
 *   placerAppointmentId: "PL-1001",
 *   fillerAppointmentId: "FL-2002",
 *   startDateTime: "20260801090000",
 *   endDateTime: "20260801093000",
 *   fillerStatusCode: { identifier: "Booked" },
 * };
 * ```
 */
export interface SiuAppointment {
  /** SCH-1 Placer Appointment ID. */
  readonly placerAppointmentId?: string;
  /** SCH-2 Filler Appointment ID. */
  readonly fillerAppointmentId?: string;
  /** SCH-11.4 Start Date/Time of the appointment timing quantity. */
  readonly startDateTime?: TS | string;
  /** SCH-11.5 End Date/Time of the appointment timing quantity. */
  readonly endDateTime?: TS | string;
  /** SCH-25 Filler Status Code (HL7 Table 0278). Verbatim; never defaulted. */
  readonly fillerStatusCode?: CWE;
}

/**
 * Input for {@link buildSiu}: the MSH envelope plus the typed segment bodies.
 *
 * @example
 * ```ts
 * import type { BuildSiuInit } from "@cosyte/hl7";
 * const init: BuildSiuInit = {
 *   sendingApp: "SCHEDULING",
 *   receivingApp: "EHR",
 *   appointment: { fillerAppointmentId: "FL-2002", startDateTime: "20260801090000" },
 *   resourceGroups: [{ setId: "1", resources: [{ kind: "location", code: { identifier: "OR-1" } }] }],
 * };
 * ```
 */
export interface BuildSiuInit extends MessageEnvelope {
  /** SCH content. **Required**: never fabricated. */
  readonly appointment: SiuAppointment;
  /** RGS content. **Required, non-empty**: the published structure needs a resource group. */
  readonly resourceGroups: readonly SiuResourceGroup[];
  /**
   * PID content. Optional: the patient group of the published SIU structure is
   * optional, so a PID is emitted only when supplied.
   */
  readonly patient?: SiuPatient;
  /** PV1 content. Optional; emitted only when supplied, and only alongside a patient. */
  readonly visit?: AdtVisit;
}

/** The AI* segment name for a resource kind. @internal */
const RESOURCE_SEGMENT: Readonly<Record<SiuResourceKind, string>> = Object.freeze({
  service: "AIS",
  general: "AIG",
  location: "AIL",
  personnel: "AIP",
});

/** SCH-11 timing quantity: TQ.4 start, TQ.5 end. @internal */
function timingField(appt: SiuAppointment): RawField | undefined {
  if (appt.startDateTime === undefined && appt.endDateTime === undefined) return undefined;
  const raw = (v: TS | string | undefined): string =>
    v === undefined ? "" : typeof v === "string" ? v : v.raw;
  return structuredField([[], [], [], [raw(appt.startDateTime)], [raw(appt.endDateTime)]]);
}

/** One SCH segment from typed appointment content. @internal */
function schSegment(appt: SiuAppointment): RawSegment {
  return assembleSegment(
    "SCH",
    new Map<number, RawField | undefined>([
      [
        1,
        appt.placerAppointmentId !== undefined ? scalarField(appt.placerAppointmentId) : undefined,
      ],
      [
        2,
        appt.fillerAppointmentId !== undefined ? scalarField(appt.fillerAppointmentId) : undefined,
      ],
      [11, timingField(appt)],
      [
        25,
        appt.fillerStatusCode !== undefined
          ? encodeComposite("CWE", appt.fillerStatusCode)
          : undefined,
      ],
    ]),
  );
}

/** One RGS segment from typed resource-group content. @internal */
function rgsSegment(group: SiuResourceGroup): RawSegment {
  return assembleSegment(
    "RGS",
    new Map<number, RawField | undefined>([
      [1, group.setId !== undefined ? scalarField(group.setId) : undefined],
      [2, group.actionCode !== undefined ? scalarField(group.actionCode) : undefined],
      [
        3,
        group.resourceGroupId !== undefined
          ? encodeComposite("CWE", group.resourceGroupId)
          : undefined,
      ],
    ]),
  );
}

/** One AI* segment from typed resource content. @internal */
function resourceSegment(resource: SiuResource): RawSegment {
  const identity =
    resource.kind === "personnel"
      ? resource.person !== undefined
        ? encodeComposite("XCN", resource.person)
        : undefined
      : resource.code !== undefined
        ? encodeComposite("CWE", resource.code)
        : undefined;
  return assembleSegment(
    RESOURCE_SEGMENT[resource.kind],
    new Map<number, RawField | undefined>([
      [1, resource.setId !== undefined ? scalarField(resource.setId) : undefined],
      [3, identity],
    ]),
  );
}

/**
 * Build a spec-clean SIU message for `event` (the MSH-9.2 trigger, e.g.
 * `"S12"` new appointment, `"S14"` appointment modification, `"S15"`
 * appointment cancellation) from typed inputs.
 *
 * The result is a real {@link Hl7Message}: `msg.toString()` serialises it,
 * `parseHL7(msg.toString())` round-trips with zero warnings, and
 * `msg.appointments()` reads back the identifiers, timing and resources
 * supplied.
 *
 * @param event - the SIU trigger event (MSH-9.2). Required, non-empty.
 * @param init - the MSH envelope + typed SCH/RGS/AI* content. `appointment` and
 *   a non-empty `resourceGroups` list are required.
 * @throws TypeError when `event` is empty, when `init` is not an object, when
 *   `appointment` is absent, or when `resourceGroups` is absent or empty.
 *
 * @example
 * ```ts
 * import { buildSiu, parseHL7 } from "@cosyte/hl7";
 * const msg = buildSiu("S12", {
 *   sendingApp: "SCHEDULING",
 *   receivingApp: "EHR",
 *   appointment: {
 *     placerAppointmentId: "PL-1001",
 *     fillerAppointmentId: "FL-2002",
 *     startDateTime: "20260801090000",
 *     endDateTime: "20260801093000",
 *     fillerStatusCode: { identifier: "Booked" },
 *   },
 *   resourceGroups: [
 *     {
 *       setId: "1",
 *       resources: [
 *         { kind: "location", code: { identifier: "OR-1" } },
 *         { kind: "personnel", person: { idNumber: "9990", familyName: "Welby" } },
 *       ],
 *     },
 *   ],
 * });
 * const round = parseHL7(msg.toString());
 * round.warnings.length;                                 // 0
 * round.appointments()[0]?.fillerAppointmentId;          // "FL-2002"
 * round.appointments()[0]?.resources.map((r) => r.kind); // ["location", "personnel"]
 * ```
 */
export function buildSiu(event: string, init: BuildSiuInit): Hl7Message {
  assertTriggerEvent("buildSiu", "S12", event);
  assertTypedInit("buildSiu", init);
  if (init.appointment === undefined) {
    throw new TypeError(
      `buildSiu: SIU^${event} requires \`appointment\` (SCH). A scheduling notification with no ` +
        "scheduling activity is a typed error, never a fabricated appointment.",
    );
  }
  if (
    (init.resourceGroups as readonly SiuResourceGroup[] | undefined) === undefined ||
    init.resourceGroups.length === 0
  ) {
    throw new TypeError(
      `buildSiu: SIU^${event} requires at least one \`resourceGroups\` entry (RGS). A scheduling ` +
        "notification with no resource group is a typed error, never a fabricated group.",
    );
  }

  const segments: RawSegment[] = [
    buildMshSegment(`SIU^${event}`, init),
    schSegment(init.appointment),
  ];
  if (init.patient !== undefined) {
    segments.push(pidSegment(init.patient));
    if (init.visit !== undefined) segments.push(pv1Segment(init.visit));
  }
  for (const group of init.resourceGroups) {
    segments.push(rgsSegment(group));
    for (const resource of group.resources ?? []) segments.push(resourceSegment(resource));
  }

  assertRequiredContent(
    "buildSiu",
    "SIU",
    event,
    new Set(segments.map((s) => s.name)),
    new Map([
      ["SCH", "appointment"],
      ["RGS", "resourceGroups"],
      ["PID", "patient"],
    ]),
  );

  return new Hl7Message({
    segments,
    encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
    version: init.version ?? "2.5",
    warnings: [],
  });
}
