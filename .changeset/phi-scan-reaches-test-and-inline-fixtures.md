---
"@cosyte/hl7": patch
---

Repository PHI commit-gate only, with no runtime impact: the gate now reads tracked files directly under `test/`, reads an inline `PID|...` literal in hand-written source with the same field map a `.hl7` fixture gets, and no longer drops to a shape-only pass over a blob staged at exactly a scan root.

`pnpm phi-scan` with no arguments is what CI runs; `pnpm phi-scan --staged` is the pre-commit hook.
Four separate holes, each pre-existing and each measured on this checkout before the change.

**One: a tracked file directly under `test/` was enumerated by neither route.** The walk was rooted
at `test/fixtures` and `src`, and `--staged` matched `test/fixtures/**` plus `src/**.ts`. That
leaves **115 tracked files** in this repo scanned by nothing at all. A file at `test/<name>.ts`
carrying a live `PID-3`/`PID-5`/`PID-7`/`PID-11`/`PID-13` printed `OK: no hits` and exited **0** on
both routes, over the same bytes that give six segment-aware hits at a `.hl7` path.

**Two, and it is the half that a wider walk root does NOT buy: the recogniser assumes the file IS
the document, and an inline fixture is a TypeScript string literal.** Bringing `test/**` into scope
bought the conservative shape floor -- a dashed SSN and a non-test email domain -- over those 115
files and nothing else: no name, DOB, MRN, address or phone detection. **55 of the 115 carry an
inline `PID|` literal.** Widening the scope and widening the recogniser are two changes, and the
second is in addition to the first, never instead of it. So there is now an embedded-literal pass
that pulls `PID|...` runs out of source and hands them the same field map the whole-file parse uses.
Both halves are pinned with a case that is red before and green after, and the residual is pinned
too: the same identifying values written as PROSE in the same file are still not found, because a
name in narrative is not separable from clinical vocabulary without NLP.

The embedded pass is deliberately narrower than the whole-file parse, and each of its four limits
is stated rather than left to be discovered. Two of them are here because review refuted the first
draft of this paragraph, which is the reason to read them rather than trust the summary.

It uses the default delimiters only, because an embedded run has no reachable `MSH-2`: the encoding
characters are themselves source-escaped. It runs no unknown-segment backstop, which is right for a
known message and a noise cannon over program text, so an inline `Z...` segment carrying a name is
missed. It erases a `${...}` interpolation rather than reading the variable's identifier as a
person's name, and the bound there is any value reached through an interpolation, INCLUDING one
whose literal sits in the same file: measured, a surname in a same-file constant interpolated into a
PID line exits 1 on the MRN and the DOB and is silent on the name. This pass reads literals in field
position and evaluates nothing; the shape floor still reads the whole file, so a dashed SSN or a
non-test email in such a constant is caught either way. And a run is cut at the first source quote,
which cuts HL7 data as well as program text: the two-character literal `""` is HL7 v2's
explicit-null field value, so an inline fixture exercising null handling loses everything after it,
and an apostrophe inside a name truncates identically. No clause number is quoted for that, on
purpose: the behaviour is grounded in this package's own parser, whose null indicator is true iff
the field was exactly those two characters. That last one is a MISS, and it is written down rather than
patched, because the enclosing quote style is not knowable from a single line and a wrong guess
reads program text as patient data.

`src/` changed intent and not only scope, so the comment that said otherwise is corrected rather
than left standing: the embedded pass runs on EVERY non-fixture target, so a JSDoc `@example`
carrying a PID line with a non-allow-listed name now reds where it did not before. This package
requires an `@example` on every public export, so a new example must use allow-listed tokens or add
its own, exactly as a fixture does. The committed corpus is green as it stands.

**Three: a regular blob staged at exactly `test/fixtures` got the shape floor only, and `--staged`
is the pre-commit hook.** The scope and the mode check already passed it through; the DETECTOR gate
dropped it, because the fixture test wanted a `test/fixtures/` prefix or an `.hl7` suffix and the
root's own path has neither. Measured twice independently: the same payload gives six segment-aware
hits at `test/fixtures/<name>.hl7` and exit **0** at `test/fixtures`. A dashed SSN in that blob
exited **1** either way, so the floor held and only the segment-aware tier was missing -- which is
why the remedy is one clause and not a new rule.

**And a fourth, found by a sibling and reproduced here: `-B` is not inert, and this scanner's own
comment said it was.** That was the permissive half of a "do not add these flags" paragraph, so it
told the next reader that injecting `-B` was safe. The mechanism is sharper than "a `B` record the
filter drops": under `-B` a complete rewrite prints status letter **`M`** with a break score, one
path, which the raw-record parser handles happily -- but `--diff-filter` classifies a broken pair as
**`B`** whatever letter it prints, so `AMTU` deleted the record before anything saw it. Through the
scanner, over a staged dashed SSN in a wholly rewritten in-scope file: the shipped argv exits 1, the
same argv plus `-B` printed `OK: no hits` and exited 0. `B` is now in the filter. It costs the
enumeration nothing, because git cannot emit a broken pair without the flag. **The pin that let the
false claim survive was a pin on a rename**, the one shape `-B` really does leave alone: a case that
cannot fail proves nothing.

**Two behaviour changes that follow from `test` being a walk root, recorded rather than left to be
found.** The fixture root is now an ENTRY INSIDE another root, so a symlink there is classified by
`Dirent.isSymbolicLink()` and refused by name at exit 2, dangling or not: that closes, for
`test/fixtures` only, the residual the previous entry recorded as "a root that is itself a symlink
is followed". It does not generalise -- `src` and `test` have no walked parent, so both are still
followed, and the general rule is the parent, not the root. And the two roots nest, so coverage now
credits EVERY root a file sits under rather than the first: crediting one would leave the other
permanently starved, and which one depended on list order with nothing saying so. Walked entries are
de-duplicated for the same reason, or every fixture would be reported twice.

The scanner's own test file was the one place this could not be resolved with the allow-list, and it
is worth saying why: it holds deliberate violators, every one of them asserted on, so allow-listing
them would have made the positive tests vacuous and carving the file out of the scan would have been
the gate excusing itself from the rule it enforces. Its violator identities are assembled at runtime
instead -- the discipline the file already used for its SSN sentinel -- so the temp files it builds
still carry the full violator bytes and nothing in the tracked file is a PHI-shaped run. One
registrable `.org` email in it became a permanently unregistrable `.invalid` one on the way past.
Every other new allow-list token was surfaced by the gate rather than guessed at, and they are the
same species as the placeholder surnames already listed.

Twenty-three net new tests in the scanner's own suite (78 to 101), plus several existing ones
rewritten where the widening inverted their verdict, each change of verdict recorded rather than
deleted. All of them run on throwaway repositories, so no violator is ever written into the
committed corpus. Nothing here changes a single byte of the published package.
