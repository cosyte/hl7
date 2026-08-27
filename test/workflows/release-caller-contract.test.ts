/**
 * The `Release` caller contract, asserted in this repository's own suite.
 *
 * WHAT THIS PINS AND WHY IT IS WORTH A TEST FILE. `.github/workflows/release.yml` is a
 * thin caller of the reusable workflow `cosyte/.github/.github/workflows/release.yml@main`.
 * The shared workflow declares `actions: read` so it can read this repository's `release`
 * environment protection, and a called workflow's `GITHUB_TOKEN` can only be downgraded by
 * its caller, never elevated. So a calling job that pins contents/id-token/pull-requests
 * and omits `actions` is granting `actions: none`, the shared workflow's request against
 * that is an escalation, and GitHub refuses the whole workflow at STARTUP: no jobs, no
 * steps, no logs, one second, and a `startup_failure` conclusion. That is what every
 * `Release` run of this repository did from June until the grant was added, and the reason
 * it lived that long is that a refusal at startup produces silence, not a red step. The
 * grant is four lines of YAML and any edit can delete one, so the regression is made loud
 * here instead of being left to whoever next reads a workflow list.
 *
 * WHAT A `waiting` RUN MEANS, since a reader arriving from a red-looking run list will
 * want it: the shared workflow puts its publish job in this repository's `release`
 * environment, which carries a required reviewer, so a run parked at `waiting` is that
 * gate holding the publish for a person to approve. That is the control working. It is
 * `startup_failure` that means this file is broken, and that is what these tests catch.
 *
 * The audit itself is in `test/_helpers/release-caller-contract.ts`: one file read with
 * `node:fs`, inspected as text. No YAML dependency, no network, no credentials, so the
 * verdict is reachable on every matrix leg and on a laptop that is offline.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  auditReleaseCaller,
  auditReleaseCallerAt,
  problemsFor,
  RELEASE_WORKFLOW_PATH,
  SHARED_RELEASE_WORKFLOW,
  type Problem,
  type ProblemId,
} from "../_helpers/release-caller-contract.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

interface GrantCase {
  readonly id: ProblemId;
  readonly grant: string;
  readonly line: RegExp;
}

const ACTIONS_GRANT: GrantCase = {
  id: "grant:actions",
  grant: "actions: read",
  line: /^\s*actions:\s*read\b/,
};

const GRANT_CASES: readonly GrantCase[] = [
  ACTIONS_GRANT,
  { id: "grant:contents", grant: "contents: write", line: /^\s*contents:\s*write\b/ },
  { id: "grant:id-token", grant: "id-token: write", line: /^\s*id-token:\s*write\b/ },
  {
    id: "grant:pull-requests",
    grant: "pull-requests: write",
    line: /^\s*pull-requests:\s*write\b/,
  },
];

const ALL_PROBLEM_IDS: readonly ProblemId[] = [
  "unreadable",
  "no-release-job",
  "uses-target",
  "permissions-block",
  ...GRANT_CASES.map((entry) => entry.id),
];

function readWorkflowText(): string | null {
  try {
    return readFileSync(join(REPO_ROOT, RELEASE_WORKFLOW_PATH), "utf8");
  } catch {
    return null;
  }
}

/**
 * The real workflow text, or the empty string when it cannot be read. The empty string is
 * itself a reported problem, so a checkout with no release workflow reds every case below
 * rather than skipping any of them.
 */
const WORKFLOW_TEXT = readWorkflowText() ?? "";

function indentWidth(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Drop every line matching `pattern`, refusing to return an unmutated document. Without
 * that refusal a reformat of `release.yml` would quietly turn each negative case below
 * into an assertion about the compliant file, which passes and proves nothing.
 */
function withoutLines(text: string, pattern: RegExp): string {
  const lines = text.split("\n");
  const kept = lines.filter((line) => !pattern.test(line));
  if (kept.length === lines.length) {
    throw new Error(
      "mutation matched no line in " +
        RELEASE_WORKFLOW_PATH +
        " (" +
        String(pattern) +
        "), so this negative case would assert nothing",
    );
  }
  return kept.join("\n");
}

/** Drop the `permissions:` key and everything nested under it. */
function withoutPermissionsBlock(text: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => /^\s*permissions:\s*$/.test(line.split("#")[0] ?? line));
  if (at === -1) {
    throw new Error("no `permissions:` block found in " + RELEASE_WORKFLOW_PATH + " to remove");
  }
  const indent = indentWidth(lines[at] ?? "");
  let end = at + 1;
  while (end < lines.length) {
    const line = lines[end] ?? "";
    if (line.trim() !== "" && indentWidth(line) <= indent) break;
    end += 1;
  }
  return [...lines.slice(0, at), ...lines.slice(end)].join("\n");
}

