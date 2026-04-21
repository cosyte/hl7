import { afterEach, describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";
import { defineProfile } from "../src/profiles/define.js";
import { getDefaultProfile, setDefaultProfile } from "../src/profiles/default.js";

const BASE_MSH = "MSH|^~\\&|APP|FAC|APP|FAC|20250101120000||ADT^A01|MSG001|P|2.5\rPID|||MRN\r";

// CRITICAL: every test file that touches the default profile MUST clean up.
afterEach(() => {
  setDefaultProfile(null);
});

describe("setDefaultProfile + getDefaultProfile — basic wiring", () => {
  it("getDefaultProfile returns undefined before any set", () => {
    expect(getDefaultProfile()).toBeUndefined();
  });

  it("setDefaultProfile(p) then getDefaultProfile returns p", () => {
    const p = defineProfile({ name: "test" });
    setDefaultProfile(p);
    expect(getDefaultProfile()).toBe(p);
  });

  it("setDefaultProfile(null) clears — getDefaultProfile returns undefined", () => {
    const p = defineProfile({ name: "test" });
    setDefaultProfile(p);
    setDefaultProfile(null);
    expect(getDefaultProfile()).toBeUndefined();
  });

  it("re-setting overwrites", () => {
    const a = defineProfile({ name: "a" });
    const b = defineProfile({ name: "b" });
    setDefaultProfile(a);
    setDefaultProfile(b);
    expect(getDefaultProfile()).toBe(b);
  });
});

describe("parseHL7 default-profile dispatch (D-19)", () => {
  it("parseHL7(raw) with NO default and NO explicit → msg.profile undefined", () => {
    const msg = parseHL7(BASE_MSH);
    expect(msg.profile).toBeUndefined();
  });

  it("parseHL7(raw) with registered default → msg.profile populated", () => {
    const p = defineProfile({ name: "test-default" });
    setDefaultProfile(p);
    const msg = parseHL7(BASE_MSH);
    expect(msg.profile?.name).toBe("test-default");
  });

  it("parseHL7(raw, explicit) with a different default → explicit wins", () => {
    const def = defineProfile({ name: "default" });
    const explicit = defineProfile({ name: "explicit" });
    setDefaultProfile(def);
    const msg = parseHL7(BASE_MSH, explicit);
    expect(msg.profile?.name).toBe("explicit");
  });

  it("parseHL7(raw, { profile: null }) opts out → msg.profile undefined + default REMAINS set", () => {
    const p = defineProfile({ name: "test" });
    setDefaultProfile(p);
    const msg = parseHL7(BASE_MSH, { profile: null });
    expect(msg.profile).toBeUndefined();
    // Default is NOT cleared by the opt-out — still usable for next call.
    expect(getDefaultProfile()).toBe(p);
  });
});

describe("D-20 effects equivalence: default profile === explicit profile", () => {
  it("customSegments land equivalently via default vs explicit", () => {
    const p = defineProfile({
      name: "test",
      customSegments: { ZPI: { fields: { encounterId: 3 } } },
    });
    const raw = BASE_MSH + "ZPI|||ENC123\r";

    setDefaultProfile(p);
    const viaDefault = parseHL7(raw);

    // fresh parse explicit (doesn't modify default)
    const viaExplicit = parseHL7(raw, p);

    expect(viaDefault.segments("ZPI")[0]?.get("encounterId")?.value).toBe(
      viaExplicit.segments("ZPI")[0]?.get("encounterId")?.value,
    );
    expect(viaDefault.segments("ZPI")[0]?.get("encounterId")?.value).toBe("ENC123");
  });

  it("dateFormats land equivalently via default vs explicit", () => {
    const p = defineProfile({ name: "test", dateFormats: ["MM/DD/YYYY"] });
    const raw = "MSH|^~\\&|APP|FAC|APP|FAC|01/15/2025||ADT^A01|MSG001|P|2.5\rPID\r";

    setDefaultProfile(p);
    const viaDefault = parseHL7(raw);
    const viaExplicit = parseHL7(raw, p);

    expect(viaDefault.meta.timestamp?.toISOString()).toBe(
      viaExplicit.meta.timestamp?.toISOString(),
    );
  });

  it("profile lineage lands equivalently", () => {
    const parent = defineProfile({ name: "parent" });
    const child = defineProfile({ name: "child", extends: parent });

    setDefaultProfile(child);
    const viaDefault = parseHL7(BASE_MSH);
    const viaExplicit = parseHL7(BASE_MSH, child);

    expect(viaDefault.profile?.lineage).toEqual(viaExplicit.profile?.lineage);
    expect(viaDefault.profile?.lineage).toEqual(["parent", "child"]);
  });

  it("UNKNOWN_SEGMENT suppression lands equivalently (Plan 03 integration)", () => {
    const p = defineProfile({
      name: "test",
      customSegments: { ZPI: { fields: { a: 3 } } },
    });
    const raw = BASE_MSH + "ZPI|||X\r";

    setDefaultProfile(p);
    const viaDefault = parseHL7(raw);
    const viaExplicit = parseHL7(raw, p);

    const defaultCodes = viaDefault.warnings.map((w) => w.code);
    const explicitCodes = viaExplicit.warnings.map((w) => w.code);
    expect(defaultCodes).toEqual(explicitCodes);
    expect(defaultCodes).not.toContain("UNKNOWN_SEGMENT");
  });
});

describe("test-isolation contract (documents the afterEach obligation)", () => {
  it("afterEach cleanup prevents bleed — this test expects NO default set", () => {
    expect(getDefaultProfile()).toBeUndefined();
  });
});
