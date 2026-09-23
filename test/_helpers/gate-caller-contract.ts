/**
 * Audit of the caller-side contract the two gate workflows owe the shared gate pipeline,
 * performed as text.
 *
 * WHY THIS EXISTS. `.github/workflows/no-emdash.yml` and `.github/workflows/no-internal-refs.yml`
 * are thin callers of reusable workflows in `cosyte/.github`. Three properties of that shape
 * are load-bearing and all three fail SILENTLY when they regress:
 *
 *   THE JOB ID IS A CHECK-RUN CONTEXT. GitHub names a called job's check run
 *   `<caller job id> / <inner job id>`, and this repository's branch rulesets require
 *   `no-emdash / tracked-files` and `no-internal-refs / public-surface` by that exact
 *   string. Renaming a caller job detaches the requirement with no error anywhere: the
 *   ruleset keeps requiring a context nothing emits, which blocks every pull request, or
 *   the requirement is dropped and every pull request merges with the gate gone.
 *
 *   THE REF IS A PIN OR IT IS NOT A PIN. A reusable workflow named by branch, by `main`, by
 *   tag or by an abbreviated SHA resolves to whatever that name points at on the day it
 *   runs, so an edit in another repository changes what this repository's gates enforce.
 *   Only a full 40-character commit SHA is an immutable reference.
 *
 *   A CALLER THAT SCANS IS A SECOND COPY OF THE RULE. The shared workflow carries no
 *   pattern, no allow-list and no file selection; the scanner in `scripts/` owns all three.
 *   A `with:`, a `run:` or a `steps:` key in a caller is the beginning of a second, divergent
 *   copy of a rule this repository keeps in exactly one place.
 *
 * WHY IT IS TEXT AND NOT A YAML PARSE. This package has zero runtime dependencies and no
 * YAML parser in `devDependencies` (`js-yaml` appears only as an overrides pin for
 * transitive copies and must not be imported), and the suite runs on a CI matrix with no
 * token and no network. So the audit reads the workflow out of the checkout with `node:fs`
 * and inspects it as indented text: no dependency, no credential, no request leaves the
 * machine. It deliberately does not try to be a YAML implementation. ANYTHING IT CANNOT
 * RECOGNISE AS THE DOCUMENTED CALLER SHAPE IS REPORTED AS A PROBLEM RATHER THAN PASSED,
 * including a key it has no opinion about, because a gate whose compliance cannot be
 * confirmed must never be reported as compliant.
 *
 * It reads its own comments, unlike the release audit next door: the pinned reference is a
 * SHA and the human-readable release name it was published under survives only as the
 * trailing comment, so that comment is part of the contract rather than decoration.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The coverage identifier a clause belongs to, from the cross-repo contract. */
export type CoverageFact = "E1" | "E7" | "I1" | "I5";

/** Identifies which clause of the caller contract a problem belongs to. */
export type ProblemId =
  | "unreadable"
  | "no-jobs"
  | "job-id"
  | "extra-job"
  | "job-keys"
  | "uses-missing"
  | "uses-target"
  | "uses-ref"
  | "uses-reference-comment"
  | "with"
  | "secrets"
  | "steps"
  | "run"
  | "permissions"
  | "trigger"
  | "concurrency"
  | "top-level-keys";

/** One violation of the caller contract, with the text a failing suite should print. */
export interface Problem {
  readonly id: ProblemId;
  readonly message: string;
}

/**
 * Problems that stop the audit reaching the rest of the contract. Every clause-level check
 * selects these alongside its own id, so an unreadable file or a renamed job reds every
 * clause instead of letting the clauses pass vacuously.
 */
export const UPSTREAM_PROBLEM_IDS: readonly ProblemId[] = ["unreadable", "no-jobs", "job-id"];