function replaceOnce(text: string, find: string, replacement: string): string {
  if (!text.includes(find)) {
    throw new Error("mutation target not present in " + RELEASE_WORKFLOW_PATH + ": " + find);
  }
  return text.replace(find, replacement);
}

function auditText(text: string): Problem[] {
  return auditReleaseCaller({ kind: "text", text });
}

function idsOf(problems: readonly Problem[]): ProblemId[] {
  return problems.map((entry) => entry.id);
}

function messageFor(problems: readonly Problem[], id: ProblemId): string {
  const hit = problems.find((entry) => entry.id === id);
  if (hit === undefined) {
    throw new Error("expected a `" + id + "` problem, got: " + idsOf(problems).join(", "));
  }
  return hit.message;
}

describe("release.yml satisfies the shared pipeline's caller-side contract", () => {
  const problems = auditReleaseCallerAt(REPO_ROOT);

  /**
   * Every clause selects the upstream problems too, so an absent or renamed target cannot
   * let a clause pass by never being reached. The failure is thrown rather than diffed:
   * the remedy is the message, and it must reach the reader whole.
   */
  function expectClean(ids: readonly ProblemId[]): void {
    const hits = problemsFor(problems, ids);
    if (hits.length > 0) {
      throw new Error("\n\n" + hits.map((entry) => entry.message).join("\n\n") + "\n");
    }
    expect(hits).toHaveLength(0);
  }

  it("is present, non-empty and readable at " + RELEASE_WORKFLOW_PATH, () => {
    expectClean([]);
  });

  it("delegates the release job to the shared release pipeline", () => {
    expectClean(["uses-target"]);
  });

  it("gives the release job a permissions block rather than inheriting the default", () => {
    expectClean(["permissions-block"]);
  });

  it.each(GRANT_CASES)("grants $grant to the release job", ({ id }) => {
    expectClean([id]);
  });

  it("reports no contract problem of any kind", () => {
    expectClean(ALL_PROBLEM_IDS);
  });
});

