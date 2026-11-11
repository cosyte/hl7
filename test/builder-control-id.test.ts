import { describe, expect, it } from "vitest";
import { generateControlId, randomSuffix } from "../src/builder/control-id.js";

describe("randomSuffix: the six random characters of a control ID", () => {
  /**
   * A draw that hands out `draws`, one array per call, with every byte it does not set at 255 (a
   * byte that is always rejected). It throws past the last array rather than loop for ever.
   */
  function fixedDraws(...draws: readonly (readonly number[])[]): {
    draw: (bytes: Uint8Array) => void;
    calls: () => number;
  } {
    let call = 0;
    return {
      draw: (bytes) => {
        const next = draws[call];
        if (next === undefined) throw new Error("drew past the fixed bytes");
        bytes.fill(255);
        bytes.set(next);
        call += 1;
      },
      calls: () => call,
    };
  }

  it("maps each accepted byte onto the alphabet modulo 62", () => {
    // 62 and 123 wrap to A and 9; 247 is the last byte accepted, and 247 - 3 * 62 = 61.
    expect(randomSuffix(fixedDraws([0, 1, 61, 62, 123, 247]).draw)).toBe("AB9A99");
  });

  it("skips a byte of 248 or more rather than reduce it, so no character is favored", () => {
    expect(randomSuffix(fixedDraws([248, 249, 255, 0, 1, 2, 3, 4, 5]).draw)).toBe("ABCDEF");
  });

  it("draws again when a whole draw is rejected", () => {
    const draws = fixedDraws([], [7, 8, 9, 10, 11, 12]);
    expect(randomSuffix(draws.draw)).toBe("HIJKLM");
    expect(draws.calls()).toBe(2);
  });

  it("stops at six characters when a draw accepts more", () => {
    expect(randomSuffix(fixedDraws([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).draw)).toBe("ABCDEF");
  });
});

describe("generateControlId (D-12)", () => {
  it("returns a 23-character string", () => {
    const id = generateControlId();
    expect(id).toHaveLength(23);
    expect(typeof id).toBe("string");
  });

  it("matches /^[0-9]{17}[A-Za-z0-9]{6}$/", () => {
    const id = generateControlId();
    expect(id).toMatch(/^[0-9]{17}[A-Za-z0-9]{6}$/);
  });

  it("first 17 chars are a plausible UTC timestamp anchored to now", () => {
    const before = new Date().getUTCFullYear();
    const id = generateControlId();
    const idYear = parseInt(id.slice(0, 4), 10);
    // Allow year-1 if the test runs exactly at UTC midnight new-year's-eve.
    expect(idYear === before || idYear === before + 1).toBe(true);
  });

  it("month component is 1-12 (never 0, never 13+)", () => {
    const id = generateControlId();
    const month = parseInt(id.slice(4, 6), 10);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
  });

  it("day component is 1-31", () => {
    const id = generateControlId();
    const day = parseInt(id.slice(6, 8), 10);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(31);
  });

  it("generates distinct IDs for back-to-back calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateControlId());
    // 100 distinct IDs expected: the random suffix guarantees it with
    // overwhelming probability. If this ever fails, investigate Math.random
    // being mocked/frozen in the test env.
    expect(ids.size).toBe(100);
  });

  it("never throws", () => {
    expect(() => generateControlId()).not.toThrow();
  });

  it("suffix is 6 chars from [A-Za-z0-9]", () => {
    const id = generateControlId();
    const suffix = id.slice(17);
    expect(suffix).toHaveLength(6);
    expect(suffix).toMatch(/^[A-Za-z0-9]{6}$/);
  });

  describe("the random suffix is uniform over the 62-character alphabet", () => {
    const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const IDS = 20_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < IDS; i++) {
      for (const char of generateControlId().slice(17)) {
        counts.set(char, (counts.get(char) ?? 0) + 1);
      }
    }
    const total = IDS * 6;

    it("can produce every character of the alphabet and nothing else", () => {
      expect([...counts.keys()].sort()).toEqual([...ALPHABET].sort());
    });

    it("does not favor the first 8 characters, as reducing a random byte modulo 62 would", () => {
      // 256 = 4 * 62 + 8, so a byte reduced modulo 62 lands on each of A..H with probability
      // 5/256 and on every other character with 4/256: A..H together would draw 15.6% of the
      // characters instead of the uniform 8/62, 12.9%. Over 120,000 characters the uniform share
      // has a standard deviation of about 0.1 percentage points, so the midpoint, 14.3%, sits more
      // than ten deviations from either outcome.
      const firstEight = [...ALPHABET.slice(0, 8)].reduce(
        (sum, c) => sum + (counts.get(c) ?? 0),
        0,
      );
      expect(firstEight / total).toBeLessThan(0.143);
      expect(firstEight / total).toBeGreaterThan(0.116);
    });
  });
});
