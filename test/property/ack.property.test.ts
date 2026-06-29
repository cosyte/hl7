/**
 * Property tests for `buildAck` (Phase C). Two invariants the generator pins
 * across thousands of synthetic inbound messages:
 *
 *   1. **Clean round-trip** — a built ACK always re-parses without warnings
 *      and as an `ACK` message (when the inbound carries a correlatable MSH-10).
 *   2. **Correlation echo** — MSA-2 always echoes the inbound MSH-10.
 *
 * Inbound corpus is generated via the shared spec-clean arbitrary, then a
 * disposition + optional ERR detail are drawn. Synthetic only — ERR locations
 * are structural paths, never data values.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { buildAck, parseHL7 } from "../../src/index.js";
import type { AckCode, AckErrorDetail, ErrSeverity } from "../../src/index.js";

import { specCleanMessageRaw } from "./_arbitraries.js";

const RUN_CONFIG = { numRuns: 300, seed: 0x0c_29_2026 } as const;

/** The six Table 0008 dispositions buildAck can be told to emit. */
const ACK_DISPOSITIONS: readonly AckCode[] = ["AA", "AE", "AR", "CA", "CE", "CR"];
const ackCode = fc.constantFrom(...ACK_DISPOSITIONS);

/** The three Table 0516 severities. */
const SEVERITIES: readonly ErrSeverity[] = ["I", "W", "E"];

/** An optional single ERR detail — codes/locations only. */
const errorDetail: fc.Arbitrary<AckErrorDetail | undefined> = fc.option(
  fc.record({
    conditionCode: fc.constantFrom("100", "101", "102", "200", "999"),
    severity: fc.constantFrom(...SEVERITIES),
    location: fc.constantFrom("PID^1^5", "MSH^1^9", "PV1^1^2"),
  }),
  { nil: undefined },
);

describe("property: buildAck clean round-trip", () => {
  it("a built ACK re-parses without warnings and as an ACK message", () => {
    fc.assert(
      fc.property(specCleanMessageRaw(), ackCode, errorDetail, (raw, code, error) => {
        const inbound = parseHL7(raw);
        const ack = buildAck(inbound, error !== undefined ? { code, error } : { code });
        const round = parseHL7(ack.toString());
        expect(round.warnings).toEqual([]);
        expect(round.meta.messageCode).toBe("ACK");
      }),
      RUN_CONFIG,
    );
  });
});

describe("property: buildAck correlation echo", () => {
  it("MSA-2 always echoes the inbound MSH-10", () => {
    fc.assert(
      fc.property(specCleanMessageRaw(), ackCode, (raw, code) => {
        const inbound = parseHL7(raw);
        const sourceControlId = inbound.meta.controlId;
        const ack = buildAck(inbound, { code });
        // specCleanMessageRaw always sets a non-empty controlId, so the
        // fail-safe never fires here — MSA-2 mirrors the inbound MSH-10.
        expect(ack.get("MSA.2")).toBe(sourceControlId);
      }),
      RUN_CONFIG,
    );
  });
});
