/**
 * The registry records where it came from, and the record is checkable.
 *
 * These tests do not take the shipped provenance at its word: every sha256 is
 * recomputed from the vendored bytes on disk, and every recognized pair is
 * checked back against the publication's own message list. A provenance record
 * nobody verifies is a comment.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MESSAGE_STRUCTURE_DEFINITIONS, STRUCTURE_REGISTRY_PROVENANCE } from "../src/index.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = path.join(REPO_ROOT, "vendor", "hl7-v2ig");

const PUBLICATION_COMMIT = "51dfdd968cf2a14038505c5b2f3d97edd21f1b02";

describe("AC3: the registry is derived from the publication and says so", () => {
  it("names the publication it was derived from", () => {
    expect(STRUCTURE_REGISTRY_PROVENANCE.publication.repository).toBe("HL7/v2ig");
    expect(STRUCTURE_REGISTRY_PROVENANCE.publication.tree).toBe("input/sourceOfTruth");
    expect(STRUCTURE_REGISTRY_PROVENANCE.snapshotTakenAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("every derived entry points at a published structure that is vendored", () => {
    const vendored = new Set(
      readdirSync(path.join(VENDOR_DIR, "message-structure")).map((n) =>
        n.slice(0, -".json".length),
      ),
    );
    for (const def of MESSAGE_STRUCTURE_DEFINITIONS) {
      if (def.derivation !== "published") continue;
      expect(def.structureIds.length).toBeGreaterThan(0);
      for (const id of def.structureIds) expect(vendored.has(id)).toBe(true);
    }
  });

  it("the shipped provenance agrees with the snapshot's own record", () => {
    const snapshot: unknown = JSON.parse(
      readFileSync(path.join(VENDOR_DIR, "snapshot.json"), "utf8"),
    );
    const doc = snapshot as {
      publication: Record<string, string>;
      snapshotTakenAt: string;
      files: { path: string; sha256: string }[];
    };
    expect(STRUCTURE_REGISTRY_PROVENANCE.publication.commit).toBe(doc.publication["commit"]);
    expect(STRUCTURE_REGISTRY_PROVENANCE.snapshotTakenAt).toBe(doc.snapshotTakenAt);
    const recorded = new Map(doc.files.map((f) => [f.path, f.sha256]));
    for (const file of STRUCTURE_REGISTRY_PROVENANCE.files) {
      expect(recorded.get(file.path)).toBe(file.sha256);
    }
  });
});

describe("AC4: the provenance names the commit, the hashes and every pair's structure", () => {
  it("names the exact publication commit", () => {
    expect(STRUCTURE_REGISTRY_PROVENANCE.publication.commit).toBe(PUBLICATION_COMMIT);
  });

  it("carries a verifiable sha256 for every vendored file it was derived from", () => {
    const structures = readdirSync(path.join(VENDOR_DIR, "message-structure")).filter((n) =>
      n.endsWith(".json"),
    );
    expect(structures).toHaveLength(81);
    // 81 structure definitions plus the two control manifests.
    expect(STRUCTURE_REGISTRY_PROVENANCE.files).toHaveLength(83);

    for (const file of STRUCTURE_REGISTRY_PROVENANCE.files) {
      const bytes = readFileSync(path.join(VENDOR_DIR, file.path));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
      expect(bytes.byteLength).toBe(file.bytes);
      expect(file.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/HL7\/v2ig\//);
    }
  });

  it("covers both control manifests and every structure file", () => {
    const recorded = new Set(STRUCTURE_REGISTRY_PROVENANCE.files.map((f) => f.path));
    expect(recorded.has(path.join("control-manifests", "messages.json"))).toBe(true);
    expect(recorded.has(path.join("control-manifests", "message_structures.json"))).toBe(true);
    for (const name of readdirSync(path.join(VENDOR_DIR, "message-structure"))) {
      expect(recorded.has(path.join("message-structure", name))).toBe(true);
    }
  });

  it("names the structure id behind every recognized pair", () => {
    const byPair = new Map(
      STRUCTURE_REGISTRY_PROVENANCE.pairs.map((p) => [`${p.messageCode}^${p.triggerEvent}`, p]),
    );
    for (const def of MESSAGE_STRUCTURE_DEFINITIONS) {
      const events = def.triggerEvents.length === 0 ? [""] : def.triggerEvents;
      for (const event of events) {
        const pair = byPair.get(`${def.messageCode}^${event}`);
        expect(pair, `${def.messageCode}^${event} has no provenance row`).toBeDefined();
        expect(pair?.structureId).toBe(def.structureId);
      }
    }
  });

  it("each pair's structure id is the one the publication's message list gives it", () => {
    const messages: unknown = JSON.parse(
      readFileSync(path.join(VENDOR_DIR, "control-manifests", "messages.json"), "utf8"),
    );
    const published = new Map<string, string>();
    for (const entry of (messages as { entry: { item: { display: string } }[] }).entry) {
      const head = entry.item.display.split(":", 1)[0] ?? "";
      const parts = head.split("^");
      if (parts.length !== 3) continue;
      published.set(`${parts[0] ?? ""}^${parts[1] ?? ""}`, parts[2] ?? "");
    }
    let checked = 0;
    for (const pair of STRUCTURE_REGISTRY_PROVENANCE.pairs) {
      if (pair.structureId === "") continue; // the retained transcription
      if (pair.triggerEvent === "") continue; // a code-alone match
      expect(published.get(`${pair.messageCode}^${pair.triggerEvent}`)).toBe(pair.structureId);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("records the variant family read for each referenced structure", () => {
    const families = new Map(
      STRUCTURE_REGISTRY_PROVENANCE.families.map((f) => [f.structureId, f.members]),
    );
    expect(families.get("ADT_A01")).toEqual(["ADT_A01-A", "ADT_A01-B", "ADT_A01-C", "ADT_A01-D"]);
    expect(families.get("ACK")).toEqual(["ACK"]);
    for (const def of MESSAGE_STRUCTURE_DEFINITIONS) {
      if (def.derivation !== "published") continue;
      expect(families.get(def.structureId)).toEqual(def.structureIds);
    }
  });

  it("the retained pair is present with an empty structure id", () => {
    const orm = STRUCTURE_REGISTRY_PROVENANCE.pairs.find(
      (p) => p.messageCode === "ORM" && p.triggerEvent === "O01",
    );
    expect(orm).toBeDefined();
    expect(orm?.structureId).toBe("");
  });

  it("the provenance record is frozen", () => {
    expect(Object.isFrozen(STRUCTURE_REGISTRY_PROVENANCE)).toBe(true);
    expect(Object.isFrozen(STRUCTURE_REGISTRY_PROVENANCE.publication)).toBe(true);
    expect(Object.isFrozen(STRUCTURE_REGISTRY_PROVENANCE.files)).toBe(true);
    expect(Object.isFrozen(STRUCTURE_REGISTRY_PROVENANCE.pairs)).toBe(true);
  });
});
