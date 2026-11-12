/**
 * `@cosyte/hl7/tables`: eight structural HL7 v2 code tables, generated from HL7 Terminology 7.5.0.
 *
 * The tables are 0003 Event type, 0008 Acknowledgment code, 0076 Message type, 0103 Processing ID,
 * 0104 Version ID, 0155 Accept/application acknowledgment conditions, 0211 Alternate character
 * sets and 0357 Message error condition codes. Each carries its codes, display text, status and
 * the version a code was deprecated in, with the versions it covers.
 *
 * Source and licence: HL7 Terminology 7.5.0 (https://terminology.hl7.org/7.5.0/), published by
 * Health Level Seven International under the CC0 designation. These tables are derived from it and
 * altered: each keeps only its codes, display text, status and deprecation version, the
 * per-version lists are rebuilt from the deprecation versions, and a long dash in display text is
 * written as a hyphen. They are not HL7 Terminology itself, and HL7 does not endorse this package.
 * {@link V2_TABLE_SOURCE} carries the same citation, the commit and every file's sha256.
 *
 * This entry point is separate from `@cosyte/hl7`, which never imports it, so the main entry
 * point's size and import time do not change for a caller who does not use it.
 *
 * @packageDocumentation
 */

import { GENERATED_SOURCE, GENERATED_TABLES, GENERATED_VERSIONS } from "./generated/v2-tables.js";
import type {
  V2CodeLookup,
  V2Table,
  V2TableCodesOptions,
  V2TableEntry,
  V2TableId,
  V2TableSource,
} from "./types.js";

export type {
  V2CodeLookup,
  V2LookupUnknownReason,
  V2Table,
  V2TableCodesOptions,
  V2TableEntry,
  V2TableId,
  V2TableSource,
} from "./types.js";

