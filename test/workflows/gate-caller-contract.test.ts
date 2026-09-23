/**
 * The two gate callers' contract, asserted in this repository's own suite.
 *
 * WHAT THIS PINS AND WHY IT IS WORTH A TEST FILE. `.github/workflows/no-emdash.yml` and
 * `.github/workflows/no-internal-refs.yml` are thin callers of reusable workflows in
 * `cosyte/.github`. Every regression this file catches is silent:
 *
 *   A RENAMED CALLER JOB moves the check-run context, because GitHub names a called job's
 *   check run `<caller job id> / <inner job id>`. The branch rulesets on this repository
 *   require `no-emdash / tracked-files` and `no-internal-refs / public-surface` by that
 *   exact string, so a rename either leaves a required context nothing emits, which blocks
 *   every pull request, or drops the requirement and lets every pull request merge with the
 *   gate gone. Neither reports an error anywhere.
 *
 *   A MOVING REF hands another repository the power to change what these gates enforce.
 *   `@main`, a branch, a tag and an abbreviated SHA all resolve on the day they run.
 *
 *   A CALLER THAT SCANS is a second, divergent copy of a rule this repository reaches
 *   through `pnpm check:no-emdash` and `pnpm check:no-internal-refs`, both of which run the
 *   one implementation `@cosyte/script-utils` publishes.
 *
 * The audit itself is in `test/_helpers/gate-caller-contract.ts`: one file read with
 * `node:fs`, inspected as indented text. No YAML dependency, no network, no credentials, so
 * the verdict is reachable on every matrix leg and on a laptop that is offline. Whether the
 * SHA still resolves, whether the rulesets actually require the new contexts and whether the
 * contexts report at all are live-platform facts this suite deliberately cannot reach; they
 * are graded against the GitHub API instead.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  auditGateCaller,
  auditGateCallerAt,
  EMDASH_CALLER,
  GATE_CALLERS,
  INTERNAL_REFS_CALLER,
  problemsFor,
  type CallerSpec,
  type Problem,
  type ProblemId,
} from "../_helpers/gate-caller-contract.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

const ALL_PROBLEM_IDS: readonly ProblemId[] = [
  "unreadable",
  "no-jobs",
  "job-id",
  "extra-job",
  "job-keys",
  "uses-missing",
  "uses-target",
  "uses-ref",
  "uses-reference-comment",
  "with",
  "secrets",
  "steps",
  "run",
  "permissions",
  "trigger",
  "concurrency",
  "top-level-keys",
];

function readCaller(spec: CallerSpec): string {
  try {
    return readFileSync(join(REPO_ROOT, spec.path), "utf8");
  } catch {
    // The empty string is itself a reported problem, so a checkout missing a caller reds
    // every case below rather than skipping any of them.
    return "";
  }
}

const TEXT = new Map<string, string>(GATE_CALLERS.map((spec) => [spec.path, readCaller(spec)]));

function textOf(spec: CallerSpec): string {
  return TEXT.get(spec.path) ?? "";
}

function auditText(spec: CallerSpec, text: string): Problem[] {
  return auditGateCaller(spec, { kind: "text", text });
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

/** Replace once, refusing a no-op: a mutation that matched nothing asserts nothing. */
function replaceOnce(spec: CallerSpec, text: string, find: string, replacement: string): string {
  if (!text.includes(find)) {
    throw new Error("mutation target not present in " + spec.path + ": " + find);
  }
  return text.replace(find, replacement);
}

/** Insert a line into the caller job's body, immediately under its `uses:` line. */
function addToJob(spec: CallerSpec, line: string): string {
  const text = textOf(spec);
  const match = /^ {4}uses: .*$/m.exec(text);
  if (match === null) throw new Error("no `uses:` line found in " + spec.path);
  return text.replace(match[0], match[0] + "\n    " + line);
}