/** What one caller workflow has to be, so the audit can say what it found instead. */
export interface CallerSpec {
  /** Path, relative to the repository root, of the workflow this audit reads. */
  readonly path: string;
  /** The one job id under `jobs:`, which is also the check-run context prefix. */
  readonly jobId: string;
  /** The reusable workflow that job delegates to, without its ref. */
  readonly reusable: string;
  /**
   * The 40-character commit in `cosyte/.github` this caller is pinned to. It is PER CALLER and
   * not one shared constant: the two gates name different reusable workflows, which are
   * published and adopted independently, so a shared pin would force a repository moving one
   * gate to move the other in the same change.
   */
  readonly commit: string;
  /** The published reference that commit was released as, carried as a trailing comment. */
  readonly reference: string;
  /** The job ids the reusable publishes, for naming the contexts a rename would move. */
  readonly innerJobIds: readonly string[];
  /** The `pull_request` activity types the caller must trigger on, or null for the default set. */
  readonly pullRequestTypes: readonly string[] | null;
  /** The coverage identifier owning this caller's trigger fact. */
  readonly triggerFact: CoverageFact;
  /** The coverage identifier owning this caller's concurrency and permissions fact. */
  readonly ceilingFact: CoverageFact;
}

/** The em-dash gate caller: two contexts, and `edited` is load-bearing. */
export const EMDASH_CALLER: CallerSpec = {
  path: ".github/workflows/no-emdash.yml",
  jobId: "no-emdash",
  reusable: "cosyte/.github/.github/workflows/gate-no-emdash.yml",
  commit: "84ecccd771cbc9c1ece003a3f8ff61415360395b",
  reference: "workflows-2026-09-18-84ecccd771cb",
  innerJobIds: ["tracked-files", "messages"],
  pullRequestTypes: ["opened", "synchronize", "reopened", "edited"],
  triggerFact: "E1",
  ceilingFact: "E7",
};

/**
 * The public-surface gate caller: one context, and deliberately no `edited` type.
 *
 * IT NAMES THE INSTALLING FORM OF THE SHARED GATE, and that is load-bearing rather than a
 * spelling. `pnpm check:no-internal-refs` reaches an installed package, so a runner handed a
 * tree with no `node_modules` cannot reach the implementation and the gate refuses, correctly
 * and permanently. The shared repository publishes the install as a SECOND WORKFLOW rather than
 * as an input, because selecting an input needs a `with:` key in the caller and the contract
 * below refuses one. Both forms publish the same `public-surface` job id, so this choice moves
 * no check-run context and no ruleset entry.
 */
export const INTERNAL_REFS_CALLER: CallerSpec = {
  path: ".github/workflows/no-internal-refs.yml",
  jobId: "no-internal-refs",
  reusable: "cosyte/.github/.github/workflows/gate-no-internal-refs-install.yml",
  commit: "acaa6cbe1745e950837e61849ed84bf9e34fec68",
  reference: "workflows-2026-09-22-acaa6cbe1745",
  innerJobIds: ["public-surface"],
  pullRequestTypes: null,
  triggerFact: "I1",
  ceilingFact: "I5",
};

/** Both callers, in the order the gates are named throughout this repository. */
export const GATE_CALLERS: readonly CallerSpec[] = [EMDASH_CALLER, INTERNAL_REFS_CALLER];

/** What the audit was handed: either the workflow text, or why there is none to read. */
export type WorkflowSource =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "unreadable"; readonly reason: string };

interface Entry {
  readonly indent: number;
  /** The mapping key, or the empty string for a bare sequence item. */
  readonly key: string;
  readonly value: string;
  /** The trailing `#` comment, without its hash, or the empty string. */
  readonly comment: string;
  readonly itemStart: boolean;
  readonly line: number;
}

const KEY_LINE = /^([A-Za-z0-9_.-]+):(?:[ \t]+(.*))?$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

