import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawComponent, RawRepetition } from "../src/parser/types.js";

import { readComponent, readSubcomponent } from "../src/model/types/_shared.js";

const enc = DEFAULT_ENCODING_CHARACTERS;

describe("model/types/_shared: readSubcomponent", () => {
  it("reads the subcomponent at index 0", () => {
    const comp: RawComponent = { subcomponents: ["Smith"] };
    expect(readSubcomponent(comp, 0, enc)).toBe("Smith");
  });

  it("auto-unescapes at the leaf (\\F\\ → field separator)", () => {
    const comp: RawComponent = { subcomponents: ["Smith\\F\\Jr"] };
    expect(readSubcomponent(comp, 0, enc)).toBe("Smith|Jr");
  });

  it("returns undefined for out-of-range index", () => {
    const comp: RawComponent = { subcomponents: ["Smith"] };
    expect(readSubcomponent(comp, 5, enc)).toBeUndefined();
  });

  it("returns undefined when component is undefined", () => {
    expect(readSubcomponent(undefined, 0, enc)).toBeUndefined();
  });

  it("maps empty string to undefined (optional-field omission signal)", () => {
    const comp: RawComponent = { subcomponents: [""] };
    expect(readSubcomponent(comp, 0, enc)).toBeUndefined();
  });
});

describe("model/types/_shared: readComponent", () => {
  it("reads the first subcomponent of the nth component", () => {
    const rep: RawRepetition = { components: [{ subcomponents: ["Smith"] }] };
    expect(readComponent(rep, 0, enc)).toBe("Smith");
  });

  it("returns undefined for out-of-range component index", () => {
    const rep: RawRepetition = { components: [{ subcomponents: ["Smith"] }] };
    expect(readComponent(rep, 5, enc)).toBeUndefined();
  });
});
