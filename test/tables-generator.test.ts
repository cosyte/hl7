/**
 * The table generator: reproducibility and its refusals.
 *
 * The generator is why the shipped tables can be trusted, so it is tested the way a build tool is:
 * re-run it and demand the identical bytes, then corrupt an input and demand a refusal that names
 * the file and writes nothing.
 */

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  TABLE_LIST_DIR,
  TABLES_MODULE_PATH,
  THO_COPYRIGHT,
  VENDOR_DIR,
  cutTableList,
  deriveTables,
  main,
  recutTableList,
  renderTablesModule,
} from "../scripts/generate-v2-tables.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REAL_VENDOR = path.join(REPO_ROOT, VENDOR_DIR);

const scratch: string[] = [];

/** A throwaway repo root holding a copy of the vendored files. */
function scratchRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "hl7-tablegen-"));
  scratch.push(root);
  cpSync(REAL_VENDOR, path.join(root, VENDOR_DIR), { recursive: true });
  return root;
}

/** Rewrite one vendored file in a scratch root and record its new hash, as a vendor update would. */
function replaceVendored(root: string, relative: string, edit: (text: string) => string): void {
  const file = path.join(root, VENDOR_DIR, relative);
  const text = edit(readFileSync(file, "utf8"));
  writeFileSync(file, text);
  const snapshotPath = path.join(root, VENDOR_DIR, "snapshot.json");
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
    files: { path: string; bytes: number; sha256: string }[];
  };
  const record = snapshot.files.find((f) => f.path === relative);
  if (record === undefined) throw new Error(`no snapshot record for ${relative}`);
  const bytes = Buffer.from(text, "utf8");
  record.bytes = bytes.length;
  record.sha256 = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("re-running the generator", () => {
  it("renders the committed module byte for byte, with no network", async () => {
    const realFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error("the generator must not make a network call");
      },
    });
    try {
      const rendered = await renderTablesModule(deriveTables(REAL_VENDOR));
      expect(rendered).toBe(readFileSync(path.join(REPO_ROOT, TABLES_MODULE_PATH), "utf8"));
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: realFetch,
      });
    }
  });

  it("writes the same file twice from a fresh copy of the vendored data", async () => {
    const root = scratchRoot();
    await main(root);
    const first = readFileSync(path.join(root, TABLES_MODULE_PATH), "utf8");
    await main(root);
    expect(readFileSync(path.join(root, TABLES_MODULE_PATH), "utf8")).toBe(first);
    expect(first).toBe(readFileSync(path.join(REPO_ROOT, TABLES_MODULE_PATH), "utf8"));
  });
});

describe("the ranges cut from HL7's master table list", () => {
  const snapshot = JSON.parse(readFileSync(path.join(REAL_VENDOR, "snapshot.json"), "utf8")) as {
    tableList: { bytes: number };
    files: { path: string; bytes: number; cutFrom?: { start: number; end: number } }[];
  };
  const cuts = snapshot.files.filter((file) => file.cutFrom !== undefined);

  it("are the header and one row per table, in file order, inside the whole file", () => {
    expect(cuts.map((cut) => cut.path)).toEqual([
      `${TABLE_LIST_DIR}/header.xml`,
      ...["0003", "0008", "0076", "0103", "0104", "0155", "0211", "0357"].map(
        (id) => `${TABLE_LIST_DIR}/${id}.xml`,
      ),
    ]);
    let previousEnd = 0;
    for (const cut of cuts) {
      const { start, end } = cut.cutFrom ?? { start: -1, end: -1 };
      expect(start).toBeGreaterThanOrEqual(previousEnd);
      expect(end - start).toBe(cut.bytes);
      previousEnd = end;
    }
    expect(previousEnd).toBeLessThanOrEqual(snapshot.tableList.bytes);
  });

  it("are found again by the cutter in a list built from them", () => {
    // Rebuild a list from the committed ranges with other rows between them, the shape the
    // whole file has, and demand the cutter finds each range's bytes and nothing else.
    const filler = Buffer.from(
      '  <concept>\n    <code value="9999"/>\n    <display value="x"/>\n  </concept>\n',
    );
    const parts = cuts.map((cut) => readFileSync(path.join(REAL_VENDOR, cut.path)));
    const list = Buffer.concat([
      ...parts.flatMap((part) => [part, filler]),
      Buffer.from("</CodeSystem>"),
    ]);
    const found = cutTableList(list).map((cut) => list.subarray(cut.start, cut.end));
    expect(found).toEqual(parts);
  });

  it("refuses to cut a whole file whose sha256 is not the recorded one", () => {
    const root = scratchRoot();
    const fake = path.join(root, "v2-tables.xml");
    writeFileSync(fake, "<CodeSystem/>");
    expect(() => recutTableList(path.join(root, VENDOR_DIR), fake)).toThrow(/sha256/u);
  });
});

