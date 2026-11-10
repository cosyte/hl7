/**
 * Edge cases of `defineProfile` the main suites do not reach: an empty option
 * key and a sparse `dateFormats` array, both of which a JavaScript caller can
 * pass past the types. All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import { ProfileDefinitionError, defineProfile } from "../src/index.js";

describe("defineProfile", () => {
  it("refuses an empty option key, offering no near match", () => {
    const options: Record<string, unknown> = { name: "p", "": 1 };
    expect(() => defineProfile(options as never)).toThrow(
      new ProfileDefinitionError(
        "Profile 'p' has unknown option key ''. Known keys: name, description, dateFormats, " +
          "customSegments, segmentOverrides, onWarning, extends.",
        "p",
      ),
    );
  });

  it("reads a hole in dateFormats as an empty format and refuses it by index", () => {
    const formats: string[] = [];
    formats.length = 2;
    formats[1] = "YYYY-MM-DD";
    expect(() => defineProfile({ name: "p", dateFormats: formats })).toThrow(
      /^Profile 'p' dateFormats\[0\] = "" is malformed: it contains no date token\./u,
    );
  });
});
