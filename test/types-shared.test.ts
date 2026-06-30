import { describe, expect, it } from "vitest";

import { DEFAULT_ENCODING_CHARACTERS } from "../src/parser/delimiters.js";
import type { RawComponent, RawRepetition } from "../src/parser/types.js";

import {
  readComponent,
  readExtraComponents,
  readSubcomponent,
} from "../src/model/types/_shared.js";

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

describe("model/types/_shared: readExtraComponents", () => {
  function rep(components: string[][]): RawRepetition {
    return { components: components.map((sc) => ({ subcomponents: sc })) };
  }

  it("returns undefined when there is nothing beyond fromIndex", () => {
    expect(readExtraComponents(rep([["A"], ["B"]]), 2, enc)).toBeUndefined();
  });

  it("returns undefined when every extra component is empty", () => {
    expect(readExtraComponents(rep([["A"], ["B"], [""], [""]]), 2, enc)).toBeUndefined();
  });

  it("collects extra components verbatim, in order", () => {
    const out = readExtraComponents(rep([["A"], ["B"], ["X"], ["Y"], ["Z"]]), 2, enc);
    expect(out).toEqual(["X", "Y", "Z"]);
  });

  it("preserves an absent interior component as '' to keep positional mapping", () => {
    const out = readExtraComponents(rep([["A"], [""], ["Y"]]), 1, enc);
    expect(out).toEqual(["", "Y"]);
  });

  it("strips trailing empties (D-02 parity)", () => {
    const out = readExtraComponents(rep([["A"], ["X"], [""], [""]]), 1, enc);
    expect(out).toEqual(["X"]);
  });

  it("auto-unescapes extra components", () => {
    const out = readExtraComponents(rep([["A"], ["X\\F\\Y"]]), 1, enc);
    expect(out).toEqual(["X|Y"]);
  });

  it("returns a frozen array", () => {
    const out = readExtraComponents(rep([["A"], ["X"]]), 1, enc);
    expect(Object.isFrozen(out)).toBe(true);
  });
});
