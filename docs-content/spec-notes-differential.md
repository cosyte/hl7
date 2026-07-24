---
id: spec-notes-differential
title: "Spec notes: differential testing against external oracles (HL7-J)"
sidebar_label: Differential testing
---

# Spec notes: differential testing against external oracles (HL7-J)

`test/differential/differential.test.ts` parses the canonical corpus
(`test/fixtures/canonical/*.hl7`, 27 fixtures spanning ADT/ORU/ORM/SIU/MDM/DFT/RDE/RDS/VXU trigger
events, TQ1 timing, Z-segments, and nested-subcomponent edge cases) through **both**
`@cosyte/hl7` and an external, independently-implemented HL7 v2 parser, then compares segment
count and per-segment field extraction. This is a _second, independent read_ of the same corpus.
A real bug that both this repo's own fixtures AND its own implementation happen to agree on
(a shared blind spot) would never surface from `@cosyte/hl7`'s own test suite alone. An external
oracle is the only way to catch that class of bug.

## Why this is oracle-gated, not a hard CI dependency

`@cosyte/hl7` ships **zero runtime dependencies** (the standing convention across every
`@cosyte/*` parser). The oracle is a **dev-time-only, external, never-vendored** tool: it is
never bundled, published, or required to install the package. If no Python interpreter with the
oracle package importable is available, `test/differential/differential.test.ts` detects that at
runtime and `it.skip()`s every comparison. `scripts/verify.sh` (and CI) stay green with zero
Python present. The harness is a **bonus signal when available**, not a merge gate on its own
absence.

## The oracle: python-hl7

**Primary oracle: [python-hl7](https://github.com/johnpaulett/python-hl7)** (PyPI distribution
name `hl7`: the GitHub repo name and the installable package name differ; `pip install hl7`, not
`pip install python-hl7`). Pure-Python, zero C extensions, `import hl7`. **License: BSD**
(3-clause), permissive, external-only, safe to invoke as a dev/test tool without any bundling or
distribution obligation back onto `@cosyte/hl7`.

