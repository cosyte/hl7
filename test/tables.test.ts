/**
 * The `@cosyte/hl7/tables` entry point, read against the data the generator wrote from the
 * vendored HL7 Terminology 7.5.0 files.
 *
 * The counts and codes below were read off the vendored XML by hand, not off the generated module,
 * so a generator that dropped, merged or invented a code reds here even though its own output would
 * agree with itself.
 */

import { describe, expect, it } from "vitest";

import {
  V2_TABLE_IDS,
  V2_TABLE_SOURCE,
  V2_TABLES,
  V2_VERSIONS,
  lookupV2Code,
  v2TableCodes,
  type V2TableId,
} from "../src/tables/index.js";

/** How many concepts each vendored code system carries, counted from the XML. */
const CONCEPT_COUNTS: Readonly<Record<V2TableId, number>> = {
  "0003": 384,
  "0008": 6,
  "0076": 159,
  "0103": 5,
  "0104": 17,
  "0155": 4,
  "0211": 25,
  "0357": 16,
};

/** The two long dashes, by code point, so this file holds neither. */
const LONG_DASHES = [0x2010 + 3, 0x2010 + 4].map((point) => String.fromCodePoint(point));

describe("the eight tables", () => {
  it("ships exactly the eight structural tables, in a stable order", () => {
    expect(V2_TABLE_IDS).toEqual(["0003", "0008", "0076", "0103", "0104", "0155", "0211", "0357"]);
    expect(Object.keys(V2_TABLES).sort()).toEqual([...V2_TABLE_IDS]);
  });

  it("carries every concept of each source code system, with no duplicate code", () => {
    for (const id of V2_TABLE_IDS) {
      const table = V2_TABLES[id];
      expect(table.id).toBe(id);
      expect(table.entries).toHaveLength(CONCEPT_COUNTS[id]);
      expect(new Set(table.codes).size, `${id} repeats a code`).toBe(table.codes.length);
      expect(table.codes).toEqual(table.entries.map((entry) => entry.code));
    }
  });

  it("names each table and its HL7 Terminology code system at the versioned path", () => {
    for (const id of V2_TABLE_IDS) {
      const table = V2_TABLES[id];
      expect(table.type).toBe("HL7");
      expect(table.codeSystemUrl).toBe(`http://terminology.hl7.org/CodeSystem/v2-${id}`);
      expect(table.pageUrl).toBe(`https://terminology.hl7.org/7.5.0/en/CodeSystem-v2-${id}.html`);
    }
    expect(V2_TABLES["0103"].name).toBe("Processing ID");
    expect(V2_TABLES["0357"].name).toBe("Message Error Condition Codes");
  });

  it("records the version each table was introduced in, from the source's table list", () => {
    expect(V2_TABLES["0003"].introducedIn).toBe("2.1");
    expect(V2_TABLES["0155"].introducedIn).toBe("2.2");
    expect(V2_TABLES["0211"].introducedIn).toBe("2.3");
    expect(V2_TABLES["0357"].introducedIn).toBe("2.3.1");
  });

  it("holds table 0357 at the sixteen codes the source carries", () => {
    expect(V2_TABLES["0357"].codes).toEqual([
      "0",
      "100",
      "101",
      "102",
      "103",
      "104",
      "198",
      "199",
      "200",
      "201",
      "202",
      "203",
      "204",
      "205",
      "206",
      "207",
    ]);
    const display = new Map(V2_TABLES["0357"].entries.map((e) => [e.code, e.display]));
    expect(display.get("198")).toBe("Non-Conformant Cardinality");
    expect(display.get("207")).toBe("Application error");
  });

  it("passes a status the source does not define through unchanged", () => {
    const status = new Map(V2_TABLES["0357"].entries.map((e) => [e.code, e.status]));
    expect(status.get("0")).toBe("active");
    expect(status.get("198")).toBe("N");
    expect(status.get("204")).toBe("B");
  });

  it("records the version a code was deprecated in only where the source does", () => {
    const v2 = new Map(V2_TABLES["0104"].entries.map((e) => [e.code, e]));
    expect(v2.get("2.3.2")?.deprecatedIn).toBe("2.9");
    expect(v2.get("2.5.1")?.deprecatedIn).toBeUndefined();
    const events = new Map(V2_TABLES["0003"].entries.map((e) => [e.code, e]));
    expect(events.get("A18")?.status).toBe("deprecated");
    expect(events.get("A18")?.deprecatedIn).toBeUndefined();
  });

  it("writes a long dash in the source's display text as a hyphen", () => {
    const osu = V2_TABLES["0003"].entries.find((e) => e.display.startsWith("OSU"));
    expect(osu?.display).toBe("OSU - Order Status Update");
    for (const id of V2_TABLE_IDS) {
      for (const entry of V2_TABLES[id].entries) {
        for (const dash of LONG_DASHES) expect(entry.display.includes(dash)).toBe(false);
      }
    }
  });

  it("is frozen all the way down", () => {
    expect(Object.isFrozen(V2_TABLES)).toBe(true);
    expect(Object.isFrozen(V2_TABLES["0008"])).toBe(true);
    expect(Object.isFrozen(V2_TABLES["0008"].entries)).toBe(true);
    expect(Object.isFrozen(V2_TABLES["0008"].entries[0])).toBe(true);
    expect(Object.isFrozen(V2_TABLES["0008"].codes)).toBe(true);
    expect(Object.isFrozen(V2_TABLES["0008"].versions)).toBe(true);
    expect(Object.isFrozen(V2_TABLE_SOURCE)).toBe(true);
    expect(Object.isFrozen(V2_TABLE_IDS)).toBe(true);
    expect(Object.isFrozen(V2_VERSIONS)).toBe(true);
  });
});

