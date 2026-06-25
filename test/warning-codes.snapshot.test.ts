/**
 * Public-API stability snapshot for `WARNING_CODES` (and the Tier-3
 * `FATAL_CODES`). The set of codes the parser can emit is part of the
 * package's PUBLIC contract: consumers narrow on `warning.code` /
 * `err.code`, so renaming or removing a code is a BREAKING change.
 *
 * Snapshotting the full sorted code set turns any such change into a failing
 * test with a readable diff — a deliberate tripwire. Updating the snapshot
 * (`vitest -u`) is the explicit acknowledgement that the public surface
 * changed and a changeset / major-bump is owed.
 *
 * Inline snapshots (not external `.snap` files) keep the expected surface
 * reviewable directly in the diff.
 */

import { describe, expect, it } from "vitest";

import { FATAL_CODES, WARNING_CODES } from "../src/index.js";

/** Sorted list of the public Tier-2 warning code strings. */
function sortedWarningCodes(): string[] {
  return Object.values(WARNING_CODES).sort((a, b) => a.localeCompare(b));
}

/** Sorted list of the public Tier-3 fatal code strings. */
function sortedFatalCodes(): string[] {
  return Object.values(FATAL_CODES).sort((a, b) => a.localeCompare(b));
}

describe("public API: WARNING_CODES surface is stable", () => {
  it("the sorted set of Tier-2 warning codes matches the locked snapshot", () => {
    expect(sortedWarningCodes()).toMatchInlineSnapshot(`
      [
        "DUPLICATE_REQUIRED_SEGMENT",
        "ENCODING_MISMATCH",
        "EXTRA_FIELDS",
        "FIELD_WHITESPACE_TRIMMED",
        "MISSING_REQUIRED_FIELD",
        "MLLP_FRAMING_STRIPPED",
        "OUT_OF_ORDER_SEGMENT",
        "SEGMENT_CASE",
        "TIMESTAMP_FALLBACK_FORMAT",
        "UNKNOWN_CHARSET",
        "UNKNOWN_ESCAPE_SEQUENCE",
        "UNKNOWN_SEGMENT",
        "VERSION_MISMATCH",
      ]
    `);
  });

  it("WARNING_CODES keys equal their values (registry self-consistency)", () => {
    for (const [k, v] of Object.entries(WARNING_CODES)) expect(k).toBe(v);
  });

  it("there are exactly 13 Tier-2 warning codes", () => {
    expect(Object.keys(WARNING_CODES)).toHaveLength(13);
  });
});

describe("public API: FATAL_CODES surface is stable", () => {
  it("the sorted set of Tier-3 fatal codes matches the locked snapshot", () => {
    expect(sortedFatalCodes()).toMatchInlineSnapshot(`
      [
        "EMPTY_INPUT",
        "INVALID_ENCODING_CHARACTERS",
        "MSH_TOO_SHORT",
        "NO_MSH_SEGMENT",
      ]
    `);
  });

  it("there are exactly 4 Tier-3 fatal codes", () => {
    expect(Object.keys(FATAL_CODES)).toHaveLength(4);
  });
});