describe("the gate callers satisfy the shared pipeline's caller-side contract", () => {
  const audits = new Map<string, Problem[]>(
    GATE_CALLERS.map((spec) => [spec.path, auditGateCallerAt(spec, REPO_ROOT)]),
  );

  /**
   * Every clause selects the upstream problems too, so an absent or renamed caller cannot
   * let a clause pass by never being reached. The failure is thrown rather than diffed: the
   * remedy is the message and it must reach the reader whole.
   */
  function expectClean(spec: CallerSpec, ids: readonly ProblemId[]): void {
    const hits = problemsFor(audits.get(spec.path) ?? [], ids);
    if (hits.length > 0) {
      throw new Error("\n\n" + hits.map((entry) => entry.message).join("\n\n") + "\n");
    }
    expect(hits).toHaveLength(0);
  }

  it.each(GATE_CALLERS)(
    "AC-1: $path pins the reusable workflow to the 40-character commit",
    (spec) => {
      expectClean(spec, ["uses-missing", "uses-target", "uses-ref", "uses-reference-comment"]);
      expect(textOf(spec)).toContain("@" + spec.commit);
      expect(textOf(spec)).toContain(spec.reference);
    },
  );

  it.each(GATE_CALLERS)(
    "AC-3: $path declares exactly one job, $jobId, granting exactly contents: read and no secrets",
    (spec) => {
      expectClean(spec, ["extra-job", "job-keys", "permissions", "secrets"]);
    },
  );

  it.each(GATE_CALLERS)("AC-4b: $path carries no steps:, run: or with: key", (spec) => {
    expectClean(spec, ["with", "steps", "run", "job-keys", "top-level-keys"]);
  });

  it("AC-5 (E1): the em-dash caller triggers on push to main and on pull_request with edited", () => {
    expectClean(EMDASH_CALLER, ["trigger"]);
  });

  it("AC-5 (E7): the em-dash caller cancels in progress and grants no more than contents: read", () => {
    expectClean(EMDASH_CALLER, ["concurrency", "permissions"]);
  });

  it("AC-5 (I1): the public-surface caller triggers on push to main and on pull_request with no edited type", () => {
    expectClean(INTERNAL_REFS_CALLER, ["trigger"]);
  });

  it("AC-5 (I5): the public-surface caller cancels in progress and grants no more than contents: read", () => {
    expectClean(INTERNAL_REFS_CALLER, ["concurrency", "permissions"]);
  });

  it.each(GATE_CALLERS)("$path reports no contract problem of any kind", (spec) => {
    expectClean(spec, ALL_PROBLEM_IDS);
  });
});

