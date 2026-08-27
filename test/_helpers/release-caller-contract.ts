/**
 * Audit of the caller-side contract that `.github/workflows/release.yml` owes the shared
 * release pipeline, performed as text.
 *
 * WHY THIS EXISTS. This repository's `Release` workflow is a thin caller of the reusable
 * workflow `cosyte/.github/.github/workflows/release.yml@main`. That shared workflow
 * declares `actions: read` so it can read this repository's `release` environment
 * protection. A called workflow's `GITHUB_TOKEN` can only be downgraded by its caller,
 * never elevated, so a calling job whose `permissions:` block pins
 * contents/id-token/pull-requests and nothing else is granting `actions: none`, and the
 * shared workflow's request against that is an escalation. GitHub refuses the whole
 * workflow at STARTUP: no jobs, no steps, no logs, one second, and a `startup_failure`
 * conclusion that reads like silence rather than like a failure. Every `Release` run of
 * this repository did exactly that from June until the caller was given `actions: read`,
 * and nothing inside this repository could tell. The grant is four lines of YAML; any
 * edit, any workflow bump, any well meant permission tightening can delete one of them,
 * and the punishment for deleting one is silence that looks like health. This audit makes
 * that specific regression loud, in this repository's own suite.
 *
 * WHY IT IS TEXT AND NOT A YAML PARSE. This package has zero runtime dependencies and no
 * YAML parser in `devDependencies` (`js-yaml` appears only as an overrides pin for
 * transitive copies and must not be imported), and the suite runs on a CI matrix with no
 * token and no network. So the audit reads one file out of the checkout with `node:fs`
 * and inspects it as indented text: no dependency, no credential, no request leaves the
 * machine. It deliberately does not try to be a YAML implementation. Anything it cannot
 * recognise as the documented caller shape is REPORTED AS A PROBLEM rather than passed,
 * because a release workflow whose compliance cannot be confirmed must never be reported
 * as compliant, and because reshaping this file should cost a deliberate edit here too.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Path, relative to the repository root, of the workflow this audit reads. */
export const RELEASE_WORKFLOW_PATH = ".github/workflows/release.yml";

/** The job id under `jobs:` that carries the caller-side contract. */
export const RELEASE_JOB_ID = "release";

/** The reusable workflow the release job must delegate to, ref included. */
export const SHARED_RELEASE_WORKFLOW = "cosyte/.github/.github/workflows/release.yml@main";

const WORKFLOW_LABEL = "`" + RELEASE_WORKFLOW_PATH + "`";
const JOB_LABEL = "`" + RELEASE_JOB_ID + "`";

/** Identifies which clause of the caller contract a problem belongs to. */
export type ProblemId =
  | "unreadable"
  | "no-release-job"
  | "uses-target"
  | "permissions-block"
  | "grant:actions"
  | "grant:contents"
  | "grant:id-token"
  | "grant:pull-requests";

/** One violation of the caller contract, with the text a failing suite should print. */
export interface Problem {
  readonly id: ProblemId;
  readonly message: string;
}

/**
 * Problems that stop the audit from reaching the rest of the contract at all. Every
 * clause-level check selects these alongside its own id, so an unreadable file or a
 * renamed job reds every clause instead of letting the clauses pass vacuously.
 */
export const UPSTREAM_PROBLEM_IDS: readonly ProblemId[] = ["unreadable", "no-release-job"];

interface RequiredGrant {
  readonly id: ProblemId;
  readonly scope: string;
  readonly level: string;
  readonly purpose: string;
}

const REQUIRED_GRANTS: readonly RequiredGrant[] = [
  {
    id: "grant:actions",
    scope: "actions",
    level: "read",
    purpose:
      "The shared release pipeline declares `actions: read` so it can read this repository's " +
      "`release` environment protection, and a `permissions:` block that pins the other three " +
      "grants and not this one is granting `actions: none`.",
  },
  {
    id: "grant:contents",
    scope: "contents",
    level: "write",
    purpose: "The shared release pipeline creates the tag and the release with it.",
  },
  {
    id: "grant:id-token",
    scope: "id-token",
    level: "write",
    purpose: "The shared release pipeline publishes with npm provenance, which needs it.",
  },
  {
    id: "grant:pull-requests",
    scope: "pull-requests",
    level: "write",
    purpose: "The shared release pipeline opens the version packages pull request with it.",
  },
];

const ESCALATION =
  "A called workflow's GITHUB_TOKEN can only be downgraded by its caller, never elevated, so a " +
  "caller that omits this grant is handing the shared workflow less than it requests and that " +
  "request becomes an ESCALATION: GitHub refuses the whole workflow at STARTUP, before any job " +
  "or step runs, and the run reports `startup_failure` with no jobs and no logs.";

/** What the audit was handed: either the workflow text, or why there is none to read. */
export type WorkflowSource =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "unreadable"; readonly reason: string };

