/**
 * Property: an animal patient's species, breed, strain and production class (PID-35 to PID-38)
 * survive build, serialize, parse and read. Each is drawn from the public generators at
 * `@cosyte/hl7/arbitraries` or left out; a given one reads back equal, a left-out one reads back
 * absent, and the administrative sex beside them reads back as it was given. The values carry
 * every delimiter, line breaks and characters outside ASCII, so the escape path is exercised.
 * Synthetic only.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildAdt, parseHL7, type AdtPatient } from "../../src/index.js";
import { breed, productionClass, species, strain, value } from "../../src/arbitraries/index.js";
import { checkProperty } from "../_helpers/property.js";

/** The animal fields and sex of a PID input, each present or left out. */
const animalPatient: fc.Arbitrary<AdtPatient> = fc
  .record(
    {
      species: species(),
      breed: breed(),
      strain: strain(),
      productionClass: productionClass(),
      administrativeSex: value({ maxLength: 3 }),
    },
    { requiredKeys: [] },
  )
  .map((parts) => ({ ...parts, identifiers: { idNumber: "TESTPET" } }));

describe("property: animal patient fields round-trip", () => {
  it("build, serialize, parse and read give back each given field, and no other", () => {
    checkProperty(
      fc.property(animalPatient, (input) => {
        const text = buildAdt("A01", { controlId: "C1", timestamp: "20260102", patient: input });
        const msg = parseHL7(text.toString());
        const read = msg.patient;
        expect(msg.warnings).toEqual([]);
        expect(read?.species).toEqual(input.species);
        expect(read?.breed).toEqual(input.breed);
        expect(read?.strain).toBe(input.strain);
        expect(read?.productionClass).toEqual(input.productionClass);
        expect(read?.sex).toBe(input.administrativeSex);
        for (const key of ["species", "breed", "strain", "productionClass"] as const) {
          expect(read !== undefined && key in read).toBe(input[key] !== undefined);
        }
      }),
    );
  });
});
