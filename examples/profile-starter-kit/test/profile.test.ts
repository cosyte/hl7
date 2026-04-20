import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";
import { parseHL7 } from "@cosyte/hl7-parser";

import { MyProfile } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loadFixture = (relPath: string): string =>
  readFileSync(join(__dirname, "fixtures", relPath), "utf-8");

describe("MyProfile — starter kit sample", () => {
  const raw = loadFixture("sample.hl7");

  it("exposes name + description", () => {
    expect(MyProfile.name).toBe("{{PROFILE_NAME}}");
    expect(MyProfile.description).toContain("{{YOUR_ORG}}");
  });

  it("parses the sample ADT with no UNKNOWN_SEGMENT warning for ZAL", () => {
    const without = parseHL7(raw);
    const withP = parseHL7(raw, MyProfile);

    const zalUnknownWithout = without.warnings.filter(
      (w) => w.code === "UNKNOWN_SEGMENT" && w.message.includes("ZAL"),
    );
    const zalUnknownWith = withP.warnings.filter(
      (w) => w.code === "UNKNOWN_SEGMENT" && w.message.includes("ZAL"),
    );

    expect(zalUnknownWithout.length).toBeGreaterThanOrEqual(1);
    expect(zalUnknownWith.length).toBe(0);
  });

  it("exposes ZAL fields by alias", () => {
    const msg = parseHL7(raw, MyProfile);
    const zal = msg.segments("ZAL")[0];
    expect(zal).toBeDefined();
    expect(zal?.get("allergyId")?.value).toBeDefined();
    expect(zal?.get("severity")?.value).toBeDefined();
    expect(zal?.get("verifiedAt")?.value).toBeDefined();
  });

  it("re-serializes to spec-clean HL7 (profile-agnostic toString)", () => {
    const msg = parseHL7(raw, MyProfile);
    const out = msg.toString();
    expect(out.startsWith("MSH|^~\\&|")).toBe(true);
  });
});
