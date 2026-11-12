import type { CWE } from "@cosyte/hl7";
import fc from "fast-check";
import type { Arbitrary } from "fast-check";

import { value } from "./tree.js";

/**
 * A coded value with the parts a reader most often sees filled (identifier, text, coding system
 * and original text), each present or absent at random and at least one present, so it never
 * encodes to an empty field. The leaves are {@link value}s, delimiters and line breaks included,
 * so writing one needs escape sequences.
 *
 * @internal
 */
function codedValue(): Arbitrary<CWE> {
  const part = value();
  return fc
    .record(
      { identifier: part, text: part, nameOfCodingSystem: part, originalText: part },
      { requiredKeys: [] },
    )
    .filter((code) => Object.keys(code).length > 0);
}

/**
 * Generate a PID-35 Species Code: a random coded value, never a real species code.
 *
 * @returns An arbitrary of the code, the shape `Patient.species` reads and `AdtPatient.species`
 * takes.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { species } from "@cosyte/hl7/arbitraries";
 *
 * const [code] = fc.sample(species(), 1);
 * // code is a CWE with at least one part, such as { identifier: "Q7", text: "a^b" }
 * ```
 */
export function species(): Arbitrary<CWE> {
  return codedValue();
}

/**
 * Generate a PID-36 Breed Code: a random coded value, never a real breed code.
 *
 * @returns An arbitrary of the code, the shape `Patient.breed` reads and `AdtPatient.breed` takes.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { breed } from "@cosyte/hl7/arbitraries";
 *
 * const [code] = fc.sample(breed(), 1);
 * // code is a CWE with at least one part
 * ```
 */
export function breed(): Arbitrary<CWE> {
  return codedValue();
}

/**
 * Generate a PID-37 Strain: one random decoded value, the free text `Patient.strain` reads and
 * `AdtPatient.strain` takes.
 *
 * @returns An arbitrary of the strain text.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { strain } from "@cosyte/hl7/arbitraries";
 *
 * const [text] = fc.sample(strain(), 1);
 * // text is a non-empty string, such as "x&Y"
 * ```
 */
export function strain(): Arbitrary<string> {
  return value();
}

/**
 * Generate a PID-38 Production Class Code: a random coded value, never a real class code.
 *
 * @returns An arbitrary of the code, the shape `Patient.productionClass` reads and
 * `AdtPatient.productionClass` takes.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { productionClass } from "@cosyte/hl7/arbitraries";
 *
 * const [code] = fc.sample(productionClass(), 1);
 * // code is a CWE with at least one part
 * ```
 */
export function productionClass(): Arbitrary<CWE> {
  return codedValue();
}
