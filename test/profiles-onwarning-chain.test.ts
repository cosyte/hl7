/**
 * Plan 06-03 Task 4: D-22 `profile.onWarning` chain.
 *
 * Covers the observable ordering + isolation contract for the profile
 * onWarning chain hoisted into `makeEmitter` in Task 2:
 *
 *   - profile.onWarning fires BEFORE options.onWarning (lenient mode).
 *   - Both handlers receive the SAME warning object (reference identity).
 *   - Per-handler try/catch isolation: a throw in either handler does NOT
 *     prevent the other from receiving the warning, and does NOT surface
 *     to the parseHL7 caller.
 *   - Strict mode short-circuits BOTH handlers (existing Phase 2 contract
 *     preserved).
 *   - Option A hoist coverage: early-pipeline warnings (MLLP framing)
 *     route through both handlers too — distinguishes from a lazy-getter
 *     design (Option B) that would skip early warnings.
 */

import { describe, expect, it } from "vitest";

import { parseHL7, WARNING_CODES } from "../src/index.js";
import { Hl7ParseError } from "../src/parser/errors.js";
import type { Hl7ParseWarning } from "../src/parser/warnings.js";
import { defineProfile } from "../src/profiles/define.js";

// Message guaranteed to emit UNKNOWN_SEGMENT (at least one warning the chain
// can observe). ZZZ is neither in KNOWN_SEGMENTS nor claimed by a test
// profile (which declares nothing in customSegments) so UNKNOWN_SEGMENT
// fires once per parse.
const WARN_MSH = "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ADT^A01|MSG001|P|2.5\rZZZ|foo\r";