/** Split a line into its content and its trailing YAML comment, respecting quotes. */
function splitComment(line: string): { content: string; comment: string } {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line.charAt(i);
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      const before = i === 0 ? " " : line.charAt(i - 1);
      if (before === " " || before === "\t" || i === 0) {
        return { content: line.slice(0, i), comment: line.slice(i + 1).trim() };
      }
    }
  }
  return { content: line, comment: "" };
}

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2) {
    const first = value.charAt(0);
    const last = value.charAt(value.length - 1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Flatten the document to entries carrying their indentation, their trailing comment and
 * their sequence-item flag. A bare sequence item (`- main`) is kept with an empty key, so a
 * block-style list reads the same as a flow-style one.
 */
function entriesOf(text: string): Entry[] {
  const entries: Entry[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    if (rawLine.trim() === "") continue;
    const split = splitComment(rawLine);
    const content = split.content.replace(/\s+$/, "");
    if (content.trim() === "") continue;
    let indent = content.length - content.trimStart().length;
    let rest = content.trimStart();
    let itemStart = false;
    let dash = /^-(\s+)/.exec(rest);
    while (dash !== null) {
      itemStart = true;
      indent += 1 + (dash[1]?.length ?? 1);
      rest = rest.slice(dash[0].length);
      dash = /^-(\s+)/.exec(rest);
    }
    if (rest === "" || rest === "-") continue;
    const match = KEY_LINE.exec(rest);
    if (match === null) {
      if (itemStart) {
        entries.push({
          indent,
          key: "",
          value: rest.trim(),
          comment: split.comment,
          itemStart,
          line: i + 1,
        });
      }
      continue;
    }
    entries.push({
      indent,
      key: match[1] ?? "",
      value: (match[2] ?? "").trim(),
      comment: split.comment,
      itemStart,
      line: i + 1,
    });
  }
  return entries;
}

/** Indices of the entries nested under `entries[at]`: everything more indented that follows. */
function nestedIndices(entries: readonly Entry[], at: number): number[] {
  const parent = entries[at];
  if (parent === undefined) return [];
  const found: number[] = [];
  for (let i = at + 1; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry === undefined || entry.indent <= parent.indent) break;
    found.push(i);
  }
  return found;
}

/** Only the entries one level in, so `jobs.no-emdash.permissions` is not read as a job id. */
function childIndices(entries: readonly Entry[], at: number): number[] {
  const nested = nestedIndices(entries, at);
  if (nested.length === 0) return [];
  const indents = nested.map((i) => entries[i]?.indent ?? Number.MAX_SAFE_INTEGER);
  const level = Math.min(...indents);
  return nested.filter((i) => entries[i]?.indent === level);
}

function childrenOf(entries: readonly Entry[], at: number): Entry[] {
  const found: Entry[] = [];
  for (const i of childIndices(entries, at)) {
    const entry = entries[i];
    if (entry !== undefined) found.push(entry);
  }
  return found;
}

function topLevelIndex(entries: readonly Entry[], key: string): number {
  return entries.findIndex((entry) => entry.indent === 0 && entry.key === key);
}

/**
 * The list value at `at`, whether it is written flow style (`[main]`) or block style. Returns
 * null when the entry carries neither, so "absent" and "empty" stay distinguishable.
 */
function listAt(entries: readonly Entry[], at: number): string[] | null {
  const entry = entries[at];
  if (entry === undefined) return null;
  const value = entry.value.trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    const body = value.slice(1, -1).trim();
    if (body === "") return [];
    return body.split(",").map((item) => unquote(item.trim()));
  }
  if (value !== "") return null;
  const items = childrenOf(entries, at).filter((child) => child.key === "");
  if (items.length === 0) return null;
  return items.map((child) => unquote(child.value));
}

function problem(id: ProblemId, ...sentences: readonly string[]): Problem {
  return { id, message: sentences.join(" ") };
}

function list(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.map((value) => "`" + value + "`").join(", ");
}

/**
 * Report every way one caller departs from the contract. An empty array is the only shape
 * that means compliant; every other outcome names the file, the clause and the remedy.
 *
 * @param spec - What this caller has to be.
 * @param source - The workflow text, or the reason there is none.
 * @returns Every contract violation found, in contract order.
 * @example
 * const problems = auditGateCaller(EMDASH_CALLER, { kind: "text", text: "..." });
 */
