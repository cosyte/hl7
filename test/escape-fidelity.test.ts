/**
 * HL7-ESC escape-fidelity round-trip: the serializer must re-emit a parsed
 * field's escape sequences **byte-verbatim**, not canonicalized. Before this
 * work the decoded tree conflated recognize-and-preserve escapes (`\H\`,
 * `\Z..\`, charset/formatting) and hex escapes (`\X41\`) with literal
 * backslashes, so emit double-escaped the former (`\H\` → `\E\H\E\`) and
 * decoded the latter (`\X41\` → `A`) — spec-clean + lossless-as-text, but not
 * byte-verbatim. The `RawComponent.rawSubcomponents` overlay pins the original
 * wire bytes so emit reproduces them exactly, across the FULL escape alphabet.
 *
 * The decoded `subcomponents` surface (what `Field.value` / composites read) is
 * deliberately unchanged — these tests only pin the EMIT side.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import type { RawSegment } from "../src/parser/types.js";

/** Extract a single named segment's emitted wire line from `msg.toString()`. */
function emittedSegment(raw: string, name: string): string | undefined {
  return parseHL7(raw)
    .toString()
    .split("\r")
    .find((l) => l.startsWith(name));
}

/** Build a minimal ORU whose OBX-5 carries `content`. */
function obxWith(content: string): string {
  return (
    "MSH|^~\\&|LAB|MAIN|EHR|REF|20260101100000||ORU^R01|MSG1|P|2.5\r" +
    `OBX|1|TX|CODE^Text^L||${content}||||||F`
  );
}

describe("HL7-ESC: preserved-escape families emit byte-verbatim", () => {
  it.each([
    ["highlight \\H\\ / \\N\\", "Critical \\H\\value\\N\\ here"],
    ["formatting .in/.sp/.ce/.fi/.nf", "\\.in\\indented\\.sp\\\\.ce\\c\\.fi\\r\\.nf\\pre"],
    ["single-byte charset \\Cxxyy\\", "text\\C2842\\more"],
    ["multi-byte charset \\Mxxyyzz\\", "a\\M2842\\b\\M824041\\c"],
    ["vendor-specific \\Z99\\", "value \\Z99\\ tail"],
    ["vendor with body \\Zsecret\\", "before\\Zsecret\\after"],
  ])("%s round-trips byte-verbatim in OBX-5", (_label, content) => {
    const line = emittedSegment(obxWith(content), "OBX");
    expect(line).toBe(`OBX|1|TX|CODE^Text^L||${content}||||||F`);
  });
});

describe("HL7-ESC: hex escapes preserve original bytes (decode-on-read, re-encode-on-emit)", () => {
  it("\\X41\\ emits as \\X41\\ (NOT decoded to A)", () => {
    const line = emittedSegment(obxWith("A\\X41\\B"), "OBX");
    expect(line).toBe("OBX|1|TX|CODE^Text^L||A\\X41\\B||||||F");
  });

  it("non-canonical hex casing (\\X0d\\) is preserved, not normalized to \\X0D\\", () => {
    const line = emittedSegment(obxWith("x\\X0d\\y"), "OBX");
    expect(line).toBe("OBX|1|TX|CODE^Text^L||x\\X0d\\y||||||F");
  });

  it("multi-byte hex payload (\\X48656C6C6F\\) survives verbatim", () => {
    const line = emittedSegment(obxWith("\\X48656C6C6F\\"), "OBX");
    expect(line).toBe("OBX|1|TX|CODE^Text^L||\\X48656C6C6F\\||||||F");
  });

  it("but a decoded value still reads decoded (the value surface is unchanged)", () => {
    const obx5 = parseHL7(obxWith("A\\X41\\B")).segments("OBX")[0]?.field(5);
    expect(obx5?.value).toBe("AAB"); // decode-on-read
    expect(obx5?.text).toBe("A\\X41\\B"); // re-encode-on-emit
  });
});

describe("HL7-ESC: delimiter escapes keep the reescape path (no overlay, still verbatim)", () => {
  it.each([
    ["field \\F\\", "a\\F\\b"],
    ["component \\S\\", "a\\S\\b"],
    ["subcomponent \\T\\", "a\\T\\b"],
    ["repetition \\R\\", "a\\R\\b"],
    ["escape \\E\\", "a\\E\\b"],
    ["newline \\.br\\", "line1\\.br\\line2"],
    ["hex CR \\X0D\\ (framing-safe)", "a\\X0D\\b"],
  ])("%s round-trips byte-verbatim", (_label, content) => {
    const line = emittedSegment(obxWith(content), "OBX");
    expect(line).toBe(`OBX|1|TX|CODE^Text^L||${content}||||||F`);
  });

  it("mixed preserved + delimiter escapes in one subcomponent emit verbatim", () => {
    const line = emittedSegment(obxWith("x\\H\\y\\F\\z\\X41\\w"), "OBX");
    expect(line).toBe("OBX|1|TX|CODE^Text^L||x\\H\\y\\F\\z\\X41\\w||||||F");
  });
});

describe("HL7-ESC: the overlay is off the common path", () => {
  it("plain content produces NO rawSubcomponents overlay anywhere in the tree", () => {
    const msg = parseHL7(
      "MSH|^~\\&|A|B|C|D|20260101100000||ADT^A01|ID1|P|2.5\r" +
        "PID|1||MRN^^^HOSP^MR||Doe^John||19700101|M",
    );
    const hasOverlay = (segs: readonly RawSegment[]): boolean =>
      segs.some((s) =>
        s.fields.some((f) =>
          f.repetitions.some((r) => r.components.some((c) => c.rawSubcomponents !== undefined)),
        ),
      );
    expect(hasOverlay(msg.rawSegments)).toBe(false);
  });

  it("a delimiter-only escaped field also produces NO overlay (reescape reproduces it)", () => {
    const msg = parseHL7(obxWith("a\\F\\b\\S\\c"));
    const obx = msg.rawSegments.find((s) => s.name === "OBX");
    const comp = obx?.fields[5]?.repetitions[0]?.components[0];
    expect(comp?.rawSubcomponents).toBeUndefined();
  });

  it("a preserved-escape field DOES carry an overlay entry", () => {
    const msg = parseHL7(obxWith("a\\H\\b"));
    const obx = msg.rawSegments.find((s) => s.name === "OBX");
    const comp = obx?.fields[5]?.repetitions[0]?.components[0];
    expect(comp?.rawSubcomponents?.[0]).toBe("a\\H\\b");
  });
});

describe("HL7-ESC: whole-message idempotency across the escape alphabet", () => {
  it.each([
    "Critical \\H\\value\\N\\ here",
    "\\.in\\a\\.sp\\b\\.ce\\c\\.fi\\d\\.nf\\e",
    "u\\C2842\\v\\M824041\\w",
    "A\\X41\\B\\X0d\\C",
    "vendor \\Z99\\ and \\Zmore\\",
    "delims a\\F\\b\\S\\c\\T\\d\\R\\e\\E\\f",
    "mixed \\H\\p\\F\\q\\X41\\r\\Z9\\s",
  ])("toString() is a fixpoint for %j", (content) => {
    const once = parseHL7(obxWith(content)).toString();
    const twice = parseHL7(once).toString();
    expect(twice).toBe(once);
    // And the first emit already preserved the content byte-verbatim.
    expect(once.split("\r").find((l) => l.startsWith("OBX"))).toBe(
      `OBX|1|TX|CODE^Text^L||${content}||||||F`,
    );
  });
});
