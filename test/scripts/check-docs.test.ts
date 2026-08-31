/**
 * Gate self-test for `scripts/check-docs.ts` (`pnpm check:docs`).
 *
 * Every acceptance rule of that script is a REFUSAL, and a refusal nobody exercises is a comment.
 * So each case here copies the real `docs-content/` into a temp tree, breaks exactly one thing,
 * runs the real script through its real CLI, and asserts BOTH a non-zero exit AND the identifying
 * token the contract says it must print (the path, the id, the code, or the line number). The
 * clean copy is asserted to pass first, so a case that reds for an unrelated reason is visible.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No shell.
 *
 * PHI: `test/**` is a `pnpm phi-scan` walk root, so the violator sample values below are
 * ASSEMBLED from fragments rather than written as literal runs, the discipline
 * `test/scripts/phi-scan.test.ts` already uses. The bytes that reach the temp file are the full
 * violator (that is the point: the gate has to catch them); the bytes in this file are not.
 */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const CHECKER_PATH = join(REPO_ROOT, "scripts", "check-docs.ts");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const REAL_DOCS = join(REPO_ROOT, "docs-content");

/** A violator identity, assembled so this file's own bytes carry no PHI-shaped run. */
const V = {
  ssn: ["123", "45", "6789"].join("-"),
  phone: ["617", "867", "5309"].join("-"),
  safePhone: ["617", "555", "0100"].join("-"),
  email: ["records", "@", "clinic", "-example", ".", "invalid"].join(""),
  safeEmail: ["records", "@", "example", ".", "com"].join(""),
} as const;

interface RunResult {
  code: number;
  output: string;
}

const scratch: string[] = [];

function newTree(): string {
  const dir = mkdtempSync(join(tmpdir(), "hl7-check-docs-"));
  scratch.push(dir);
  const docs = join(dir, "docs-content");
  cpSync(REAL_DOCS, docs, { recursive: true });
  return docs;
}