describe("the source and its notice", () => {
  it("cites HL7 Terminology 7.5.0, its CC0 licence and the commit it was read from", () => {
    expect(V2_TABLE_SOURCE.name).toBe("HL7 Terminology");
    expect(V2_TABLE_SOURCE.packageId).toBe("hl7.terminology");
    expect(V2_TABLE_SOURCE.version).toBe("7.5.0");
    expect(V2_TABLE_SOURCE.url).toBe("https://terminology.hl7.org/7.5.0/");
    expect(V2_TABLE_SOURCE.license).toBe("CC0-1.0");
    expect(V2_TABLE_SOURCE.licenseUrl).toBe("https://terminology.hl7.org/license.html");
    expect(V2_TABLE_SOURCE.repository).toBe("https://github.com/HL7/UTG");
    expect(V2_TABLE_SOURCE.commit).toBe("828b7136548bc82559a4fff34bc4a47f62197ed5");
  });

  it("says plainly that the tables are derived, altered, and not endorsed by HL7", () => {
    expect(V2_TABLE_SOURCE.notice).toContain("derived from HL7 Terminology");
    expect(V2_TABLE_SOURCE.notice).toContain("altered");
    expect(V2_TABLE_SOURCE.notice).toContain("HL7 does not endorse this package");
  });
});

describe("the versions", () => {
  it("are the release codes of table 0104, oldest first, without the demo code", () => {
    expect(V2_VERSIONS[0]).toBe("2.0");
    expect(V2_VERSIONS.at(-1)).toBe("2.9");
    expect(V2_VERSIONS).toContain("2.5.1");
    expect(V2_VERSIONS).not.toContain("2.0D");
  });

  it("covers a table from the version it was introduced in", () => {
    expect(V2_TABLES["0357"].versions[0]).toBe("2.3.1");
    expect(V2_TABLES["0357"].versions).not.toContain("2.3");
    expect(V2_TABLES["0003"].versions[0]).toBe("2.1");
    expect(V2_TABLES["0003"].versions).not.toContain("2.0");
  });
});

describe("v2TableCodes", () => {
  it("lists a code deprecated in 2.9 as live before 2.9 and drops it from 2.9 on request", () => {
    expect(v2TableCodes("0104", "2.8.2", { excludeDeprecated: true })).toContain("2.3.2");
    expect(v2TableCodes("0104", "2.9", { excludeDeprecated: true })).not.toContain("2.3.2");
    expect(v2TableCodes("0104", "2.9")).toContain("2.3.2");
    expect(v2TableCodes("0211", "2.5", { excludeDeprecated: true })).toContain("UNICODE UTF-16");
    expect(v2TableCodes("0211", "2.9", { excludeDeprecated: true })).not.toContain(
      "UNICODE UTF-16",
    );
  });

  it("drops an undated deprecation only at the newest version, where the source speaks for it", () => {
    expect(v2TableCodes("0003", "2.9", { excludeDeprecated: true })).not.toContain("A18");
    expect(v2TableCodes("0003", "2.5", { excludeDeprecated: true })).toContain("A18");
  });

  it("returns undefined for a version the table does not cover", () => {
    expect(v2TableCodes("0357", "2.3")).toBeUndefined();
    expect(v2TableCodes("0357", "2.10")).toBeUndefined();
    expect(v2TableCodes("0103", "")).toBeUndefined();
    expect(v2TableCodes("0103", "2.0D")).toBeUndefined();
  });

  it("returns undefined for a table it does not ship", () => {
    expect(v2TableCodes("0999" as V2TableId, "2.5")).toBeUndefined();
  });

  it("returns a frozen list", () => {
    expect(Object.isFrozen(v2TableCodes("0103", "2.5"))).toBe(true);
    expect(Object.isFrozen(v2TableCodes("0103", "2.5", { excludeDeprecated: true }))).toBe(true);
  });
});

