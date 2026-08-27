/**
 * `buildDft`: author a spec-clean HL7 v2 **DFT** (detail financial transaction)
 * message from typed inputs. The conservative-emit mirror of the read helper
 * `msg.charges()`: a caller supplies a typed patient and one or more typed
 * charges, and `buildDft` assembles `MSH + EVN + PID + [PV1] + FT1…` with
 * correct `^`/`&`/`~` structure via the encode-safe path: never
 * hand-assembling delimiters, never injecting one.
 *
 * **Structurally complete + zero-warning.** The emitted message carries the
 * segments the published structure marks required for the DFT events it
 * recognises (EVN, PID, FT1), so it re-parses with **zero warnings** and
 * `msg.structure.missingGroups` empty.
 *
 * **No money as a float, ever.** A transaction amount is supplied and emitted
 * as its typed parts (price, denomination, price type) and every part travels
 * verbatim: nothing here parses an amount to a `number`, rounds it, reconciles
 * it, or infers a currency. The read side surfaces the same amount as its
 * canonical wire text, so an amount survives emit and re-read byte for byte.
 *
 * **Never fabricate.** Only values the caller supplies are emitted.
 * `patient` and at least one `charges` entry are **required**: a financial
 * transaction message with no subject or no transaction is a typed `TypeError`.
 *
 * Spec traceability: HL7 v2 Ch. 6 (financial management: FT1), Ch. 2 datatypes.
 * Zero runtime deps.
 */

import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";
import type { CWE } from "../model/types/cwe.js";
import type { NM } from "../model/types/nm.js";
import type { TS } from "../model/types/ts.js";

