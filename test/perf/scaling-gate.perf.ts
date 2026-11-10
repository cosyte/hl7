/**
 * The scaling gate for `parseHL7`, from `@cosyte/test-utils/perf`, run by `pnpm test:perf` and
 * never under coverage (see `vitest.perf.config.ts`).
 *
 * It asks one question: does parsing cost grow faster than the input? On the count axis, 4 times
 * the messages; on the size axis, messages 4 times longer. Each ratio must stay inside the band
 * the shared contract fixes. It does not see a constant-factor slowdown: a parser 10% slower
 * everywhere passes, and always will. The base against head comparison on a pull request
 * (`bench/parse.bench.mjs`) is the instrument for that.
 *
 * The self-check proves these fixtures are large enough for the gate to fail: the same parse
 * reached quadratically (every segment found by scanning from the start of the message) must clear
 * the ceiling at exactly these sizes. Every input is synthetic and built here from an index.
 */

import {
  assertScalingGateFires,
  scalingGate,
  type ScalingGateOptions,
} from "@cosyte/test-utils/perf";
import { describe, expect, it } from "vitest";

import { parseHL7, type Hl7Message } from "../../src/index.js";

/** A synthetic ADT^A01 of five segments, the same length for every index. No PHI. */
function adtMessage(i: number): string {
  const id = String(i % 1_000_000).padStart(6, "0");
  return (
    `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|A${id}|P|2.5\r` +
    `EVN|A01|20260101120000\r` +
    `PID|1||FAKE${id}^^^HOSP^MR||Doe^Jane^Q||19800101|F|||123 Main St^^Anytown^CA^90001\r` +
    `NK1|1|Doe^John^R|SPO|123 Main St^^Anytown^CA^90001\r` +
    `PV1|1|I|WARD^101^A|||||DOC123^Smith^Robert\r`
  );
}

/** A synthetic ORU^R01 with `obx` result lines. No PHI. */
function oruMessage(i: number, obx: number): string {
  const id = String(i % 1_000_000).padStart(6, "0");
  const results = Array.from(
    { length: obx },
    (_v, k) =>
      `OBX|${String(k + 1)}|NM|GLU^Glucose^LN||${String(80 + (k % 40))}|mg/dL|70-110|N|||F|||20260101120000`,
  ).join("\r");
  return (
    `MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01|R${id}|P|2.5\r` +
    `PID|1||FAKE${id}^^^HOSP^MR||Roe^Sam^T||19750615|M\r` +
    `OBR|1||ACC${id}|CBC^Complete Blood Count^LN|||20260101120000\r` +
    `${results}\r`
  );
}

/**
 * The same parse, reached the wrong way: each segment is found by scanning from the start of the
 * text, so the cost grows with the square of the segment count. It parses exactly what `parseHL7`
 * parses, which the self-check confirms before it times anything.
 */
function parseQuadratic(raw: string): Hl7Message {
  const lines: string[] = [];
  let count = 1;
  for (let p = raw.indexOf("\r"); p !== -1; p = raw.indexOf("\r", p + 1)) count++;
  for (let i = 0; i < count; i++) {
    let start = 0;
    for (let k = 0; k < i; k++) start = raw.indexOf("\r", start) + 1;
    const end = raw.indexOf("\r", start);
    lines.push(raw.slice(start, end === -1 ? raw.length : end));
  }
  return parseHL7(lines.join("\r"));
}

/** Both phases, and the self-check, use exactly these fixtures. */
const options: ScalingGateOptions<string, Hl7Message> = {
  name: "@cosyte/hl7 parseHL7",
  parse: (raw) => parseHL7(raw),
  weigh: (m) => m.rawSegments.length,
  count: { n: 1_000, generate: (i) => adtMessage(i) },
  size: { inputs: 10, size: 500, generate: (i, size) => oruMessage(i, size) },
};

describe("the scaling gate: parseHL7", () => {
  it("has not acquired a complexity regression on either axis", () => {
    const report = scalingGate(options);
    // A skip is not a pass: a gate that could not measure says so here, rather than reading green.
    expect(report.count.status, report.count.diagnostic).toBe("measured");
    expect(report.size.status, report.size.diagnostic).toBe("measured");
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(options, {
      regressedParse: parseQuadratic,
      equals: (a, b) => a.toString() === b.toString(),
    });
    expect(report.margin).toBeGreaterThan(1);
  });
});
