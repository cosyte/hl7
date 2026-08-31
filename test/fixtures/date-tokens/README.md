# Date token grammar corpus

`corpus.json` is the shared conformance corpus for the date-format token
grammar. It is **data, not code**: no expression language, no assertions, no
syntax belonging to any one parser, and no dependency of any kind. A parser in
any language proves it implements the same grammar by reading this file,
running every case, and producing the stated expectation.

## Where the shape is written down

The `Date token grammar` page in this package's published documentation
(`docs-content/date-token-grammar.md`) is the **normative** statement of both
the grammar and this file's shape: the token table, the tokenisation and
escaping rules, the pairing and adjacency rules, the meridiem conversion, the
two deliberate exclusions, every top-level key here, every field each case kind
requires, and the coverage a runner asserts. It is the artifact a sibling
parser cites and the one that ships to the documentation site, so it is written
there once rather than restated here and left to drift.

What that page says, in one paragraph, for a reader who arrived at the data
first: every case carries an `id`, a `kind` and a `note`; `kind: "accept"`
means the format is well formed and the input matches it, `reject-format` means
the format is refused at definition time before any input is seen, and
`no-match` means the format is well formed and the input simply does not match.
**A case whose `kind` is unknown, or that is missing a field its kind requires,
must FAIL a runner rather than be skipped**: a corpus that silently skips what
it does not understand proves nothing.

## One obligation this file cannot state

Three of the grammar's rules (the two pairing rules and the adjacency rule)
hold at **match time** as well as at definition time: an input matched against
a format that breaks one of them reports no match rather than a value. This
file cannot carry that, because a `no-match` case here is a **well-formed**
format and a format breaking one of those three is not well formed, so it can
only appear here as a `reject-format` case. Passing every case in this corpus
therefore does not prove a parser enforces those three at match time. The
grammar page states that obligation, under `## Matching an input`, and it
matters because a route that skips definition-time validation (this package's
per-parse `dateFormats` option is one) would otherwise answer `2:30` under
`h:mm` with hour 2 for a feed that meant 14:30.

## What is deliberately absent

- **No two-digit-year token.** No century window is applied, so a two-digit
  year cannot be resolved to a calendar year without guessing, and a wrong
  guess ages a person by a hundred years silently. `YY` appears only as a
  `reject-format` case.
- **No timezone token.** A value with no offset is flagged as having none,
  never resolved to UTC. Every `accept` case here is offset-free.

Both exclusions are stated with their reasons in the grammar page.
