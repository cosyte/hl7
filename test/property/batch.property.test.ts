/**
 * Property tests for `splitBatch()` (roadmap Phase L). The generative analogues
 * of the example-based `test/parser-batch.test.ts` sweep. Two headline
 * invariants, restated from the Phase-L acceptance:
 *
 *   1. Count fidelity — the number of entries `splitBatch` returns equals the
 *      number of `MSH` boundaries in the stream, for any batch of valid
 *      messages under any nesting of BHS/BTS batches.
 *   2. Isolation — a malformed message inserted anywhere mid-stream never
 *      suppresses a later message: every valid sibling still comes back `ok`,
 *      and the total entry count is (valid + malformed).
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { splitBatch } from "../../src/index.js";

/** Stable seed + run budget so failures reproduce deterministically. */
const RUN_CONFIG = { numRuns: 300, seed: 0x07_04_2026 } as const;

/** A minimal, spec-clean ADT^A01 with a caller-supplied MSH-10 control id. */
function validMessage(controlId: string): string {
  return (
    `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|${controlId}|P|2.5\r` +
    `PID|1||FAKE${controlId}^^^HOSP^MR\r`
  );
}

/** A truncated MSH that parseHL7 rejects with a Tier-3 fatal (isolated failure). */
const MALFORMED_MESSAGE = "MSH|^~\r";

/** Control ids are short alphanumerics so they never collide a delimiter. */
const controlId = fc.stringMatching(/^[A-Z0-9]{1,8}$/);

describe("property: splitBatch count fidelity", () => {
  it("returns exactly one entry per MSH boundary for a BHS/BTS-wrapped batch", () => {
    fc.assert(
      fc.property(fc.array(controlId, { minLength: 1, maxLength: 12 }), (ids) => {
        const body = ids.map(validMessage).join("");
        const stream = `BHS|^~\\&|SENDAPP\r${body}BTS|${String(ids.length)}\r`;
        const result = splitBatch(stream);

        expect(result.messages).toHaveLength(ids.length);
        expect(result.messages.every((e) => e.ok)).toBe(true);
        // Declared BTS-1 matches actual -> zero mismatch warnings.
        expect(result.warnings).toHaveLength(0);
      }),
      RUN_CONFIG,
    );
  });

  it("returns one entry per MSH across multiple batches in one file", () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(controlId, { minLength: 1, maxLength: 5 }), {
          minLength: 1,
          maxLength: 4,
        }),
        (batches) => {
          let stream = "FHS|^~\\&|SENDAPP\r";
          for (const ids of batches) {
            stream += `BHS|^~\\&|SENDAPP\r${ids.map(validMessage).join("")}BTS|${String(ids.length)}\r`;
          }
          stream += `FTS|${String(batches.length)}\r`;

          const result = splitBatch(stream);
          const totalMessages = batches.reduce((sum, ids) => sum + ids.length, 0);

          expect(result.messages).toHaveLength(totalMessages);
          expect(result.batches).toHaveLength(batches.length);
          expect(result.actualBatchCount).toBe(batches.length);
          expect(result.warnings).toHaveLength(0);
        },
      ),
      RUN_CONFIG,
    );
  });
});

describe("property: splitBatch isolation (a malformed message never suppresses siblings)", () => {
  it("returns every valid message plus the malformed one, whatever the injection point", () => {
    fc.assert(
      fc.property(
        fc.array(controlId, { minLength: 1, maxLength: 10 }),
        fc.nat(),
        (ids, rawPosition) => {
          const injectAt = ids.length === 0 ? 0 : rawPosition % (ids.length + 1);
          const parts = ids.map(validMessage);
          parts.splice(injectAt, 0, MALFORMED_MESSAGE);
          const stream = `BHS|^~\\&|SENDAPP\r${parts.join("")}BTS|${String(parts.length)}\r`;

          const result = splitBatch(stream);

          // Total entries = valid + the one malformed; none dropped.
          expect(result.messages).toHaveLength(ids.length + 1);
          // Exactly one failure; the rest are the valid siblings, all ok.
          const failures = result.messages.filter((e) => !e.ok);
          expect(failures).toHaveLength(1);
          expect(result.messages.filter((e) => e.ok)).toHaveLength(ids.length);
          // Every original control id is still present, in order.
          const okIds = result.messages
            .filter((e): e is Extract<typeof e, { ok: true }> => e.ok)
            .map((e) => e.message.get("MSH.10"));
          expect(okIds).toEqual(ids);
        },
      ),
      RUN_CONFIG,
    );
  });
});