**Optional secondary oracle: [hl7apy](https://crs4.github.io/hl7apy/)**, MIT-licensed,
more structurally strict (validates against HL7 message-structure definitions rather than
python-hl7's permissive flat-field model). Not wired into the harness today; flagged here as the
natural next oracle if a second, differently-opinionated read becomes valuable. hl7apy's stricter
structural validation would likely surface _more_ "divergences" that are actually hl7apy being
pickier, not `@cosyte/hl7` being wrong. Expect to spend real time re-deriving the
known/justified-divergence list documented below if it's ever added.

**Licensing bound.** Both oracles are permissive (BSD / MIT) and used exclusively as external,
dev-only test tooling, never imported, vendored, or shipped inside the published `@cosyte/hl7`
package. This is the same bound the umbrella's conventions apply to HAPI/nHapi elsewhere in the
ecosystem: external-only, never bundled.

## How to run it

```bash
cd hl7   # this repo
python3 -m venv .difftools
.difftools/bin/pip install hl7
pnpm test test/differential/differential.test.ts
```

`.difftools/` is git-ignored (never committed: it's a local dev venv, consistent with the
zero-runtime-dep / never-vendored rule above). The harness also falls back to a plain `python3` on
`PATH` if `import hl7` succeeds there, so a system-wide install works too. The venv path is just
the reproducible default.

Detection happens once per run, in `test/differential/differential.test.ts`'s `findOraclePython()`:
try `.difftools/bin/python`, then `python3` on `PATH`; the first one where
`python3 -c "import hl7"` exits 0 wins. If neither works, every comparison test calls `ctx.skip()`
and a one-line console note explains why (pointing back at this doc).

## What is compared, and how

For each canonical fixture:

1. **Segment count.** `@cosyte/hl7`'s `msg.rawSegments.length` vs `len(hl7.parse(raw))`. A
   mismatch here is always a hard failure: it means the two parsers disagree about the message's
   fundamental shape, never a "known/justified" divergence.
2. **Per-segment name.** Segment name at each index must match exactly.
3. **Per-segment field count**, using the SAME 1-indexed HL7 position convention on both sides
   (see "Field-indexing alignment" below).
4. **Per-field wire text**: `@cosyte/hl7`'s `Field.text` (the field's canonical re-serialized wire
   text: repetitions, components, subcomponents, all re-escaped) against python-hl7's `str(field)`
   (its reconstruction of the field's original delimiter-joined text).

### Field-indexing alignment

Both parsers land on the _identical_ 1-indexed convention by construction, which is what makes a
byte-level comparison possible at all rather than needing a translation layer:

- **Non-MSH segments:** index `0` is the segment name (not a data field, excluded from both
  sides' comparison); index `N >= 1` is the HL7 N-th field (`PID-5` lives at index 5 on both
  sides).
- **MSH specifically:** index `0`/position `1` is the field separator character itself (MSH-1);
  index `1`/position `2` is the encoding-characters field (MSH-2); index `N >= 2`/position
  `N + 1` is MSH-`(N+1)`. `@cosyte/hl7`'s own module JSDoc
  (`src/parser/tokenize.ts`) documents this convention explicitly. It was written to match the
  same "unified 1-indexed, MSH-1 lives at position 1" convention any spec-literate HL7 v2 parser
  (python-hl7 included) uses. MSH-1/MSH-2 are read literally from the raw tokenizer tree on the
  `@cosyte/hl7` side rather than through `Field.text`, because `Field.text`'s own JSDoc documents
  that calling it on MSH-1/MSH-2 re-escapes the delimiter-definition characters into garbage:
  those two positions aren't "escapable content" the way MSH-3 onward is.

## Known / justified divergences

The harness classifies every field-text mismatch against a small, explicit, honestly-derived list
of known-divergence predicates (`KNOWN_DIVERGENCES` in `differential.test.ts`). A mismatch that
matches a known predicate is **reported, not silently dropped, and does not fail the suite**. A
mismatch that matches **none** of them **fails**. The point of the allowlist is to keep the
harness a real regression detector, not to paper over an actual bug with an overly broad
tolerance.

### D-02 trailing-empty-component canonicalization (observed, on `test/fixtures/canonical/tq1-q6h.hl7`)

`@cosyte/hl7`'s serializer strips **trailing empty components and subcomponents** when producing
canonical wire text (`Field.text`, `src/serialize/emit-field.ts`: this is D-02, the same rule that
governs `msg.toString()`'s spec-clean output). python-hl7's `str(field)` instead returns the
**verbatim original substring**, trailing empties included.

Concretely: the fixture's `TQ1-2` field is `1^tablet^^` (two trailing empty components). hl7
reports `"1^tablet"`; python-hl7 reports `"1^tablet^^"`. This is Postel's-Law-consistent, intended
behavior on the `@cosyte/hl7` side: trailing empty components carry no information the HL7 v2
spec treats as significant, and stripping them is exactly what the _serializer_ (the "be
conservative in what you emit" side of Postel's Law) is supposed to do. python-hl7 makes the
opposite, also-defensible choice: preserve the byte-exact original. Neither is "wrong": they're
different design points on the same lenient-parse/canonical-emit spectrum, and this harness exists
precisely to make that difference visible and documented rather than silently assumed away.

**Detection predicate:** `theirs` (the oracle's text) starts with `ours` (hl7's canonicalized
text) and the remainder is composed entirely of trailing `^`/`&` delimiter characters (i.e., empty
trailing components/subcomponents), a structural, not content-based, check.

### Divergences NOT yet observed, but plausible (kept here so a future contributor knows to look)

These are called out because they're common failure modes when differential-testing two
independently-implemented HL7 v2 parsers, but the current 27-fixture canonical corpus doesn't
happen to exercise them. If the corpus grows and one of these starts firing, add its predicate to
`KNOWN_DIVERGENCES` with the same honesty this file applies to the D-02 case above. Don't broaden
an existing predicate to swallow an unrelated divergence.

- **Escape-sequence decoding differences.** `@cosyte/hl7`'s tokenizer decodes escape sequences
  (`unescape()`) into the raw tree and the serializer re-escapes on the way back out
  (`reescape()`); python-hl7's default parse mode does _not_ auto-decode `\F\`/`\S\`/`\T\`/`\R\`/
  `\E\`. See the empty-oracle-parse workaround this harness's `oracle_python_hl7.py` module JSDoc
  had to account for while probing python-hl7's behavior (its `str(field)` returns the field as
  found, escape sequences un-expanded, for anything python-hl7 itself doesn't need to touch). None
  of the 27 canonical fixtures currently embed a `\Xxx\` escape inside a field compared by this
  harness, so this predicted divergence has not fired yet.
- **Explicit-null (`""`) field semantics.** `@cosyte/hl7` distinguishes an _empty_ field (`||`)
  from HL7's _explicit null_ token (`""`) via `RawField.isNull`; whether python-hl7's `str()`
  round-trips `""` byte-for-byte or normalizes it differently is untested by the current corpus
  (no canonical fixture uses an explicit null in a field this harness compares).
- **Lenient-mode recovery on malformed input.** The differential harness only runs against the
  **canonical, spec-clean** corpus: every fixture parses successfully on both sides today. It
  does _not_ compare lenient-mode recovery behavior (warnings, truncation handling, delimiter
  quirks) between the two parsers; `@cosyte/hl7`'s Postel's-Law tolerance model
  (`test/property/lenient.property.test.ts`, `test/property/fuzz.property.test.ts`) is validated
  in-repo against its own documented fatal/warning contract instead, since a divergence there would
  almost certainly reflect the two libraries' deliberately different leniency philosophies rather
  than a correctness bug in either.

## Limitations (read before trusting this harness more than it claims)

- **Corpus size.** 27 fixtures is a meaningful spread of real-world message shapes, but it is not
  exhaustive: the differential harness can only report what the corpus happens to exercise. It
  complements, not replaces, the spec-traceability tests and property-based fuzz suite
  (`test/property/fuzz.property.test.ts`) elsewhere in this repo.
- **One oracle today.** A single external implementation reduces, but does not eliminate, the risk
  of a shared blind spot (e.g. both python-hl7 and `@cosyte/hl7` independently under-handling the
  same obscure HL7 v2 corner case). Adding hl7apy as a second oracle would strengthen this further;
  it is intentionally left as documented future work rather than built speculatively.
- **Field-text comparison, not full semantic comparison.** The harness compares wire text, not
  parsed/typed values (e.g. it does not compare `@cosyte/hl7`'s typed `XPN`/`CX`/`TS` composites
  against any equivalent python-hl7 representation, python-hl7 doesn't have typed composites to
  compare against). This is a deliberate scope boundary: wire-text parity at the segment/field
  level is what "two parsers agree on how this message is shaped" actually means; composite-type
  interpretation is `@cosyte/hl7`-specific value-add tested elsewhere (`test/model-types-*.test.ts`).
