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

import { buildAck, interpretAck, parseHL7 } from "../../src/index.js";
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

describe("property: buildAck verbatim echo for delimiter-bearing control ids", () => {
  // Vendor-quirk MSH-10 alphabet: alphanumerics PLUS unescaped component (^),
  // subcomponent (&), and repetition (~) delimiters. Excludes the field
  // separator and CR (would change segment structure) and the bare escape
  // char (covered by a fixed unit test). A TRAILING delimiter is excluded:
  // HL7 treats trailing empty components/repetitions as insignificant, and
  // the spec-clean serializer canonicalizes them away (D-02) — that
  // canonicalization is documented, not a truncation.
  const quirkyControlId = fc
    .stringOf(fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789^&~".split("")), {
      minLength: 1,
      maxLength: 20,
    })
    .filter((s) => !/[\^&~]$/.test(s) && /[A-Z0-9]/.test(s));

  it("MSA-2 carries the inbound MSH-10 field text verbatim (never component-1 truncation)", () => {
    fc.assert(
      fc.property(quirkyControlId, ackCode, (controlId, code) => {
        const raw = `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|${controlId}|P|2.5\r`;
        const inbound = parseHL7(raw);
        // The invariant: MSA-2 === the inbound MSH-10's verbatim wire text
        // (`Field.text`). Both sides share the D-02 canonicalization of
        // insignificant empties (an all-empty repetition/component strips),
        // so comparing against `.text` — not the raw generator string — pins
        // exactly the no-truncation claim without re-litigating D-02.
        const expected = inbound.segments("MSH")[0]?.field(10).text ?? "";
        expect(expected.length).toBeGreaterThan(0);
        const ack = buildAck(inbound, { code });
        const msaLine = ack
          .toString()
          .split("\r")
          .find((l) => l.startsWith("MSA"));
        expect(msaLine).toBe(`MSA|${code}|${expected}`);
      }),
      RUN_CONFIG,
    );
  });

  it("interpretAck round-trips the verbatim id (read-side symmetry)", () => {
    fc.assert(
      fc.property(quirkyControlId, (controlId) => {
        const raw = `MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|20260101120000||ADT^A01|${controlId}|P|2.5\r`;
        const inbound = parseHL7(raw);
        const expected = inbound.segments("MSH")[0]?.field(10).text ?? "";
        const ack = buildAck(inbound, { code: "AA" });
        const view = interpretAck(parseHL7(ack.toString()));
        expect(view.controlId).toBe(expected);
      }),
      RUN_CONFIG,
    );
  });
});
