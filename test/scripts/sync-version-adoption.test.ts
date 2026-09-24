/**
 * The version-sync differential corpus, run against the canonical entry point this repository now
 * uses in place of its own copy.
 *
 * WHY THIS FILE EXISTS. The `version` package script decides what `VERSION` a published tarball
 * exports, and a published version number cannot be recalled. This repository used to carry its own
 * version-sync script and now runs `cosyte-process sync-version` from the pinned `@cosyte/process`
 * instead. Reading the new entry point does not show that it writes what the old one wrote; only a
 * corpus does, and only one whose expectations were fixed BEFORE the swap.
 *
 * THE EXPECTATIONS ARE THE RETIRED SCRIPT'S, MEASURED. Every entry of `MEASURED_BEFORE_THE_SWAP`
 * was recorded by running this repository's own script over the same input, before it was deleted,
 * and the measurement is kept in the S0345 implementation notes. They are not what the canonical
 * happens to produce. The corpus is the referee and is never the variable: if a case reds after a
 * bump of `@cosyte/process`, the bump changed what a release writes, and the case is not "updated
 * to match".
 *
 * Every input runs in its own temp directory holding a `package.json` and a `src/index.ts`; nothing
 * here reads or writes this repository's own `src/index.ts`.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  runCanonicalSyncVersion,
  SYNC_VERSION_CORPUS,
  writeSyncFixture,
  type SyncVersionInput,
} from "../_helpers/sync-version-fixture.js";

/** What the retired script did with one input: accept or refuse, and the bytes it left behind. */
interface Measured {
  readonly disposition: "accept" | "refuse";
  /** sha256 of the `src/index.ts` the retired script left, which is the input's own on a refusal. */
  readonly sha256: string;
}

const MEASURED_BEFORE_THE_SWAP: Readonly<Record<string, Measured>> = {
  "c1-version-missing": {
    disposition: "refuse",
    sha256: "238f89aaee8ce4bc29a2475f89903a8168e8a08096b8779c74d3348458344470",
  },
  "c1-version-empty": {
    disposition: "refuse",
    sha256: "238f89aaee8ce4bc29a2475f89903a8168e8a08096b8779c74d3348458344470",
  },
  "c1-version-not-a-string": {
    disposition: "refuse",
    sha256: "238f89aaee8ce4bc29a2475f89903a8168e8a08096b8779c74d3348458344470",
  },
  "c2-declaration-renamed": {
    disposition: "refuse",
    sha256: "0c0ba1b3c5f27335dfdfd13c402710652c7705350759d566113ef62c266d87ac",
  },
  "c2-decoy-in-comment": {
    disposition: "refuse",
    sha256: "27d578210bf258a32d19c186e3d2f3d358d6a8e8602508de3c0ffdcead765a56",
  },
  "c2-trailing-comment": {
    disposition: "refuse",
    sha256: "195d2c048c99b3e8e61d140a2762c4eb8e54d9f577f751d6c5b3ca863838ea31",
  },
  "c3-replacement-patterns": {
    disposition: "accept",
    sha256: "380473f4a69c8bf88ffb9e76f4355e6acabcdd8742d8d33ab81cffd1d81b6087",
  },
  "c4-already-synced": {
    disposition: "accept",
    sha256: "238f89aaee8ce4bc29a2475f89903a8168e8a08096b8779c74d3348458344470",
  },
  "c5-write": {
    disposition: "accept",
    sha256: "802d8010fd92c4367ef18d2226daa4516f8a2cc6dfd6bde8b1e9693ebcd09701",
  },
};

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

/** A fresh fixture holding exactly the input's two files, resolved so paths compare exactly. */
function fixture(input: SyncVersionInput): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "hl7-sync-version-")));
  roots.push(dir);
  writeSyncFixture(dir, input);
  return dir;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function corpusInput(id: string): SyncVersionInput {
  const input = SYNC_VERSION_CORPUS.find((candidate) => candidate.id === id);
  if (input === undefined) throw new Error(`the corpus carries no input named ${id}`);
  return input;
}

describe("AC-8: the canonical entry point reaches the retired script's outcome on every input", () => {
  it("AC-8: every corpus input has a measurement and every measurement has an input", () => {
    expect(Object.keys(MEASURED_BEFORE_THE_SWAP).sort()).toEqual(
      SYNC_VERSION_CORPUS.map((input) => input.id).sort(),
    );
  });

  it("AC-8: the corpus exercises each of the five numbered conditions", () => {
    expect([...new Set(SYNC_VERSION_CORPUS.map((input) => input.condition))].sort()).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  for (const input of SYNC_VERSION_CORPUS) {
    it(`AC-8 condition ${String(input.condition)}: ${input.id}`, () => {
      const measured = MEASURED_BEFORE_THE_SWAP[input.id];
      if (measured === undefined) throw new Error(`no measurement recorded for ${input.id}`);

      const dir = fixture(input);
      const run = runCanonicalSyncVersion(dir);
      const after = readFileSync(join(dir, "src", "index.ts"), "utf8");

      expect(run.status === 0 ? "accept" : "refuse", run.stderr).toBe(measured.disposition);
      expect(sha256(after)).toBe(measured.sha256);
    });
  }
});

describe("AC-9: a refusal exits non-zero, says why on stderr, and writes nothing", () => {
  // No usable version, zero declarations, two declarations: the three inputs AC-9 names.
  const refusals: readonly { id: string; file: string; condition: string }[] = [
    { id: "c1-version-missing", file: "package.json", condition: "condition 1" },
    { id: "c2-declaration-renamed", file: join("src", "index.ts"), condition: "condition 2" },
    { id: "c2-decoy-in-comment", file: join("src", "index.ts"), condition: "condition 2" },
  ];

  for (const refusal of refusals) {
    it(`AC-9 ${refusal.condition}: ${refusal.id}`, () => {
      const input = corpusInput(refusal.id);
      const dir = fixture(input);
      const run = runCanonicalSyncVersion(dir);

      expect(run.status).not.toBe(0);
      expect(run.status).not.toBeNull();
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain(join(dir, refusal.file));
      expect(run.stderr).toContain(refusal.condition);
      expect(readFileSync(join(dir, "src", "index.ts"), "utf8")).toBe(input.source);
      expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(input.manifest);
    });
  }
});
