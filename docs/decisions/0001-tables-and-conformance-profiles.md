# Decision 0001: HL7 tables and conformance-profile XML

- **Status:** Proposed. Waiting for the operator's choice; nothing is built until it is recorded
  below.
- **Date:** 2026-11-12
- **Scope:** `@cosyte/hl7` only. Any build this note leads to is its own change, with its own tests,
  measurements and changeset.

This note puts two questions to the operator, with the options, what each costs, and the one we
recommend:

1. Which HL7 tables, if any, the package should ship, from what source and under what licence.
2. Whether the package should read HL7 v2 conformance-profile XML, and resolve the profile a
   message names in MSH-21.

## What ships today

The picture is less empty than "no tables ship". Read from the source at commit `4d89126`:

| Table | What ships | Where |
| --- | --- | --- |
| 0008 Acknowledgment code | the six codes as `ACK_CODES`, with `isPositiveAck` and its kin | `src/builder/ack-tables.ts` |
| 0155 Accept/application acknowledgment conditions | the four codes as `ACK_CONDITIONS` | `src/builder/ack-tables.ts` |
| 0357 Message error condition codes | fifteen codes with display text as `ERR_CONDITION_CODES`, used by `buildAck` to write ERR-3 | `src/builder/ack-tables.ts` |
| 0516 Error severity | three codes as `ERR_SEVERITIES` | `src/builder/ack-tables.ts` |
| 0211 Alternate character sets | a registry the parser resolves MSH-18 against, built on the first message that declares a set | `src/parser/charset.ts` |
| 0076 Message type, 0003 Event type | no table; the message structure registry keys on the code and event pairs of the vendored HL7 v2+ publication | `src/parser/generated/message-structures.ts` |
| 0103 Processing ID | no table; `buildMessage` and `buildAck` default MSH-11 to `P`, and nothing checks it | `src/builder/` |
| 0104 Version ID | no table; MSH-12 is compared only against a version the caller expects (`VERSION_MISMATCH`) | `src/parser/` |

The reader surfaces MSA-1 and ERR-3 verbatim and looks nothing up (`src/helpers/acknowledgment.ts`).
The QAK segment is recognized by name and not modeled.

The conformance engine, `validateAgainstProfile`, runs only a profile the caller writes as a
`ConformanceProfile` object. A field rule's `valueSet` is a literal array of codes the caller
supplies. Its documentation states the boundary plainly: the package ships no profile, no code set
and makes no network call (`docs-content/spec-notes-conformance.md`). MSH-21 is read: the `meta`
helper returns its repetitions as `messageProfileIdentifiers`. Nothing resolves one to a profile.

Two published files already cover part of 0076 and 0003. The vendored `messages.json` from HL7's
v2+ publication (`vendor/hl7-v2ig/`) names 694 code and event pairs, built from 128 distinct
message codes and 356 distinct event codes (counted with `grep` over the file at `4d89126`). These
are the codes the publication's messages use, not the tables: a table can carry a code no message
uses, and the file carries no table's display text.

## Question 1: which tables to ship

The proposal under review names eight: 0003, 0076, 0008, 0103, 0104, 0155, 0211 and 0357. They are
the structural ones, the tables the parser and the builders already reason about. Four of them
(0008, 0155, 0211, 0357) already ship in some form, so the question for those is whether to publish
them in one uniform shape with a stated source, not whether to add them.

### Options

**A. A `@cosyte/hl7/tables` subpath with the eight tables, each from a vendored, checked source.
(Recommended, if the licence question below clears.)** Each table is one frozen object: its number,
its name, its source and version, and its codes with display text. The data sits beside its source
under `vendor/`, the way `vendor/hl7-v2ig/` and `vendor/segment-names/` do today, with a test that
recomputes each table from the vendored file. The existing `ACK_CODES`, `ERR_CONDITION_CODES` and
charset registry stay where they are and are checked against the same files, so there is one source
of truth. A table binds into a profile as `valueSet: tables.t0103.codes` with no change to the
engine. No new parse warning: a code outside a table stays the caller's call to make, through a
profile, because vendor feeds carry local codes in several of these fields.

- Bundle: nothing added to the main entry, `dist/index.mjs`, by construction: the main entry does
  not import the subpath. The subpath's own size is the data plus a few lines.