interface Entry {
  readonly indent: number;
  readonly key: string;
  readonly value: string;
}

const KEY_LINE = /^([A-Za-z0-9_.-]+):(?:[ \t]+(.*))?$/;

function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line.charAt(i);
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === "#" && !inSingle && !inDouble) {
      const before = i === 0 ? " " : line.charAt(i - 1);
      if (before === " " || before === "\t") return line.slice(0, i);
    }
  }
  return line;
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
 * Flatten the document to `key: value` entries carrying their indentation. Blank lines,
 * comment lines, document markers and sequence items are dropped: none of them can carry
 * a mapping key this audit reads.
 */
function entriesOf(text: string): Entry[] {
  const entries: Entry[] = [];
  for (const rawLine of text.split("\n")) {
    const line = stripComment(rawLine).replace(/\s+$/, "");
    if (line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    const match = KEY_LINE.exec(line.trimStart());
    if (match === null) continue;
    const key = match[1];
    if (key === undefined) continue;
    entries.push({ indent, key, value: (match[2] ?? "").trim() });
  }
  return entries;
}

/** Indices of the entries nested under `entries[at]`: everything more indented that follows it. */
function nestedIndices(entries: readonly Entry[], at: number): number[] {
  const parent = entries[at];
  if (parent === undefined) return [];
  const found: number[] = [];
  for (let i = at + 1; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry === undefined) break;
    if (entry.indent <= parent.indent) break;
    found.push(i);
  }
  return found;
}

/** Only the entries one level in, so `jobs.release.permissions` is not read as a job id. */
function childIndices(entries: readonly Entry[], at: number): number[] {
  const nested = nestedIndices(entries, at);
  if (nested.length === 0) return [];
  const indents = nested.map((i) => entries[i]?.indent ?? Number.MAX_SAFE_INTEGER);
  const level = Math.min(...indents);
  return nested.filter((i) => entries[i]?.indent === level);
}

/** Entries, not indices, for the one level in under `entries[at]`. */
function childrenOf(entries: readonly Entry[], at: number): Entry[] {
  const found: Entry[] = [];
  for (const i of childIndices(entries, at)) {
    const entry = entries[i];
    if (entry !== undefined) found.push(entry);
  }
  return found;
}

/**
 * Parse a flow mapping (`{ actions: read, contents: write }`) into entries. Block style is
 * what the documented caller shape uses, but flow style is legal YAML for the same value,
 * and reporting a legitimate spelling as a missing grant would be a false alarm.
 */
function flowMappingEntries(value: string): Entry[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  const body = trimmed.slice(1, -1).trim();
  if (body === "") return [];
  const entries: Entry[] = [];
  for (const pair of body.split(",")) {
    const at = pair.indexOf(":");
    if (at === -1) return null;
    const key = pair.slice(0, at).trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) return null;
    entries.push({ indent: 0, key, value: pair.slice(at + 1).trim() });
  }
  return entries;
}

function problem(id: ProblemId, ...sentences: readonly string[]): Problem {
  return { id, message: sentences.join(" ") };
}

function unreadableProblem(reason: string): Problem {
  return problem(
    "unreadable",
    WORKFLOW_LABEL + ": " + reason + ".",
    "An unreadable release workflow is never reported as compliant: the caller-side",
    "permissions contract cannot be confirmed from a file that is not there, and reporting",
    "it as satisfied would restore exactly the silence this audit exists to break.",
  );
}

function grantProblem(grant: RequiredGrant, found: string | null): Problem {
  const grantText = "`" + grant.scope + ": " + grant.level + "`";
  const observed =
    found === null ? "It is absent." : "It is set to `" + grant.scope + ": " + found + "` instead.";
  return problem(
    grant.id,
    WORKFLOW_LABEL + ": the " + JOB_LABEL + " job does not grant " + grantText + ".",
    observed,
    grant.purpose,
    ESCALATION,
    "Restore " + grantText + " to the " + JOB_LABEL + " job's `permissions:` block.",
  );
}

/**
 * Report every way the release job departs from the caller contract. An empty array is
 * the only shape that means "compliant"; every other outcome names the file, the clause
 * and the remedy.
 *
 * @param source - The workflow text, or the reason there is none.
 * @returns Every contract violation found, in contract order.
 * @example
 * const problems = auditReleaseCaller({ kind: "text", text: readFileSync(path, "utf8") });
 * if (problems.length > 0) throw new Error(problems.map((p) => p.message).join("\n\n"));
 */