/** Compare two release codes numerically, part by part: `"2.10"` sorts after `"2.9"`. */
function compareReleases(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The v2 releases table 0104 lists, oldest first, from `"2.0"` to `"2.9"`. The demo code `"2.0D"`
 * is not a release and is left out.
 *
 * @example
 * ```ts
 * import { V2_VERSIONS } from "@cosyte/hl7/tables";
 * V2_VERSIONS.at(-1); // "2.9"
 * ```
 */
export const V2_VERSIONS: readonly string[] = Object.freeze([...GENERATED_VERSIONS]);

/**
 * The newest release, the one the source's current tables speak for. The generator refuses a
 * table 0104 with no release in it, so the list is never empty.
 */
const NEWEST = V2_VERSIONS[V2_VERSIONS.length - 1] as string;

/**
 * Where the tables came from: HL7 Terminology 7.5.0, its CC0 licence, the commit the files were
 * read at, every file's sha256, and the notice that travels with the data.
 *
 * @example
 * ```ts
 * import { V2_TABLE_SOURCE } from "@cosyte/hl7/tables";
 * V2_TABLE_SOURCE.version; // "7.5.0"
 * V2_TABLE_SOURCE.license; // "CC0-1.0"
 * ```
 */
export const V2_TABLE_SOURCE: V2TableSource = Object.freeze({
  ...GENERATED_SOURCE,
  files: Object.freeze(GENERATED_SOURCE.files.map((file) => Object.freeze({ ...file }))),
});

/**
 * The eight table numbers, in the order they ship.
 *
 * @example
 * ```ts
 * import { V2_TABLE_IDS } from "@cosyte/hl7/tables";
 * V2_TABLE_IDS.length; // 8
 * ```
 */
export const V2_TABLE_IDS: readonly V2TableId[] = Object.freeze([
  "0003",
  "0008",
  "0076",
  "0103",
  "0104",
  "0155",
  "0211",
  "0357",
]);

/** Each table's codes, keyed for an exact lookup that no prototype name can reach. */
const ENTRY_INDEX = new Map<string, ReadonlyMap<string, V2TableEntry>>();

/** Build one frozen table from the generated data. */
function buildTable(generated: (typeof GENERATED_TABLES)[number]): V2Table {
  const entries = Object.freeze(generated.entries.map((entry) => Object.freeze({ ...entry })));
  ENTRY_INDEX.set(generated.id, new Map(entries.map((entry) => [entry.code, entry])));
  return Object.freeze({
    id: generated.id as V2TableId,
    name: generated.name,
    type: generated.type,
    introducedIn: generated.introducedIn,
    versions: Object.freeze(
      V2_VERSIONS.filter((version) => compareReleases(version, generated.introducedIn) >= 0),
    ),
    codeSystemUrl: generated.codeSystemUrl,
    pageUrl: generated.pageUrl,
    codes: Object.freeze(entries.map((entry) => entry.code)),
    entries,
  });
}

/**
 * The eight tables, keyed by number. Each is frozen, with its codes, its entries (code, display
 * text, status and deprecation version), the versions it covers and its HL7 Terminology URLs.
 *
 * A table binds into a conformance profile as a `valueSet`, with no change to the engine.
 *
 * @example
 * ```ts
 * import { V2_TABLES } from "@cosyte/hl7/tables";
 * V2_TABLES["0103"].codes; // ["D", "P", "T", "N", "V"]
 * V2_TABLES["0357"].entries[1]; // { code: "100", display: "Segment sequence error", status: "active" }
 * ```
 */
export const V2_TABLES: Readonly<Record<V2TableId, V2Table>> = Object.freeze(
  Object.fromEntries(GENERATED_TABLES.map((table) => [table.id, buildTable(table)])) as Record<
    V2TableId,
    V2Table
  >,
);

/** The table for `id`, or undefined when `id` is not one of the eight. */
function tableFor(id: string): V2Table | undefined {
  return Object.hasOwn(V2_TABLES, id) ? V2_TABLES[id as V2TableId] : undefined;
}

/**
 * Whether `entry` is deprecated at `version`: a recorded deprecation version at or before it, or
 * an undated deprecation at the newest version.
 */
function deprecatedAt(entry: V2TableEntry, version: string): boolean {
  if (entry.deprecatedIn !== undefined) return compareReleases(entry.deprecatedIn, version) <= 0;
  return entry.status === "deprecated" && version === NEWEST;
}

/**
 * The codes of a table at one v2 version, or `undefined` when the version is not one the table
 * covers (see {@link V2Table.versions}) or the table is not one of the eight.
 *
 * Every code the source lists is in every covered version's list unless `excludeDeprecated` is
 * set, which leaves out the codes deprecated at or before that version. The source records the
 * version a code was deprecated in but not the version it was added in, so a list for an older
 * version can hold a code that version did not yet have.
 *
 * @example
 * ```ts
 * import { v2TableCodes } from "@cosyte/hl7/tables";
 * v2TableCodes("0104", "2.8", { excludeDeprecated: true })?.includes("2.3.2"); // true
 * v2TableCodes("0104", "2.9", { excludeDeprecated: true })?.includes("2.3.2"); // false
 * v2TableCodes("0357", "2.3"); // undefined: table 0357 starts at 2.3.1
 * ```
 */
export function v2TableCodes(
  id: V2TableId,
  version: string,
  options: V2TableCodesOptions = {},
): readonly string[] | undefined {
  const table = tableFor(id);
  if (table === undefined || !table.versions.includes(version)) return undefined;
  if (options.excludeDeprecated !== true) return table.codes;
  return Object.freeze(
    table.entries.filter((entry) => !deprecatedAt(entry, version)).map((entry) => entry.code),
  );
}

/**
 * Look a code up in one table at one v2 version. It answers `"listed"`, `"deprecated"` (with the
 * version it was deprecated in, where the source records one) or `"not-listed"`, and `"unknown"`
 * with a reason wherever the source does not settle the question, so a code is never rejected for a
 * version the table does not cover.
 *
 * `"not-listed"` is given only at the newest version, `"2.9"`: the source is the current table, so
 * a code missing from it may still have been in an older version. For the same reason `"listed"`
 * at an older version means the code is in the current table and was not deprecated by that
 * version, not that the version already had it. The match is exact: codes are case sensitive.
 *
 * @example
 * ```ts
 * import { lookupV2Code } from "@cosyte/hl7/tables";
 * lookupV2Code("0103", "P", "2.5.1").result; // "listed"
 * lookupV2Code("0104", "2.3.2", "2.9").result; // "deprecated"
 * lookupV2Code("0103", "Z", "2.9").result; // "not-listed"
 * lookupV2Code("0103", "Z", "2.5").result; // "unknown"
 * ```
 */
export function lookupV2Code(id: V2TableId, code: string, version: string): V2CodeLookup {
  const table = tableFor(id);
  if (table === undefined) {
    return { result: "unknown", reason: "table-not-shipped", table: id, code, version };
  }
  if (!table.versions.includes(version)) {
    return { result: "unknown", reason: "version-not-covered", table: id, code, version };
  }
  // Every table `tableFor` returns was indexed when it was built.
  const entry = (ENTRY_INDEX.get(id) as ReadonlyMap<string, V2TableEntry>).get(code);
  if (entry === undefined) {
    return version === NEWEST
      ? { result: "not-listed", table: id, code, version }
      : { result: "unknown", reason: "absence-not-recorded", table: id, code, version };
  }
  if (deprecatedAt(entry, version)) {
    return { result: "deprecated", table: id, code, version, entry, since: entry.deprecatedIn };
  }
  if (entry.deprecatedIn === undefined && entry.status === "deprecated") {
    return { result: "unknown", reason: "deprecation-not-dated", table: id, code, version, entry };
  }
  return { result: "listed", table: id, code, version, entry };
}