- Cold import: the main entry's 15 ms gate is unchanged, since it imports the same file. The build
  must prove that with the gate's reading before and after, and a test that the main entry's import
  graph does not reach the subpath.
- Work: small for the tables already shipped; for 0003, 0076, 0103 and 0104 it rests on the source
  question.

**B. The eight tables in the main entry, built on first use.** The same data, exported from
`@cosyte/hl7`, each table parsed from JSON text the first time it is read, the way the built-in
profiles and the character set table are today.

- Bundle: every consumer downloads and loads the data whether or not it uses a table. Six of the
  eight tables are short lists. 0003 and 0076 are not: the event codes alone run to hundreds, going
  by the 356 in the vendored publication.
- Cold import: lazy building keeps the parse off the import path, but the module text is still read
  and compiled. The cold import is already the number this package watches most closely, held at 15
  ms on the CI runner. Any growth there has to be measured on the runner before it ships.
- Work: the same as A, with less separation.

**C. Ship no new tables; document the pattern instead.** Keep the four that ship. Add a how-to page
showing a caller how to bind their own copy of a table into a profile's `valueSet`, and how to read
MSA-1 and ERR-3 against `ACK_CODES` and `ERR_CONDITION_CODES`.

- Bundle and cold import: no change.
- Work: one documentation page.
- Cost: every caller who wants 0103 or 0104 checked writes the list out by hand, and their copies
  drift apart.

**D. Ship every HL7-defined table.** Not recommended. The data is large, the version differences
are many, and it moves the package toward the code corpus its conformance engine was designed not
to need.

### Sources

Four candidate sources. We could not read any of their terms for this note (no web access), so each
is listed with what we know from this repository and what is still open.

| Source | What we know | Still open |
| --- | --- | --- |
| HL7 Terminology (`terminology.hl7.org`), the `CodeSystem-v2-NNNN` pages | `src/builder/ack-tables.ts` already cites the 0008 and 0357 pages as its provenance | the licence on that content and whether an MIT package may redistribute it; whether every one of the eight tables has a page; which v2 version each page reflects |
| HL7's v2+ publication on GitHub (`HL7/v2ig`), already vendored for message structures | it carries the message list we use for 0003 and 0076 codes | whether it carries the tables themselves; the licence on the repository's content |
| hl7apy's per-version tables (`crs4/hl7apy`) | the code is MIT, per its README, and we already vendor its segment lists | whether its table content is derived from HL7 material with terms of its own, which the MIT licence on the code would not settle |
| The HL7 v2 standard's own text | the authority for every table | HL7's licence terms for the standard and its tables, and whether reproducing a table in a package is allowed to a non-member |

The facts this note does not confirm, and on which the recommendation rests:

- the licence or intellectual property terms under which HL7 publishes its v2 tables, on any of the
  four sources;
- whether the tables of `terminology.hl7.org` may be redistributed inside an MIT-licensed npm
  package;
- whether `HL7/v2ig` carries table definitions;
- the exact code lists of each table in each version, including how 0104 grows by version and which
  0357 codes are version-specific beyond the note in `ack-tables.ts`;
- whether 0003 and 0076 are HL7-defined or user-defined tables in each version, which decides
  whether shipping them as closed lists is right at all.

**Recommendation on the source:** before any build, a person reads HL7's terms for its v2 tables on
`terminology.hl7.org` and in `HL7/v2ig`. If redistribution is allowed with attribution, take the
`terminology.hl7.org` code systems, vendored byte for byte with their URLs and checksums. If it is
not, or it is unclear, take option C and ship nothing new, since the four tables already shipped
predate this question and their provenance is only a citation.

## Question 2: conformance-profile XML and MSH-21

HAPI describes tools for conformance profiles, and hl7apy lists message profiles and validation
following the HL7 XSD specifications, each in its own documentation
(`docs-content/compare-hl7-libraries.md` cites both). Our engine reads only the `ConformanceProfile`
object a caller writes.

### Options

**A. Resolve MSH-21 against a caller-supplied registry, and read no XML. (Recommended.)** A small
function takes a parsed message and a map from profile identifier to `ConformanceProfile`, and
returns the profile MSH-21 names, or a typed result saying none matched, never a silent pass. The
caller still writes every profile. No network call; the identifier is matched as the EI the message
carries, entity identifier and namespace both.