export function auditReleaseCaller(source: WorkflowSource): Problem[] {
  if (source.kind === "unreadable") return [unreadableProblem(source.reason)];
  if (source.text.trim() === "") return [unreadableProblem("is empty")];

  const entries = entriesOf(source.text);
  const jobsAt = entries.findIndex((entry) => entry.key === "jobs" && entry.indent === 0);
  if (jobsAt === -1) {
    return [
      problem(
        "no-release-job",
        WORKFLOW_LABEL + ": no top level `jobs:` mapping was found,",
        "so the " + JOB_LABEL + " job that carries the caller-side release contract is not",
        "there to audit. This audit reads that contract off " + JOB_LABEL + " under `jobs:`,",
        "so reshaping the workflow has to be a deliberate edit of this audit as well.",
      ),
    ];
  }

  const jobIndices = childIndices(entries, jobsAt);
  const releaseJobAt = jobIndices.find((i) => entries[i]?.key === RELEASE_JOB_ID);
  if (releaseJobAt === undefined) {
    const present = jobIndices.map((i) => "`" + (entries[i]?.key ?? "?") + "`").join(", ");
    return [
      problem(
        "no-release-job",
        WORKFLOW_LABEL + ": no job named " + JOB_LABEL + " was found under `jobs:`",
        "(present: " + (present === "" ? "none" : present) + ").",
        "This audit reads the caller-side release contract off that job, so renaming or",
        "removing it has to be a deliberate edit of this audit as well as of the workflow.",
      ),
    ];
  }

  const jobBodyIndices = childIndices(entries, releaseJobAt);
  const jobBody = childrenOf(entries, releaseJobAt);
  const problems: Problem[] = [];

  const uses = jobBody.find((entry) => entry.key === "uses");
  const usesTarget = uses === undefined ? null : unquote(uses.value);
  if (usesTarget !== SHARED_RELEASE_WORKFLOW) {
    problems.push(
      problem(
        "uses-target",
        WORKFLOW_LABEL + ": the " + JOB_LABEL + " job does not delegate to the shared release",
        "pipeline `" + SHARED_RELEASE_WORKFLOW + "`.",
        usesTarget === null
          ? "It carries no `uses:` key at all."
          : "It delegates to `" + usesTarget + "` instead.",
        "Which caller-side permissions are owed is a property of the workflow being called,",
        "so redirecting this job to another repository, path or ref invalidates every other",
        "clause this audit checks. Leaving the shared pipeline is allowed; doing it silently",
        "is not, so update this audit in the same change.",
      ),
    );
  }

  const permissionsAt = jobBodyIndices.find((i) => entries[i]?.key === "permissions");
  const permissions = permissionsAt === undefined ? undefined : entries[permissionsAt];
  let grants: Entry[] = [];
  if (permissions === undefined || permissionsAt === undefined) {
    problems.push(
      problem(
        "permissions-block",
        WORKFLOW_LABEL + ": the " + JOB_LABEL + " job carries no `permissions:` block.",
        "A calling job without one inherits the repository default GITHUB_TOKEN, which is read",
        "access for `contents` and `packages` only, so the shared release pipeline's requests",
        "are an escalation exactly as an incomplete block makes them, and GitHub refuses the",
        "run at STARTUP with no jobs, no logs and a `startup_failure` conclusion. Inheriting",
        "the default is not the safe option here; it is the same outage.",
      ),
    );
  } else {
    const flow = flowMappingEntries(permissions.value);
    grants = flow ?? childrenOf(entries, permissionsAt);
  }

  for (const grant of REQUIRED_GRANTS) {
    const found = grants.find((entry) => entry.key === grant.scope);
    const level = found === undefined ? null : unquote(found.value);
    if (level !== grant.level) problems.push(grantProblem(grant, level));
  }

  return problems;
}

/**
 * Read `.github/workflows/release.yml` out of a checkout and audit it. Reads one file with
 * `node:fs` and nothing else: no network, no credentials, no GitHub API.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @returns Every contract violation found, in contract order.
 * @example
 * const problems = auditReleaseCallerAt(join(import.meta.dirname, "..", ".."));
 */
export function auditReleaseCallerAt(repoRoot: string): Problem[] {
  let source: WorkflowSource;
  try {
    source = { kind: "text", text: readFileSync(join(repoRoot, RELEASE_WORKFLOW_PATH), "utf8") };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    source = { kind: "unreadable", reason: "could not be read (" + reason + ")" };
  }
  return auditReleaseCaller(source);
}

/**
 * Select the problems a single contract clause owns, always including the upstream ones so
 * a missing file or a renamed job cannot let a clause pass by never being reached.
 *
 * @param problems - The audit result.
 * @param ids - The clause ids this check owns.
 * @returns The matching problems, upstream problems first.
 * @example
 * const hits = problemsFor(problems, ["grant:actions"]);
 */
export function problemsFor(problems: readonly Problem[], ids: readonly ProblemId[]): Problem[] {
  const wanted = new Set<ProblemId>([...UPSTREAM_PROBLEM_IDS, ...ids]);
  return problems.filter((entry) => wanted.has(entry.id));
}
