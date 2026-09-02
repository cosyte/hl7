#!/usr/bin/env tsx
/**
 * Write the committed schema artifacts for the serialized message projection,
 * and answer whether the ones on disk are still what the emitter produces.
 *
 * Run it with `pnpm generate:schema`. It reads `src/serialize/schema/` and
 * writes `schema/`. It never touches the network, at generation time or at run
 * time, and it never reads a message: the emitter is a function of the measured
 * projection shape and the warning-code registry, so a run is repeatable from a
 * checkout alone.
 *
 * TWO MODES, AND THE CHECK NEVER WRITES.
 *
 *   `generate-schema-artifacts.ts`           writes both artifacts
 *   `generate-schema-artifacts.ts --check`   compares and reports, exit 1 on drift
 *
 * The check is the half that matters. A check that rewrote its own baseline on
 * mismatch would always pass and therefore measure nothing, which is the exact
 * shape of the silent-green failure the other gates in this repository were
 * built against. So `--check` opens no file for writing, names every stale
 * artifact by path, and names the command that regenerates it. Updating the
 * committed bytes is the default mode: a separate, deliberate act whose diff a
 * reviewer reads.
 *
 * EXIT CODES. 0 written, or checked and current. 1 the committed artifacts have
 * drifted. 2 the run could not read what it needed.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { emitMessageSchema, type SchemaEmitTarget } from "../src/serialize/schema/emit.js";

/** One committed artifact: where it lives and which target produces it. */
export interface SchemaArtifact {
  /** Repo-root-relative path of the committed file. */
  readonly path: string;
  /** The emission target whose output the file holds, byte for byte. */
  readonly target: SchemaEmitTarget;
}

/** The command that rewrites every artifact below. Named in every drift report. */
export const REGENERATE_COMMAND = "pnpm generate:schema";

/** Every artifact this generator owns. */
export const SCHEMA_ARTIFACTS: readonly SchemaArtifact[] = [
  { path: "schema/serialized-message.schema.json", target: "json-schema-2020-12" },
  { path: "schema/serialized-message.zod.ts", target: "zod" },
];

/** The bytes one artifact should hold. */
export function renderArtifact(artifact: SchemaArtifact): string {
  return emitMessageSchema(artifact.target);
}

/**
 * Compare every committed artifact against what the emitter produces now.
 *
 * Returns one report line per stale or unreadable artifact, each naming the
 * artifact and the command that regenerates it. An empty list means the tree is
 * current. NOTHING IS WRITTEN on any path through this function.
 */
export function checkArtifacts(repoRoot: string): string[] {
  const stale: string[] = [];
  for (const artifact of SCHEMA_ARTIFACTS) {
    const expected = renderArtifact(artifact);
    let actual: string;
    try {
      actual = readFileSync(path.join(repoRoot, artifact.path), "utf8");
    } catch {
      stale.push(
        `${artifact.path} is missing. It is a generated artifact: run \`${REGENERATE_COMMAND}\` ` +
          "and commit it with the change that caused it.",
      );
      continue;
    }
    if (actual !== expected) {
      stale.push(
        `${artifact.path} is stale: it differs from what the emitter produces. Run ` +
          `\`${REGENERATE_COMMAND}\` and commit it with the change that caused it. ` +
          "Nothing was rewritten by this check.",
      );
    }
  }
  return stale;
}

/** Write every artifact. Every byte is built in memory before anything is written. */
export function writeArtifacts(repoRoot: string): void {
  const rendered = SCHEMA_ARTIFACTS.map((artifact) => ({
    file: path.join(repoRoot, artifact.path),
    text: renderArtifact(artifact),
  }));
  for (const { file, text } of rendered) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** Write or check, and report. Returns the process exit code. */
export function main(repoRoot: string, argv: readonly string[]): number {
  const unknown = argv.filter((arg) => arg !== "--check");
  if (unknown.length > 0) {
    process.stderr.write(
      `REFUSED: generate-schema-artifacts - unrecognized argument ${String(unknown[0])}\n` +
        "Usage: tsx scripts/generate-schema-artifacts.ts [--check]\n",
    );
    return 2;
  }

  if (argv.includes("--check")) {
    const stale = checkArtifacts(repoRoot);
    if (stale.length === 0) {
      process.stdout.write(
        `generate:schema --check: ${String(SCHEMA_ARTIFACTS.length)} artifacts are current.\n`,
      );
      return 0;
    }
    for (const line of stale) process.stderr.write(`DRIFT: ${line}\n`);
    return 1;
  }

  writeArtifacts(repoRoot);
  process.stdout.write(
    `generate:schema: wrote ${String(SCHEMA_ARTIFACTS.length)} artifacts under schema/.\n`,
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exit(
    main(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), process.argv.slice(2)),
  );
}
