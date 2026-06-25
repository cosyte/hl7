/**
 * Property tests for the immutability contract of the parsed model.
 *
 * The model's read surface (`rawSegments`, `warnings`, `Segment`, `Field`) is
 * declared `readonly` at the type level; the ONLY sanctioned way to change a
 * message is the explicit mutation API (`setField`, `addSegment`,
 * `removeSegment`). These properties assert, over generated messages, that:
 *
 *   1. The `warnings` array is frozen and survives mutation by reference
 *      (mutation methods never touch it — model/message.ts D-16).
 *   2. Cached wrapper arrays (`segments(type)` / `allSegments()`) are rebuilt
 *      (new identity) after a mutation — i.e. a mutation cannot leave a stale
 *      wrapper aliasing freed internals (D-17).
 *   3. A read of one message is not perturbed by mutating a SEPARATE parse of
 *      the same bytes — no shared mutable tree leaks across `parseHL7` calls.
 *   4. `setField` does not retroactively alter the value seen through a
 *      Segment/Field wrapper captured BEFORE the mutation (the old wrapper
 *      still points at the pre-mutation raw node — no in-place leaf mutation).
 *   5. `toString()` is a pure read: calling it does not mutate the message
 *      (serialize twice → identical bytes, rawSegments identity unchanged).
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { type Hl7ParseWarning, parseHL7 } from "../../src/index.js";

import { specCleanMessageRaw, safeValue } from "./_arbitraries.js";

/** Stable seed + run budget so failures reproduce deterministically. */
const RUN_CONFIG = { numRuns: 300, seed: 20_260_625 } as const;

describe("property: parsed model immutability", () => {
  it("warnings array is frozen and identity-stable across a mutation", () => {
    fc.assert(
      fc.property(specCleanMessageRaw(), safeValue(), (raw, value) => {
        const msg = parseHL7(raw);
        const warningsRef = msg.warnings;
        expect(Object.isFrozen(msg.warnings)).toBe(true);
        // A guaranteed-present field on MSH (sending app at MSH.3) — safe to set.
        msg.setField("MSH.3", value);
        expect(msg.warnings).toBe(warningsRef);
        expect(Object.isFrozen(msg.warnings)).toBe(true);
      }),
      RUN_CONFIG,
    );
  });

  it("segment/allSegments caches are rebuilt (new identity) after setField", () => {
    fc.assert(
      fc.property(specCleanMessageRaw(), safeValue(), (raw, value) => {
        const msg = parseHL7(raw);
        const beforeAll = msg.allSegments();
        const beforeMsh = msg.segments("MSH");
        msg.setField("MSH.3", value);
        // Wholesale invalidation: new array identities after mutation.
        expect(msg.allSegments()).not.toBe(beforeAll);
        expect(msg.segments("MSH")).not.toBe(beforeMsh);
        // And the new read reflects the mutation.
        expect(msg.get("MSH.3")).toBe(value);
      }),
      RUN_CONFIG,
    );
  });

  it("two independent parses of the same bytes do not share a mutable tree", () => {
    fc.assert(
      fc.property(specCleanMessageRaw(), safeValue(), (raw, value) => {
        const a = parseHL7(raw);
        const b = parseHL7(raw);
        const bMshBefore = b.get("MSH.3");
        // Mutating `a` must not change `b`.
        a.setField("MSH.3", value + "_MUT");
        expect(b.get("MSH.3")).toBe(bMshBefore);
        expect(a.get("MSH.3")).toBe(value + "_MUT");
      }),
      RUN_CONFIG,
    );
  });

  it("a Field wrapper captured before setField is not retroactively mutated", () => {
    fc.assert(
      fc.property(specCleanMessageRaw(), safeValue(), (raw, value) => {
        const msg = parseHL7(raw);
        const mshBefore = msg.segments("MSH")[0];
        // MSH must exist (parse would have thrown NO_MSH_SEGMENT otherwise).
        if (mshBefore === undefined) return;
        const oldField = mshBefore.field(3);
        const oldValue = oldField.value;
        msg.setField("MSH.3", value + "_NEW");
        // The OLD field wrapper still reflects the pre-mutation leaf (the
        // mutation rebuilt the path leaf-to-root rather than editing in place).
        expect(oldField.value).toBe(oldValue);
        // The freshly-read field reflects the new value.
        expect(msg.segments("MSH")[0]?.field(3).value).toBe(value + "_NEW");
      }),
      RUN_CONFIG,
    );
  });

  it("toString() is a pure read — no mutation of the message", () => {
    fc.assert(
      fc.property(specCleanMessageRaw(), (raw) => {
        const msg = parseHL7(raw);
        const treeRef = msg.rawSegments;
        const once = msg.toString();
        const twice = msg.toString();
        expect(twice).toBe(once);
        // Serialization did not swap the underlying tree reference.
        expect(msg.rawSegments).toBe(treeRef);
      }),
      RUN_CONFIG,
    );
  });

  it("readonly leaf arrays cannot be appended through the public surface (frozen warnings)", () => {
    // The strongest runtime guarantee the model makes is the frozen warnings
    // array; rawSegments is readonly at the type level. Assert a mutation
    // attempt on the frozen array throws in strict mode (Object.freeze).
    fc.assert(
      fc.property(specCleanMessageRaw(), (raw) => {
        const msg = parseHL7(raw);
        expect(Object.isFrozen(msg.warnings)).toBe(true);
        // Runtime probe: call Array.prototype.push against the frozen array.
        // Going through the prototype method (rather than `msg.warnings.push`)
        // keeps the receiver typed as a concrete array, so the type-checked
        // lint rules stay satisfied while we still exercise the freeze.
        const frozen: readonly Hl7ParseWarning[] = msg.warnings;
        expect(() => {
          Array.prototype.push.call(frozen, {
            code: "MLLP_FRAMING_STRIPPED",
            message: "x",
            position: { segmentIndex: 0 },
          });
        }).toThrow(TypeError);
        // The freeze held — length is unchanged.
        expect(msg.warnings).toBe(frozen);
      }),
      RUN_CONFIG,
    );
  });
});