describe("lookupV2Code", () => {
  it("finds a listed code with its display text", () => {
    const found = lookupV2Code("0103", "P", "2.5.1");
    expect(found).toEqual({
      result: "listed",
      table: "0103",
      code: "P",
      version: "2.5.1",
      entry: { code: "P", display: "Production", status: "active" },
    });
  });

  it("says deprecated, and since when, for a code deprecated at or before the version", () => {
    const found = lookupV2Code("0104", "2.3.2", "2.9");
    expect(found.result).toBe("deprecated");
    expect(found.result === "deprecated" ? found.since : "").toBe("2.9");
  });

  it("says listed for the same code in a version before its deprecation", () => {
    expect(lookupV2Code("0104", "2.3.2", "2.8").result).toBe("listed");
    // Marked deprecated and dated: before the date it is listed, not undated.
    expect(lookupV2Code("0003", "varies", "2.5").result).toBe("listed");
    expect(lookupV2Code("0003", "varies", "2.9").result).toBe("deprecated");
  });

  it("says listed at the newest version for a code the source keeps active", () => {
    expect(lookupV2Code("0103", "P", "2.9").result).toBe("listed");
    expect(v2TableCodes("0103", "2.9", { excludeDeprecated: true })).toEqual([
      "D",
      "P",
      "T",
      "N",
      "V",
    ]);
  });

  it("says deprecated with no date for an undated deprecation at the newest version", () => {
    const found = lookupV2Code("0003", "A18", "2.9");
    expect(found.result).toBe("deprecated");
    expect(found.result === "deprecated" ? found.since : "x").toBeUndefined();
  });

  it("says unknown for an undated deprecation at an older version", () => {
    expect(lookupV2Code("0003", "A18", "2.3")).toMatchObject({
      result: "unknown",
      reason: "deprecation-not-dated",
    });
  });

  it("says not-listed for a code absent from the newest version", () => {
    expect(lookupV2Code("0103", "Z", "2.9")).toEqual({
      result: "not-listed",
      table: "0103",
      code: "Z",
      version: "2.9",
    });
  });

  it("says unknown, not not-listed, for a code absent from an older version", () => {
    expect(lookupV2Code("0103", "Z", "2.5")).toMatchObject({
      result: "unknown",
      reason: "absence-not-recorded",
    });
  });

  it("says unknown for a version the table does not cover, never rejecting the code", () => {
    expect(lookupV2Code("0357", "100", "2.3")).toMatchObject({
      result: "unknown",
      reason: "version-not-covered",
    });
    expect(lookupV2Code("0357", "999", "2.10")).toMatchObject({
      result: "unknown",
      reason: "version-not-covered",
    });
    expect(lookupV2Code("0008", "AA", "2.0D")).toMatchObject({
      result: "unknown",
      reason: "version-not-covered",
    });
  });

  it("says unknown for a table it does not ship", () => {
    expect(lookupV2Code("0999" as V2TableId, "X", "2.5")).toMatchObject({
      result: "unknown",
      reason: "table-not-shipped",
    });
  });

  it("matches a code exactly, as the source's code systems are case sensitive", () => {
    expect(lookupV2Code("0103", "p", "2.9").result).toBe("not-listed");
    expect(lookupV2Code("0103", " P", "2.9").result).toBe("not-listed");
  });

  it("does not take a name from the object prototype for a listed code", () => {
    expect(lookupV2Code("0103", "toString", "2.9").result).toBe("not-listed");
    expect(lookupV2Code("0103", "__proto__", "2.9").result).toBe("not-listed");
    expect(lookupV2Code("toString" as V2TableId, "P", "2.9").result).toBe("unknown");
  });
});
