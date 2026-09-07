/**
 * The generator itself: reproducibility, the unresolved-pairs report, and the
 * refusals.
 *
 * The generator is the reason the shipped registry can be trusted, so it is
 * tested the way a build tool is tested: re-run it and demand the identical
 * bytes, take a structure away and demand it says so instead of guessing, and
 * corrupt an input and demand a refusal that names the file and writes nothing.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  DERIVATION_REPORT_PATH,
  REGISTRY_MODULE_PATH,
  VENDOR_DIR,
  deriveRegistry,
  main,
  renderDerivationReport,
  renderRegistryModule,
} from "../scripts/generate-message-structures.js";
import { analyzeMessageStructure, parseHL7, WARNING_CODES } from "../src/index.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REAL_VENDOR = path.join(REPO_ROOT, VENDOR_DIR);

const scratch: string[] = [];

/** A throwaway repo root holding a copy of the vendored snapshot. */
function scratchRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "hl7-structgen-"));
  scratch.push(root);
  mkdirSync(path.join(root, VENDOR_DIR), { recursive: true });
  cpSync(REAL_VENDOR, path.join(root, VENDOR_DIR), { recursive: true });
  mkdirSync(path.join(root, path.dirname(REGISTRY_MODULE_PATH)), { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("AC5: re-running the generator reproduces the committed artifact", () => {
  it("renders the committed registry module byte for byte, with no network", async () => {
    const realFetch = globalThis.fetch;
    // A generator that reached for the network would fail loudly here rather
    // than quietly succeeding on a machine that happens to have egress.
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error("the generator must not make a network call");
      },
    });
    try {
      const model = deriveRegistry(REAL_VENDOR);
      const rendered = await renderRegistryModule(model, REPO_ROOT);
      expect(rendered).toBe(readFileSync(path.join(REPO_ROOT, REGISTRY_MODULE_PATH), "utf8"));
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: realFetch,
      });
    }
  });

  it("renders the committed derivation report byte for byte", () => {
    const model = deriveRegistry(REAL_VENDOR);
    expect(renderDerivationReport(model)).toBe(
      readFileSync(path.join(REPO_ROOT, DERIVATION_REPORT_PATH), "utf8"),
    );
  });

  it("two runs over the same snapshot agree", () => {
    expect(renderDerivationReport(deriveRegistry(REAL_VENDOR))).toBe(
      renderDerivationReport(deriveRegistry(REAL_VENDOR)),
    );
  });

  it("carries no network primitive in its own source", () => {
    const source = readFileSync(
      path.join(REPO_ROOT, "scripts", "generate-message-structures.ts"),
      "utf8",
    );
    for (const forbidden of ["node:http", "node:https", "node:net", "node:dgram", "fetch("]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("writes both artifacts when it succeeds", async () => {
    const root = scratchRoot();
    await main(root);
    expect(existsSync(path.join(root, REGISTRY_MODULE_PATH))).toBe(true);
    expect(existsSync(path.join(root, DERIVATION_REPORT_PATH))).toBe(true);
  });
});

describe("AC12: an unresolvable pair is reported, and the parser stays silent on it", () => {
  const report: unknown = JSON.parse(
    readFileSync(path.join(REPO_ROOT, DERIVATION_REPORT_PATH), "utf8"),
  );
  const doc = report as {
    unresolvedPairs: { messageCode: string; triggerEvent: string; reason: string }[];
    unreferencedStructures: string[];
    resolvedPairCount: number;
  };

  it("the committed report names every pair the derivation could not resolve", () => {
    expect(doc.unresolvedPairs.map((p) => `${p.messageCode}^${p.triggerEvent}`)).toEqual([
      "ADT^A18",
      "ADT^A30",
      "ADT^A34",
      "ADT^A35",
      "ADT^A36",
      "ADT^A39",
      "ADT^A46",
      "ADT^A48",
    ]);
    for (const pair of doc.unresolvedPairs) expect(pair.reason).not.toBe("");
  });

  it("the parser is silent on every unresolved pair rather than guessing", () => {
    for (const pair of doc.unresolvedPairs) {
      const raw = `MSH|^~\\&|A|F|||20250102||${pair.messageCode}^${pair.triggerEvent}|1|P|2.5.1\rEVN||20250102\r`;
      const msg = parseHL7(raw);
      expect(msg.structure.recognized).toBe(false);
      expect(
        msg.warnings.filter((w) => w.code === WARNING_CODES.MISSING_EXPECTED_GROUP),
      ).toHaveLength(0);
      expect(
        analyzeMessageStructure(pair.messageCode, pair.triggerEvent, new Set()).recognized,
      ).toBe(false);
    }
  });

  it("records the orphan structure the one-letter family rule keeps out", () => {
    expect(doc.unreferencedStructures).toEqual(["ACK-Scheduling"]);
  });

  it("a structure missing from the snapshot is reported, not guessed, and does not fail the build", () => {
    const root = scratchRoot();
    rmSync(path.join(root, VENDOR_DIR, "message-structure", "VXU_V04.json"));
    const model = deriveRegistry(path.join(root, VENDOR_DIR));
    const unresolved = model.unresolved.find(
      (p) => p.messageCode === "VXU" && p.triggerEvent === "V04",
    );
    expect(unresolved?.referencedStructureId).toBe("VXU_V04");
    expect(unresolved?.reason).toContain("vendored snapshot does not carry it");
    expect(model.entries.some((e) => e.messageCode === "VXU")).toBe(false);
    // The rest of the registry is unaffected: a coverage gap is not a failure.
    expect(model.entries.some((e) => e.messageCode === "ORU")).toBe(true);
  });
});

describe("AC13: a malformed input refuses, naming the file, writing nothing", () => {
  it("refuses a file that is not valid JSON", async () => {
    const root = scratchRoot();
    const target = path.join(root, VENDOR_DIR, "message-structure", "ADT_A02.json");
    writeFileSync(target, "{ this is not json");
    await expect(main(root)).rejects.toThrow(/not valid JSON/);
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/ADT_A02\.json/);
    expect(existsSync(path.join(root, REGISTRY_MODULE_PATH))).toBe(false);
    expect(existsSync(path.join(root, DERIVATION_REPORT_PATH))).toBe(false);
  });

  it("refuses a file with no differential.element array", async () => {
    const root = scratchRoot();
    const target = path.join(root, VENDOR_DIR, "message-structure", "ORU_R01-B.json");
    writeFileSync(target, JSON.stringify({ resourceType: "StructureDefinition", id: "ORU_R01-B" }));
    await expect(main(root)).rejects.toThrow(/differential\.element/);
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/ORU_R01-B\.json/);
    expect(existsSync(path.join(root, REGISTRY_MODULE_PATH))).toBe(false);
  });

  it("refuses a file it cannot read", async () => {
    const root = scratchRoot();
    const target = path.join(root, VENDOR_DIR, "message-structure", "SIU_S12.json");
    rmSync(target);
    mkdirSync(target);
    await expect(main(root)).rejects.toThrow(/Cannot read vendored file/);
    expect(existsSync(path.join(root, REGISTRY_MODULE_PATH))).toBe(false);
  });

  it("refuses an element whose parent is not in the file", () => {
    const root = scratchRoot();
    const target = path.join(root, VENDOR_DIR, "message-structure", "ADT_A03.json");
    writeFileSync(
      target,
      JSON.stringify({
        // Both elements carry a `max`, so the orphan reaches the parent check
        // rather than being refused earlier for an unusable occurrence maximum.
        differential: {
          element: [
            { id: "ADT_A03", min: 0, max: "*" },
            { id: "ADT_A03.9-ORPHAN.1-PID", min: 1, max: "1" },
          ],
        },
      }),
    );
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/unknown parent/);
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/ADT_A03\.json/);
  });

  it("refuses an element with a non-integer minimum", () => {
    const root = scratchRoot();
    const target = path.join(root, VENDOR_DIR, "message-structure", "ADT_A12.json");
    writeFileSync(
      target,
      JSON.stringify({
        differential: { element: [{ id: "ADT_A12", min: "one" }] },
      }),
    );
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/non-integer min/);
  });

  it("refuses a control manifest that carries no entry array", () => {
    const root = scratchRoot();
    writeFileSync(
      path.join(root, VENDOR_DIR, "control-manifests", "messages.json"),
      JSON.stringify({ resourceType: "List" }),
    );
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/no entry array/);
  });

  it("refuses a vendored file with no recorded upstream URL", () => {
    const root = scratchRoot();
    const snapshotPath = path.join(root, VENDOR_DIR, "snapshot.json");
    const snapshot: unknown = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const doc = snapshot as { files: { path: string }[] };
    doc.files = doc.files.filter((f) => !f.path.endsWith("ACK.json"));
    writeFileSync(snapshotPath, JSON.stringify(doc, null, 2));
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/no recorded upstream URL/);
  });

  it("refuses an empty structure directory rather than shipping an empty registry", () => {
    const root = scratchRoot();
    rmSync(path.join(root, VENDOR_DIR, "message-structure"), { recursive: true });
    mkdirSync(path.join(root, VENDOR_DIR, "message-structure"));
    expect(() => deriveRegistry(path.join(root, VENDOR_DIR))).toThrow(/carries no structures/);
  });
});
