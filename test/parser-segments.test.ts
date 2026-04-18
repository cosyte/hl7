import { describe, expect, it } from "vitest";

import { snippet, splitSegments } from "../src/parser/segments.js";

describe("parser/segments: splitSegments", () => {
  it("splits on \\r and preserves order across MSH/PID/Z segments", () => {
    expect(splitSegments("MSH|A\rPID|1\rZPI|z")).toEqual(["MSH|A", "PID|1", "ZPI|z"]);
  });

  it("drops a trailing \\r without creating an empty final segment", () => {
    expect(splitSegments("MSH|A\rPID|1\r")).toEqual(["MSH|A", "PID|1"]);
  });

  it("returns a single entry when input has no \\r", () => {
    expect(splitSegments("MSH|A")).toEqual(["MSH|A"]);
  });

  it("preserves an empty middle segment between consecutive \\r", () => {
    expect(splitSegments("MSH|A\r\rPID|1")).toEqual(["MSH|A", "", "PID|1"]);
  });

  it("returns an empty array for an empty string input", () => {
    expect(splitSegments("")).toEqual([]);
  });
});

describe("parser/segments: snippet", () => {
  it("returns the input unchanged when <= 40 chars", () => {
    expect(snippet("MSH|^~\\&|APP|FAC")).toBe("MSH|^~\\&|APP|FAC");
  });

  it("truncates long segment strings with an ellipsis", () => {
    const s = snippet("M".repeat(50));
    expect(s.length).toBeLessThanOrEqual(41);
    expect(s.endsWith("\u2026")).toBe(true);
  });
});
