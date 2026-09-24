/**
 * This repository's two security-workflow callers, graded against the canonical trigger surface the
 * pinned `@cosyte/process` publishes.
 *
 * WHY THIS FILE EXISTS. `.github/workflows/codeql.yml` and `.github/workflows/scorecard.yml` are thin
 * callers of shared workflows, and a GitHub Actions workflow only runs from the repository's own
 * `.github/workflows/` directory, so both files stay here. What is shared is the definition of what
 * they must say: the triggers, the schedule, the permissions and the reusable workflow each calls.
 * The loss these files exist to prevent is quiet: a caller whose `schedule:` was deleted is a file
 * that exists and a scan that no longer runs, and nothing red appears anywhere. So a pass here means
 * every element of the surface was found and equal, and a grader that only noticed a MISSING file
 * would be graded as broken by the mutation cases below.
 *
 * The mutations are applied to the file text in memory. Nothing here writes to either workflow.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  gradeSecurityWorkflows,
  gradeWorkflowText,
  SECURITY_WORKFLOW_SURFACES,
  type SecurityWorkflowFile,
} from "@cosyte/process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const WORKFLOWS = join(REPO_ROOT, ".github", "workflows");

function callerText(file: SecurityWorkflowFile): string {
  return readFileSync(join(WORKFLOWS, file), "utf8");
}

describe("AC-12: both callers match the canonical trigger surface", () => {
  it("AC-12: codeql.yml and scorecard.yml are present in .github/workflows", () => {
    expect(existsSync(join(WORKFLOWS, "codeql.yml"))).toBe(true);
    expect(existsSync(join(WORKFLOWS, "scorecard.yml"))).toBe(true);
  });

  it("AC-12: grading this repository reports no finding for either file", () => {
    expect(gradeSecurityWorkflows(REPO_ROOT)).toEqual([]);
  });
});

/** One in-memory edit to a caller, and the element path the grader has to name for it. */
interface Mutation {
  readonly file: SecurityWorkflowFile;
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly element: string;
}

const MUTATIONS: readonly Mutation[] = [
  {
    file: "codeql.yml",
    name: "a deleted schedule",
    from: '  schedule:\n    - cron: "27 3 * * 1"\n',
    to: "",
    element: "on.schedule",
  },
  {
    file: "codeql.yml",
    name: "a changed cron",
    from: '"27 3 * * 1"',
    to: '"27 4 * * 1"',
    element: "on.schedule",
  },
  {
    file: "codeql.yml",
    name: "a moved uses target",
    from: "uses: cosyte/.github/.github/workflows/codeql.yml@main",
    to: "uses: cosyte/.github/.github/workflows/codeql.yml@v1",
    element: "jobs.codeql.uses",
  },
  {
    file: "codeql.yml",
    name: "a widened job permission",
    from: "      contents: read\n",
    to: "      contents: write\n",
    element: "jobs.codeql.permissions.contents",
  },
  {
    file: "scorecard.yml",
    name: "a grown pull_request trigger",
    from: "  schedule:\n",
    to: "  pull_request:\n    branches: [main]\n  schedule:\n",
    element: "on.pull_request",
  },
  {
    file: "scorecard.yml",
    name: "a deleted schedule",
    from: '  schedule:\n    - cron: "27 3 * * 2"\n',
    to: "",
    element: "on.schedule",
  },
  {
    file: "scorecard.yml",
    name: "a changed cron",
    from: '"27 3 * * 2"',
    to: '"0 0 * * 2"',
    element: "on.schedule",
  },
  {
    file: "scorecard.yml",
    name: "a moved uses target",
    from: "uses: cosyte/.github/.github/workflows/scorecard.yml@main",
    to: "uses: cosyte/.github/.github/workflows/scorecard.yml@v2",
    element: "jobs.scorecard.uses",
  },
  {
    file: "scorecard.yml",
    name: "a widened job permission",
    from: "      contents: read",
    to: "      contents: write",
    element: "jobs.scorecard.permissions.contents",
  },
];

describe("AC-13: a changed element of either caller is reported by file and element", () => {
  for (const mutation of MUTATIONS) {
    it(`AC-13 ${mutation.file}: ${mutation.name}`, () => {
      const original = callerText(mutation.file);
      // The edit has to land exactly once, or the case is grading an unchanged file.
      expect(original.split(mutation.from)).toHaveLength(2);
      const mutated = original.replace(mutation.from, mutation.to);

      const findings = gradeWorkflowText(mutated, SECURITY_WORKFLOW_SURFACES[mutation.file]);

      expect(findings.length).toBeGreaterThan(0);
      expect(
        findings.some((finding) => finding.startsWith(`${mutation.file}: ${mutation.element}`)),
        findings.join("\n"),
      ).toBe(true);
    });
  }
});
