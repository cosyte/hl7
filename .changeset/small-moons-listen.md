---
"@cosyte/hl7": patch
---

Docs: the published bundle now documents every warning and fatal code, and a repository command proves the bundle's shape on every change.

`docs-content/troubleshooting.md` told a reader that the 20 warning codes were a public, versioned contract and pointed at Core Concepts "for what each one means". No page carried that reference, and seven of the 20 keys of `WARNING_CODES` appeared nowhere in the bundle at all: `MLLP_FRAMING_STRIPPED`, `FIELD_WHITESPACE_TRIMMED`, `EXTRA_FIELDS`, `DUPLICATE_REQUIRED_SEGMENT`, `MISSING_REQUIRED_FIELD`, `OUT_OF_ORDER_SEGMENT` and `ACK_NO_CORRELATION_ID`. So the site promised a reference for a versioned contract and did not carry it. A new page, "Warning and fatal codes", now lists all 20 `WARNING_CODES` keys and all 4 `FATAL_CODES` keys with a description of each, and the troubleshooting sentence points there.

Page metadata is uniform. Every one of the 23 pages carries `id`, `title`, `sidebar_label` and a `description` of at most 160 characters, so the site has a per-page summary to render and to hand to a search index. `benchmarks.md` carried no frontmatter at all and now does; six pages gained a `sidebar_label`; five carried a `sidebar_position` that this site never consults, because the bundle ships an explicit `sidebars.json`, and those are gone. Internal links were written two ways, `./page.md` on 15 and `./page` on 7; all 22 are now the `.md` form.

`pnpm check:docs` is the new gate, wired into a pull-request workflow. It refuses a missing or unparseable frontmatter block, an `id` that disagrees with its filename, an over-long or empty `description`, a stray `sidebar_position`, a sidebar id with no page, a page no sidebar reaches, an internal link that is extensionless or dangling, a code in the source registries and not on the reference page, a code on the page that no registry defines, and a code listed without prose beside it. It also refuses to report a clean result it did not measure: an empty `docs-content/`, an absent `sidebars.json` and a file it enumerated but could not read are all failures rather than passes.

It carries a sample-data floor that nothing else in this repo covers. `pnpm phi-scan` deliberately does not read markdown, and `docs-content/` is published to the documentation site and shipped in the release tarball, so a sample value on one of these pages had no gate in front of it. Any line shaped like an HL7 segment is now refused if it carries a nine-digit dashed identifier, a telephone number whose exchange digits are not `555`, or an email address outside `example.com` and `example.org`.

No parser behaviour changes here. The code registries are read, never modified; `pnpm pack:docs` keeps its existing contract and still refuses without `intro.md` and `sidebars.json`.