describe("D-22: profile.onWarning fires BEFORE options.onWarning", () => {
  it("both handlers fire in profile-first order on a single emitted warning", () => {
    const callLog: Array<{ who: string; code: string }> = [];
    const profile = defineProfile({
      name: "test",
      onWarning: (w) => callLog.push({ who: "profile", code: w.code }),
    });
    parseHL7(WARN_MSH, {
      profile,
      onWarning: (w) => callLog.push({ who: "options", code: w.code }),
    });
    // For each UNKNOWN_SEGMENT emission, profile must appear before options.
    const unknown = callLog.filter((e) => e.code === WARNING_CODES.UNKNOWN_SEGMENT);
    expect(unknown.length).toBeGreaterThanOrEqual(2); // at least one per handler
    const profileIdx = callLog.findIndex(
      (e) => e.who === "profile" && e.code === WARNING_CODES.UNKNOWN_SEGMENT,
    );
    const optionsIdx = callLog.findIndex(
      (e) => e.who === "options" && e.code === WARNING_CODES.UNKNOWN_SEGMENT,
    );
    expect(profileIdx).toBeLessThan(optionsIdx);
  });

  it("both handlers receive the SAME warning object (reference identity)", () => {
    const received: Hl7ParseWarning[] = [];
    const profile = defineProfile({
      name: "test",
      onWarning: (w) => received.push(w),
    });
    parseHL7(WARN_MSH, {
      profile,
      onWarning: (w) => received.push(w),
    });
    // First two entries correspond to the same emission — profile then options.
    expect(received.length).toBeGreaterThanOrEqual(2);
    expect(received[0]).toBe(received[1]); // identity, not just equality
  });

  it("a throw in profile.onWarning does NOT prevent options.onWarning from receiving the warning", () => {
    const optionsReceived: Hl7ParseWarning[] = [];
    const profile = defineProfile({
      name: "test",
      onWarning: () => {
        throw new Error("profile handler boom");
      },
    });
    expect(() => {
      parseHL7(WARN_MSH, {
        profile,
        onWarning: (w) => optionsReceived.push(w),
      });
    }).not.toThrow();
    expect(optionsReceived.length).toBeGreaterThan(0);
    expect(optionsReceived[0]?.code).toBe(WARNING_CODES.UNKNOWN_SEGMENT);
  });

  it("a throw in options.onWarning does NOT surface to the parseHL7 caller (symmetric silent swallow)", () => {
    const profileReceived: Hl7ParseWarning[] = [];
    const profile = defineProfile({
      name: "test",
      onWarning: (w) => profileReceived.push(w),
    });
    expect(() => {
      parseHL7(WARN_MSH, {
        profile,
        onWarning: () => {
          throw new Error("options handler boom");
        },
      });
    }).not.toThrow();
    // profile.onWarning still got to observe before options threw.
    expect(profileReceived.length).toBeGreaterThan(0);
  });

  it("profile.onWarning undefined + options.onWarning defined → only options fires", () => {
    const received: Hl7ParseWarning[] = [];
    const profile = defineProfile({ name: "test" }); // no onWarning
    parseHL7(WARN_MSH, {
      profile,
      onWarning: (w) => received.push(w),
    });
    expect(received.length).toBeGreaterThan(0);
  });

  it("options.onWarning undefined + profile.onWarning defined → only profile fires", () => {
    const received: Hl7ParseWarning[] = [];
    const profile = defineProfile({
      name: "test",
      onWarning: (w) => received.push(w),
    });
    parseHL7(WARN_MSH, profile); // no options.onWarning
    expect(received.length).toBeGreaterThan(0);
  });

  it("strict mode: NEITHER handler fires; parseHL7 throws Hl7ParseError", () => {
    const profileLog: string[] = [];
    const optionsLog: string[] = [];
    const profile = defineProfile({
      name: "test",
      onWarning: () => profileLog.push("p"),
    });
    expect(() => {
      parseHL7(WARN_MSH, {
        profile,
        strict: true,
        onWarning: () => optionsLog.push("o"),
      });
    }).toThrow(Hl7ParseError);
    expect(profileLog).toEqual([]);
    expect(optionsLog).toEqual([]);
  });

  it("multiple warnings: per-warning ordering invariant holds", () => {
    // Two ZZZ segments → two UNKNOWN_SEGMENT emissions.
    const raw = "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ADT^A01|MSG001|P|2.5\rZZZ|a\rZZZ|b\r";
    const sequence: string[] = [];
    const profile = defineProfile({
      name: "test",
      onWarning: (w) => sequence.push(`p:${String(w.position.segmentIndex)}`),
    });
    parseHL7(raw, {
      profile,
      onWarning: (w) => sequence.push(`o:${String(w.position.segmentIndex)}`),
    });
    // Expected: p:1, o:1, p:2, o:2. Every "o:N" must be preceded by a
    // matching "p:N" earlier in the sequence.
    for (let i = 0; i < sequence.length; i++) {
      const entry = sequence[i] ?? "";
      if (entry.startsWith("o:")) {
        const idx = entry.slice(2);
        const before = sequence.slice(0, i);
        expect(before).toContain(`p:${idx}`);
      }
    }
  });

  it("Option A hoist coverage: MLLP-framing warning (early pipeline) reaches BOTH handlers", () => {
    // MLLP-framed input triggers MLLP_FRAMING_STRIPPED in Step 8 (after the
    // Task-2 Step-7 emitter construction but before Step 11.5). If the
    // profile.onWarning chain only covered post-Step-11.5 warnings (Option B
    // lazy getter), this test would fail — it passes under Option A's
    // hoisted effectiveProfile resolution at Step 6.5.
    const VT = "\x0B";
    const FS = "\x1C";
    const CR = "\r";
    const framed =
      VT + "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ADT^A01|MSG001|P|2.5\rPID|||MRN\r" + FS + CR;
    const profileCodes: string[] = [];
    const optionsCodes: string[] = [];
    const profile = defineProfile({
      name: "test",
      onWarning: (w) => profileCodes.push(w.code),
    });
    parseHL7(framed, {
      profile,
      onWarning: (w) => optionsCodes.push(w.code),
    });
    expect(profileCodes).toContain(WARNING_CODES.MLLP_FRAMING_STRIPPED);
    expect(optionsCodes).toContain(WARNING_CODES.MLLP_FRAMING_STRIPPED);
  });
});