describe("the audit reds on every way a gate caller can regress", () => {
  // Each caller carries its own pin, so the ref a mutation writes is derived from the caller
  // under test rather than from one shared constant.
  it.each([
    ["a branch name", "a BRANCH or tag name", () => "main"],
    ["the published reference tag", "a TAG", (spec: CallerSpec) => spec.reference],
    ["an abbreviated SHA", "an ABBREVIATED SHA", (spec: CallerSpec) => spec.commit.slice(0, 12)],
    ["another commit", "another commit", () => "0".repeat(40)],
  ])("AC-1: names the file and the ref when the pin becomes %s", (_label, shape, refFor) => {
    for (const spec of GATE_CALLERS) {
      const ref = refFor(spec);
      expect(ref).not.toBe(spec.commit);
      const problems = auditText(
        spec,
        replaceOnce(spec, textOf(spec), "@" + spec.commit, "@" + ref),
      );
      expect(idsOf(problems)).toContain("uses-ref");
      const message = messageFor(problems, "uses-ref");
      expect(message).toContain(spec.path);
      expect(message).toContain(ref);
      expect(message).toContain(shape);
    }
  });

  it("AC-1: reds when the published reference comment is dropped from the uses line", () => {
    for (const spec of GATE_CALLERS) {
      const problems = auditText(spec, replaceOnce(spec, textOf(spec), " # " + spec.reference, ""));
      expect(idsOf(problems)).toContain("uses-reference-comment");
      expect(messageFor(problems, "uses-reference-comment")).toContain(spec.reference);
    }
  });

  it("AC-1: reds when the reusable workflow is another repository or another path", () => {
    const problems = auditText(
      EMDASH_CALLER,
      replaceOnce(
        EMDASH_CALLER,
        textOf(EMDASH_CALLER),
        EMDASH_CALLER.reusable,
        "acme/actions/.github/workflows/gate-no-emdash.yml",
      ),
    );
    expect(idsOf(problems)).toContain("uses-target");
    expect(messageFor(problems, "uses-target")).toContain(EMDASH_CALLER.reusable);
  });

  it("AC-3: names the file, the id found and the contexts it would publish when the job is renamed", () => {
    for (const spec of GATE_CALLERS) {
      const renamed = replaceOnce(spec, textOf(spec), "\n  " + spec.jobId + ":\n", "\n  gate:\n");
      const problems = auditText(spec, renamed);
      expect(idsOf(problems)).toEqual(["job-id"]);
      const message = messageFor(problems, "job-id");
      expect(message).toContain(spec.path);
      expect(message).toContain("gate");
      for (const inner of spec.innerJobIds) {
        // The contexts the renamed id WOULD publish, and the ones a ruleset requires.
        expect(message).toContain("gate / " + inner);
        expect(message).toContain(spec.jobId + " / " + inner);
      }
    }
  });

  it("AC-3: reds when the caller passes secrets of any kind", () => {
    for (const spec of GATE_CALLERS) {
      const problems = auditText(spec, addToJob(spec, "secrets: inherit"));
      expect(idsOf(problems)).toContain("secrets");
      expect(messageFor(problems, "secrets")).toContain("inherit");
    }
  });

  it.each([
    ["contents: write", "contents: write"],
    ["a second scope", "contents: read\n      actions: read"],
  ])("AC-3: reds when the permissions ceiling is widened by %s", (_label, block) => {
    const spec = EMDASH_CALLER;
    const problems = auditText(
      spec,
      replaceOnce(
        spec,
        textOf(spec),
        "permissions:\n      contents: read",
        "permissions:\n      " + block,
      ),
    );
    expect(idsOf(problems)).toContain("permissions");
    expect(messageFor(problems, "permissions")).toContain(spec.ceilingFact);
  });

  it.each(["with", "steps", "run"])("AC-4b: reds when the caller job carries a %s: key", (key) => {
    for (const spec of GATE_CALLERS) {
      const line =
        key === "with" ? "with:\n      files-command: grep -r x ." : key + ": echo scanning";
      const problems = auditText(spec, addToJob(spec, line));
      expect(idsOf(problems)).toContain(key as ProblemId);
      expect(messageFor(problems, key as ProblemId)).toContain(spec.path);
    }
  });

  it("AC-4b: reds on an if: that would let a skipped job satisfy its required context", () => {
    // The nastiest shape of all: a skipped job SATISFIES its required context, so the gate
    // reports green without running and the ruleset is quietly un-required.
    const problems = auditText(EMDASH_CALLER, addToJob(EMDASH_CALLER, "if: false"));
    expect(idsOf(problems)).toContain("job-keys");
    expect(messageFor(problems, "job-keys")).toContain("SATISFIES");
  });

  it("AC-4b: reds on a second job, because every job here publishes a context", () => {
    const spec = INTERNAL_REFS_CALLER;
    const problems = auditText(
      spec,
      textOf(spec) + "\n  extra:\n    uses: acme/x/.github/workflows/y.yml@main\n",
    );
    expect(idsOf(problems)).toContain("extra-job");
  });

  it("AC-5 (E1): reds naming edited when the em-dash caller drops that activity type", () => {
    const spec = EMDASH_CALLER;
    const problems = auditText(
      spec,
      replaceOnce(
        spec,
        textOf(spec),
        "[opened, synchronize, reopened, edited]",
        "[opened, synchronize, reopened]",
      ),
    );
    expect(idsOf(problems)).toContain("trigger");
    const message = messageFor(problems, "trigger");
    expect(message).toContain("E1");
    expect(message).toContain("edited");
    expect(message).toContain("squash-merges");
  });

  it("AC-5 (I1): reds naming I1 when the public-surface caller gains an activity type list", () => {
    const spec = INTERNAL_REFS_CALLER;
    const problems = auditText(
      spec,
      replaceOnce(
        spec,
        textOf(spec),
        "  pull_request:\n    branches: [main]",
        "  pull_request:\n    branches: [main]\n    types: [opened, edited]",
      ),
    );
    expect(idsOf(problems)).toContain("trigger");
    expect(messageFor(problems, "trigger")).toContain("I1");
  });

  it.each(GATE_CALLERS)(
    "AC-5: $path reds naming $triggerFact when the push trigger is dropped",
    (spec) => {
      const problems = auditText(
        spec,
        replaceOnce(spec, textOf(spec), "  push:\n    branches: [main]\n", ""),
      );
      expect(idsOf(problems)).toContain("trigger");
      expect(messageFor(problems, "trigger")).toContain(spec.triggerFact);
    },
  );

  it.each(GATE_CALLERS)(
    "AC-5: $path reds naming $ceilingFact when cancel-in-progress is turned off",
    (spec) => {
      const problems = auditText(
        spec,
        replaceOnce(spec, textOf(spec), "cancel-in-progress: true", "cancel-in-progress: false"),
      );
      expect(idsOf(problems)).toContain("concurrency");
      expect(messageFor(problems, "concurrency")).toContain(spec.ceilingFact);
    },
  );

  it.each(GATE_CALLERS)(
    "AC-5: $path reds naming $ceilingFact when the permissions block is removed",
    (spec) => {
      const problems = auditText(
        spec,
        replaceOnce(spec, textOf(spec), "    permissions:\n      contents: read\n", ""),
      );
      expect(idsOf(problems)).toContain("permissions");
      expect(messageFor(problems, "permissions")).toContain(spec.ceilingFact);
    },
  );

  it.each(GATE_CALLERS)("$path is never reported as compliant when it cannot be read", (spec) => {
    // The silent-green route this whole file exists to close: "cannot tell" must never
    // render as "fine".
    expect(auditGateCaller(spec, { kind: "unreadable", reason: "could not be read" })).not.toEqual(
      [],
    );
    expect(auditText(spec, "")).not.toEqual([]);
    expect(auditText(spec, "\n   \n")).not.toEqual([]);
    const emptyCheckout = mkdtempSync(join(tmpdir(), "gate-caller-"));
    try {
      const problems = auditGateCallerAt(spec, emptyCheckout);
      expect(idsOf(problems)).toEqual(["unreadable"]);
      expect(messageFor(problems, "unreadable")).toContain(spec.path);
    } finally {
      rmSync(emptyCheckout, { recursive: true, force: true });
    }
  });
});