export function auditGateCaller(spec: CallerSpec, source: WorkflowSource): Problem[] {
  const label = "`" + spec.path + "`";
  const jobLabel = "`" + spec.jobId + "`";

  const unreadable = (reason: string): Problem[] => [
    problem(
      "unreadable",
      label + ": " + reason + ".",
      "An unreadable gate caller is never reported as compliant: neither the pinned reference",
      "nor the job id that carries this gate's check-run contexts can be confirmed from a file",
      "that is not there, and reporting it as satisfied would hide a dark gate behind a green",
      "suite.",
    ),
  ];

  if (source.kind === "unreadable") return unreadable(source.reason);
  if (source.text.trim() === "") return unreadable("is empty");

  const entries = entriesOf(source.text);
  const problems: Problem[] = [];

  const jobsAt = topLevelIndex(entries, "jobs");
  if (jobsAt === -1) {
    return [
      problem(
        "no-jobs",
        label + ": no top level `jobs:` mapping was found, so the " + jobLabel + " job that",
        "publishes this gate's check-run contexts is not there to audit.",
      ),
    ];
  }

  // The top level shape. A key this audit has no opinion about is still reported: an
  // unrecognised caller is not a compliant caller.
  const allowedTopLevel = new Set(["name", "on", "concurrency", "jobs", "permissions"]);
  for (const entry of entries) {
    if (entry.indent === 0 && entry.key !== "" && !allowedTopLevel.has(entry.key)) {
      problems.push(
        problem(
          "top-level-keys",
          label +
            ": unexpected top level key `" +
            entry.key +
            "` at line " +
            String(entry.line) +
            ".",
          "The documented caller shape is `name`, `on`, `concurrency` and `jobs`, and this audit",
          "reports what it cannot recognise rather than passing it.",
        ),
      );
    }
  }

  const jobIndices = childIndices(entries, jobsAt);
  const jobIds = jobIndices.map((i) => entries[i]?.key ?? "?");
  const jobAt = jobIndices.find((i) => entries[i]?.key === spec.jobId);

  if (jobAt === undefined) {
    const wouldPublish = jobIds.flatMap((found) =>
      spec.innerJobIds.map((inner) => "`" + found + " / " + inner + "`"),
    );
    return [
      problem(
        "job-id",
        label +
          ": no job named " +
          jobLabel +
          " was found under `jobs:` (present: " +
          list(jobIds) +
          ").",
        "A called job's check run is named `<caller job id> / <inner job id>`, so this file would",
        "publish " +
          (wouldPublish.length === 0 ? "nothing" : wouldPublish.join(", ")) +
          " instead of",
        spec.innerJobIds.map((inner) => "`" + spec.jobId + " / " + inner + "`").join(" and ") + ".",
        "A branch ruleset requires the latter by that exact string, so renaming this job detaches",
        "the requirement with no error anywhere: either the ruleset keeps requiring a context",
        "nothing emits, which blocks every pull request, or the gate stops blocking and nothing",
        "says so. Renaming it has to be a deliberate edit of this audit and of the rulesets too.",
      ),
    ];
  }

  for (const i of jobIndices) {
    const extra = entries[i];
    if (extra === undefined || i === jobAt) continue;
    problems.push(
      problem(
        "extra-job",
        label + ": a second job `" + extra.key + "` was found at line " + String(extra.line) + ".",
        "This caller declares exactly one job, because every job here publishes a check-run",
        "context and an unrequired extra context is a gate nobody is watching.",
      ),
    );
  }

  const jobBody = childrenOf(entries, jobAt);
  const jobBodyIndices = childIndices(entries, jobAt);

  // `uses:`, and the ref it names. Every `uses:` in the file is checked, not only this
  // job's, so a later edit that adds an action somewhere cannot smuggle in a moving ref.
  const uses = jobBody.find((entry) => entry.key === "uses");
  if (uses === undefined) {
    problems.push(
      problem(
        "uses-missing",
        label + ": the " + jobLabel + " job carries no `uses:` key, so it delegates to nothing.",
        "This gate runs entirely through the shared workflow `" + spec.reusable + "`.",
      ),
    );
  } else {
    const target = unquote(uses.value);
    const at = target.lastIndexOf("@");
    const path = at === -1 ? target : target.slice(0, at);
    const ref = at === -1 ? "" : target.slice(at + 1);
    if (path !== spec.reusable) {
      problems.push(
        problem(
          "uses-target",
          label + ": the " + jobLabel + " job does not delegate to `" + spec.reusable + "`.",
          at === -1 && target === ""
            ? "Its `uses:` value is empty."
            : "It delegates to `" + path + "` instead.",
          "Which contexts this gate publishes, and what it actually scans, are properties of the",
          "workflow being called, so redirecting this job invalidates every other clause here.",
        ),
      );
    }
    if (ref !== spec.commit) {
      const shape = FULL_SHA.test(ref)
        ? "another commit"
        : ref === ""
          ? "no ref at all"
          : /^[0-9a-f]{7,39}$/.test(ref)
            ? "an ABBREVIATED SHA"
            : ref.startsWith("workflows-")
              ? "a TAG"
              : "a BRANCH or tag name";
      problems.push(
        problem(
          "uses-ref",
          label + ": the " + jobLabel + " job names the reusable workflow at `" + ref + "`,",
          "which is " + shape + ", not the pinned 40-character commit `" + spec.commit + "`.",
          "A branch, `main`, a tag or an abbreviated SHA resolves to whatever that name points at",
          "on the day the workflow runs, and a tag can be moved or deleted by anyone who gains",
          "write access to the workflow's repository, so none of them is an immutable reference.",
          "Only the full commit SHA pins what this repository's gates enforce.",
        ),
      );
    }
    if (!uses.comment.includes(spec.reference)) {
      problems.push(
        problem(
          "uses-reference-comment",
          label + ": the " + jobLabel + " job's `uses:` line carries no trailing comment naming",
          "the published reference `" + spec.reference + "`",
          uses.comment === "" ? "(there is no comment)." : "(it reads `" + uses.comment + "`).",
          "A 40-character SHA is a pin and not a name: without the reference beside it, the",
          "release note describing what this commit changed is unreachable from here.",
        ),
      );
    }
  }

  // A caller that scans is a second copy of the rule this gate keeps in `scripts/`.
  const forbidden: readonly { key: string; id: ProblemId; why: string }[] = [
    {
      key: "with",
      id: "with",
      why:
        "A `with:` key is how a scanning rule, a pattern, an allow-list or a file selection enters " +
        "a caller. This repository's defaults already match every input the shared workflow takes, " +
        "so the caller passes none and the rule stays in `scripts/` where there is one copy of it.",
    },
    {
      key: "secrets",
      id: "secrets",
      why:
        "These gates read the tree and nothing else. A `secrets:` key of any kind, `inherit` " +
        "included, hands a called workflow credentials a file scan has no use for.",
    },
    {
      key: "steps",
      id: "steps",
      why:
        "A job that delegates through `uses:` cannot carry steps at all, so a `steps:` key means " +
        "this file has stopped being a caller and has become a second implementation of the gate.",
    },
    {
      key: "run",
      id: "run",
      why:
        "A `run:` key means the gate is being performed here rather than by the shared workflow, " +
        "which is the divergent second copy this file exists to prevent.",
    },
  ];
  for (const entry of jobBody) {
    for (const rule of forbidden) {
      if (entry.key === rule.key) {
        problems.push(
          problem(
            rule.id,
            label +
              ": the " +
              jobLabel +
              " job carries a `" +
              rule.key +
              ":` key at line " +
              String(entry.line) +
              ".",
            rule.why,
          ),
        );
      }
    }
  }

  const allowedJobKeys = new Set(["uses", "permissions"]);
  for (const entry of jobBody) {
    if (entry.key === "" || allowedJobKeys.has(entry.key)) continue;
    if (forbidden.some((rule) => rule.key === entry.key)) continue;
    problems.push(
      problem(
        "job-keys",
        label +
          ": the " +
          jobLabel +
          " job carries an unexpected key `" +
          entry.key +
          ":` at line " +
          String(entry.line) +
          ".",
        "The documented caller shape is `uses:` and `permissions:` and nothing else.",
        entry.key === "if"
          ? "An `if:` here is the worst of them: a job skipped by a conditional SATISFIES its " +
              "required context, so the gate would report green without running and the ruleset " +
              "would be quietly un-required."
          : "This audit reports what it cannot recognise rather than passing it.",
      ),
    );
  }

  // The permissions ceiling. Coverage fact E7 for the em-dash caller, I5 for the other.
  const ceiling = spec.ceilingFact;
  const permissionsAt = jobBodyIndices.find((i) => entries[i]?.key === "permissions");
  if (permissionsAt === undefined) {
    problems.push(
      problem(
        "permissions",
        label + " (" + ceiling + "): the " + jobLabel + " job carries no `permissions:` block,",
        "so it hands the shared workflow whatever this repository's default GITHUB_TOKEN grants.",
        "The documented ceiling is exactly `contents: read`: a called workflow's token can only be",
        "downgraded by its caller, and a file scan needs nothing else.",
      ),
    );
  } else {
    const grants = childrenOf(entries, permissionsAt);
    const flow = entries[permissionsAt]?.value.trim() ?? "";
    const pairs =
      flow.startsWith("{") && flow.endsWith("}")
        ? flow
            .slice(1, -1)
            .split(",")
            .map((pair) => pair.trim())
            .filter((pair) => pair !== "")
            .map((pair) => {
              const at = pair.indexOf(":");
              return { key: pair.slice(0, at).trim(), value: pair.slice(at + 1).trim() };
            })
        : grants.map((entry) => ({ key: entry.key, value: unquote(entry.value) }));
    const rendered = pairs.map((pair) => pair.key + ": " + pair.value);
    const isExact =
      pairs.length === 1 && pairs[0]?.key === "contents" && pairs[0]?.value === "read";
    if (!isExact) {
      problems.push(
        problem(
          "permissions",
          label + " (" + ceiling + "): the " + jobLabel + " job grants " + list(rendered) + ",",
          "not exactly `contents: read`.",
          "A gate that reads the tree needs no other scope, and a called workflow inherits whatever",
          "the caller grants it.",
        ),
      );
    }
  }

  // The triggers. Coverage fact E1 for the em-dash caller, I1 for the other, and `edited`
  // is the difference between them rather than an oversight.
  const fact = spec.triggerFact;
  const onAt = topLevelIndex(entries, "on");
  if (onAt === -1) {
    problems.push(
      problem(
        "trigger",
        label +
          " (" +
          fact +
          "): no top level `on:` block was found, so this gate runs on nothing.",
      ),
    );
  } else {
    const onChildren = childIndices(entries, onAt);
    const pushAt = onChildren.find((i) => entries[i]?.key === "push");
    const prAt = onChildren.find((i) => entries[i]?.key === "pull_request");
    const branchesUnder = (parent: number | undefined): string[] | null => {
      if (parent === undefined) return null;
      const at = childIndices(entries, parent).find((i) => entries[i]?.key === "branches");
      return at === undefined ? null : listAt(entries, at);
    };
    const pushBranches = branchesUnder(pushAt);
    const prBranches = branchesUnder(prAt);
    if (pushAt === undefined || pushBranches === null || pushBranches.join(",") !== "main") {
      problems.push(
        problem(
          "trigger",
          label + " (" + fact + "): this gate does not run on `push` to `main`",
          pushAt === undefined
            ? "(there is no `push:` trigger)."
            : "(it runs on " + list(pushBranches ?? []) + ").",
          "A gate that does not run on the default branch cannot tell anyone the branch went bad.",
        ),
      );
    }
    if (prAt === undefined || prBranches === null || prBranches.join(",") !== "main") {
      problems.push(
        problem(
          "trigger",
          label + " (" + fact + "): this gate does not run on `pull_request` to `main`",
          prAt === undefined
            ? "(there is no `pull_request:` trigger)."
            : "(it runs on " + list(prBranches ?? []) + ").",
        ),
      );
    }
    const typesAt =
      prAt === undefined
        ? undefined
        : childIndices(entries, prAt).find((i) => entries[i]?.key === "types");
    const types = typesAt === undefined ? null : listAt(entries, typesAt);
    if (spec.pullRequestTypes === null) {
      if (types !== null) {
        problems.push(
          problem(
            "trigger",
            label + " (" + fact + "): the `pull_request` trigger carries an activity type list",
            "(" + list(types) + "), and this gate is documented to carry none.",
            "Nothing in this gate reads pull request text, so retitling a pull request cannot change",
            "its result and an `edited` rerun would buy nothing.",
          ),
        );
      }
    } else {
      const wanted = spec.pullRequestTypes;
      const found = types ?? [];
      const missing = wanted.filter((type) => !found.includes(type));
      if (types === null || missing.length > 0 || found.length !== wanted.length) {
        problems.push(
          problem(
            "trigger",
            label +
              " (" +
              fact +
              "): the `pull_request` trigger's activity types are " +
              (types === null ? "absent" : list(found)) +
              ", not exactly " +
              list(wanted) +
              ".",
            missing.includes("edited")
              ? "`edited` is the load-bearing one: this repository squash-merges, so the pull request " +
                  "title and body ARE the commit message that lands on `main`, and without `edited` a " +
                  "title edited after the last push is never re-checked."
              : "The documented set is the one the shared workflow's two halves are triggered by.",
          ),
        );
      }
    }
  }

  // The concurrency group. Same coverage fact as the permissions ceiling.
  const concurrencyAt = topLevelIndex(entries, "concurrency");
  if (concurrencyAt === -1) {
    problems.push(
      problem(
        "concurrency",
        label + " (" + ceiling + "): no top level `concurrency:` block was found.",
        "Without one, a push on top of a push leaves both runs racing and the older one can report",
        "after the newer.",
      ),
    );
  } else {
    const group = childrenOf(entries, concurrencyAt).find((entry) => entry.key === "group");
    const cancel = childrenOf(entries, concurrencyAt).find(
      (entry) => entry.key === "cancel-in-progress",
    );
    const groupValue = group === undefined ? "" : unquote(group.value);
    if (!groupValue.includes("github.workflow") || !groupValue.includes("github.ref")) {
      problems.push(
        problem(
          "concurrency",
          label + " (" + ceiling + "): the concurrency group is `" + groupValue + "`,",
          "which is not keyed on both `github.workflow` and `github.ref`.",
          "A group that does not name the ref cancels runs on other branches; one that does not name",
          "the workflow collides with the other gate.",
        ),
      );
    }
    if (cancel === undefined || unquote(cancel.value) !== "true") {
      problems.push(
        problem(
          "concurrency",
          label +
            " (" +
            ceiling +
            "): `cancel-in-progress` is " +
            (cancel === undefined ? "absent" : "`" + unquote(cancel.value) + "`") +
            ", not `true`.",
        ),
      );
    }
  }

  return problems;
}

