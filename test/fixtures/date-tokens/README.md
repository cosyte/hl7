# Date token grammar corpus

`corpus.json` is the shared conformance corpus for the date-format token
grammar. It is **data, not code**: no expression language, no assertions, no
syntax belonging to any one parser, and no dependency of any kind. A parser in
any language proves it implements the same grammar by reading this file,
running every case, and producing the stated expectation.

The grammar itself, with the token table, the tokenisation and escaping rules,
the pairing and adjacency rules, the meridiem conversion and the two deliberate
exclusions, is the `Date token grammar` page in this package's published
documentation (`docs-content/date-token-grammar.md`).

## Top-level shape

| key | meaning |
| --- | --- |
| `grammar` | Which grammar the file describes. Always `date-token-grammar`. |
| `revision` | Bumped when a case is added, removed or changed. |
| `description` | One sentence, for a reader who arrives at the file first. |
| `tokens` | The whole token vocabulary. A runner asserts its own published token list equals this, which is how a parser that quietly recognizes more or fewer tokens is caught. |
| `refusalRules` | Every reason a format is refused at definition time. |
| `precisionLevels` | Every stated precision level a value can carry. |
| `noMatchReasons` | Every reason an input fails to match a well-formed format. |
| `cases` | The cases themselves, one object each. |

## Cases

Every case has an `id` (unique, stable, referenceable from a bug report), a
`kind`, and a `note` saying what the case is for. **A case whose `kind` is
unknown, or that is missing a field its kind requires, must FAIL a runner
rather than be skipped**: a corpus that silently skips what it does not
understand proves nothing.

### `kind: "accept"`

The format is well formed AND the input matches it.

| field | meaning |
| --- | --- |
| `format` | The format string. |
| `tokens` | Every token the format uses, so per-token coverage is checkable without a tokenizer. Each entry must appear in the top-level `tokens`. |
| `input` | The value matched against `format`. |
| `expect` | The fields recovered. Keys are `year`, `month`, `day`, `hour`, `minute`, `second`, `fractionalSeconds`. A key that is absent must be absent from the result: the value does not claim a field the format did not populate. |
| `precision` | The stated precision, one of `precisionLevels`, or `null` for a format that populates no year and so carries no date precision. |

`month` is **spec-native 1 to 12**, never a 0-based index. `hour` is a
**24-hour** reading: a 12-hour token plus a meridiem is already converted, and
the meridiem never appears in `expect`. `fractionalSeconds` is the digit string
exactly as written, with no leading dot and no rounding.

### `kind: "reject-format"`

The format is not well formed and must be refused **at definition time**,
before any input is seen.

| field | meaning |
| --- | --- |
| `format` | The offending format string. |
| `rule` | Which refusal rule it breaks, one of `refusalRules`. |

A runner should assert both that the refusal happened and that it named the
offending format: an unactionable error is a defect of its own.

### `kind: "no-match"`

The format is well formed, and the input does not match it. The result is **no
match**, never a substituted or partial value, and never a raised error.

| field | meaning |
| --- | --- |
| `format` | A well-formed format string. |
| `input` | The value that does not match it. |
| `reason` | Why, one of `noMatchReasons`. |

## Coverage a runner should assert

Beyond running each case, a runner should assert the corpus still covers what
it claims to:

- every token in `tokens` appears in at least one `accept` case's `tokens`;
- every rule in `refusalRules` appears in at least one `reject-format` case;
- every level in `precisionLevels` appears in at least one `accept` case;
- every reason in `noMatchReasons` appears in at least one `no-match` case;
- every `id` is unique.

## What is deliberately absent

- **No two-digit-year token.** No century window is applied, so a two-digit
  year cannot be resolved to a calendar year without guessing, and a wrong
  guess ages a person by a hundred years silently. `YY` appears only as a
  `reject-format` case.
- **No timezone token.** A value with no offset is flagged as having none,
  never resolved to UTC. Every `accept` case here is offset-free.

Both exclusions are stated with their reasons in the grammar page.
