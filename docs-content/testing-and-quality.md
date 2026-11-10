---
id: testing-and-quality
title: Testing and quality
sidebar_label: Testing and quality
description: "How we test @cosyte/hl7: unit tests, corpora, property-based tests, fuzzing, differential tests and the PHI scan, with what each one catches and misses."
---

# Testing and quality

This page describes how we test `@cosyte/hl7`, what each technique catches, and what it cannot.
The shared rules every Cosyte package follows (the coverage and mutation floors, the property-based
runners, what a pull request must prove) are written down in the testing standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

The failure we test hardest against is the quiet one. A field parsed wrong but plausible travels
downstream as an allergy nobody sees or a dose that is off, and nothing flags it. So most of what
follows checks values, not only that the parser did not throw.

## What we run, and what each technique catches

| Technique | What it catches | What it cannot catch |
| --- | --- | --- |
| Unit tests | each documented behavior and each failure path of every module, run against the source | an input nobody thought to write down |
| Conformance corpora | a regression on a known message shape: synthetic canonical messages across ADT, ORU, ORM, SIU, MDM, DFT, RDE, RDS and VXU, every fatal input, every strict-mode escalation, the date-token corpus, and the structures derived from HL7's published definitions | a shape the corpus does not hold; behavior on real vendor traffic, since every fixture is synthetic |
| Property-based tests | a whole class of input breaking a stated rule: a message survives `toString()` and parsing again, normalizing twice changes nothing a first pass did not, lenient mode never throws except on the four fatal codes, the model cannot be mutated by accident, no warning or error carries message text | a rule nobody stated; a case outside the cases run; a gap in what the generators produce |
| Fuzzing | a crash or an unexpected throw on hostile input: arbitrary strings, the canonical messages with delimiters injected, duplicated or dropped, and every truncation of them | a wrong but plausible result, unless a property states what right is |
| Differential testing | a bug our fixtures and our code agree on, by parsing the canonical corpus with an independent parser (python-hl7) and comparing | a bug both parsers share; it runs only where python-hl7 is installed, and is skipped otherwise |
| Coverage gate | code no test runs: lines, branches, functions and statements, held at a floor on every core directory | a test that runs code without checking what it returns |
| Mutation testing | a test that runs code but would not notice it changing | not yet run on this package; the numbers below say "not measured" until it is |
| Doc samples | a documentation sample that no longer matches the code: every TypeScript sample on these pages runs against the built package and its `// =>` values are checked | prose that is wrong beside a sample that is right |
| PHI scan | a realistic patient identifier in a fixture or a staged file: an HL7-aware scan of the fields that carry each kind of identifier, against a declared allow-list of synthetic values | anything outside the fields and formats it knows; it detects after a write, it does not prevent one |

## How each one runs

- **Unit tests, corpora, properties, fuzzing and doc samples** run in one Vitest suite on every pull
  request and on `main`, on Node.js 22, 24 and 26. Property tests run a fixed number of cases each
  (from 100 to 2,000 today). Of the 143 property checks, 120 fix their seed, so a failure replays
  exactly. The other 23 draw a new seed on every run, so a run can find a case an earlier run
  missed. Eleven of them (ten checks of the composite encoders and one of the patient-merge
  helpers) are replayed from the seed fast-check prints with a failure. The other twelve prove the
  three properties every Cosyte parser proves (round trip, idempotent normalize, and never throws
  in lenient mode) on the generators we publish at `@cosyte/hl7/arbitraries`; they run 100 cases
  each, `COSYTE_PROPERTY_RUNS` sets a deeper run, and a failure prints the seed and path that
  replay it. [Property-test your code](./property-test-your-code.md) shows those generators on
  code of your own.
- **The coverage gate** runs with the suite. A floor that is not met fails the pull request.
- **The PHI scan** runs on every commit (a pre-commit hook) and in CI. The docs pages have their own
  check, which refuses a nine-digit dashed identifier, a telephone number outside the 555 range,
  or an email address outside `example.com` and `example.org` on any line shaped like an HL7
  segment.
- **Differential testing** runs when a Python interpreter with python-hl7 is available.
  [Differential testing](./spec-notes-differential.md) explains the comparison and the known
  differences.

## Run them yourself

```bash
pnpm install --frozen-lockfile
pnpm test               # unit tests, corpora, properties, fuzzing and doc samples
pnpm test:coverage      # the same suite with the coverage gate
pnpm phi-scan           # the PHI scan over the repository
pnpm check:docs         # the docs pages: metadata, links, code reference and sample data

# Differential testing, with the independent parser installed locally:
python3 -m venv .difftools && .difftools/bin/pip install hl7
pnpm test test/differential/differential.test.ts
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
