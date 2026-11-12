import { describe, expect, it, vi } from "vitest";
import { byteSource, generateControlId, randomSuffix } from "../src/builder/control-id.js";

describe("randomSuffix: the six random characters of a control ID", () => {
  /** A byte source that hands out `bytes` in order and throws past the last one. */
  function fixedBytes(...bytes: readonly number[]): () => number {
    let next = 0;
    return () => {
      const byte = bytes[next];
      if (byte === undefined) throw new Error("read past the fixed bytes");
      next += 1;
      return byte;
    };
  }

  it("maps each accepted byte onto the alphabet modulo 62", () => {
    // 62 and 123 wrap to A and 9; 247 is the last byte accepted, and 247 - 3 * 62 = 61.
    expect(randomSuffix(fixedBytes(0, 1, 61, 62, 123, 247))).toBe("AB9A99");
  });

  it("skips a byte of 248 or more rather than reduce it, so no character is favored", () => {
    expect(randomSuffix(fixedBytes(248, 249, 255, 0, 1, 2, 3, 4, 5))).toBe("ABCDEF");
  });

  it("reads exactly six accepted bytes and no more", () => {
    const bytes = [7, 8, 9, 10, 11, 12, 13];
    let read = 0;
    const suffix = randomSuffix(() => bytes[read++] ?? 255);
    expect(suffix).toBe("HIJKLM");
    expect(read).toBe(6);
  });
});

describe("byteSource: random bytes drawn many at a time and handed out one at a time", () => {
  /** A fill that writes 0, 1, 2, ... across its calls, and counts them. */
  function countingFill(): { fill: (bytes: Uint8Array) => void; calls: () => number } {
    let calls = 0;
    let value = 0;
    return {
      fill: (bytes) => {
        calls += 1;
        for (let i = 0; i < bytes.length; i++) bytes[i] = value++ % 256;
      },
      calls: () => calls,
    };
  }

  it("draws nothing until the first byte is asked for", () => {
    const counting = countingFill();
    byteSource(counting.fill, 4);
    expect(counting.calls()).toBe(0);
  });

  it("hands out each drawn byte once, in order, and draws again only when all are used", () => {
    const counting = countingFill();
    const next = byteSource(counting.fill, 4);
    const read = Array.from({ length: 9 }, () => next());
    expect(read).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(counting.calls()).toBe(3);
  });

  it("draws into a buffer of the size it was given", () => {
    const sizes: number[] = [];
    const next = byteSource((bytes) => {
      sizes.push(bytes.length);
      bytes.fill(1);
    }, 5);
    for (let i = 0; i < 6; i++) next();
    expect(sizes).toEqual([5, 5]);
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

  it("draws its random bytes from Web Crypto many IDs at a time, not once an ID", () => {
    // A `crypto.getRandomValues` call for every ID made each ACK measurably slower, so the bytes
    // are drawn a pool at a time. 200 IDs read about 1,240 bytes.
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    try {
      for (let i = 0; i < 200; i++) generateControlId();
      expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
    } finally {
      spy.mockRestore();
    }
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