/**
 * Read one caller out of a checkout and audit it. Reads one file with `node:fs` and nothing
 * else: no network, no credentials, no GitHub API.
 *
 * @param spec - What this caller has to be.
 * @param repoRoot - Absolute path to the repository root.
 * @returns Every contract violation found, in contract order.
 * @example
 * const problems = auditGateCallerAt(EMDASH_CALLER, join(import.meta.dirname, "..", ".."));
 */
export function auditGateCallerAt(spec: CallerSpec, repoRoot: string): Problem[] {
  let source: WorkflowSource;
  try {
    source = { kind: "text", text: readFileSync(join(repoRoot, spec.path), "utf8") };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    source = { kind: "unreadable", reason: "could not be read (" + reason + ")" };
  }
  return auditGateCaller(spec, source);
}

/**
 * Select the problems a single contract clause owns, always including the upstream ones so
 * a missing file or a renamed job cannot let a clause pass by never being reached.
 *
 * @param problems - The audit result.
 * @param ids - The clause ids this check owns.
 * @returns The matching problems, upstream problems first.
 * @example
 * const hits = problemsFor(problems, ["uses-ref"]);
 */
export function problemsFor(problems: readonly Problem[], ids: readonly ProblemId[]): Problem[] {
  const wanted = new Set<ProblemId>([...UPSTREAM_PROBLEM_IDS, ...ids]);
  return problems.filter((entry) => wanted.has(entry.id));
}
