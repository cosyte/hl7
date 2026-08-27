/**
 * `buildOrm`: author a spec-clean HL7 v2 **ORM^O01** (general order) message
 * from typed inputs. The conservative-emit mirror of the read helper
 * `msg.orders()`: a caller supplies a typed patient and one or more typed
 * orders, and `buildOrm` assembles `MSH + PID + [ORC OBR [OBX…]]…` with correct
 * `^`/`&`/`~` structure via the encode-safe path: never hand-assembling
 * delimiters, never injecting one.
 *
 * **What the structure net can and cannot vouch for here.** The registry entry
 * behind `ORM^O01` is a retained transcription: the vendored publication names
 * no structure for this message type, and its only expectation is the common
 * order segment `ORC`. A zero-warning ORM therefore proves less than a
 * zero-warning `SIU` or `MDM` does, which is why every order also carries its
 * `OBR`: the order group the read side walks is `ORC` then `OBR`, and the
 * round trip through `msg.orders()` is the real check on this builder.
 *
 * **Never fabricate.** Only values the caller supplies are emitted. `patient`
 * and at least one `orders` entry are **required**: an order message with no
 * subject or no order is a typed `TypeError`.
 *
 * Spec traceability: HL7 v2 Ch. 4 (order entry: ORC/OBR), Ch. 2 datatypes.
 * Zero runtime deps.
 */

import { Hl7Message } from "../model/message.js";
import { DEFAULT_ENCODING_CHARACTERS } from "../parser/delimiters.js";
import type { RawField, RawSegment } from "../parser/types.js";

import type { AdtPatient } from "./build-adt.js";
import type { OruObservation, OruOrder } from "./build-oru.js";
import { encodeComposite } from "./encode-composite.js";
import { obxSegment, pidSegment } from "./segment-bodies.js";
import {
  assembleSegment,
  buildMshSegment,
  repField,
  scalarField,
  type MessageEnvelope,
} from "./segment-fields.js";
import { assertRequiredContent, assertTypedInit } from "./supported-messages.js";

/**
 * Typed PID content for {@link buildOrm}: the same shape every family shares.
 *
 * @example
 * ```ts
 * import type { OrmPatient } from "@cosyte/hl7";
 * const patient: OrmPatient = { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } };
 * ```
 */
export type OrmPatient = AdtPatient;

/**
 * Typed OBX content for {@link buildOrm}: an observation carried with the order.
 *
 * @example
 * ```ts
 * import type { OrmObservation } from "@cosyte/hl7";
 * const note: OrmObservation = { setId: "1", valueType: "ST", value: "Fasting" };
 * ```
 */
export type OrmObservation = OruObservation;

/**
 * Typed order content for {@link buildOrm}: the OBR order detail every typed
 * builder shares, plus the ORC control information and any OBX children.
 *
 * @example
 * ```ts
 * import type { OrmOrder } from "@cosyte/hl7";
 * const order: OrmOrder = {
 *   orderControl: "NW",
 *   setId: "1",
 *   placerOrderNumber: "PL-1001",
 *   universalServiceId: { identifier: "CBC", text: "Complete Blood Count" },
 *   orderingProvider: { idNumber: "9990", familyName: "Welby" },
 * };
 * ```
 */
export interface OrmOrder extends OruOrder {
  /**
   * ORC-1 Order Control (HL7 Table 0119: `NW` new order, `CA` cancel, `XO`
   * change, …). An ORC is emitted for every order regardless, because the
   * published expectation for this message type is exactly that segment; this
   * value fills ORC-1 when supplied and is never defaulted.
   */
  readonly orderControl?: string;
  /** ORC-2 Placer Order Number. Defaults to nothing: never copied from OBR-2. */
  readonly orcPlacerOrderNumber?: string;
  /** ORC-3 Filler Order Number. Defaults to nothing: never copied from OBR-3. */
  readonly orcFillerOrderNumber?: string;
  /** OBX children of this order, in the order supplied. */
  readonly observations?: readonly OrmObservation[];
}

/**
 * Input for {@link buildOrm}: the MSH envelope plus the typed segment bodies.
 *
 * @example
 * ```ts
 * import type { BuildOrmInit } from "@cosyte/hl7";
 * const init: BuildOrmInit = {
 *   sendingApp: "EHR",
 *   receivingApp: "LAB",
 *   patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
 *   orders: [{ orderControl: "NW", universalServiceId: { identifier: "CBC" } }],
 * };
 * ```
 */
