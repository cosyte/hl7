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

import { describe, expect, it } from "vitest";

import {
  Hl7EncodeError,
  WARNING_CODES,
  buildMessage,
  parseHL7,
  readMessages,
} from "../src/index.js";

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
    const bytes = messageBytes("8859/1", [0x52, 0x65, 0x6e, 0xe9, 0x85, 0x65, 0xff]);
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
    const bytes = messageBytes("8859/2", [0xa3, 0xf3, 0x64, 0xbf, 0xff]);
    const msg = parseHL7(bytes);
    expect(msg.get("PID.5.1")?.codePointAt(0)).toBe(0x0141);
    expect(msg.get("PID.5.1")?.codePointAt(4)).toBe(0x02d9);
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
    const text = messageText("UNICODE UTF-8~8859/1", "PID|1||SYN123||Renée");
    expect(parseHL7(text).toBytes()).toEqual(Buffer.from(text, "utf8"));
  });

  it("reads MSH-18 from MSH only, not from a later segment's eighteenth field", () => {
    const text =
      "MSH|^~\\&|SYNTH|LAB|SYNTH|WARD|20260101||ADT^A01|SYN1|P|2.5\r" +
      "NTE|1||Zörb" +
      "|".repeat(14) +
      "8859/1\r";
    expect(parseHL7(text).toBytes()).toEqual(Buffer.from(text, "utf8"));
  });

  it("writes an 8859/3 message, a set with bytes it leaves undefined", () => {
    // 0xA6 is H-circumflex in 8859/3; 0xA5 just before it is undefined there.
    const bytes = messageBytes("8859/3", [0xa6, 0x41, 0xff]);
    const msg = parseHL7(bytes);
    expect(msg.get("PID.5.1")?.codePointAt(0)).toBe(0x0124);
    expect(msg.toBytes()).toEqual(bytes);
  });

  it("writes a set it does not decode from a string when the text is ASCII", () => {
    const msg = parseHL7(messageText("ISO IR87", "NTE|1||Renee"));
    expect(msg.toBytes()).toEqual(Buffer.from(msg.toString(), "latin1"));
  });

  it("writes a byte reading back with no option even when the read disagreed with MSH-18", () => {
    // The ASCII default decodes as strict UTF-8, which 0xE9 alone fails: the reader warns twice.
    const bytes = messageBytes("UNICODE UTF-8", [0x52, 0xe9, 0x65]);
    const msg = parseHL7(bytes, { charset: "ASCII" });
    expect(msg.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining([WARNING_CODES.ENCODING_MISMATCH, WARNING_CODES.UNSUPPORTED_CHARSET]),
    );
    expect(msg.toBytes()).toEqual(bytes);
  });

  it("writes a byte reading back under an option naming the set MSH-18 declares", () => {
    const bytes = messageBytes("CP850", [0x52, 0xe9, 0x65]);
    expect(parseHL7(bytes).toBytes({ charset: " cp850 " })).toEqual(bytes);
  });

  it("writes the segments a byte reading kept as they arrived around an edited one", () => {
    const bytes = messageBytes("8859/9", [0x52, 0xdd, 0x65]);
    const msg = parseHL7(Buffer.concat([bytes, Buffer.from("NTE|1||old\r", "latin1")]));
    msg.setField("NTE.3", "new");
    expect(msg.toBytes()).toEqual(Buffer.concat([bytes, Buffer.from("NTE|1||new\r", "latin1")]));
  });

  it("writes a lazily read byte reading back, and after an edit to another segment", () => {
    const bytes = messageBytes("CP850", [0x52, 0xe9, 0x65]);
    const msg = parseHL7(Buffer.concat([bytes, Buffer.from("NTE|1||old\r", "latin1")]), {
      lazy: true,
    });
    expect(msg.toBytes()).toEqual(Buffer.concat([bytes, Buffer.from("NTE|1||old\r", "latin1")]));
    msg.removeSegment("NTE");
    expect(msg.toBytes()).toEqual(bytes);
  });

  it("writes UTF-8 for a message whose only warnings are not about its character set", () => {
    const text = messageText("UNICODE UTF-8", "NTE|1||Renée");
    const msg = parseHL7(`\u000b${text}\u001c\r`);
    expect(msg.warnings.map((w) => w.code)).toContain(WARNING_CODES.MLLP_FRAMING_STRIPPED);
    expect(msg.toBytes()).toEqual(Buffer.from(text, "utf8"));
  });

  it("reads a blank charset option as the ASCII default, written as UTF-8", () => {
    const text = messageText("UNICODE UTF-8", "NTE|1||Zörb");
    expect(parseHL7(text).toBytes({ charset: "  " })).toEqual(Buffer.from(text, "utf8"));
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

describe("toBytes: the limit of a byte reading, line-ending bytes", () => {
  // The bytes of a wide character whose code unit holds a line-ending byte: as UTF-16LE, U+010A is
  // 0x0A 0x01, U+0A0D is 0x0D 0x0A and U+010D is 0x0D 0x01. The reader keeps a UTF-16 message as a latin1 reading, but
  // it reads line endings before it frames segments, so these bytes do not come back as they came.
  const name = (bytes: readonly number[]): Buffer => messageBytes("UNICODE UTF-16", bytes);
  const at = (bytes: Buffer, byte: number): number =>
    bytes.indexOf(Buffer.concat([Buffer.from("SYN^MR||", "latin1"), Buffer.from([byte])])) + 8;

  it("writes a lone 0x0A byte back as 0x0D, and frames a segment on it", async () => {
    const bytes = name([0x0a, 0x01]);
    const msg = parseHL7(bytes);
    expect(msg.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNSUPPORTED_CHARSET);
    const expected = Buffer.from(bytes);
    expected[at(bytes, 0x0a)] = 0x0d;
    expect(msg.toBytes()).toEqual(expected);
    expect(msg.rawSegments.length).toBe(3);
    // readMessages reads the same bytes the same way.
    const read: (Buffer | false)[] = [];
    for await (const item of readMessages([bytes])) read.push(item.ok && item.message.toBytes());
    expect(read).toEqual([expected]);
  });

  it("writes a 0x0D 0x0A pair back as 0x0D alone, one byte shorter", () => {
    const bytes = name([0x0d, 0x0a]);
    const i = at(bytes, 0x0d);
    const expected = Buffer.concat([bytes.subarray(0, i + 1), bytes.subarray(i + 2)]);
    expect(parseHL7(bytes).toBytes()).toEqual(expected);
  });

  it("keeps a lone 0x0D byte, though it frames a segment on it too", () => {
    const bytes = name([0x0d, 0x01]);
    const msg = parseHL7(bytes);
    expect(msg.toBytes()).toEqual(bytes);
    expect(msg.rawSegments.length).toBe(3);
  });

  // The East Asian sets kept as a byte reading never put 0x0A or 0x0D inside a character: ISO-2022
  // uses ESC and 0x21 to 0x7E, GB 18030 0x30 to 0x39 and 0x40 to 0xFE past its lead byte, EUC 0xA1
  // to 0xFE, BIG-5 trail bytes 0x40 to 0x7E and 0xA1 to 0xFE. So the limit above does not reach them.
  it.each([
    ["ISO IR87", [0x1b, 0x24, 0x42, 0x30, 0x21, 0x1b, 0x28, 0x42]],
    ["ISO IR159", [0x1b, 0x24, 0x28, 0x44, 0x30, 0x21, 0x1b, 0x28, 0x42]],
    ["GB 18030-2000", [0xb0, 0xa1, 0x81, 0x30, 0x81, 0x30]],
    ["KS X 1001", [0xb0, 0xa1, 0xc8, 0xfe]],
    ["CNS 11643-1992", [0xa1, 0xa1, 0xc4, 0xa1]],
    ["BIG-5", [0xa4, 0x40, 0xa4, 0xa1]],
  ] as const)("writes a %s byte reading back byte for byte", async (set, chars) => {
    const bytes = messageBytes(set, chars);
    expect(bytes.includes(0x0a)).toBe(false);
    const msg = parseHL7(bytes);
    expect(msg.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNSUPPORTED_CHARSET);
    expect(msg.rawSegments.length).toBe(2);
    expect(msg.toBytes()).toEqual(bytes);
    const read: (Buffer | false)[] = [];
    for await (const item of readMessages([bytes])) read.push(item.ok && item.message.toBytes());
    expect(read).toEqual([bytes]);
  });
});

describe("toBytes: refuses a character the set cannot hold", () => {
  it("refuses the euro sign in 8859/1 and names where it is, not what it is", () => {
    // MSH ends in an empty MSH-19, so the field count starts after a separator.
    const msg = parseHL7(messageText("8859/1|", "NTE|1||Price€note"));
    expect(msg.toString().split("\r")[0]?.endsWith("|")).toBe(true);
    const err = caught(() => msg.toBytes());
    expect(err.code).toBe("UNENCODABLE_CHARACTER");
    expect(err.charset).toBe("8859/1");
    expect(err.position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
    expect(err.message).toBe(
      'Cannot write segment 1 field 3 in character set "8859/1": it holds a character the set has no byte for.',
    );
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
    expect(err.code).toBe("UNENCODABLE_CHARACTER");
    expect(err.position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
    expect(err.charset).toBe("UTF-8");
  });

  it.each([
    ["a low surrogate alone", "A\udc00B"],
    ["the last low surrogate alone", "A\udfffB"],
    ["a high surrogate before a non-surrogate", "A\ud800A"],
    ["a high surrogate at the end of a field", "AB\ud800"],
  ])("refuses %s in UTF-8", (_name, value) => {
    const msg = parseHL7(messageText("", `NTE|1||${value}`));
    const err = caught(() => msg.toBytes());
    expect(err.code).toBe("UNENCODABLE_CHARACTER");
    expect(err.position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
  });

  it("refuses a character above U+00FF in a set kept as a byte reading", () => {
    const msg = parseHL7(messageText("ISO IR87", "NTE|1||山"));
    const err = caught(() => msg.toBytes());
    expect(err.code).toBe("UNENCODABLE_CHARACTER");
    expect(err.charset).toBe("ISO IR87");
  });

  it("withholds an unrecognized label from the error", () => {
    const msg = parseHL7(messageText("SYNTH-SET", "NTE|1||山"));
    const err = caught(() => msg.toBytes());
    expect(err.charset).toBe("<withheld>");
    expect(err.message).not.toContain("SYNTH-SET");
  });

  it("refuses the replacement character in a set that has no byte for it", () => {
    const msg = parseHL7(messageText("8859/3", "NTE|1||A�B"));
    expect(caught(() => msg.toBytes()).code).toBe("UNENCODABLE_CHARACTER");
  });

  it("refuses a Latin-1 letter in 8859/9 read from a string rather than write its 8859/1 byte", () => {
    // 0xDD is I with a dot above in 8859/9, not Y-acute: the parser has no 8859/9 table.
    const msg = parseHL7(messageText("8859/9", "NTE|1||Ý"));
    const err = caught(() => msg.toBytes());
    expect(err.code).toBe("UNENCODABLE_CHARACTER");
    expect(err.charset).toBe("8859/9");
    expect(err.position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
  });

  it.each([
    ["8859/11", "NTE|1||é"],
    ["ISO IR87", "NTE|1||Renée"],
    ["SYNTH-SET", "NTE|1||é"],
  ])("refuses a character above U+007F in %s from a string", (label, nte) => {
    expect(caught(() => parseHL7(messageText(label, nte)).toBytes()).code).toBe(
      "UNENCODABLE_CHARACTER",
    );
  });

  it("refuses a Latin-1 letter in a built message declaring a set it does not decode", () => {
    const msg = buildMessage({ type: "ADT^A01" }).addSegment("NTE", ["1", "", "Ý"]);
    msg.setField("MSH.18", "8859/9");
    expect(caught(() => msg.toBytes()).position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
  });

  it.each(["UNICODE UTF-16", "UNICODE UTF-32"])(
    "refuses %s from a string, which one byte per character is not",
    (label) => {
      const err = caught(() => parseHL7(messageText(label, "NTE|1||plain")).toBytes());
      expect(err.code).toBe("UNSUPPORTED_CHARSET");
      expect(err.position).toEqual({ segmentIndex: 0, fieldIndex: 18 });
    },
  );

  it("refuses non-ASCII text under an explicit ASCII declaration rather than write UTF-8", () => {
    const err = caught(() => parseHL7(messageText("ASCII", "NTE|1||Zörb")).toBytes());
    expect(err.code).toBe("UNENCODABLE_CHARACTER");
    expect(err.charset).toBe("ASCII");
    expect(err.position).toEqual({ segmentIndex: 1, fieldIndex: 3 });
  });

  it("refuses non-ASCII text under an ASCII option", () => {
    const msg = parseHL7(messageText("UNICODE UTF-8", "NTE|1||Zörb"));
    expect(caught(() => msg.toBytes({ charset: "US-ASCII" })).charset).toBe("ASCII");
  });

  it("refuses an edit that adds a Latin-1 letter to a byte reading", () => {
    const msg = parseHL7(messageBytes("CP850", [0x52, 0x82, 0x65]));
    msg.setField("PID.5.2", "Renée");
    const err = caught(() => msg.toBytes());
    expect(err.code).toBe("UNENCODABLE_CHARACTER");
    expect(err.position).toEqual({ segmentIndex: 1, fieldIndex: 5 });
  });

  it("refuses an added segment's Latin-1 letter in a byte reading", () => {
    const msg = parseHL7(messageBytes("8859/9", [0x41]));
    msg.addSegment("NTE", ["1", "", "Ý"]);
    expect(caught(() => msg.toBytes()).position).toEqual({ segmentIndex: 2, fieldIndex: 3 });
  });

  it("refuses an edited segment of a UTF-16 byte reading, which ASCII bytes cannot be", () => {
    const msg = parseHL7(messageBytes("UNICODE UTF-16", [0x41]));
    msg.setField("PID.5.2", "Jo");
    expect(caught(() => msg.toBytes()).code).toBe("UNSUPPORTED_CHARSET");
  });

  it("refuses a byte reading's bytes under an option naming another set", () => {
    const msg = parseHL7(messageBytes("CP850", [0x52, 0xe9, 0x65]));
    const err = caught(() => msg.toBytes({ charset: "UNICODE UTF-8" }));
    expect(err.code).toBe("UNENCODABLE_CHARACTER");
    expect(err.charset).toBe("UTF-8");
    expect(err.position).toEqual({ segmentIndex: 1, fieldIndex: 5 });
  });

  it("refuses a byte reading's bytes once MSH-18 is edited to another set", () => {
    const msg = parseHL7(messageBytes("CP850", [0x52, 0xe9, 0x65]));
    msg.setField("MSH.18", "UNICODE UTF-8");
    expect(caught(() => msg.toBytes()).position).toEqual({ segmentIndex: 1, fieldIndex: 5 });
  });

  it("refuses an option on a byte reading whose read set is not known", () => {
    // The parser read in the option's set, not MSH-18's, and keeps no record of which it was.
    const bytes = messageBytes("UNICODE UTF-8", [0x52, 0xe9, 0x65]);
    const msg = parseHL7(bytes, { charset: "ASCII" });
    expect(caught(() => msg.toBytes({ charset: "ASCII" })).code).toBe("UNENCODABLE_CHARACTER");
  });

  it("refuses an option on a byte reading whose MSH stops before MSH-18", () => {
    const bytes = Buffer.concat([
      Buffer.from("MSH|^~\\&|SYNTH|LAB|SYNTH|WARD|20260101||ADT^A01|SYN1|P|2.5\rNTE|1||", "latin1"),
      Buffer.of(0x52, 0x82, 0x65, 0x0d),
    ]);
    const msg = parseHL7(bytes, { charset: "CP850" });
    expect(msg.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_CHARSET);
    expect(caught(() => msg.toBytes({ charset: "CP850" })).code).toBe("UNENCODABLE_CHARACTER");
    expect(msg.toBytes()).toEqual(bytes);
  });

  it("refuses an option on a byte reading whose MSH-18 is blank", () => {
    const bytes = messageBytes("", [0x52, 0xe9, 0x65]);
    const msg = parseHL7(bytes);
    expect(msg.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNSUPPORTED_CHARSET);
    expect(caught(() => msg.toBytes({ charset: "ASCII" })).code).toBe("UNENCODABLE_CHARACTER");
    expect(msg.toBytes()).toEqual(bytes);
  });

  it("refuses an option naming MSH-18's set when a disagreeing option governed the read", () => {
    // Read in CP437 by the option, not in the CP850 that MSH-18 names.
    const bytes = messageBytes("CP850", [0x52, 0x82, 0x65]);
    const msg = parseHL7(bytes, { charset: "CP437" });
    expect(msg.warnings.map((w) => w.code)).toContain(WARNING_CODES.ENCODING_MISMATCH);
    expect(caught(() => msg.toBytes({ charset: "CP850" })).code).toBe("UNENCODABLE_CHARACTER");
    expect(msg.toBytes()).toEqual(bytes);
  });

  it("refuses an ASCII option on a byte reading whose MSH stops before MSH-18", () => {
    // The ASCII default decodes as strict UTF-8, which 0x82 alone fails.
    const bytes = Buffer.concat([
      Buffer.from("MSH|^~\\&|SYNTH|LAB|SYNTH|WARD|20260101||ADT^A01|SYN1|P|2.5\rNTE|1||", "latin1"),
      Buffer.of(0x52, 0x82, 0x65, 0x0d),
    ]);
    const msg = parseHL7(bytes);
    expect(msg.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNSUPPORTED_CHARSET);
    expect(caught(() => msg.toBytes({ charset: "ASCII" })).code).toBe("UNENCODABLE_CHARACTER");
    expect(msg.toBytes()).toEqual(bytes);
  });

  it("refuses an ASCII option on a byte reading whose MSH-18 is a single space", () => {
    // Untrimmed, MSH-18 is " ": blank, so the ASCII default governed the read, not a declared set.
    const bytes = messageBytes(" ", [0x52, 0x82, 0x65]);
    const msg = parseHL7(bytes, { trimFields: false });
    expect(msg.warnings.map((w) => w.code)).toContain(WARNING_CODES.UNSUPPORTED_CHARSET);
    expect(caught(() => msg.toBytes({ charset: "ASCII" })).code).toBe("UNENCODABLE_CHARACTER");
    expect(msg.toBytes()).toEqual(bytes);
  });

  it("writes an ASCII byte reading under any option, the bytes being the same", () => {
    const bytes = messageBytes("CP850", [0x52, 0x65]);
    expect(parseHL7(bytes).toBytes({ charset: "UNICODE UTF-8" })).toEqual(bytes);
  });

  it("refuses the option's set too", () => {
    const msg = parseHL7(messageText("", "NTE|1||Ł"));
    expect(caught(() => msg.toBytes({ charset: "8859/1" })).charset).toBe("8859/1");
  });
});
