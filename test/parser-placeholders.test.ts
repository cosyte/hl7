/**
 * The `fields[0]` placeholder of each segment: frozen at every level, shared by every segment of
 * one name in a message, and, for a standard segment name or an ASCII field separator, by every
 * message the process parses. Every message here is synthetic.
 */

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import type { RawField } from "../src/index.js";

function placeholderOf(text: string, index: number, lazy: boolean): RawField | undefined {
  return parseHL7(text, { lazy }).rawSegments[index]?.fields[0];
}

describe("segment name placeholders", () => {
  for (const lazy of [true, false]) {
    describe(lazy ? "lazy" : "eager", () => {
      it("shares a standard name's placeholder between two messages", () => {
        const a = placeholderOf("MSH|^~\\&|A\rPID|1", 1, lazy);
        const b = placeholderOf("MSH|^~\\&|B\rPID|2", 1, lazy);
        expect(a).toBeDefined();
        expect(a).toBe(b);
        expect(Object.isFrozen(a)).toBe(true);
        expect(a?.repetitions[0]?.components[0]?.subcomponents).toEqual(["PID"]);
      });

      it("shares MSH-1's placeholder between two messages with the same ASCII separator", () => {
        const a = placeholderOf("MSH|^~\\&|A", 0, lazy);
        expect(a).toBe(placeholderOf("MSH|^~\\&|B", 0, lazy));
        expect(placeholderOf("MSH#^~\\&#B", 0, lazy)).not.toBe(a);
      });

      it("gives a name outside the standard set a placeholder per message", () => {
        const text = "MSH|^~\\&|A\rZPI|1\rZPI|2";
        const msg = parseHL7(text, { lazy });
        const first = msg.rawSegments[1]?.fields[0];
        expect(first).toBe(msg.rawSegments[2]?.fields[0]);
        expect(first).not.toBe(placeholderOf(text, 1, lazy));
        expect(placeholderOf("MSH|^~\\&|A\rpid|1", 1, lazy)).not.toBe(
          placeholderOf("MSH|^~\\&|A\rpid|1", 1, lazy),
        );
      });

      it("gives a separator beyond ASCII a placeholder per message", () => {
        const text = "MSH¦^~\\&¦A";
        expect(placeholderOf(text, 0, lazy)).not.toBe(placeholderOf(text, 0, lazy));
        expect(placeholderOf(text, 0, lazy)?.repetitions[0]?.components[0]?.subcomponents).toEqual([
          "¦",
        ]);
      });
    });
  }
});
