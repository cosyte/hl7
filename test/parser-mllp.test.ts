import { describe, expect, it } from "vitest";

import { stripMllp, emitIfFramed } from "../src/parser/mllp.js";
import { WARNING_CODES, type Hl7ParseWarning } from "../src/parser/warnings.js";

describe("parser/mllp: stripMllp", () => {
  it("returns input unchanged when no framing bytes are present", () => {
    const raw = "MSH|^~\\&|APP\rPID|1";
    const r = stripMllp(raw);
    expect(r.stripped).toBe(raw);
    expect(r.wasFramed).toBe(false);
  });

  it("strips a full MLLP envelope (VT prefix, FS+CR suffix)", () => {
    const raw = "\u000BMSH|^~\\&|APP\rPID|1\u001C\u000D";
    const r = stripMllp(raw);
    expect(r.stripped).toBe("MSH|^~\\&|APP\rPID|1");
    expect(r.wasFramed).toBe(true);
  });

  it("strips a leading VT only", () => {
    const r = stripMllp("\u000BMSH|^~\\&|APP\rPID|1");
    expect(r.stripped).toBe("MSH|^~\\&|APP\rPID|1");
    expect(r.wasFramed).toBe(true);
  });

  it("strips a trailing FS+CR pair without removing an earlier data CR", () => {
    const raw = "MSH|^~\\&|APP\rPID|1\u001C\u000D";
    const r = stripMllp(raw);
    expect(r.stripped).toBe("MSH|^~\\&|APP\rPID|1");
    expect(r.wasFramed).toBe(true);
  });

  it("strips VT/FS bytes that appear mid-payload (defensive)", () => {
    const r = stripMllp("MSH\u000B|^~\\&|APP\u001C\rPID|1");
    expect(r.stripped).toBe("MSH|^~\\&|APP\rPID|1");
    expect(r.wasFramed).toBe(true);
  });

  it("emitIfFramed fires exactly one MLLP_FRAMING_STRIPPED warning when wasFramed is true", () => {
    const warnings: Hl7ParseWarning[] = [];
    emitIfFramed({ stripped: "x", wasFramed: true }, (w) => warnings.push(w), {
      segmentIndex: 0,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe(WARNING_CODES.MLLP_FRAMING_STRIPPED);
  });

  it("emitIfFramed emits nothing when wasFramed is false", () => {
    const warnings: Hl7ParseWarning[] = [];
    emitIfFramed({ stripped: "x", wasFramed: false }, (w) => warnings.push(w), {
      segmentIndex: 0,
    });
    expect(warnings).toHaveLength(0);
  });
});