import type { AdtEvent, AdtPatient, AdtVisit } from "./build-adt.js";
import { encodeComposite } from "./encode-composite.js";
import { evnSegment, pidSegment, pv1Segment } from "./segment-bodies.js";
import {
  assembleSegment,
  buildMshSegment,
  repField,
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
 * Typed PID content for {@link buildDft}: the same shape every family shares.
 *
 * @example
 * ```ts
 * import type { DftPatient } from "@cosyte/hl7";
 * const patient: DftPatient = {
 *   identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" },
 *   accountNumber: { idNumber: "ACCT-1", identifierTypeCode: "AN" },
 * };
 * ```
 */
export type DftPatient = AdtPatient;

/**
 * A transaction amount (CP, composite price) for {@link buildDft}, supplied as
 * its typed parts. Every part is emitted **verbatim**: the price keeps the
 * precision the caller wrote, and the denomination is never inferred.
 *
 * @example
 * ```ts
 * import type { DftAmount } from "@cosyte/hl7";
 * const amount: DftAmount = { price: "150.00", denomination: "USD" };
 * ```
 */
export interface DftAmount {
  /** CP.1.1 Price quantity, e.g. `"150.00"`. Emitted verbatim, never a float. */
  readonly price?: string;
  /** CP.1.2 Price denomination, e.g. `"USD"` (ISO 4217). Never inferred. */
  readonly denomination?: string;
  /** CP.2 Price type (HL7 Table 0205, e.g. `"AP"` administrative price). */
  readonly priceType?: string;
}

/**
 * Typed FT1 (financial transaction) content for {@link buildDft}.
 *
 * @example
 * ```ts
 * import type { DftCharge } from "@cosyte/hl7";
 * const charge: DftCharge = {
 *   setId: "1",
 *   transactionDate: "20260801",
 *   transactionType: "CG",
 *   transactionCode: { identifier: "80053", text: "Metabolic panel" },
 *   quantity: "1",
 *   amountExtended: { price: "150.00", denomination: "USD" },
 *   diagnoses: [{ identifier: "E11.9" }],
 * };
 * ```
 */
export interface DftCharge {
  /** FT1-1 Set ID. */
  readonly setId?: string;
  /** FT1-2 Transaction ID. */
  readonly transactionId?: string;
  /** FT1-4 Transaction Date. */
  readonly transactionDate?: TS | string;
  /** FT1-5 Transaction Posting Date. */
  readonly postingDate?: TS | string;
  /** FT1-6 Transaction Type (HL7 Table 0017: `CG`, `CD`, `PY`, `AJ`). */
  readonly transactionType?: string;
  /** FT1-7 Transaction Code: the institution charge or procedure code. */
  readonly transactionCode?: CWE;
  /** FT1-10 Transaction Quantity (emitted verbatim: the caller owns its precision). */
  readonly quantity?: NM | number | string;
  /** FT1-11 Transaction Amount, Extended. */
  readonly amountExtended?: DftAmount;
  /** FT1-12 Transaction Amount, Unit. */
  readonly amountUnit?: DftAmount;
  /** FT1-19 Diagnosis Code(s): the billing diagnosis linkage, repeating. */
  readonly diagnoses?: CWE | readonly CWE[];
}

/**
 * Input for {@link buildDft}: the MSH envelope plus the typed segment bodies.
 *
 * @example
 * ```ts
 * import type { BuildDftInit } from "@cosyte/hl7";
 * const init: BuildDftInit = {
 *   sendingApp: "CLINIC",
 *   receivingApp: "BILLING",
 *   patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
 *   charges: [{ transactionType: "CG", amountExtended: { price: "150.00", denomination: "USD" } }],
 * };
 * ```
 */
export interface BuildDftInit extends MessageEnvelope {
  /** PID content. **Required**: never fabricated. */
  readonly patient: DftPatient;
  /** FT1 content. **Required, non-empty**: a DFT with no transaction is a typed error. */
  readonly charges: readonly DftCharge[];
  /** PV1 content. Optional; a PV1 is emitted only when supplied. */
  readonly visit?: AdtVisit;
  /** EVN content (EVN-1 is the trigger event; EVN-2/6 optional). */
  readonly event?: AdtEvent;
}

/**
 * A CP amount as an ordered component list: CP.1 is a nested MO
 * (price & denomination), CP.2 the price type. `undefined` yields an absent
 * field. @internal
 */
function amountField(amount: DftAmount | undefined): RawField | undefined {
  if (amount === undefined) return undefined;
  return structuredField([
    [amount.price ?? "", amount.denomination ?? ""],
    [amount.priceType ?? ""],
  ]);
}

/** One FT1 segment from typed charge content. @internal */
function ft1Segment(charge: DftCharge): RawSegment {
  return assembleSegment(
    "FT1",
    new Map<number, RawField | undefined>([
      [1, charge.setId !== undefined ? scalarField(charge.setId) : undefined],
      [2, charge.transactionId !== undefined ? scalarField(charge.transactionId) : undefined],
      [
        4,
        charge.transactionDate !== undefined
          ? encodeComposite("TS", charge.transactionDate)
          : undefined,
      ],
      [5, charge.postingDate !== undefined ? encodeComposite("TS", charge.postingDate) : undefined],
      [6, charge.transactionType !== undefined ? scalarField(charge.transactionType) : undefined],
      [
        7,
        charge.transactionCode !== undefined
          ? encodeComposite("CWE", charge.transactionCode)
          : undefined,
      ],
      [10, charge.quantity !== undefined ? encodeComposite("NM", charge.quantity) : undefined],
      [11, amountField(charge.amountExtended)],
      [12, amountField(charge.amountUnit)],
      [19, charge.diagnoses !== undefined ? repField("CWE", charge.diagnoses) : undefined],
    ]),
  );
}

/**
 * Build a spec-clean DFT message for `event` (the MSH-9.2 trigger, e.g.
 * `"P03"` post detail financial transaction, `"P11"` post detail financial
 * transactions with a new appointment) from typed inputs.
 *
 * The result is a real {@link Hl7Message}: `msg.toString()` serialises it,
 * `parseHL7(msg.toString())` round-trips with zero warnings, and
 * `msg.charges()` reads back the transactions supplied, in the order supplied.
 *
 * @param event - the DFT trigger event (MSH-9.2). Required, non-empty.
 * @param init - the MSH envelope + typed PID/FT1 content. `patient` and a
 *   non-empty `charges` list are required.
 * @throws TypeError when `event` is empty, when `init` is not an object, when
 *   `patient` is absent, or when `charges` is absent or empty.
 *
 * @example
 * ```ts
 * import { buildDft, parseHL7 } from "@cosyte/hl7";
 * const msg = buildDft("P03", {
 *   sendingApp: "CLINIC",
 *   receivingApp: "BILLING",
 *   patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
 *   charges: [
 *     {
 *       setId: "1",
 *       transactionDate: "20260801",
 *       transactionType: "CG",
 *       transactionCode: { identifier: "80053", text: "Metabolic panel" },
 *       quantity: "1",
 *       amountExtended: { price: "150.00", denomination: "USD" },
 *       diagnoses: [{ identifier: "E11.9" }],
 *     },
 *   ],
 * });
 * const round = parseHL7(msg.toString());
 * round.warnings.length;                          // 0
 * round.charges()[0]?.transactionCode?.identifier; // "80053"
 * round.charges()[0]?.amountExtended;              // "150.00&USD": wire text, never a number
 * ```
 */
export function buildDft(event: string, init: BuildDftInit): Hl7Message {
  assertTriggerEvent("buildDft", "P03", event);
  assertTypedInit("buildDft", init);
  if (init.patient === undefined) {
    throw new TypeError(
      `buildDft: DFT^${event} requires \`patient\` (PID). A financial transaction message is ` +
        "never emitted with a fabricated subject.",
    );
  }
  if (
    (init.charges as readonly DftCharge[] | undefined) === undefined ||
    init.charges.length === 0
  ) {
    throw new TypeError(
      `buildDft: DFT^${event} requires at least one \`charges\` entry (FT1). A financial ` +
        "transaction message with no transaction is a typed error, never a fabricated charge.",
    );
  }

  const segments: RawSegment[] = [
    buildMshSegment(`DFT^${event}`, init),
    evnSegment(event, init.event),
    pidSegment(init.patient),
  ];
  if (init.visit !== undefined) segments.push(pv1Segment(init.visit));
  for (const charge of init.charges) segments.push(ft1Segment(charge));

  assertRequiredContent(
    "buildDft",
    "DFT",
    event,
    new Set(segments.map((s) => s.name)),
    new Map([
      ["PID", "patient"],
      ["FT1", "charges"],
      ["PV1", "visit"],
    ]),
  );

  return new Hl7Message({
    segments,
    encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
    version: init.version ?? "2.5",
    warnings: [],
  });
}