export interface BuildOrmInit extends MessageEnvelope {
  /** PID content. **Required**: never fabricated. */
  readonly patient: OrmPatient;
  /** ORC/OBR content. **Required, non-empty**: an ORM with no order is a typed error. */
  readonly orders: readonly OrmOrder[];
}

/** One ORC segment from typed order-control content. @internal */
function orcSegment(order: OrmOrder): RawSegment {
  return assembleSegment(
    "ORC",
    new Map<number, RawField | undefined>([
      [1, order.orderControl !== undefined ? scalarField(order.orderControl) : undefined],
      [
        2,
        order.orcPlacerOrderNumber !== undefined
          ? scalarField(order.orcPlacerOrderNumber)
          : undefined,
      ],
      [
        3,
        order.orcFillerOrderNumber !== undefined
          ? scalarField(order.orcFillerOrderNumber)
          : undefined,
      ],
    ]),
  );
}

/** One OBR segment from typed order-detail content. @internal */
function obrSegment(order: OrmOrder): RawSegment {
  return assembleSegment(
    "OBR",
    new Map<number, RawField | undefined>([
      [1, order.setId !== undefined ? scalarField(order.setId) : undefined],
      [2, order.placerOrderNumber !== undefined ? scalarField(order.placerOrderNumber) : undefined],
      [3, order.fillerOrderNumber !== undefined ? scalarField(order.fillerOrderNumber) : undefined],
      [
        4,
        order.universalServiceId !== undefined
          ? encodeComposite("CWE", order.universalServiceId)
          : undefined,
      ],
      [
        7,
        order.observationDateTime !== undefined
          ? encodeComposite("TS", order.observationDateTime)
          : undefined,
      ],
      [
        16,
        order.orderingProvider !== undefined ? repField("XCN", order.orderingProvider) : undefined,
      ],
      [25, order.resultStatus !== undefined ? scalarField(order.resultStatus) : undefined],
    ]),
  );
}

/**
 * Build a spec-clean `ORM^O01` general-order message from typed inputs.
 *
 * The result is a real {@link Hl7Message}: `msg.toString()` serialises it,
 * `parseHL7(msg.toString())` round-trips with zero warnings, and `msg.orders()`
 * reads back the orders supplied, in the order supplied.
 *
 * @param init - the MSH envelope + typed PID/ORC/OBR content. `patient` and a
 *   non-empty `orders` list are required.
 * @throws TypeError when `init` is not an object, when `patient` is absent, or
 *   when `orders` is absent or empty.
 *
 * @example
 * ```ts
 * import { buildOrm, parseHL7 } from "@cosyte/hl7";
 * const msg = buildOrm({
 *   sendingApp: "EHR",
 *   receivingApp: "LAB",
 *   patient: { identifiers: { idNumber: "MRN001", identifierTypeCode: "MR" } },
 *   orders: [
 *     {
 *       orderControl: "NW",
 *       setId: "1",
 *       placerOrderNumber: "PL-1001",
 *       universalServiceId: { identifier: "CBC", text: "Complete Blood Count" },
 *       orderingProvider: { idNumber: "9990", familyName: "Welby" },
 *     },
 *   ],
 * });
 * const round = parseHL7(msg.toString());
 * round.warnings.length;                              // 0
 * round.orders()[0]?.orderControl;                    // "NW"
 * round.orders()[0]?.universalServiceId?.identifier;  // "CBC"
 * ```
 */
export function buildOrm(init: BuildOrmInit): Hl7Message {
  assertTypedInit("buildOrm", init);
  if (init.patient === undefined) {
    throw new TypeError(
      "buildOrm: ORM^O01 requires `patient` (PID). An order message is never emitted with a " +
        "fabricated subject.",
    );
  }
  if ((init.orders as readonly OrmOrder[] | undefined) === undefined || init.orders.length === 0) {
    throw new TypeError(
      "buildOrm: ORM^O01 requires at least one `orders` entry (ORC/OBR). An order message with " +
        "no order is a typed error, never a fabricated order.",
    );
  }

  const segments: RawSegment[] = [buildMshSegment("ORM^O01", init), pidSegment(init.patient)];
  for (const order of init.orders) {
    segments.push(orcSegment(order), obrSegment(order));
    for (const obs of order.observations ?? []) segments.push(obxSegment(obs));
  }

  assertRequiredContent(
    "buildOrm",
    "ORM",
    "O01",
    new Set(segments.map((s) => s.name)),
    new Map([
      ["ORC", "orders"],
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
