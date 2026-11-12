/**
 * The shapes of the `@cosyte/hl7/tables` entry point, shared by its generated data and the
 * functions that read it.
 */

/**
 * The number of one of the eight HL7 v2 tables this entry point ships: 0003 Event type, 0008
 * Acknowledgment code, 0076 Message type, 0103 Processing ID, 0104 Version ID, 0155
 * Accept/application acknowledgment conditions, 0211 Alternate character sets and 0357 Message
 * error condition codes.
 */
export type V2TableId = "0003" | "0008" | "0076" | "0103" | "0104" | "0155" | "0211" | "0357";

/** One code of a table, as HL7 Terminology 7.5.0 records it. */
export interface V2TableEntry {
  /** The code, exactly as the source spells it. Codes are case sensitive. */
  readonly code: string;
  /** The source's display text, with a long dash written as a hyphen. */
  readonly display: string;
  /**
   * The concept's status as the source records it: `"active"` or `"deprecated"` for most codes.
   * The source also carries `"N"` and `"B"` on a few codes without defining them; they are passed
   * through unchanged rather than guessed at.
   */
  readonly status: string;
  /**
   * The v2 version the source records the code as deprecated in. Absent when it records none,
   * which includes every code it marks `"deprecated"` without a version.
   */
  readonly deprecatedIn?: string;
}

/** One HL7 v2 table, with where it came from and the versions it covers. */
export interface V2Table {
  /** The table number. */
  readonly id: V2TableId;
  /** The table's name in HL7's master list of v2 tables. */
  readonly name: string;
  /** `"HL7"` for an HL7-defined table, as the master list records it. */
  readonly type: string;
  /** The v2 version the master list records the table as introduced in. */
  readonly introducedIn: string;
  /**
   * The v2 versions this table covers, oldest first: the releases in table 0104 from the one the
   * table was introduced in. A lookup for any other version answers `"unknown"`.
   */
  readonly versions: readonly string[];
  /** The code system's canonical URL. */
  readonly codeSystemUrl: string;
  /** The code system's page in the HL7 Terminology 7.5.0 publication. */
  readonly pageUrl: string;
  /** Every code, in the source's order. Bind it into a profile as a `valueSet`. */
  readonly codes: readonly string[];
  /** Every code with its display text, status and deprecation version, in the source's order. */
  readonly entries: readonly V2TableEntry[];
}

/** Where the tables came from: the publication, its licence and the notice that travels with it. */
export interface V2TableSource {
  /** `"HL7 Terminology"`. */
  readonly name: string;
  /** The publication's package id, `"hl7.terminology"`. */
  readonly packageId: string;
  /** The publication version the data was read from, `"7.5.0"`. */
  readonly version: string;
  /** The publication's versioned home. */
  readonly url: string;
  /** The SPDX identifier of the publication's licence, `"CC0-1.0"`. */
  readonly license: string;
  /** The licence page the source's own copyright statement names. */
  readonly licenseUrl: string;
  /** The repository HL7 publishes the source from. */
  readonly repository: string;
  /** The commit the vendored files were read at, the one that requested the 7.5.0 publication. */
  readonly commit: string;
  /** The plain notice: derived from HL7 Terminology, altered, and not endorsed by HL7. */
  readonly notice: string;
  /**
   * Every source file the data was generated from, with its sha256 and its URL at the commit. A
   * row of HL7's master table list is a byte range of the file at its `url`, and its sha256 is the
   * range's.
   */
  readonly files: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly url: string;
  }[];
}

/** Options for {@link v2TableCodes}. */
export interface V2TableCodesOptions {
  /**
   * Leave out the codes deprecated at or before the version asked for. A code the source marks
   * deprecated without a version is left out only at the newest version, the one the source
   * speaks for. Default `false`.
   */
  readonly excludeDeprecated?: boolean;
}

/**
 * Why a lookup could not answer:
 *
 * - `"table-not-shipped"`: the table is not one of the eight.
 * - `"version-not-covered"`: the version is not a release in table 0104 from the table's
 *   introduction on (a later or local version, a demo code, a blank).
 * - `"absence-not-recorded"`: the code is not in the table, and the version is older than the
 *   newest. The source is the current table, so it cannot say a code was never in an older one.
 * - `"deprecation-not-dated"`: the source marks the code deprecated without saying since when, and
 *   the version is older than the newest.
 */
export type V2LookupUnknownReason =
  "table-not-shipped" | "version-not-covered" | "absence-not-recorded" | "deprecation-not-dated";

/**
 * What {@link lookupV2Code} found. It never rejects a code it cannot speak for: where the source
 * does not settle the question it answers `"unknown"` with the reason.
 */
export type V2CodeLookup =
  | {
      /** The code is in the table and not deprecated at that version. */
      readonly result: "listed";
      readonly table: V2TableId;
      readonly code: string;
      readonly version: string;
      readonly entry: V2TableEntry;
    }
  | {
      /** The code is in the table and deprecated at or before that version. */
      readonly result: "deprecated";
      readonly table: V2TableId;
      readonly code: string;
      readonly version: string;
      readonly entry: V2TableEntry;
      /** The version it was deprecated in, or `undefined` when the source records none. */
      readonly since: string | undefined;
    }
  | {
      /** The code is not in the table at the newest version, the one the source speaks for. */
      readonly result: "not-listed";
      readonly table: V2TableId;
      readonly code: string;
      readonly version: string;
    }
  | {
      /** The source does not settle the question; `reason` says why. */
      readonly result: "unknown";
      readonly reason: V2LookupUnknownReason;
      readonly table: string;
      readonly code: string;
      readonly version: string;
      /** The code's entry, when the code is in the table. */
      readonly entry?: V2TableEntry;
    };

/** One table as the generator writes it, before its versions and codes are derived. */
export interface GeneratedTable {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly introducedIn: string;
  readonly codeSystemUrl: string;
  readonly pageUrl: string;
  readonly entries: readonly V2TableEntry[];
}

/** The source as the generator writes it. */
export type GeneratedSource = V2TableSource;
