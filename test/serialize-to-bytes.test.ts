/**
 * `Hl7Message.toBytes()`: a message written as bytes in the character set it declares in MSH-18.
 *
 * Covers the byte round trip for each kind of set the parser reads (UTF-8 and its ASCII default,
 * byte-exact 8859/1, windows-1252, the strictly decoded ISO 8859 sets, and the sets kept as a
 * latin1 byte reading), the refusal of a character the set cannot hold, and the `charset` option.
 *
 * All fixtures are synthetic. Byte streams are built as Buffers here, since a non-UTF-8 byte stream
 * cannot be stored losslessly in a UTF-8 text fixture.
 */

import { Buffer } from "node:buffer";

import { afterEach, describe, expect, it, vi } from "vitest";

import { Hl7EncodeError, WARNING_CODES, parseHL7 } from "../src/index.js";

/** An ADT^A01 header declaring `msh18` (omitted when empty), then `rest` segments. */
function messageText(msh18: string, ...rest: string[]): string {
  const msh = `MSH|^~\\&|SYNTH|LAB|SYNTH|WARD|20260101||ADT^A01|SYN1|P|2.5||||||${msh18}`;
  return [msh, ...rest].join("\r") + "\r";
}

/** The message bytes with PID-5.1 set to `name`, raw bytes in no particular set. */
function messageBytes(msh18: string, name: readonly number[]): Buffer {
  const head = Buffer.from(
    messageText(msh18).slice(0, -1) + "\rPID|1||SYN123^^^SYN^MR||",
    "latin1",
  );
  return Buffer.concat([head, Buffer.from(name), Buffer.from("^Jane\r", "latin1")]);
}

/** The error `fn` throws, or a failed assertion when it does not throw one. */
function caught(fn: () => unknown): Hl7EncodeError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(Hl7EncodeError);
    return err as Hl7EncodeError;
  }
  throw new Error("expected an Hl7EncodeError");
}

describe("toBytes: a message leaves in the set it declares", () => {
  it("writes an 8859/1 message back byte for byte, where UTF-8 would change it", () => {
    // 0xE9 is e-acute in Latin-1, 0x85 a C1 control the set keeps.
    const bytes = messageBytes("8859/1", [0x52, 0x65, 0x6e, 0xe9, 0x85, 0x65]);
    const msg = parseHL7(bytes);
    expect(msg.toBytes()).toEqual(bytes);
    expect(Buffer.from(msg.toString(), "utf8")).not.toEqual(bytes);
  });

  it("writes an 8859/1 message read from a string in that set", () => {
    const msg = parseHL7(messageText("8859/1", "PID|1||SYN123||Renée^Jane"));
    const out = msg.toBytes();
    expect(out.includes(0xe9)).toBe(true);
    expect(out.length).toBe(msg.toString().length);
  });

  it("writes a declared UTF-8 message back byte for byte", () => {
    const text = messageText("UNICODE UTF-8", "PID|1||SYN123||Zörb^山田");
    const bytes = Buffer.from(text, "utf8");
    expect(parseHL7(bytes).toBytes()).toEqual(bytes);
  });

  it("writes a blank MSH-18 as UTF-8, the superset the reader decodes it with", () => {
    const text = messageText("", "PID|1||SYN123||Zörb^Jane");
    const bytes = Buffer.from(text, "utf8");
    expect(parseHL7(bytes).toBytes()).toEqual(bytes);
  });

  it("writes windows-1252 with the euro sign at 0x80", () => {
    const bytes = messageBytes("WINDOWS-1252", [0x80, 0x31, 0x30, 0x81, 0x9f]);
    const msg = parseHL7(bytes);
    expect(msg.toBytes()).toEqual(bytes);
    msg.setField("PID.5.1", "€5");
    const out = msg.toBytes();
    expect(out.subarray(out.indexOf(0x80), out.indexOf(0x80) + 2)).toEqual(Buffer.of(0x80, 0x35));
  });

  it("writes an ISO 8859 set decoded by the parser, 8859/2 here", () => {
    // 0xA3 is L-stroke in 8859/2 and the pound sign in 8859/1.
    const bytes = messageBytes("8859/2", [0xa3, 0xf3, 0x64, 0xbf]);
    const msg = parseHL7(bytes);
    expect(msg.get("PID.5.1")).toBe("Łódż");
    expect(msg.toBytes()).toEqual(bytes);
  });

  it.each(["8859/9", "ISO IR87", "CP850"])(
    "writes %s, read as a latin1 byte reading, back byte for byte",
    (label) => {
      const bytes = messageBytes(label, [0x80, 0xd0, 0xfe, 0x41]);
      expect(parseHL7(bytes).toBytes()).toEqual(bytes);
    },
  );

  it("writes bytes the strict decode refused back as they arrived", () => {
    // 0xE9 alone is not UTF-8, so the reader kept the bytes as a latin1 reading and warned.
    const bytes = messageBytes("UNICODE UTF-8", [0x52, 0xe9, 0x65]);
    const msg = parseHL7(bytes);
    expect(msg.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNSUPPORTED_CHARSET);
    expect(msg.toBytes()).toEqual(bytes);
  });

  it("follows the charset option, as parseHL7 does", () => {
    const bytes = messageBytes("", [0x52, 0xe9, 0x65]);
    const msg = parseHL7(bytes, { charset: "8859/1" });
    expect(msg.get("PID.5.1")).toBe("Rée");
    expect(msg.toBytes({ charset: "8859/1" })).toEqual(bytes);
    expect(msg.toBytes()).toEqual(Buffer.from(msg.toString(), "utf8"));
  });

  it("reads MSH-18's first repetition as the message's set", () => {
    const text = messageText("8859/1~ISO IR87", "PID|1||SYN123||Renée");
    expect(parseHL7(text).toBytes().includes(0xe9)).toBe(true);
  });

  it("writes UTF-8 when MSH stops before MSH-18", () => {
    const text = "MSH|^~\\&|SYNTH|LAB|SYNTH|WARD|20260101||ADT^A01|SYN1|P|2.5\rNTE|1||Zörb\r";
    expect(parseHL7(text).toBytes()).toEqual(Buffer.from(text, "utf8"));
  });

  it("writes a surrogate pair in UTF-8 as its four bytes", () => {
    const text = messageText("UNICODE UTF-8", "NTE|1||A😀B");
    expect(parseHL7(text).toBytes()).toEqual(Buffer.from(text, "utf8"));
  });

  it("returns a Buffer", () => {
    expect(Buffer.isBuffer(parseHL7(messageText("8859/1")).toBytes())).toBe(true);
  });
});