function run(docs: string): RunResult {
  const r = spawnSync(TSX_BIN, [CHECKER_PATH, "--docs", docs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function page(docs: string, name: string): string {
  return readFileSync(join(docs, name), "utf8");
}

function rewrite(docs: string, name: string, from: string, to: string): void {
  const text = page(docs, name);
  expect(text).toContain(from);
  writeFileSync(join(docs, name), text.replace(from, to));
}

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("check:docs on the delivered tree", () => {
  it("passes over the real docs-content/", () => {
    const r = run(newTree());
    expect(r.output).toContain("check-docs: OK");
    expect(r.code).toBe(0);
  });
});

describe("frontmatter refusals", () => {
  it("refuses a page whose block omits a required key, naming the file", () => {
    const docs = newTree();
    rewrite(docs, "quickstart.md", "sidebar_label: Quickstart\n", "");
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("quickstart.md");
    expect(r.output).toContain("sidebar_label");
  });

  it("refuses a page with no frontmatter block at all, naming the file", () => {
    const docs = newTree();
    const text = page(docs, "installation.md");
    writeFileSync(join(docs, "installation.md"), text.slice(text.indexOf("\n---\n") + 5));
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("installation.md");
    expect(r.output).toContain("no YAML frontmatter block");
  });

  it("refuses an id that differs from the basename, naming the file", () => {
    const docs = newTree();
    rewrite(docs, "intro.md", "id: intro", "id: introduction");
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("intro.md");
    expect(r.output).toContain("introduction");
  });

  it("refuses an empty description, naming the file", () => {
    const docs = newTree();
    rewrite(
      docs,
      "benchmarks.md",
      /description: "[^"]*"/.exec(page(docs, "benchmarks.md"))?.[0] ?? "",
      'description: ""',
    );
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("benchmarks.md");
    expect(r.output).toContain("description is empty");
  });

  it("refuses a description over 160 characters, naming the file", () => {
    const docs = newTree();
    const current = /description: "[^"]*"/.exec(page(docs, "troubleshooting.md"))?.[0] ?? "";
    rewrite(docs, "troubleshooting.md", current, `description: "${"a".repeat(161)}"`);
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("troubleshooting.md");
    expect(r.output).toContain("161 characters");
  });

  it("refuses an unparseable block as unparseable, not as a missing one", () => {
    const docs = newTree();
    rewrite(docs, "quickstart.md", "title: Quickstart", "title Quickstart");
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("quickstart.md");
    expect(r.output).toContain("not parseable YAML");
    expect(r.output).not.toContain("no YAML frontmatter block");
  });

  it("refuses a stray sidebar_position, naming the file", () => {
    const docs = newTree();
    rewrite(
      docs,
      "intro.md",
      "title: Getting started",
      "title: Getting started\nsidebar_position: 1",
    );
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("intro.md");
    expect(r.output).toContain("sidebar_position");
  });
});

describe("sidebar refusals", () => {
  it("refuses an id with no matching page, printing the id", () => {
    const docs = newTree();
    rewrite(docs, "sidebars.json", '"intro",', '"intro",\n    "no-such-page",');
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("no-such-page");
  });

  it("refuses a page no sidebar entry reaches, printing the path", () => {
    const docs = newTree();
    rewrite(docs, "sidebars.json", '"spec-notes-differential"\n', '"spec-notes-nte"\n');
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("spec-notes-differential.md");
    expect(r.output).toContain("not reachable from sidebars.json");
  });
});

describe("link refusals", () => {
  it("refuses an extensionless internal link, printing the file and the link text", () => {
    const docs = newTree();
    rewrite(docs, "quickstart.md", "[Guides](./guides-overview.md)", "[Guides](./guides-overview)");
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("quickstart.md");
    expect(r.output).toContain("[Guides](./guides-overview)");
  });

  it("refuses a dangling internal link, printing the file and the link text", () => {
    const docs = newTree();
    rewrite(docs, "quickstart.md", "[Guides](./guides-overview.md)", "[Guides](./guides-gone.md)");
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("quickstart.md");
    expect(r.output).toContain("resolves to no page");
  });
});

describe("code contract refusals", () => {
  it("refuses a code the source defines but the reference page omits, printing the code", () => {
    const docs = newTree();
    rewrite(docs, "warning-and-fatal-codes.md", "`EXTRA_FIELDS`", "`EXTRA__FIELDS`");
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("EXTRA_FIELDS is defined in the source registries but absent");
  });

  it("refuses a code on the page that no source registry defines, printing the code", () => {
    const docs = newTree();
    rewrite(
      docs,
      "warning-and-fatal-codes.md",
      "## Fatals",
      "## Fatals\n\nSee also `INVENTED_CODE`.",
    );
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain(
      "INVENTED_CODE is written on this page but no source registry defines it",
    );
  });

  it("refuses a code listed with too little prose beside it, printing the code", () => {
    const docs = newTree();
    const text = page(docs, "warning-and-fatal-codes.md");
    const row = /\|\s*`SEGMENT_CASE`\s*\|[^\n]*\n/.exec(text)?.[0] ?? "";
    expect(row).not.toBe("");
    writeFileSync(
      join(docs, "warning-and-fatal-codes.md"),
      text.replace(row, "| `SEGMENT_CASE` | see above |\n"),
    );
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("SEGMENT_CASE carries fewer than 40 characters of prose");
  });

  it("refuses troubleshooting.md when it drops the link to the reference", () => {
    const docs = newTree();
    rewrite(
      docs,
      "troubleshooting.md",
      "[Warning and fatal codes](./warning-and-fatal-codes.md)",
      "the reference page",
    );
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("no link to the code reference");
  });

  it("refuses troubleshooting.md when it sends per-code questions to another page", () => {
    const docs = newTree();
    rewrite(
      docs,
      "troubleshooting.md",
      "[Warning and fatal codes](./warning-and-fatal-codes.md) for what each one\nmeans.",
      "[Warning and fatal codes](./warning-and-fatal-codes.md).\n\nSee [Core Concepts](./spec-notes-primer.md) for what each one means.",
    );
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("per-code meanings");
    expect(r.output).toContain("./spec-notes-primer.md");
  });
});

describe("sample-data floor", () => {
  const MSH = "MSH|^~\\&|LAB|MAIN|EHR|REF|20260419143000||ADT^A01|EX1|P|2.5";

  function withSample(docs: string, sample: string): RunResult {
    const text = page(docs, "quickstart.md");
    writeFileSync(
      join(docs, "quickstart.md"),
      `${text}\n\n\`\`\`text\n${MSH}\n${sample}\n\`\`\`\n`,
    );
    return run(docs);
  }

  it("refuses a nine-digit dashed identifier on an HL7-shaped line, printing file and line", () => {
    const docs = newTree();
    const r = withSample(docs, `PID|1||${V.ssn}^^^HOSP^SS||Doe^John`);
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/quickstart\.md:\d+:/);
    expect(r.output).toContain("nine-digit dashed identifier");
  });

  it("refuses a telephone number whose exchange is not 555, printing file and line", () => {
    const docs = newTree();
    const r = withSample(docs, `PID|1||MRN12345^^^HOSP^MR||Doe^John|||||||${V.phone}`);
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/quickstart\.md:\d+:/);
    expect(r.output).toContain("exchange is not 555");
  });

  it("refuses an email address outside the example domains, printing file and line", () => {
    const docs = newTree();
    const r = withSample(
      docs,
      `PID|1||MRN12345^^^HOSP^MR||Doe^John|||||||^NET^Internet^${V.email}`,
    );
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/quickstart\.md:\d+:/);
    expect(r.output).toContain("email address outside");
  });

  it("accepts the reserved 555 exchange and the example domains", () => {
    const docs = newTree();
    const r = withSample(
      docs,
      `PID|1||MRN12345^^^HOSP^MR||Doe^John|||||||${V.safePhone}~^NET^Internet^${V.safeEmail}`,
    );
    expect(r.output).toContain("check-docs: OK");
    expect(r.code).toBe(0);
  });

  it("ignores a violator on a line that is not HL7-shaped", () => {
    const docs = newTree();
    const text = page(docs, "quickstart.md");
    writeFileSync(join(docs, "quickstart.md"), `${text}\n\nContact ${V.email} about ${V.phone}.\n`);
    const r = run(docs);
    expect(r.output).toContain("check-docs: OK");
    expect(r.code).toBe(0);
  });
});