- Bundle and cold import: a few hundred bytes of code in the main entry, beside
  `validateAgainstProfile`. Too small to move the gate, and the build measures it anyway.
- Work: small.
- What it does not do: read a profile someone else published.

**B. A reader for HL7 v2 conformance-profile XML, on its own subpath.** A function turns a
message-profile XML document into a `ConformanceProfile`, with a report of every construct it could
not carry over (a rule the engine lacks, a table binding without codes), and it never drops one
silently. It sits on a `@cosyte/hl7/profile-xml` subpath, so the main entry does not pay for it.

- Bundle: the main entry is unchanged. The subpath needs a hardened XML tokenizer that reads
  attributes, which profile XML leans on. The package's own v2 XML reader, `src/xml/read.ts` (31,820
  bytes of source at `4d89126`), is shaped for the v2 XML encoding; it would have to be generalized
  or a second reader written, with the same hardening: no DTD, no entities beyond the five XML
  predefines, caps on size, depth and element count.
- Cold import: the main entry unchanged; the subpath's own import measured by the build.
- Work: medium to large. We did not read the profile schema, so we cannot size it more closely:
  which schema versions exist, how tools that export profiles differ from each other, and where a
  profile declares its identifier are all open.
- Risk: a lenient read of a profile that misses a rule turns into an empty findings list, which a
  caller can take for a pass. The report of what was not carried over is what keeps that honest.

**C. Neither.** Keep MSH-21 surfaced by `meta` and leave matching and profiles to the caller.

- Bundle and cold import: no change.
- Cost: every caller writes the same few lines to pick a profile from MSH-21.

**Recommendation:** A now, B only when a caller asks for it with a profile they need read, and after
someone reads the schema. A is useful on its own, and B would build on it.

## Against the performance budgets

Two budgets bear on this:

- **Cold import.** `pnpm check:cold-import` holds the median cold import of `dist/index.mjs` to 15
  ms on the GitHub runner, and the package already keeps its larger tables off the import path
  (`docs-content/performance.md`, "The cold import budget"). Every recommended option either adds
  nothing to the main entry (a subpath) or adds a few hundred bytes of code. Option B of question 1
  is the only one that adds data to the main entry, and it is not recommended.
- **Absolute performance budgets.** The shared budgets file that `docs-content/performance.md` says
  the parse benchmarks will feed is not written yet. None of these options touches a parse path, so
  none moves a parse benchmark. When the budgets file lands, a tables or profile-XML subpath gets
  its own import entry there.

No number in this note is a reading of a build that includes any of these options. Each build
measures its own cost on the CI runner, before and after, and states it in its pull request.

## Recommendation, in one place

1. Tables: option A, a `@cosyte/hl7/tables` subpath with the eight tables from `terminology.hl7.org`,
   only once HL7's redistribution terms have been read and allow it. Until then, option C.
2. Profiles: option A, MSH-21 resolution against a caller-supplied registry. Profile XML waits for a
   caller who needs it.

## Choices recorded on the sources we already ship

On 2026-11-12, after research into the sources of HL7 material the package already held, the
operator chose on two questions. Their choices, verbatim:

1. The ORU_R01 group table the v2 XML writer shipped, taken from an HL7 v2.5 XML schema:
   "Remove ORU_R01 until settled". The table is removed: the
   package ships no message-structure group table, and `toHl7Xml` takes every structure's groups
   from the caller in `groups`, refusing with `GROUPS_UNKNOWN` without them.
2. The exact copy of files from HL7's v2 guide (`HL7/v2ig`) and the structure registry built from
   it: "Record it honestly now (Recommended)". Both stay. The
   READMEs beside them (`vendor/hl7-v2ig/README.md`, `vendor/segment-names/README.md`) and
   `THIRD-PARTY-NOTICES.md` record the repository, the commit, the date taken, that the guide's
   definition file declares `CC0-1.0`, that the repository has no licence file and describes itself
   as a draft that is not production ready, and that the structures describe the v2+ draft meant to
   represent v2.9.1. They draw no legal conclusion.

These choices do not answer questions 1 and 2 above.

## Decision

Not yet recorded for questions 1 and 2. When the operator chooses, this section records the choice
in their words, with the date, and the status above changes to Accepted or Rejected. Each option
chosen becomes its own piece of work.
