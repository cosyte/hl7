/**
 * Emission is a function of the library, never of what the library has been
 * doing.
 *
 * WHY THIS IS PINNED RATHER THAN ARGUED FROM THE SOURCE. The emitter is pure
 * today, and every way it could stop being pure is invisible at the call site:
 * a cache keyed on the last parsed message, an enumeration built from segment
 * names the process happened to see, a `Set` iterated in insertion order after
 * something inserted into it. Each of those produces an artifact that differs
 * between two runs of the same library version, which turns the drift check
 * into a coin flip and puts message content one edit away from a published
 * file. So the parsing below is not decoration: it is the state the emitter
 * must be measured against.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { emitMessageSchema, messageJsonSchema, messageZodSource, parseHL7 } from "../src/index.js";

const CANONICAL_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "canonical",
);

const FIXTURES: readonly string[] = readdirSync(CANONICAL_DIR)
  .filter((name) => name.endsWith(".hl7"))
  .sort((a, b) => a.localeCompare(b, "en"));

/** Parse a list of fixtures and project each, so the run really did work. */
function parseAndProject(names: readonly string[]): number {
  let members = 0;
  for (const name of names) {
    const projection = parseHL7(readFileSync(path.join(CANONICAL_DIR, name), "utf8")).toJSON();
    members += projection.segments.length + projection.warnings.length;
  }
  return members;
}

describe("AC8: both artifacts are byte-identical across calls and across parse history", () => {
  it("two calls in one process return identical bytes", () => {
    expect(emitMessageSchema("json-schema-2020-12")).toBe(emitMessageSchema("json-schema-2020-12"));
    expect(emitMessageSchema("zod")).toBe(emitMessageSchema("zod"));
    expect(messageZodSource()).toBe(messageZodSource());
  });

  it("does not vary with how many messages have been parsed", () => {
    const before = emitMessageSchema("json-schema-2020-12");
    const beforeZod = emitMessageSchema("zod");
    expect(parseAndProject(FIXTURES)).toBeGreaterThan(0);
    expect(emitMessageSchema("json-schema-2020-12")).toBe(before);
    expect(emitMessageSchema("zod")).toBe(beforeZod);
    expect(parseAndProject(FIXTURES)).toBeGreaterThan(0);
    expect(parseAndProject(FIXTURES)).toBeGreaterThan(0);
    expect(emitMessageSchema("json-schema-2020-12")).toBe(before);
    expect(emitMessageSchema("zod")).toBe(beforeZod);
  });

  it("does not vary with the order the messages were parsed in", () => {
    const forward = [...FIXTURES];
    const backward = [...FIXTURES].reverse();
    parseAndProject(forward);
    const afterForward = emitMessageSchema("json-schema-2020-12");
    const afterForwardZod = emitMessageSchema("zod");
    parseAndProject(backward);
    expect(emitMessageSchema("json-schema-2020-12")).toBe(afterForward);
    expect(emitMessageSchema("zod")).toBe(afterForwardZod);
  });

  it("does not vary with the content of a parsed message", () => {
    const before = emitMessageSchema("json-schema-2020-12");
    const beforeZod = emitMessageSchema("zod");
    // A message carrying an unknown segment, a miscased one, a repetition and
    // nested subcomponents: content that reaches every level of the projection
    // and raises warnings besides.
    const noisy =
      "MSH|^~\\&|SEND|FAC|RECV|RFAC|20250102||ADT^A01|CTRL1|P|2.5\r" +
      "EVN||20250102\r" +
      "pid|||MRN00001~MRN00002||AAAA^BBBB^C&D\r" +
      "ZQQ|1|2|3\r";
    const projection = parseHL7(noisy).toJSON();
    expect(projection.warnings.length).toBeGreaterThan(0);
    expect(emitMessageSchema("json-schema-2020-12")).toBe(before);
    expect(emitMessageSchema("zod")).toBe(beforeZod);
  });

  it("returns a fresh document each call rather than a shared mutable one", () => {
    const first = messageJsonSchema();
    const second = messageJsonSchema();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it("the committed text for a target is exactly what the emitter returns", () => {
    expect(emitMessageSchema("zod")).toBe(messageZodSource());
    expect(emitMessageSchema("json-schema-2020-12")).toBe(
      `${JSON.stringify(messageJsonSchema(), null, 2)}\n`,
    );
  });
});
