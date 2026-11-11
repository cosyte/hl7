/**
 * `Hl7Message.toBytes()` on a runtime without `TextDecoder` for a set, which each case here stubs
 * away. All fixtures are synthetic.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { Hl7EncodeError, parseHL7 } from "../src/index.js";

/** An ADT^A01 header declaring `msh18`, then one NTE carrying `note`. */
function messageText(msh18: string, note: string): string {
  return (
    `MSH|^~\\&|SYNTH|LAB|SYNTH|WARD|20260101||ADT^A01|SYN1|P|2.5||||||${msh18}\r` +
    `NTE|1||${note}\r`
  );
}

/** Make every `new TextDecoder(...)` throw, as on a build without the label. */
function withoutTextDecoder(): void {
  vi.stubGlobal(
    "TextDecoder",
    class {
      public constructor() {
        throw new RangeError("no such encoding");
      }
    },
  );
}

describe("toBytes: a runtime without a set's decoder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes windows-1252 from its own table, not TextDecoder", () => {
    withoutTextDecoder();
    const out = parseHL7(messageText("WINDOWS-1252", "Copay 12 €")).toBytes();
    expect(out.at(-2)).toBe(0x80);
  });

  it("refuses a set it has no table for with UNSUPPORTED_CHARSET rather than guessing", () => {
    withoutTextDecoder();
    const msg = parseHL7(messageText("8859/16", "Ł"));
    let err: unknown;
    try {
      msg.toBytes();
    } catch (caught) {
      err = caught;
    }
    expect(err).toBeInstanceOf(Hl7EncodeError);
    const refusal = err as Hl7EncodeError;
    expect(refusal.code).toBe("UNSUPPORTED_CHARSET");
    expect(refusal.position).toEqual({ segmentIndex: 0, fieldIndex: 18 });
    expect(refusal.charset).toBe("8859/16");
    expect(refusal.message).toBe(
      'Cannot write character set "8859/16": this runtime has no table for it.',
    );
  });
});