describe("toBytes: refuses a character the set cannot hold", () => {
  it("refuses the euro sign in 8859/1 and names where it is, not what it is", () => {
    const msg = parseHL7(messageText("8859/1", "NTE|1||Price€note"));
    const err = caught(() => msg.toBytes());
    expect(err.code).toBe("UNENCODABLE_CHARACTER");
    expect(err.charset).toBe("8859/1");
    expect(err.position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
    expect(err.message).toContain('"8859/1"');
    expect(err.message).not.toContain("Price");
    expect(err.message).not.toContain("€");
    expect(err.name).toBe("Hl7EncodeError");
  });

  it("counts MSH fields from MSH-1", () => {
    const msg = parseHL7(messageText("8859/1"));
    msg.setField("MSH.4", "ŁAB");
    expect(caught(() => msg.toBytes()).position).toEqual({ segmentIndex: 0, fieldIndex: 4 });
  });

  it("refuses a character 8859/2 does not hold", () => {
    const msg = parseHL7(messageText("8859/2", "NTE|1||Señal"));
    expect(caught(() => msg.toBytes()).position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
  });

  it("refuses a C1 control windows-1252 gives a character", () => {
    const msg = parseHL7(messageText("WINDOWS-1252", "NTE|1||A\u0080B"));
    expect(caught(() => msg.toBytes()).charset).toBe("WINDOWS-1252");
  });

  it("refuses a lone surrogate in UTF-8 rather than writing a replacement character", () => {
    const msg = parseHL7(messageText("UNICODE UTF-8", "NTE|1||A\ud800B"));
    const err = caught(() => msg.toBytes());
    expect(err.position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
    expect(err.charset).toBe("UTF-8");
  });

  it.each([
    ["a low surrogate alone", "A\udc00B"],
    ["a high surrogate before a non-surrogate", "A\ud800A"],
    ["a high surrogate at the end of a field", "AB\ud800"],
  ])("refuses %s in UTF-8", (_name, value) => {
    const msg = parseHL7(messageText("", `NTE|1||${value}`));
    expect(caught(() => msg.toBytes()).position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
  });

  it("refuses a character above U+00FF in a set kept as a byte reading", () => {
    const msg = parseHL7(messageText("ISO IR87", "NTE|1||山"));
    expect(caught(() => msg.toBytes()).charset).toBe("ISO IR87");
  });

  it("withholds an unrecognized label from the error", () => {
    const msg = parseHL7(messageText("SYNTH-SET", "NTE|1||山"));
    const err = caught(() => msg.toBytes());
    expect(err.charset).toBe("<withheld>");
    expect(err.message).not.toContain("SYNTH-SET");
  });

  it("refuses the option's set too", () => {
    const msg = parseHL7(messageText("", "NTE|1||Ł"));
    expect(caught(() => msg.toBytes({ charset: "8859/1" })).charset).toBe("8859/1");
  });
});

describe("toBytes: a runtime without the set's decoder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses with UNSUPPORTED_CHARSET rather than guessing", () => {
    vi.stubGlobal(
      "TextDecoder",
      class {
        public constructor() {
          throw new RangeError("no such encoding");
        }
      },
    );
    const msg = parseHL7(messageText("8859/16", "NTE|1||Ł"));
    const err = caught(() => msg.toBytes());
    expect(err.code).toBe("UNSUPPORTED_CHARSET");
    expect(err.position).toEqual({ segmentIndex: 0, fieldIndex: 18 });
  });
});