describe("enumeration and empty-scan refusals", () => {
  it("refuses a file it enumerated but cannot read, naming the path", () => {
    if (process.getuid?.() === 0) return; // root reads a 000 file; the case cannot be staged
    const docs = newTree();
    const victim = join(docs, "spec-notes-nte.md");
    chmodSync(victim, 0o000);
    const r = run(docs);
    chmodSync(victim, 0o644);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("spec-notes-nte.md");
    expect(r.output).toContain("could not be read");
  });

  it("refuses an enumerated *.md path that is not a regular file, naming the path", () => {
    const docs = newTree();
    mkdirSync(join(docs, "not-a-page.md"));
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("not-a-page.md");
    expect(r.output).toContain("not a regular file");
  });

  it("refuses a docs directory with no pages rather than reporting a clean scan", () => {
    const dir = mkdtempSync(join(tmpdir(), "hl7-check-docs-"));
    scratch.push(dir);
    const docs = join(dir, "docs-content");
    mkdirSync(docs);
    writeFileSync(join(docs, "sidebars.json"), '{"docs":[]}');
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("no *.md pages found");
  });

  it("refuses a missing sidebars.json rather than reporting a clean scan", () => {
    const docs = newTree();
    rmSync(join(docs, "sidebars.json"));
    const r = run(docs);
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("sidebars.json is missing or unreadable");
  });

  it("refuses a docs directory that does not exist at all", () => {
    const dir = mkdtempSync(join(tmpdir(), "hl7-check-docs-"));
    scratch.push(dir);
    const r = run(join(dir, "absent"));
    expect(r.code).not.toBe(0);
    expect(r.output).toContain("cannot be enumerated");
  });
});
