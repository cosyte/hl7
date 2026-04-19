import { describe, expect, it } from "vitest";
import { generateControlId } from "../src/builder/control-id.js";

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
    // 100 distinct IDs expected — the random suffix guarantees it with
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
});
