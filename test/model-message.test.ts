import { describe, expect, it } from "vitest";

import { Hl7Message } from "../src/model/message.js";
import type { EncodingCharacters, RawSegment } from "../src/parser/types.js";
import type { Hl7ParseWarning } from "../src/parser/warnings.js";

const enc: EncodingCharacters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
};
const emptySegments: readonly RawSegment[] = [];
const noWarnings: readonly Hl7ParseWarning[] = [];

describe("model/message: Hl7Message shell", () => {
  it("constructs with all 5 public fields populated and profile undefined", () => {
    const msg = new Hl7Message({
      segments: emptySegments,
      encodingCharacters: enc,
      version: "2.5",
      warnings: noWarnings,
    });
    expect(msg.rawSegments).toBe(emptySegments);
    expect(msg.encodingCharacters.field).toBe("|");
    expect(msg.version).toBe("2.5");
    expect(msg.warnings).toHaveLength(0);
    expect(msg.profile).toBeUndefined();
  });

  it("rejects mutation of fields at compile time", () => {
    const msg = new Hl7Message({
      segments: emptySegments,
      encodingCharacters: enc,
      version: "2.5",
      warnings: noWarnings,
    });
    // @ts-expect-error version is readonly
    msg.version = "2.8";
    expect(msg.version).toBeDefined();
  });

  it("freezes the warnings array after construction", () => {
    const msg = new Hl7Message({
      segments: emptySegments,
      encodingCharacters: enc,
      version: "2.5",
      warnings: noWarnings,
    });
    expect(Object.isFrozen(msg.warnings)).toBe(true);
  });

  it("exposes profile when provided in init", () => {
    const msg = new Hl7Message({
      segments: emptySegments,
      encodingCharacters: enc,
      version: "2.5",
      warnings: noWarnings,
      profile: { name: "epic", lineage: ["base", "epic"] },
    });
    expect(msg.profile?.name).toBe("epic");
    expect(msg.profile?.lineage).toEqual(["base", "epic"]);
  });

  it("leaves profile as undefined when omitted from init", () => {
    const msg = new Hl7Message({
      segments: emptySegments,
      encodingCharacters: enc,
      version: "2.5",
      warnings: noWarnings,
    });
    expect(msg.profile).toBeUndefined();
  });
});
