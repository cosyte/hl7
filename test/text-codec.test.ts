import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { decodeText, encodeText, parseHL7, text } from "../src/index.js";
import type { EncodingCharacters } from "../src/parser/types.js";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/text/${name}`, import.meta.url)), "utf8");
}

describe("text/codec: decodeText", () => {
  it("resolves delimiter and newline escapes with no warning plumbing", () => {
    expect(decodeText("Doe\\S\\John")).toBe("Doe^John");
    expect(decodeText("line1\\.br\\line2")).toBe("line1\nline2");
  });

  it("preserves presentational escapes verbatim (nothing lost)", () => {
    expect(decodeText("a\\H\\b\\N\\c")).toBe("a\\H\\b\\N\\c");
    expect(decodeText("a\\Z99\\b")).toBe("a\\Z99\\b");
  });

  it("defaults to the standard encoding characters and accepts a custom set", () => {
    const custom: EncodingCharacters = {
      field: "#",
      component: "$",
      repetition: "%",
      escape: "*",
      subcomponent: "@",
    };
    expect(decodeText("a*F*b", custom)).toBe("a#b");
  });
});

describe("text/codec: encodeText — encode-safety (no delimiter injection)", () => {
  it("escapes every reserved delimiter so a hostile value cannot break framing", () => {
    const hostile = "a|b^c~d\\e&f";
    const body = encodeText(hostile);
    expect(body).toBe("a\\F\\b\\S\\c\\R\\d\\E\\e\\T\\f");
    const msg = parseHL7(`MSH|^~\\&|A|B|C|D|20260101||ADT^A01|1|P|2.5\rNTE|1||${body}`);
    const nte3 = msg.segments("NTE")[0]?.field(3);
    // Exact round-trip AND no forged boundary: one repetition, one component.
    expect(nte3?.value).toBe(hostile);
    expect(nte3?.repetitions).toHaveLength(1);
    expect(nte3?.repetitions[0]?.components).toHaveLength(1);
  });

  it("escapes framing-critical CR/LF via \\.br\\ / \\X0D\\", () => {
    expect(encodeText("a\nb")).toBe("a\\.br\\b");
    expect(encodeText("a\rb")).toBe("a\\X0D\\b");
  });

  it("decodeText(encodeText(x)) is identity for a delimiter-laden string", () => {
    const original = "Hello|World^Foo~Bar\\Baz&Qux\nNext";
    expect(decodeText(encodeText(original))).toBe(original);
  });
});

describe("text/codec: the `text` namespace bundles decode/encode/render", () => {
  it("text.decode / text.encode / text.render mirror the top-level functions", () => {
    expect(text.decode("a\\F\\b")).toBe("a|b");
    expect(text.encode("a|b")).toBe("a\\F\\b");
    expect(text.render("a\\H\\b\\N\\c").text).toBe("abc");
  });
});

describe("text/codec: inject-on-encode fixture (synthetic)", () => {
  it("a pre-encoded hostile NTE-3 re-parses to the exact original with no injection", () => {
    const nte3 = parseHL7(fixture("inject-on-encode.hl7")).segments("NTE")[0]?.field(3);
    // wire: X\F\Y\S\Z\R\W\E\Q\T\V\X0D\line2
    expect(nte3?.value).toBe("X|Y^Z~W\\Q&V\rline2");
    expect(nte3?.repetitions).toHaveLength(1);
    expect(nte3?.repetitions[0]?.components).toHaveLength(1);
  });
});
