/**
 * Build a canonical, fully-populated message for any pair in the published
 * typed-builder support set. Shared by the invariant harness and the
 * per-family round-trip suites so both drive the same inits.
 *
 * Every value here is synthetic.
 */

import {
  MESSAGE_STRUCTURE_DEFINITIONS,
  buildAck,
  buildAdt,
  buildDft,
  buildMdm,
  buildOrm,
  buildOru,
  buildSiu,
  buildVxu,
  parseHL7,
  type BuildAdtInit,
  type BuildDftInit,
  type BuildMdmInit,
  type BuildOrmInit,
  type BuildSiuInit,
  type BuildVxuInit,
  type Hl7Message,
  type SupportedBuilderMessage,
} from "../../src/index.js";

/** A fixed MSH envelope so every built message is byte-stable across runs. */
export const ENVELOPE = {
  sendingApp: "CLINIC",
  sendingFacility: "MAIN",
  receivingApp: "EHR",
  receivingFacility: "REF",
  controlId: "CTRL0000042",
  timestamp: "20260801101500",
  version: "2.5",
  processingId: "P",
} as const;

/** The typed patient every family shares. */
export const PATIENT = {
  setId: "1",
  identifiers: [{ idNumber: "MRN001", assigningAuthority: { namespaceId: "HOSP" } }],
  name: { familyName: "Test", givenName: "Jane" },
  birthDateTime: "19880705",
  administrativeSex: "F",
} as const;

/** The prior identity an ADT merge or move event retires. */
export const PRIOR_IDENTITY = {
  identifiers: [{ idNumber: "MRN-OLD", assigningAuthority: { namespaceId: "HOSP" } }],
  accountNumber: { idNumber: "ACCT-OLD" },
  visitNumber: { idNumber: "V-OLD" },
  name: { familyName: "Test", givenName: "Mary" },
} as const;

/**
 * Trigger events whose published structure requires a merge segment, DERIVED
 * from the registry rather than hand-listed: the emit side and the read side
 * are graded over the same domain, and a registry entry that starts or stops
 * requiring MRG moves both at once instead of drifting past a literal list.
 */
export const MERGE_EVENTS: readonly string[] = Object.freeze(
  MESSAGE_STRUCTURE_DEFINITIONS.filter(
    (def) => def.messageCode === "ADT" && def.requiredSegments.includes("MRG"),
  )
    .flatMap((def) => [...def.triggerEvents])
    .sort(),
);

/** A full ADT init for `event`; prior identity is supplied only when required. */
export function adtInit(event: string): BuildAdtInit {
  return {
    ...ENVELOPE,
    event: { recordedDateTime: "20260801101500" },
    patient: PATIENT,
    visit: { patientClass: "I", assignedLocation: { pointOfCare: "ICU", room: "1", bed: "A" } },
    ...(MERGE_EVENTS.includes(event) ? { priorIdentity: PRIOR_IDENTITY } : {}),
  };
}

/** A full VXU init: one administered dose and one refused dose. */
export const VXU_INIT: BuildVxuInit = {
  ...ENVELOPE,
  patient: PATIENT,
  immunizations: [
    {
      orderControl: "RE",
      giveSubIdCounter: "0",
      administrationSubIdCounter: "1",
      administeredDateTime: "20260801",
      vaccineCode: { identifier: "115", text: "Tdap", nameOfCodingSystem: "CVX" },
      doseAmount: "0.5",
      doseUnits: { identifier: "mL", nameOfCodingSystem: "UCUM" },
      informationSource: { identifier: "00", text: "administered", nameOfCodingSystem: "NIP001" },
      lotNumber: "LOT-9",
      expirationDate: "20270101",
      manufacturer: { identifier: "PMC", text: "Sanofi Pasteur", nameOfCodingSystem: "MVX" },
      completionStatus: "CP",
      actionCode: "A",
      routes: [{ route: { identifier: "IM", text: "Intramuscular" }, site: { identifier: "LD" } }],
      observations: [
        { setId: "1", valueType: "CE", identifier: { identifier: "64994-7" }, value: "V02" },
      ],
    },
    {
      giveSubIdCounter: "0",
      administrationSubIdCounter: "2",
      administeredDateTime: "20260802",
      vaccineCode: { identifier: "150", text: "Influenza", nameOfCodingSystem: "CVX" },
      refusalReason: { identifier: "00", text: "Parental decision", nameOfCodingSystem: "NIP002" },
      completionStatus: "RE",
      actionCode: "A",
    },
  ],
};

/** A full DFT init: two charges, posted in the order supplied. */
export const DFT_INIT: BuildDftInit = {
  ...ENVELOPE,
  event: { recordedDateTime: "20260801101500" },
  patient: PATIENT,
  visit: { patientClass: "O", visitNumber: { idNumber: "V123" } },
  charges: [
    {
      setId: "1",
      transactionId: "TXN-1",
      transactionDate: "20260801",
      postingDate: "20260802",
      transactionType: "CG",
      transactionCode: { identifier: "80053", text: "Metabolic panel", nameOfCodingSystem: "C4" },
      quantity: "1",
      amountExtended: { price: "150.00", denomination: "USD" },
      amountUnit: { price: "150.00", denomination: "USD", priceType: "AP" },
      diagnoses: [{ identifier: "E11.9", text: "Type 2 diabetes" }, { identifier: "I10" }],
    },
    {
      setId: "2",
      transactionDate: "20260801",
      transactionType: "CD",
      transactionCode: { identifier: "99213", text: "Office visit" },
      quantity: "2",
      amountExtended: { price: "75.50", denomination: "USD" },
    },
  ],
};

