/**
 * How much heap a message read from the v2 XML encoding holds, run by `pnpm test:perf` and never
 * under coverage (see `vitest.perf.config.ts`). `parseHL7Xml` writes the message's pipe-delimited
 * text and hands it to the lazy parser, so the message holds that text and what the pipe reader
 * holds for it, and nothing of the XML: the ceiling here is the pipe reader's own ceiling in
 * `parse-memory.perf.ts` (5 times the text, for a 1 MiB report read at MSH, PID, PV1 and five
 * OBX), plus one for the text itself, which the pipe reader's caller owns and this reader makes.
 *
 * The heap is read after a full collection, before and after one parse that is kept alive. Every
 * input is synthetic and built here from an index.
 */

import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { parseHL7, parseHL7Xml, toHl7Xml, type Hl7Message } from "../../src/index.js";

setFlagsFromString("--expose-gc");
const collect = runInNewContext("gc") as () => void;

/** A synthetic ORU^R01 of about `bytes` bytes, every result a short OBX line. No PHI. */
function denseMessage(bytes: number): string {
  const lines = [
    "MSH|^~\\&|LAB|SENDFAC|EHR|RECVFAC|20260101120000||ORU^R01^ORU_R01|R000001|P|2.6",
    "PID|1||FAKE000001^^^HOSP^MR||Roe^Sam^T||19750615|M",
    "OBR|1||ACC000001|CBC^Complete Blood Count^LN|||20260101120000",
  ];
  for (let k = 0, n = 0; n < bytes; k++) {
    const line = `OBX|${String(k + 1)}|NM|GLU^Glucose^LN||${String(80 + (k % 40))}|mg/dL|70-110|N|||F|||20260101120000`;
    lines.push(line);
    n += line.length + 1;
  }
  return `${lines.join("\r")}\r`;
}

/** The data types the dense report's composites need. */
const DATA_TYPES: Readonly<Record<string, string>> = {
  "MSH.9": "MSG",
  "PID.3": "CX",
  "PID.5": "XPN",
  "OBR.4": "CWE",
  "OBX.3": "CWE",
};

/** MSH, PID, PV1 (absent, so a read that finds nothing) and the first five OBX. */
function readTypical(msg: Hl7Message): unknown[] {
  return [
    msg.part("MSH")?.field(10).value,
    msg.part("PID")?.field(3).value,
    msg.part("PV1")?.field(3).value,
    ...msg
      .segments("OBX")
      .slice(0, 5)
      .map((obx) => obx.field(5).value),
  ];
}

describe("the heap a message read from v2 XML holds", () => {
  it("is under 6 times its pipe text for a 1 MiB result report read at MSH, PID, PV1 and five OBX", () => {
    const pipe = denseMessage(1024 * 1024);
    const xml = toHl7Xml(parseHL7(pipe), { dataTypes: DATA_TYPES, groups: "none" });
    for (let k = 0; k < 3; k++) readTypical(parseHL7Xml(xml));
    collect();
    collect();
    const before = process.memoryUsage().heapUsed;
    const kept = parseHL7Xml(xml);
    readTypical(kept);
    collect();
    collect();
    const after = process.memoryUsage().heapUsed;
    expect(kept.toString()).toBe(pipe);
    expect((after - before) / pipe.length).toBeLessThan(6);
  });
});
