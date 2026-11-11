import { afterEach, describe, expect, it, vi } from "vitest";

import type * as Hl7 from "../src/index.js";
import type * as Schemas from "../src/parser/generated/message-structure-schemas.js";

/**
 * What importing the package does before a caller asks it for anything. A cold import of the built
 * package is held to a time budget on a CI runner (`pnpm check:cold-import`); these cases hold the
 * three changes that brought it there, each of which a reading alone could lose without saying
 * which:
 *
 * - no `localeCompare` runs at load: the first one in a process builds an ICU collator;
 * - `node:crypto` is not imported: the message control ID draws from the Web Crypto global on its
 *   first use instead;
 * - the published structure schemas, the largest generated table, are parsed on the first
 *   structure validation rather than at import.
 *
 * Every case imports a fresh copy of `src/index.ts`, so nothing an earlier case loaded counts.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("node:crypto");
  vi.doUnmock("../src/parser/generated/message-structure-schemas.js");
  vi.resetModules();
});

/** A fresh import of the package source. */
async function importFresh(): Promise<typeof Hl7> {
  vi.resetModules();
  return import("../src/index.js");
}

describe("importing the package", () => {
  it("runs no localeCompare", async () => {
    const collate = vi.spyOn(String.prototype, "localeCompare");
    await importFresh();
    expect(collate).not.toHaveBeenCalled();
  });

  it("does not import node:crypto", async () => {
    const loaded = vi.fn();
    vi.doMock("node:crypto", async (original) => {
      loaded();
      return original();
    });
    await importFresh();
    expect(loaded).not.toHaveBeenCalled();
  });

  it("parses the structure schemas on the first validation, and only once", async () => {
    const parsed = vi.fn();
    vi.doMock("../src/parser/generated/message-structure-schemas.js", async (original) => {
      const real = await original<typeof Schemas>();
      return {
        generatedStructureSchemas: () => {
          parsed();
          return real.generatedStructureSchemas();
        },
      };
    });
    const hl7 = await importFresh();
    expect(parsed).not.toHaveBeenCalled();

    const raw = [
      "MSH|^~\\&|SEND|FAC|RECV|FAC|20250102||ADT^A01|MSGID1|P|2.5.1",
      "EVN|A01|20250102",
      "PID|1||FAKE000001^^^HOSP^MR||Doe^Jane",
      "PV1|1|I",
    ].join("\r");
    const first = hl7.validateMessageStructure(hl7.parseHL7(raw));
    const second = hl7.validateMessageStructure(hl7.parseHL7(raw));
    expect(first.validated).toBe(true);
    expect(second.structureId).toBe(first.structureId);
    expect(parsed).toHaveBeenCalledTimes(1);
  });
});

describe("compareCodeUnits", () => {
  it("orders by UTF-16 code unit and calls equal strings equal", async () => {
    const { compareCodeUnits } = await import("../src/parser/code-order.js");
    expect(compareCodeUnits("ADT", "ORU")).toBe(-1);
    expect(compareCodeUnits("ORU", "ADT")).toBe(1);
    expect(compareCodeUnits("A01", "A01")).toBe(0);
    // A prefix sorts first, as it does under a collator.
    expect(compareCodeUnits("ACK", "ACK^A01")).toBe(-1);
  });
});

describe("the orders sorted at load", () => {
  /** The collated order the lists were sorted in before, for comparison. */
  const collated = (values: readonly string[]): string[] =>
    [...values].sort((a, b) => a.localeCompare(b, "en"));

  it("keep the overlay keys in the order a collator gives", async () => {
    const { SUPPORTED_OVERLAY_MESSAGES } = await importFresh();
    const keys = SUPPORTED_OVERLAY_MESSAGES.map((m) => m.key);
    expect(keys).toEqual(collated(keys));
  });

  it("keep the builder pairs in the order a collator gives", async () => {
    const { SUPPORTED_BUILDER_MESSAGES } = await importFresh();
    const pairs = SUPPORTED_BUILDER_MESSAGES.map((m) => [m.messageCode, m.triggerEvent] as const);
    const expected = [...pairs].sort(([codeA, eventA], [codeB, eventB]) =>
      codeA === codeB ? eventA.localeCompare(eventB) : codeA.localeCompare(codeB),
    );
    expect(pairs).toEqual(expected);
  });
});
