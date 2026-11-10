/**
 * An escalated warning keeps its own code. Under `{ strict: true }` a Tier-2
 * warning is thrown as an `Hl7ParseError` whose `code` is the warning's code,
 * not a member of `FATAL_CODES`, so `Hl7ParseError.code` is typed
 * `FatalCode | WarningCode`. The runtime cases pin the behavior; the type-level
 * cases are checked by `pnpm typecheck`, which compiles this file.
 */

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  FATAL_CODES,
  Hl7ParseError,
  parseHL7,
  WARNING_CODES,
  type FatalCode,
  type WarningCode,
} from "../src/index.js";

/** A synthetic message with an unknown segment: a warning when lenient. */
const UNKNOWN_SEGMENT_INPUT = "MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rZZZ|1";

/** A synthetic message wrapped in MLLP framing: a warning when lenient. */
const FRAMED_INPUT = "\x0bMSH|^~\\&|A|B|C|D|20260101||ACK|1|P|2.5\rMSA|AA|1\x1c\r";

function caught(run: () => unknown): Hl7ParseError {
  try {
    run();
  } catch (err) {
    if (err instanceof Hl7ParseError) return err;
    throw err;
  }
  throw new Error("expected parseHL7 to throw");
}

describe("Hl7ParseError.code for an escalated warning", () => {
  it.each([
    [UNKNOWN_SEGMENT_INPUT, WARNING_CODES.UNKNOWN_SEGMENT],
    [FRAMED_INPUT, WARNING_CODES.MLLP_FRAMING_STRIPPED],
  ])("strict mode throws the warning's own code, outside FATAL_CODES", (input, code) => {
    const err = caught(() => parseHL7(input, { strict: true }));
    expect(err.code).toBe(code);
    expect(err.code in FATAL_CODES).toBe(false);
    expect(err.code in WARNING_CODES).toBe(true);
  });

  it("the same inputs warn with that code when lenient", () => {
    expect(parseHL7(UNKNOWN_SEGMENT_INPUT).warnings.map((w) => w.code)).toContain(
      WARNING_CODES.UNKNOWN_SEGMENT,
    );
    expect(parseHL7(FRAMED_INPUT).warnings.map((w) => w.code)).toContain(
      WARNING_CODES.MLLP_FRAMING_STRIPPED,
    );
  });

  it("a fatal still throws a fatal code, in either mode", () => {
    for (const strict of [false, true]) {
      const err = caught(() => parseHL7("", { strict }));
      expect(err.code).toBe(FATAL_CODES.EMPTY_INPUT);
      expect(err.code in FATAL_CODES).toBe(true);
    }
  });

  it("is typed FatalCode | WarningCode", () => {
    const err = caught(() => parseHL7(UNKNOWN_SEGMENT_INPUT, { strict: true }));
    expectTypeOf(err.code).toEqualTypeOf<FatalCode | WarningCode>();
    // @ts-expect-error: an escalated warning's code is not a FatalCode, so the type must not claim it is.
    const fatal: FatalCode = err.code;
    expect(fatal).toBe(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("err.code in FATAL_CODES tells a fatal from an escalated warning", () => {
    function kind(err: Hl7ParseError): string {
      return err.code in FATAL_CODES ? "fatal" : "escalated warning";
    }
    expect(kind(caught(() => parseHL7(UNKNOWN_SEGMENT_INPUT, { strict: true })))).toBe(
      "escalated warning",
    );
    expect(kind(caught(() => parseHL7("")))).toBe("fatal");
  });
});
