/**
 * The acknowledgment vocabularies the main entry point has always shipped, held to the same HL7
 * Terminology 7.5.0 tables the `@cosyte/hl7/tables` entry point ships, so the package has one
 * source of truth for each code and its display text.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ACK_CODES, ACK_CONDITIONS, ERR_CONDITION_CODES } from "../src/index.js";
import { V2_TABLES } from "../src/tables/index.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The one code `ERR_CONDITION_CODES` keeps that HL7 Terminology 7.5.0 does not carry. It stays so
 * that a caller who passes it to `buildAck` still gets the text it got before; the doc comment on
 * the map says it is not in the source.
 */
const KEPT_BEYOND_SOURCE = ["105"];

describe("ERR_CONDITION_CODES against table 0357", () => {
  it("carries every code of the source with the source's display text", () => {
    for (const entry of V2_TABLES["0357"].entries) {
      expect(ERR_CONDITION_CODES[entry.code], `code ${entry.code}`).toBe(entry.display);
    }
  });

  it("carries no other code but the one kept for callers that already send it", () => {
    const source = new Set(V2_TABLES["0357"].codes);
    const extra = Object.keys(ERR_CONDITION_CODES).filter((code) => !source.has(code));
    expect(extra).toEqual(KEPT_BEYOND_SOURCE);
  });
});

describe("ACK_CODES and ACK_CONDITIONS against tables 0008 and 0155", () => {
  it("ACK_CODES is exactly table 0008", () => {
    expect(Object.values(ACK_CODES).sort()).toEqual([...V2_TABLES["0008"].codes].sort());
  });

  it("ACK_CONDITIONS is exactly table 0155", () => {
    expect(Object.values(ACK_CONDITIONS).sort()).toEqual([...V2_TABLES["0155"].codes].sort());
  });
});

describe("the provenance cited in ack-tables.ts", () => {
  const text = readFileSync(path.join(REPO_ROOT, "src", "builder", "ack-tables.ts"), "utf8");

  it("cites each HL7 Terminology page at its versioned path", () => {
    for (const id of ["0008", "0155", "0357"]) {
      expect(text).toContain(`https://terminology.hl7.org/7.5.0/en/CodeSystem-v2-${id}.html`);
    }
  });

  it("cites every HL7 Terminology page under the 7.5.0 publication", () => {
    const cited = (text.match(/https:\/\/\S+/gu) ?? [])
      .map((raw) => new URL(raw))
      .filter((url) => url.hostname === "terminology.hl7.org");
    expect(cited.length).toBeGreaterThan(0);
    for (const url of cited) expect(url.pathname.startsWith("/7.5.0/en/")).toBe(true);
  });
});