/** The MDM trigger events whose published structure additionally requires OBX. */
export const MDM_CONTENT_EVENTS: readonly string[] = ["T02", "T04", "T06", "T08", "T10"];

/** A full MDM init; the transcribed body is supplied for every event. */
export const MDM_INIT: BuildMdmInit = {
  ...ENVELOPE,
  event: { recordedDateTime: "20260801101500" },
  patient: PATIENT,
  visit: { patientClass: "I", assignedLocation: { pointOfCare: "5W", room: "12", bed: "B" } },
  document: {
    setId: "1",
    documentType: "DS",
    activityDateTime: "20260801100000",
    uniqueDocumentNumber: "DOC-1001",
    parentDocumentNumber: "DOC-1000",
    completionStatus: "AU",
    availabilityStatus: "AV",
    body: [
      { setId: "1", valueType: "TX", value: "Discharge summary, line one." },
      { setId: "2", valueType: "TX", value: "Discharge summary, line two." },
    ],
  },
};

/** A full SIU init: two resource groups covering all four resource kinds. */
export const SIU_INIT: BuildSiuInit = {
  ...ENVELOPE,
  patient: PATIENT,
  visit: { patientClass: "O", visitNumber: { idNumber: "V123" } },
  appointment: {
    placerAppointmentId: "PL-1001",
    fillerAppointmentId: "FL-2002",
    startDateTime: "20260801090000",
    endDateTime: "20260801093000",
    fillerStatusCode: { identifier: "Booked", text: "Booked", nameOfCodingSystem: "HL70278" },
  },
  resourceGroups: [
    {
      setId: "1",
      actionCode: "A",
      resourceGroupId: { identifier: "RG-1", text: "Theatre" },
      resources: [
        { kind: "location", setId: "1", code: { identifier: "OR-1" } },
        {
          kind: "personnel",
          setId: "2",
          person: { idNumber: "9990", familyName: "Welby", givenName: "Marcus" },
        },
      ],
    },
    {
      setId: "2",
      resources: [
        { kind: "service", setId: "1", code: { identifier: "XR-CHEST", text: "Chest x-ray" } },
        { kind: "general", setId: "2", code: { identifier: "PORTABLE-1" } },
      ],
    },
  ],
};

/** A full ORM init: two orders, the first carrying an observation. */
export const ORM_INIT: BuildOrmInit = {
  ...ENVELOPE,
  patient: PATIENT,
  orders: [
    {
      orderControl: "NW",
      orcPlacerOrderNumber: "PL-1001",
      setId: "1",
      placerOrderNumber: "PL-1001",
      fillerOrderNumber: "FL-2002",
      universalServiceId: {
        identifier: "CBC",
        text: "Complete Blood Count",
        nameOfCodingSystem: "L",
      },
      observationDateTime: "20260801080000",
      orderingProvider: { idNumber: "9990", familyName: "Welby", givenName: "Marcus" },
      resultStatus: "O",
      observations: [
        { setId: "1", valueType: "ST", identifier: { identifier: "NOTE" }, value: "Fasting" },
      ],
    },
    {
      orderControl: "NW",
      setId: "2",
      placerOrderNumber: "PL-1002",
      universalServiceId: { identifier: "BMP", text: "Basic Metabolic Panel" },
      resultStatus: "O",
    },
  ],
};

/**
 * Build one published pair from a fully-populated typed init. Throws when the
 * pair names a message code the dispatcher does not know, so a coverage entry
 * added without a matching init reds the harness rather than skipping.
 */
export function buildSupportedPair(m: SupportedBuilderMessage): Hl7Message {
  switch (m.messageCode) {
    case "ACK": {
      const inbound = parseHL7(buildAdt("A01", adtInit("A01")).toString());
      return buildAck(inbound, { code: "AA" });
    }
    case "ADT":
      return buildAdt(m.triggerEvent, adtInit(m.triggerEvent));
    case "DFT":
      return buildDft(m.triggerEvent, DFT_INIT);
    case "MDM":
      return buildMdm(m.triggerEvent, MDM_INIT);
    case "ORM":
      return buildOrm(ORM_INIT);
    case "ORU":
      return buildOru({
        ...ENVELOPE,
        patient: PATIENT,
        order: { setId: "1", universalServiceId: { identifier: "CBC" }, resultStatus: "F" },
        observations: [
          { setId: "1", valueType: "NM", identifier: { identifier: "WBC" }, value: "7.2" },
        ],
      });
    case "SIU":
      return buildSiu(m.triggerEvent, SIU_INIT);
    case "VXU":
      return buildVxu(VXU_INIT);
    default:
      throw new Error(
        `buildSupportedPair: no typed init for ${m.messageCode}^${m.triggerEvent} (${m.builder}).`,
      );
  }
}
