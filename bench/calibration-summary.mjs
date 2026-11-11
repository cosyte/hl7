// Pool the A/A calibration runs of the large comparison into one summary: how many comparisons
// ran, how many called a regression where nothing changed (a false alarm), how many skipped a case,
// and the spread of each case's round ratios. The bench-calibration workflow runs it over every
// shard's results; docs-content/performance.md quotes it.
//
//   node bench/calibration-summary.mjs <dir>... > summary.md
//
// Every file under the directories (at any depth) that ends in .json and holds a calibration
// results document (`cosyte-bench calibrate --out`) is read; any other JSON file is passed over.
// The upper bounds are exact one-sided 95% Clopper-Pearson bounds, as @cosyte/bench computes them.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { BENCH_CONTRACT, readResults } from "@cosyte/bench";

/** The probability of at most `k` events in `n` trials at rate `p`. */
function binomialCdf(k, n, p) {
  let total = 0;
  let log = 0;
  for (let i = 0; i <= k; i++) {
    if (i > 0) log += Math.log(n - i + 1) - Math.log(i);
    total += Math.exp(log + i * Math.log(p) + (n - i) * Math.log1p(-p));
  }
  return total;
}

/** The exact one-sided upper bound on a rate of `k` events in `n` trials. 1 with no trials. */
export function upperBound(k, n, confidence = BENCH_CONTRACT.REQUIRED_CONFIDENCE) {
  if (n === 0) return 1;
  let lo = k / n;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (binomialCdf(k, n, mid) > 1 - confidence) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** The value at quantile `q` of `xs`, nearest rank. */
function quantile(xs, q) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

/**
 * Pool the comparisons of A/A calibration documents. A skipped case is never a trial; a comparison
 * is a trial when every case measured or it called a regression, as @cosyte/bench counts them.
 */
export function pool(documents) {
  const runs = documents
    .filter((doc) => doc.kind === "calibration" && doc.calibration.inject === 0)
    .flatMap((doc) => doc.calibration.runs);
  let caseTrials = 0;
  let caseAlarms = 0;
  let comparisonTrials = 0;
  let comparisonAlarms = 0;
  let skippedComparisons = 0;
  const cases = new Map();
  for (const run of runs) {
    let alarmed = false;
    let skipped = false;
    for (const c of run) {
      const id = `${c.benchmark} @ ${c.size}`;
      const entry = cases.get(id) ?? {
        benchmark: c.benchmark,
        size: c.size,
        verdicts: 0,
        alarms: 0,
        skips: 0,
        ratios: [],
        largePlan: 0,
        processes: 0,
      };
      cases.set(id, entry);
      if (c.verdict === "skipped") {
        skipped = true;
        entry.skips += 1;
        continue;
      }
      entry.verdicts += 1;
      entry.ratios.push(...c.ratios);
      for (const plan of [...(c.basePlans ?? []), ...(c.headPlans ?? [])]) {
        entry.processes += 1;
        if (plan === "large") entry.largePlan += 1;
      }
      caseTrials += 1;
      if (c.verdict === "regression") {
        caseAlarms += 1;
        entry.alarms += 1;
        alarmed = true;
      }
    }
    if (skipped) skippedComparisons += 1;
    if (alarmed || !skipped) comparisonTrials += 1;
    if (alarmed) comparisonAlarms += 1;
  }
  return {
    comparisons: runs.length,
    caseTrials,
    caseAlarms,
    comparisonTrials,
    comparisonAlarms,
    skippedComparisons,
    cases: [...cases.values()],
  };
}

/** The pooled calibration as Markdown. */
export function render(pooled) {
  const pct = (x) => `${(x * 100).toFixed(2)}%`;
  const p = pooled;
  return [
    `${String(p.comparisons)} A/A comparisons, both sides the same build from two directories.`,
    "",
    `- Comparisons with a false alarm: ${String(p.comparisonAlarms)} of ${String(p.comparisonTrials)} ` +
      `that measured every case or called a regression, upper bound ${pct(upperBound(p.comparisonAlarms, p.comparisonTrials))}.`,
    `- Case verdicts that were false alarms: ${String(p.caseAlarms)} of ${String(p.caseTrials)}, ` +
      `upper bound ${pct(upperBound(p.caseAlarms, p.caseTrials))}.`,
    `- Comparisons that skipped a case: ${String(p.skippedComparisons)} of ${String(p.comparisons)}, ` +
      `upper bound ${pct(upperBound(p.skippedComparisons, p.comparisons))}.`,
    "",
    "| Benchmark | Size | Verdicts | False alarms | Skips | Processes on the large-case plan | Round ratio, 5th to 95th percentile |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...p.cases.map(
      (c) =>
        `| ${c.benchmark} | ${c.size} | ${String(c.verdicts)} | ${String(c.alarms)} | ${String(c.skips)} | ` +
        `${String(c.largePlan)} of ${String(c.processes)} | ` +
        (c.ratios.length === 0
          ? "n/a"
          : `${quantile(c.ratios, 0.05).toFixed(3)} to ${quantile(c.ratios, 0.95).toFixed(3)}`) +
        " |",
    ),
  ].join("\n");
}

function jsonFiles(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return jsonFiles(path);
      return name.endsWith(".json") ? [path] : [];
    });
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  const documents = process.argv
    .slice(2)
    .flatMap(jsonFiles)
    .map((file) => readResults(readFileSync(file, "utf8")));
  console.log(render(pool(documents)));
}
