/**
 * The built-in profiles in `src/profiles/index.ts`, read straight from the module the package
 * imports, with no mock and no fresh import: each getter builds its profile on the first read and
 * hands back that same frozen object on every read after it. A builder makes a new object on each
 * call, so a cache that missed every time, or a getter that built a different profile, would give a
 * second read that is not the first.
 */

import { describe, expect, it } from "vitest";

import { profiles } from "../src/profiles/index.js";
import { athena } from "../src/profiles/athena.js";
import { epic } from "../src/profiles/epic.js";

const NAMES = [
  "athena",
  "cerner",
  "epic",
  "genericLab",
  "meditech",
  "philips",
  "va",
  "visage",
] as const;

describe("profiles", () => {
  it("builds a new object on each call of a builder, so identity tells a cache hit from a miss", () => {
    expect(epic()).not.toBe(epic());
    expect(athena()).not.toBe(athena());
  });

  for (const name of NAMES) {
    it(`${name}: the same frozen profile, named ${name}, on every read`, () => {
      const first = profiles[name];
      expect(first).toBeDefined();
      expect(first.name).toBe(name);
      expect(Object.isFrozen(first)).toBe(true);
      expect(profiles[name]).toBe(first);
      expect(profiles[name]).toBe(first);
    });
  }

  it("gives each name its own profile", () => {
    const read = NAMES.map((name) => profiles[name]);
    expect(new Set(read).size).toBe(NAMES.length);
  });
});
