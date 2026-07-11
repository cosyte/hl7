/**
 * HL7-VALUE-REDECODE: the value-READ surface must decode each subcomponent
 * exactly ONCE. The tokenizer already unescapes every subcomponent on parse
 * (parser-02), so `Field.value`, the dot-path `get()`, and the composite
 * coercions must return the stored (decoded) value verbatim — never run a
 * SECOND `unescape` over it.
 *
 * The bug (found by the HL7-ESC conformance-refuter): a value whose OWN decoded
 * bytes look like an escape — e.g. a wire `\E\F\E\` decodes once to the literal
 * three chars `\F\` — was decoded a second time by the readers, turning `\F\`
 * into the field separator `|`: a silently-wrong read on rare-but-spec-legal
 * input. Emit stays byte-verbatim (HL7-ESC) — proven here too.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";

/** A minimal ORU whose OBX-5 carries `content` (verbatim wire bytes). */
function obx5(content: string): string {
  return (
    "MSH|^~\\&|LAB|MAIN|EHR|REF|20260101100000||ORU^R01|MSG1|P|2.5\r" +
    `OBX|1|TX|CODE^Text^L||${content}||||||F`
  );
}

/** A minimal ADT whose PID-5 (XPN) carries `content`. */
function pid5(content: string): string {
  return (
    "MSH|^~\\&|LAB|MAIN|EHR|REF|20260101100000||ADT^A01|MSG1|P|2.5\r" +
    `PID|1||MRN^^^HOSP^MR||${content}||19700101|M`
  );
}

describe("HL7-VALUE-REDECODE: reads decode exactly once (no double-unescape)", () => {
  it("Field.value returns a decoded value whose bytes look like an escape, verbatim", () => {
    // Wire `A\E\F\E\B` decodes ONCE (tokenizer) to the literal 5 chars `A\F\B`.
    // The old reader re-unescaped that `\F\` into `|` — the bug. Now: verbatim.
    const f = parseHL7(obx5("A\\E\\F\\E\\B")).segments("OBX")[0]?.field(5);
    expect(f?.value).toBe("A\\F\\B");
  });

  it("the plain single-escape case is unchanged (`\\F\\` on the wire still reads `|`)", () => {
    const f = parseHL7(obx5("A\\F\\B")).segments("OBX")[0]?.field(5);
    expect(f?.value).toBe("A|B");
  });

  it("dot-path get() returns the once-decoded value verbatim", () => {
    const msg = parseHL7(obx5("A\\E\\F\\E\\B"));
    expect(msg.get("OBX.5")).toBe("A\\F\\B");
  });

  it("composite coercion (asXpn → readSubcomponent) does not double-decode a component", () => {
    const f = parseHL7(pid5("Smith\\E\\F\\E\\Jr")).segments("PID")[0]?.field(5);
    expect(f?.asXpn().familyName).toBe("Smith\\F\\Jr");
  });

  it("the TS raw reader does not double-decode (ts.ts)", () => {
    const f = parseHL7(obx5("20250102\\E\\F\\E\\")).segments("OBX")[0]?.field(5);
    expect(f?.asTs().raw).toBe("20250102\\F\\");
  });

  it("the NM raw reader does not double-decode (nm.ts)", () => {
    const f = parseHL7(obx5("12\\E\\F\\E\\5")).segments("OBX")[0]?.field(5);
    expect(f?.asNm()).toStrictEqual({ raw: "12\\F\\5", value: undefined });
  });

  it("emit is unaffected — the field round-trips byte-verbatim (HL7-ESC)", () => {
    const line = parseHL7(obx5("A\\E\\F\\E\\B"))
      .toString()
      .split("\r")
      .find((l) => l.startsWith("OBX"));
    expect(line).toBe("OBX|1|TX|CODE^Text^L||A\\E\\F\\E\\B||||||F");
  });
});
