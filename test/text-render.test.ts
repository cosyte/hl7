import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import { parseHL7, renderText } from "../src/index.js";
import type { EncodingCharacters } from "../src/parser/types.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/text/${name}`, import.meta.url)), "utf8");
}

describe("text/render: renderText — plain content & delimiters", () => {
  it("passes through plain text unchanged with a single run", () => {
    const r = renderText("plain narrative text");
    expect(r.text).toBe("plain narrative text");
    expect(r.runs).toEqual([{ text: "plain narrative text", highlighted: false }]);
    expect(r.unrenderedSequences).toEqual([]);
  });

  it("decodes the delimiter/escape/truncation substitutions to literal chars", () => {
    const v27: EncodingCharacters = { ...enc, truncation: "#" };
    const r = renderText("a\\F\\b\\S\\c\\T\\d\\R\\e\\E\\f\\P\\g", v27);
    expect(r.text).toBe("a|b^c&d~e\\f#g");
    expect(r.unrenderedSequences).toEqual([]);
  });

  it("falls back to the spec-default # for \\P\\ when no truncation char is declared", () => {
    expect(renderText("x\\P\\y").text).toBe("x#y");
  });

  it("decodes hex escapes as byte pairs", () => {
    expect(renderText("\\X48656C6C6F\\").text).toBe("Hello");
    expect(renderText("sym \\X21\\").text).toBe("sym !");
  });

  it("honors a custom escape character from the encoding characters", () => {
    const custom: EncodingCharacters = {
      field: "#",
      component: "$",
      repetition: "%",
      escape: "*",
      subcomponent: "@",
    };
    expect(renderText("a*F*b", custom).text).toBe("a#b");
  });
});

describe("text/render: renderText — highlight (§2.7.1 \\H\\/\\N\\)", () => {
  it("drops highlight boundaries from text and exposes highlighted runs", () => {
    const r = renderText("Result is \\H\\CRITICAL\\N\\ now");
    expect(r.text).toBe("Result is CRITICAL now");
    expect(r.runs).toEqual([
      { text: "Result is ", highlighted: false },
      { text: "CRITICAL", highlighted: true },
      { text: " now", highlighted: false },
    ]);
    expect(r.unrenderedSequences).toEqual([]);
  });

  it("handles an unclosed highlight (\\H\\ with no \\N\\) — rest stays highlighted", () => {
    const r = renderText("see \\H\\emphasis to end");
    expect(r.text).toBe("see emphasis to end");
    expect(r.runs).toEqual([
      { text: "see ", highlighted: false },
      { text: "emphasis to end", highlighted: true },
    ]);
  });
});

describe("text/render: renderText — formatting commands (§2.7.6, FT)", () => {
  it("renders \\.br\\ and \\.ce\\ as a single line break each", () => {
    expect(renderText("a\\.br\\b\\.ce\\c").text).toBe("a\nb\nc");
  });

  it("renders \\.sp\\ as one break and \\.sp n\\ as n breaks", () => {
    expect(renderText("a\\.sp\\b").text).toBe("a\nb");
    expect(renderText("a\\.sp3\\b").text).toBe("a\n\n\nb");
    expect(renderText("a\\.sp 2\\b").text).toBe("a\n\nb");
  });

  it("renders \\.sk\\ as one space and \\.sk n\\ as n spaces", () => {
    expect(renderText("a\\.sk\\b").text).toBe("a b");
    expect(renderText("a\\.sk4\\b").text).toBe("a    b");
  });

  it("clamps a pathological \\.sp n\\ / \\.sk n\\ count instead of throwing (fail-safe)", () => {
    // A ~15-byte hostile field must never trigger a RangeError / OOM.
    expect(() => renderText("a\\.sp999999999\\b")).not.toThrow();
    expect(() => renderText("a\\.sk2147483648\\b")).not.toThrow();
    // Clamped to the documented maximum (100).
    expect(renderText("a\\.sp999999999\\b").text).toBe("a" + "\n".repeat(100) + "b");
    expect(renderText("a\\.sk999999999\\b").text).toBe("a" + " ".repeat(100) + "b");
    // A negative skip is meaningless → treated as 1.
    expect(renderText("a\\.sp-5\\b").text).toBe("a\nb");
  });

  it("drops indentation (\\.in\\/\\.ti\\, signed) and word-wrap toggles (\\.fi\\/\\.nf\\)", () => {
    expect(renderText("\\.in5\\text\\.ti-2\\more\\.fi\\wrap\\.nf\\raw").text).toBe(
      "textmorewrapraw",
    );
  });

  it("honors a custom newline string", () => {
    expect(renderText("a\\.br\\b", enc, { newline: " " }).text).toBe("a b");
  });

  it("never leaves a formatting sentinel in the rendered text", () => {
    const r = renderText("x\\.br\\\\.sp\\\\.in3\\\\.ce\\\\.sk\\y");
    expect(r.text).not.toMatch(/\\\.(br|sp|in|ti|fi|nf|ce|sk)/u);
  });
});

