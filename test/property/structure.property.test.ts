/**
 * The structure safety net is ADDITIVE, over any message at all.
 *
 * The registry got wider when it was re-sourced from the publication: more
 * trigger events are recognized and more segments are expected, so the safety
 * net now fires on traffic it used to ignore. The one thing that must not have
 * changed is what firing COSTS. Whatever the message, structural findings are
 * warnings and nothing else: the parse still succeeds or fails for exactly the
 * reasons it did before, the message that comes back is byte-identical to the
 * one parsed with the net silenced, and no finding carries a field value.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  FATAL_CODES,
  Hl7ParseError,
  MESSAGE_STRUCTURE_DEFINITIONS,
  WARNING_CODES,
  parseHL7,
} from "../../src/index.js";
import { hostileInput, quirkyMessageRaw, specCleanMessageRaw } from "./_arbitraries.js";

const RUN_CONFIG = { numRuns: 400, seed: 0x08_27_2026 } as const;
const FATAL_CODE_SET: ReadonlySet<string> = new Set(Object.values(FATAL_CODES));

/** Every (code, trigger) pair the registry recognizes, plus unmodelled ones. */
const RECOGNIZED_PAIRS: readonly (readonly [string, string])[] = MESSAGE_STRUCTURE_DEFINITIONS.map(
  (d) => [d.messageCode, d.triggerEvents[0] ?? "Z99"] as const,
);

/** Known segment ids the generator can plausibly expect, plus decoys. */
const SEGMENT_POOL: readonly string[] = [
  "EVN",
  "PID",
  "PV1",
  "OBR",
  "OBX",
  "ORC",
  "MSA",
  "SCH",
  "RGS",
  "TXA",
  "FT1",
  "MRG",
  "NPU",
  "SPM",
  "SAC",
  "RXO",
  "RXR",
  "IPC",
  "NTE",
  "ZZZ",
];

/** Build a syntactically valid message of a given type and segment list. */
function compose(messageType: string, segments: readonly string[]): string {
  const lines = [`MSH|^~\\&|APP|FAC|APP2|FAC2|20250102||${messageType}|MSGID1|P|2.5.1`];
  for (const seg of segments) lines.push(`${seg}|1`);
  return `${lines.join("\r")}\r`;
}

/** Parse, asserting the only tolerated throw is one of the four fatal codes. */
function parseOrFatal(raw: string): ReturnType<typeof parseHL7> | undefined {
  try {
    return parseHL7(raw);
  } catch (err) {
    expect(err).toBeInstanceOf(Hl7ParseError);
    if (err instanceof Hl7ParseError) expect(FATAL_CODE_SET.has(err.code)).toBe(true);
    return undefined;
  }
}

describe("AC14: structural findings are additive warnings and never a refusal", () => {
  it("a recognized type with an arbitrary segment set never throws", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RECOGNIZED_PAIRS),
        fc.uniqueArray(fc.constantFrom(...SEGMENT_POOL), { maxLength: 8 }),
        ([code, trigger], segments) => {
          const raw = compose(trigger === "" ? code : `${code}^${trigger}`, segments);
          const msg = parseOrFatal(raw);
          expect(msg).toBeDefined();
          // Every structural finding is Tier-2, on the warnings array only.
          const structural =
            msg?.warnings.filter((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP) ?? [];
          for (const w of structural) {
            expect(w.code).toBe(WARNING_CODES.MISSING_EXPECTED_GROUP);
            expect(typeof w.message).toBe("string");
          }
        },
      ),
      RUN_CONFIG,
    );
  });

  it("the message is never rewritten: every segment parsed comes back unchanged", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RECOGNIZED_PAIRS),
        fc.uniqueArray(fc.constantFrom(...SEGMENT_POOL), { maxLength: 8 }),
        ([code, trigger], segments) => {
          const raw = compose(trigger === "" ? code : `${code}^${trigger}`, segments);
          const msg = parseHL7(raw);
          const seen = msg.allSegments().map((s) => s.type);
          expect(seen).toEqual(["MSH", ...segments]);
          expect(msg.toString()).toBe(raw);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("a structural warning is emitted exactly once per genuinely absent segment", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RECOGNIZED_PAIRS),
        fc.uniqueArray(fc.constantFrom(...SEGMENT_POOL), { maxLength: 8 }),
        ([code, trigger], segments) => {
          const raw = compose(trigger === "" ? code : `${code}^${trigger}`, segments);
          const msg = parseHL7(raw);
          const present = new Set(msg.allSegments().map((s) => s.type));
          const absent = msg.structure.requiredSegments.filter((s) => !present.has(s));
          expect([...msg.structure.missingSegments]).toEqual(absent);
          expect(
            msg.warnings.filter((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP),
          ).toHaveLength(absent.length);
        },
      ),
      RUN_CONFIG,
    );
  });

  it("a structural warning never quotes anything from the message", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RECOGNIZED_PAIRS),
        fc.uniqueArray(fc.constantFrom(...SEGMENT_POOL), { maxLength: 6 }),
        fc.string({ minLength: 4, maxLength: 24 }).filter((s) => !/[|^~\\&\r\n]/.test(s)),
        ([code, trigger], segments, payload) => {
          const lines = [
            `MSH|^~\\&|APP|FAC|APP2|FAC2|20250102||${trigger === "" ? code : `${code}^${trigger}`}|MSGID1|P|2.5.1`,
          ];
          for (const seg of segments) lines.push(`${seg}|1|${payload}|${payload}`);
          const msg = parseHL7(`${lines.join("\r")}\r`);
          for (const w of msg.warnings) {
            if (w.code !== WARNING_CODES.MISSING_EXPECTED_GROUP) continue;
            expect(w.message).not.toContain(payload);
            expect(w.message).not.toContain("MSGID1");
          }
        },
      ),
      RUN_CONFIG,
    );
  });

  it("hostile and quirky input never turns a structural finding into a throw", () => {
    fc.assert(
      fc.property(fc.oneof(hostileInput(), quirkyMessageRaw(), specCleanMessageRaw()), (raw) => {
        const msg = parseOrFatal(raw);
        if (msg === undefined) return;
        const structural = msg.warnings.filter(
          (w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP,
        );
        // Silence on an unrecognized type; never a finding without an entry.
        if (!msg.structure.recognized) expect(structural).toHaveLength(0);
        expect(structural.length).toBeLessThanOrEqual(msg.structure.requiredSegments.length);
      }),
      RUN_CONFIG,
    );
  });
});