describe("the audit reds on every way the caller can regress", () => {
  it.each(GRANT_CASES)("names $grant when that grant is deleted", ({ id, grant, line }) => {
    const problems = auditText(withoutLines(WORKFLOW_TEXT, line));
    expect(idsOf(problems)).toContain(id);
    expect(messageFor(problems, id)).toContain(grant);
  });

  it("explains the escalation and the startup refusal when actions: read is deleted", () => {
    // The one grant whose absence is not self-explanatory: `actions` is the scope the
    // shared workflow needs to READ this repository's environment protection, and its
    // absence is what turned every run into a one second refusal with no logs. The message
    // has to carry that, because the reader arrives with a green-looking file.
    const problems = auditText(withoutLines(WORKFLOW_TEXT, ACTIONS_GRANT.line));
    const message = messageFor(problems, "grant:actions");
    expect(message).toContain("actions: read");
    expect(message).toContain("ESCALATION");
    expect(message).toContain("STARTUP");
    expect(message).toContain(RELEASE_WORKFLOW_PATH);
  });

  it("reds when a grant is present but downgraded", () => {
    // Exact levels, deliberately: `actions: write` would satisfy the precondition in
    // practice, but the documented caller block is the four exact grants and any drift
    // from it should cost a deliberate edit here rather than pass unread.
    const problems = auditText(replaceOnce(WORKFLOW_TEXT, "contents: write", "contents: read"));
    expect(idsOf(problems)).toContain("grant:contents");
    expect(messageFor(problems, "grant:contents")).toContain("contents: write");
  });

  it("reds when the permissions block is removed entirely", () => {
    const problems = auditText(withoutPermissionsBlock(WORKFLOW_TEXT));
    expect(idsOf(problems)).toContain("permissions-block");
    const message = messageFor(problems, "permissions-block");
    expect(message).toContain("permissions:");
    expect(message).toContain("STARTUP");
    // Inheriting the repository default is the same outage, so the four grants are still
    // reported missing: a reader who deletes the block gets the whole bill, not a hint.
    for (const grant of GRANT_CASES) expect(idsOf(problems)).toContain(grant.id);
  });

  it.each([
    ["another ref", "cosyte/.github/.github/workflows/release.yml@v2"],
    ["another repository", "acme/actions/.github/workflows/release.yml@main"],
    ["another path", "cosyte/.github/.github/workflows/publish.yml@main"],
  ])("reds when the release job is redirected to %s", (_label, target) => {
    const problems = auditText(replaceOnce(WORKFLOW_TEXT, SHARED_RELEASE_WORKFLOW, target));
    expect(idsOf(problems)).toContain("uses-target");
    const message = messageFor(problems, "uses-target");
    expect(message).toContain(SHARED_RELEASE_WORKFLOW);
    expect(message).toContain(target);
  });

  it("reds when the release job is renamed", () => {
    const renamed = WORKFLOW_TEXT.replace(/^(\s*)release:(\s*)$/m, "$1publish:$2");
    expect(renamed).not.toBe(WORKFLOW_TEXT);
    const problems = auditText(renamed);
    expect(idsOf(problems)).toEqual(["no-release-job"]);
    expect(messageFor(problems, "no-release-job")).toContain(RELEASE_WORKFLOW_PATH);
  });

  it("reds naming the path when the workflow is empty", () => {
    const problems = auditText("\n   \n");
    expect(idsOf(problems)).toEqual(["unreadable"]);
    expect(messageFor(problems, "unreadable")).toContain(RELEASE_WORKFLOW_PATH);
  });

  it("reds naming the path when the workflow file is absent", () => {
    const emptyCheckout = mkdtempSync(join(tmpdir(), "release-caller-"));
    try {
      const problems = auditReleaseCallerAt(emptyCheckout);
      expect(idsOf(problems)).toEqual(["unreadable"]);
      expect(messageFor(problems, "unreadable")).toContain(RELEASE_WORKFLOW_PATH);
    } finally {
      rmSync(emptyCheckout, { recursive: true, force: true });
    }
  });

  it("never reports an unreadable workflow as compliant", () => {
    // The silent-green route this whole file exists to close: "cannot tell" must never
    // render as "fine". Both unreadable shapes produce a problem, not an empty result.
    expect(auditReleaseCaller({ kind: "unreadable", reason: "could not be read" })).not.toEqual([]);
    expect(auditText("")).not.toEqual([]);
  });
});

describe("the audit accepts the legal spellings of a compliant caller", () => {
  it("accepts the workflow exactly as it stands on the default branch", () => {
    expect(auditText(WORKFLOW_TEXT)).toEqual([]);
  });

  it("accepts a quoted uses: value", () => {
    const quoted = replaceOnce(
      WORKFLOW_TEXT,
      "uses: " + SHARED_RELEASE_WORKFLOW,
      'uses: "' + SHARED_RELEASE_WORKFLOW + '"',
    );
    expect(auditText(quoted)).toEqual([]);
  });

  it("accepts a flow mapping for permissions", () => {
    // Same value, legal YAML, different spelling. Reporting it as four missing grants
    // would be a false alarm, and a false alarm is how a check gets deleted.
    const flowStyle = [
      "name: Release",
      "on:",
      "  push:",
      "    branches: [main]",
      "jobs:",
      "  release:",
      "    permissions: { actions: read, contents: write, id-token: write, pull-requests: write }",
      "    uses: " + SHARED_RELEASE_WORKFLOW,
      "    with:",
      '      package-name: "@cosyte/hl7"',
      "    secrets: inherit",
      "",
    ].join("\n");
    expect(auditText(flowStyle)).toEqual([]);
  });

  it("ignores comments, including a comment on a grant line", () => {
    const commented = replaceOnce(
      WORKFLOW_TEXT,
      "contents: write",
      "contents: write # tags and the release",
    );
    expect(auditText(commented)).toEqual([]);
  });
});
