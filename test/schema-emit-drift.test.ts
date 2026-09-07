/**
 * The committed schema artifacts and the check that keeps them honest.
 *
 * Two properties, and the second is the one that matters. The committed bytes
 * must be exactly what the emitter produces now, AND a tree where they are not
 * must FAIL rather than being quietly repaired. A check that rewrote its own
 * baseline on mismatch would pass forever and measure nothing, which is the
 * failure shape the generated-structure registry's own drift test was written
 * against; this one is built the same way, over a throwaway copy so a corrupted
 * artifact never touches the real tree.
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
  REGENERATE_COMMAND,
  SCHEMA_ARTIFACTS,
  checkArtifacts,
  main,
  renderArtifact,
  writeArtifacts,
} from "../scripts/generate-schema-artifacts.js";
import { emitMessageSchema } from "../src/index.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const scratch: string[] = [];

/** A throwaway repo root holding a copy of the committed artifacts. */
function scratchRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "hl7-schemagen-"));
  scratch.push(root);
  mkdirSync(path.join(root, "schema"), { recursive: true });
  cpSync(path.join(REPO_ROOT, "schema"), path.join(root, "schema"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("AC11: the committed artifacts are what the emitter produces", () => {
  it("owns two artifacts, one per emission target", () => {
    expect(SCHEMA_ARTIFACTS.map((artifact) => artifact.path)).toEqual([
      "schema/serialized-message.schema.json",
      "schema/serialized-message.zod.ts",
    ]);
  });

  it("the check reports the committed tree as current", () => {
    // The failure message of this one is the drift report itself, so a stale
    // tree fails the repository's own test run naming the artifact and the
    // command that regenerates it.
    expect(checkArtifacts(REPO_ROOT)).toEqual([]);
    expect(main(REPO_ROOT, ["--check"])).toBe(0);
  });

  it("every committed artifact is byte-for-byte what the emitter returns", () => {
    for (const artifact of SCHEMA_ARTIFACTS) {
      expect(
        readFileSync(path.join(REPO_ROOT, artifact.path), "utf8"),
        `${artifact.path} is stale: run \`${REGENERATE_COMMAND}\` and commit the result`,
      ).toBe(emitMessageSchema(artifact.target));
    }
  });

  it("two renders of the same artifact agree", () => {
    for (const artifact of SCHEMA_ARTIFACTS) {
      expect(renderArtifact(artifact)).toBe(renderArtifact(artifact));
    }
  });

  it("carries no network primitive in the generator's own source", () => {
    const source = readFileSync(
      path.join(REPO_ROOT, "scripts", "generate-schema-artifacts.ts"),
      "utf8",
    );
    for (const forbidden of ["node:http", "node:https", "node:net", "node:dgram", "fetch("]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});

describe("AC11: a stale tree fails, is named, and is never self-healed", () => {
  it("fails when an artifact differs from what the emitter produces", () => {
    const root = scratchRoot();
    const target = path.join(root, "schema/serialized-message.schema.json");
    const before = `${readFileSync(target, "utf8")}\n// edited by hand\n`;
    writeFileSync(target, before);

    const stale = checkArtifacts(root);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain("schema/serialized-message.schema.json");
    expect(stale[0]).toContain(REGENERATE_COMMAND);
    expect(main(root, ["--check"])).toBe(1);

    // The bytes on disk are untouched: the check reported, it did not repair.
    expect(readFileSync(target, "utf8")).toBe(before);
  });

  it("fails when the OTHER artifact is the stale one, and names that one", () => {
    const root = scratchRoot();
    const target = path.join(root, "schema/serialized-message.zod.ts");
    const before = readFileSync(target, "utf8").replace("isNull", "isNullish");
    writeFileSync(target, before);

    const stale = checkArtifacts(root);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain("schema/serialized-message.zod.ts");
    expect(stale[0]).toContain(REGENERATE_COMMAND);
    expect(readFileSync(target, "utf8")).toBe(before);
  });

  it("fails when an artifact is missing, and says how to get it back", () => {
    const root = scratchRoot();
    rmSync(path.join(root, "schema/serialized-message.zod.ts"));
    const stale = checkArtifacts(root);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain("schema/serialized-message.zod.ts");
    expect(stale[0]).toContain(REGENERATE_COMMAND);
    // Still absent: the check does not write the file it is checking.
    expect(existsSync(path.join(root, "schema/serialized-message.zod.ts"))).toBe(false);
    expect(main(root, ["--check"])).toBe(1);
  });

  it("names BOTH artifacts when both have drifted, not just the first", () => {
    const root = scratchRoot();
    for (const artifact of SCHEMA_ARTIFACTS) {
      writeFileSync(path.join(root, artifact.path), "drifted\n");
    }
    const stale = checkArtifacts(root);
    expect(stale).toHaveLength(2);
    expect(stale.join("\n")).toContain("schema/serialized-message.schema.json");
    expect(stale.join("\n")).toContain("schema/serialized-message.zod.ts");
    for (const artifact of SCHEMA_ARTIFACTS) {
      expect(readFileSync(path.join(root, artifact.path), "utf8")).toBe("drifted\n");
    }
  });

  it("writing is a separate act, and it does repair a drifted tree", () => {
    const root = scratchRoot();
    writeFileSync(path.join(root, "schema/serialized-message.zod.ts"), "drifted\n");
    expect(checkArtifacts(root)).toHaveLength(1);
    writeArtifacts(root);
    expect(checkArtifacts(root)).toEqual([]);
  });

  it("writes both artifacts into a tree that has neither", () => {
    const root = mkdtempSync(path.join(tmpdir(), "hl7-schemagen-empty-"));
    scratch.push(root);
    expect(main(root, [])).toBe(0);
    for (const artifact of SCHEMA_ARTIFACTS) {
      expect(existsSync(path.join(root, artifact.path)), artifact.path).toBe(true);
    }
    expect(checkArtifacts(root)).toEqual([]);
  });

  it("refuses an argument it does not recognise rather than guessing a mode", () => {
    const root = scratchRoot();
    expect(main(root, ["--rewrite"])).toBe(2);
    expect(main(root, ["--check", "extra"])).toBe(2);
  });
});