describe("the audit accepts the legal spellings of a compliant caller", () => {
  it.each(GATE_CALLERS)("accepts $path exactly as it stands on the branch", (spec) => {
    expect(auditText(spec, textOf(spec))).toEqual([]);
  });

  it.each(GATE_CALLERS)("accepts a quoted uses: value in $path", (spec) => {
    const text = textOf(spec);
    const target = spec.reusable + "@" + spec.commit;
    expect(
      auditText(spec, replaceOnce(spec, text, "uses: " + target, 'uses: "' + target + '"')),
    ).toEqual([]);
  });

  it.each(GATE_CALLERS)("accepts a flow mapping for permissions in $path", (spec) => {
    // Same value, legal YAML, different spelling. Reporting it as a missing grant would be
    // a false alarm, and a false alarm is how a check gets deleted.
    const flow = replaceOnce(
      spec,
      textOf(spec),
      "permissions:\n      contents: read",
      "permissions: { contents: read }",
    );
    expect(auditText(spec, flow)).toEqual([]);
  });

  it.each(GATE_CALLERS)("accepts block style branch lists in $path", (spec) => {
    const block = textOf(spec).split("    branches: [main]").join("    branches:\n      - main");
    expect(block).not.toBe(textOf(spec));
    expect(auditText(spec, block)).toEqual([]);
  });

  it("accepts a block style activity type list in the em-dash caller", () => {
    const spec = EMDASH_CALLER;
    const block = replaceOnce(
      spec,
      textOf(spec),
      "    types: [opened, synchronize, reopened, edited]",
      "    types:\n      - opened\n      - synchronize\n      - reopened\n      - edited",
    );
    expect(auditText(spec, block)).toEqual([]);
  });
});