describe("what the generator refuses", () => {
  it("a vendored byte that no longer matches its recorded hash", () => {
    const root = scratchRoot();
    const file = path.join(root, VENDOR_DIR, "code-systems", "cs-v2-0103.xml");
    writeFileSync(file, readFileSync(file, "utf8").replace("Production", "Productoin"));
    expect(() => deriveTables(path.join(root, VENDOR_DIR))).toThrow(/cs-v2-0103\.xml.*sha256/u);
  });

  it("a code system whose copyright is not HL7 Terminology's CC0 statement", () => {
    const root = scratchRoot();
    replaceVendored(root, "code-systems/cs-v2-0103.xml", (text) =>
      text.replace(THO_COPYRIGHT, "Copyright 2026 Example Vendor Inc. All rights reserved."),
    );
    expect(() => deriveTables(path.join(root, VENDOR_DIR))).toThrow(/cs-v2-0103\.xml.*copyright/u);
  });

  it("a concept that carries a third-party notice of its own", () => {
    const root = scratchRoot();
    replaceVendored(root, "code-systems/cs-v2-0155.xml", (text) =>
      text.replace(
        '<display value="Always"/>',
        '<display value="Always (licensed from Example Vendor Inc.)"/>',
      ),
    );
    expect(() => deriveTables(path.join(root, VENDOR_DIR))).toThrow(
      /cs-v2-0155\.xml.*third-party/u,
    );
  });

  it("a publication that is not HL7 Terminology 7.5.0", () => {
    const root = scratchRoot();
    replaceVendored(root, "publication-request.json", (text) =>
      text.replace('"version" : "7.5.0"', '"version" : "7.4.0"'),
    );
    expect(() => deriveTables(path.join(root, VENDOR_DIR))).toThrow(/7\.5\.0/u);
  });

  it("a code system file that is missing, and writes nothing", async () => {
    const root = scratchRoot();
    rmSync(path.join(root, VENDOR_DIR, "code-systems", "cs-v2-0357.xml"));
    await expect(main(root)).rejects.toThrow(/cs-v2-0357\.xml/u);
    expect(existsSync(path.join(root, TABLES_MODULE_PATH))).toBe(false);
  });

  it("a table row that carries a third-party notice", () => {
    const root = scratchRoot();
    replaceVendored(root, `${TABLE_LIST_DIR}/0103.xml`, (text) =>
      text.replace('<display value="Processing ID"/>', '<display value="Processing ID ©"/>'),
    );
    expect(() => deriveTables(path.join(root, VENDOR_DIR))).toThrow(/0103\.xml.*third-party/u);
  });

  it("a code system with a repeated code", () => {
    const root = scratchRoot();
    replaceVendored(root, "code-systems/cs-v2-0103.xml", (text) =>
      text.replace('<code value="T"/>', '<code value="P"/>'),
    );
    expect(() => deriveTables(path.join(root, VENDOR_DIR))).toThrow(
      /cs-v2-0103\.xml.*repeats the code "P"/u,
    );
  });
});