describe("text/render: renderText — line-break normalization", () => {
  it("normalizes raw CR, LF, and CRLF (e.g. an already-decoded \\.br\\) to one break", () => {
    expect(renderText("a\rb\nc\r\nd").text).toBe("a\nb\nc\nd");
  });

  it("normalizes a hex-encoded CR/LF (\\X0D\\ / \\X0A\\ / \\X0D0A\\) to one break", () => {
    // A hex-encoded line break must agree with a raw one and honor opts.newline.
    expect(renderText("a\\X0D\\b\\X0A\\c").text).toBe("a\nb\nc");
    expect(renderText("a\\X0D0A\\b").text).toBe("a\nb");
    expect(renderText("a\\X0D\\b", enc, { newline: " " }).text).toBe("a b");
  });

  it("renders a pre-decoded Field.value the same as the wire text", () => {
    // value has \.br\ already decoded to \n and \H\ preserved; render agrees.
    const raw =
      "MSH|^~\\&|A|B|C|D|20260101||ORU^R01|1|P|2.5\r" +
      "OBX|1|TX|N^N^L||one\\.br\\\\H\\two\\N\\ three||||||F";
    const field = parseHL7(raw).segments("OBX")[0]?.field(5);
    const fromValue = renderText(field?.value ?? "", enc);
    const fromWire = renderText(field?.text ?? "", enc);
    expect(fromValue.text).toBe("one\ntwo three");
    expect(fromWire.text).toBe("one\ntwo three");
  });
});

describe("text/render: renderText — never fabricates (fail-safe)", () => {
  it("preserves a vendor \\Z..\\ escape as literal characters AND flags it", () => {
    const r = renderText("note \\Z99\\ end");
    expect(r.text).toBe("note \\Z99\\ end");
    expect(r.unrenderedSequences).toEqual(["\\Z99\\"]);
  });

  it("preserves charset switches \\Cxxyy\\ / \\Mxxyyzz\\ as literal + flagged (not guessed)", () => {
    const r = renderText("t\\C2842\\u\\M824041\\v");
    expect(r.text).toBe("t\\C2842\\u\\M824041\\v");
    expect(r.unrenderedSequences).toEqual(["\\C2842\\", "\\M824041\\"]);
  });

  it("preserves a malformed hex escape as literal + flagged", () => {
    const r = renderText("a\\Xzz\\b");
    expect(r.text).toBe("a\\Xzz\\b");
    expect(r.unrenderedSequences).toEqual(["\\Xzz\\"]);
  });

  it("preserves an unknown dot body (not one of the 8 commands) as literal + flagged", () => {
    const r = renderText("a\\.zz\\b");
    expect(r.text).toBe("a\\.zz\\b");
    expect(r.unrenderedSequences).toEqual(["\\.zz\\"]);
  });

  it("preserves an unterminated escape verbatim and flags it, never throwing", () => {
    const r = renderText("tail \\unterminated");
    expect(r.text).toBe("tail \\unterminated");
    expect(r.unrenderedSequences).toEqual(["\\unterminated"]);
  });
});

describe("text/render: renderText — fixtures (synthetic)", () => {
  it("renders a formatting-laden pathology narrative to correct line structure", () => {
    const obx5 = parseHL7(fixture("formatting-note.hl7")).segments("OBX")[0]?.field(5);
    const r = obx5?.render();
    expect(r?.text).toBe(
      "Specimen received in formalin.\n" +
        "Gross examination unremarkable.\n" +
        "Microscopic:\n" +
        "No atypical cells identified.\n" +
        "END OF REPORT",
    );
    expect(r?.unrenderedSequences).toEqual([]);
  });

  it("renders a highlighted critical-flag note", () => {
    const obx5 = parseHL7(fixture("highlight.hl7")).segments("OBX")[0]?.field(5);
    const r = obx5?.render();
    expect(r?.text).toBe("Result is CRITICALLY HIGH and requires attention");
    expect(r?.runs).toContainEqual({ text: "CRITICALLY HIGH", highlighted: true });
  });

  it("renders hex + delimiter escapes in a note", () => {
    const obx5 = parseHL7(fixture("hex-and-delimiters.hl7")).segments("OBX")[0]?.field(5);
    expect(obx5?.render().text).toBe("Ratio 1^128 and unit mg|dL ends with !");
  });
});

describe("model/field: Field.render", () => {
  it("renders a note field through the convenience method (read projection — raw unchanged)", () => {
    const raw =
      "MSH|^~\\&|A|B|C|D|20260101||ORU^R01|1|P|2.5\r" + "OBX|1|TX|N^N^L||Line1\\.br\\Line2||||||F";
    const msg = parseHL7(raw);
    const before = msg.toString();
    const field = msg.segments("OBX")[0]?.field(5);
    expect(field?.render().text).toBe("Line1\nLine2");
    // Rendering did not mutate the raw value/serialization: the decoded value
    // still carries the \.br\-decoded newline, and re-emit is byte-for-byte.
    expect(field?.value).toBe("Line1\nLine2");
    expect(msg.toString()).toBe(before);
  });
});
