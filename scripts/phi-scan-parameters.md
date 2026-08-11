# `hl7` phi-scan parameter derivation

**Status: this repo's adoption of `@cosyte/script-utils/phi-scan` is BLOCKED and this branch must
not be merged.** What is here is the DERIVATION: every value `scripts/phi-scan.ts` needs in order to
be declarative parameters rather than machinery, written down as data, plus what the shared engine
must parameterize to accept them.

Nothing in this file is a claim that the list is complete. Each entry says how it was derived, so the
next reader re-measures rather than trusting the sentence.

## Why it is blocked, measured rather than inferred

`@cosyte/script-utils@0.0.2`'s `AllowList` models four tags (`NAME`, `DOB`, `ID`, `EMAILDOMAIN`) and
drops every other line, while its own docblock names ADDRESS among the five categories a caller's
detectors own. `scripts/phi-allow-list.txt` here declares five `ADDR` values.

Measured on this branch, `pnpm phi-scan` over the committed corpus with the tag unavailable:

```
[phi-scan] 17 hit(s) across 14 file(s)          exit 1
```

Every one is a `PID-11` or `NK1-4` street address that IS declared synthetic in this repo's
allow-list, in nine fixtures and five test modules. There is no configuration-only remedy:
`allowListPath` moves the file, it does not widen the parse. A repo-local re-parse was written,
measured green, and then DELETED rather than shipped, because a repo-local re-parse is the
hand-maintained machinery adopting the engine exists to eliminate.

---

# Part 1 — the parameters, as data

Each block gives the value, how it was derived, and a judgement: **UNIVERSAL** (every `@cosyte/*`
parser has an analogue and the engine should own the mechanism) or **hl7-only** (the value is this
standard's vocabulary and only the value should cross the boundary).

## 1. Exit codes — AXIS 1. Already parameterized. UNIVERSAL mechanism, per-repo value.

```ts
{ clean: 0, hits: 1, refuse: 2 }
```

Derived from the superseded scanner's own header contract. `1` is reserved for HITS and CI branches
on it. **Never ported in or out**: a walk root that is a regular file exits 2 here and 1 in at least
one sibling. The engine is right to have no default.

## 2. Scan roots — AXIS 2, root half. Already parameterized. UNIVERSAL mechanism, per-repo value.

```ts
["test/fixtures", "test", "src"]
```

None is `./`-prefixed (re-derived on this branch, not carried from the survey). `test` nests
`test/fixtures` and BOTH are declared: collapsing them would let one `test/*.test.ts` vouch for an
absent fixture corpus. The engine dedupes the nested walk, so a fixture is one target.

Grounding for `test` being a root at all, measured on `d8d3be3`: with roots at `test/fixtures` and
`src` only, **115 tracked files directly under `test/`** were enumerated by neither route, **55 of
them carrying an inline `PID|` literal**, and a PHI-bearing `test/<name>.ts` scanned `OK: no hits` at
exit 0 on both routes over bytes that give six segment-aware hits at a `.hl7` path.

## 3. Excluded paths — AXIS 2, subtractive half. Already parameterized. Value: EMPTY.

```ts
new Set<string>()   // i.e. leave the parameter unset
```

Deliberate, and it is a decision rather than an omission. The parser template excludes its own
scanner unit test by literal path because that test must carry violator-shaped values. This repo does
not need to: `test/scripts/phi-scan.test.ts` builds every violator-shaped value FROM PARTS, so no
literal violator-shaped string lives in that source. **Keep that discipline rather than adding an
exclusion** — an excluded path is a file the scan has no verdict about.

## 4. Walk read filter — AXIS 2, read half. Already parameterized. Value: THE DEFAULT.

The superseded walk skipped `.md` by hand, which is exactly `exemptsMarkdown`. Leave it unset so the
boundary moves for every repo at once through a version bump.

## 5. `--staged` read filter — AXIS 3. Parameterized as a PREDICATE; should become DATA.

Current value, as a predicate:

```ts
(rel) =>
  rel === "test/fixtures" || rel === "test" || rel === "src" ||
  rel.startsWith("test/fixtures/") ||
  (rel.startsWith("test/") && exemptsMarkdown(rel)) ||
  (rel.startsWith("src/") && rel.endsWith(".ts"))
```

The same thing as data, which is the shape the engine should accept:

```ts
stagedScope: {
  // A scan root's OWN path is in scope as well as its contents: an index entry at exactly a root
  // is never a directory, so it is a root REPLACED by a blob, a link or a gitlink. Measured: exit 0
  // over a staged mode-120000 `test/fixtures`, and again over `src`.
  scanRootsThemselves: true,
  subtrees: [
    { prefix: "test/fixtures/", readFilter: "all" },   // markdown included, deliberately
    { prefix: "test/",          readFilter: "default" }, // the shared markdown exemption
    { prefix: "src/",           readFilter: { suffixes: [".ts"] } },
  ],
}
```

**Containment re-derived on this branch: every clause is a scan root's own name or a path under one,
so this filter admits NOTHING outside `scanRoots`.** The engine enforces that rather than assuming
it, and refuses a staged path this admits and no root covers rather than narrowing silently to the
intersection. The state that makes it matter is measured: a staged mode-120000 entry outside every
scan root was enumerated, read, had the LINK'S TARGET PATH handed to the detector as content, and
reported `OK: no hits` at exit 0.

The `.ts` suffix rule is deliberately NOT applied to `src`'s own name, for the same reason the
markdown exemption is not applied to a link: a name is no evidence about what is on the other side.

## 6. Regular blob modes — AXIS 4. Already parameterized. Value: THE DEFAULT (`100644`, `100755`).

## 7. EOL normalization — AXIS 5. No parameter, and it was CHECKED rather than skipped.

This repo ships no `.gitattributes` and CI is Linux, so index and working tree are byte-identical on
a clean checkout and the union adds zero reads. The engine's dedupe is BY CONTENT, so where the two
copies differ both are scanned.

## 8. The allow-list vocabulary — tags. **UNIVERSAL; `ADDR` is the blocking gap.**

| tag | consumed by | in engine 0.0.2 | normalization |
|---|---|---|---|
| `NAME` | the name detectors | yes | uppercased |
| `DOB` | the DOB detector | yes | verbatim, matched against the normalized form |
| `ID` | the CX / SSN detectors **and the engine's own SSN floor** | yes | uppercased |
| `EMAILDOMAIN` | the engine's email floor | yes | lowercased |
| **`ADDR`** | **the address detector** | **NO — dropped** | **lowercased** |

The five `ADDR` values this repo declares:

```
123 Main St
456 Elm St
789 Oak St
456 Oak St
55 Oak Rd
```

**Address is not an hl7 peculiarity.** Every standard in this ecosystem that carries a patient
demographic block carries a street address, so the tag is UNIVERSAL and belongs in the engine's
`AllowList` beside the other four.

⚠ **A behaviour change adoption already brings, recorded so nobody carries the old sentence
forward:** the engine's dashed-SSN floor CONSULTS `ID` (in both the dashed and the digits-only
spelling); the superseded local floor consulted nothing. So "a dashed SSN has NO allow-list tag" is
now FALSE. It remains true of a non-555 phone, which is handed no allow-list at all.

## 9. The HL7 field vocabulary. **hl7-only values; the KINDS are universal.**

The five detector kinds are names, DOB, MRN / member id, address and phone. What differs per standard
is only WHICH locations in the wire format carry them. For HL7 v2 that is a segment id plus 1-indexed
field positions:

```ts
// Person names. XPN carries family in component 1 (`Doe^John`); XCN carries an id in component 1
// and family/given in components 2/3 (`ATTEND^Smith^Jane`). Reading the wrong components lets every
// provider name through, so the component offset is part of the vocabulary, not of the mechanism.
namesXPN: { PID: [5, 6, 9], NK1: [2, 30], GT1: [3], IN1: [16], MRG: [7], STF: [3] },   // familyOffset 0
namesXCN: {
  PV1: [7, 8, 9, 17, 52], PD1: [4], ORC: [10, 11, 12, 19],
  OBR: [10, 16, 28, 32, 33, 34, 35], OBX: [16, 25], DG1: [16],
  PR1: [11], AIP: [3], TXA: [9, 10, 11], ROL: [4],
},                                                                                     // familyOffset 1
dob:     { PID: [7], NK1: [16] },
address: { PID: [11], NK1: [4], GT1: [5], IN1: [19] },
phone:   { PID: [13, 14], NK1: [5, 6, 7], GT1: [6, 7] },
idCX:    { PID: [3, 18] },   // identifier list / account number; component 5 is the CX type code
idST:    { PID: [19] },      // SSN number, HL7 type ST: a bare number, not a CX list
```

Two derived sets, both computed FROM the maps above rather than re-listed, so they cannot drift:

- `PHI_FIELD_SEGMENTS` = the union of the map keys. It anchors the embedded-literal recogniser, so a
  segment with no field map never starts a run.
- The unknown-segment backstop applies to any segment id NOT in `KNOWN_SEGMENTS` (mirroring `src/parser/known-segments.ts`, the
  parser's own source of truth — **derive the list from there; no count is written here on purpose**).

## 10. Detector-kind parameters. **UNIVERSAL mechanisms, small per-standard values.**

| kind | mechanism (engine) | hl7's values |
|---|---|---|
| name tokenizer | split on non-letters, drop 1-char Latin tokens, KEEP 1-char CJK (Chinese/Korean surnames are one character) | escape sequences to erase first: HL7's `\F\`-style `escape[^escape]*escape` |
| name noise | drop honorific / degree / suffix tokens before comparing | `MD DO DR MR MRS MS JR SR II III IV RN NP PA PHD DDS DMD ESQ PROF FNP APRN` — **not HL7-specific; this list is universal** |
| DOB | normalize to a comparable form, then compare against `DOB` | HL7 DTM: `YYYYMMDD` (month 1-12, day 1-31), `YYYYMM`, bare `YYYY` |
| address | a street line is a house number plus at least one word, compared lower-cased against `ADDR` | `/^\d+\s+\p{L}/u` — universal as written |
| phone | >= 10 digits is dialable; a marker substring means synthetic | marker `555` (the `555-01xx` fiction convention) — universal |
| id | SSN-typed -> 9 digits; otherwise a bare 6-9 digit id is a real-looking MRN / account number | CX type codes `SS` / `SSN` in component 5; synthetic fixtures use prefixed shapes (`MRN…`, `ACCT…`, `FAKE…`) |
| unknown-segment backstop | flag an ADJACENT PAIR of single-token name-shaped components inside one field | runs ONLY on unknown segments: known code-bearing segments carry `CODE^Description^System` triples this would misread as names |

## 11. Format grammar. **hl7-only.**

```ts
delimiters: {
  defaults: { field: "|", component: "^", repetition: "~", escape: "\\" },
  // MSH-1 is the character immediately after the 3-char id; MSH-2 runs from index 4 to the next
  // field separator and supplies component / repetition / escape. A header-less message uses the
  // defaults, which is why the repo's `malformed/no-msh-segment` fixture still gets a full scan.
  headerSegments: ["MSH", "FHS", "BHS"],
},
framing: {
  // BOM (U+FEFF), then MLLP: U+000B (VT) start block, trailing U+001C U+000D (FS CR) end block.
  stripLeading: [/^\uFEFF/, /^\u000b+/], stripTrailing: [/\u001c\r?\n?$/],
},
segmentLine: /^([A-Za-z][A-Za-z0-9]{2})([^A-Za-z0-9\s])/,   // 3-char id then a non-alphanumeric
caseInsensitiveSegmentIds: true,   // the parser accepts a lowercase `pid`, so the scanner must too
skipHeaderSegments: true,          // MSH/FHS/BHS carry routing metadata; the field offset differs
```

## 12. Tier assignment: which targets get the whole-document parse. **UNIVERSAL shape, hl7 values.**

```ts
documentPaths: { exactly: ["test/fixtures"], prefixes: ["test/fixtures/"], suffixes: [".hl7"] },
// AND at least one recognizable segment line must be present.
```

The fixture gate is load-bearing in BOTH directions: it lets a header-less message still get the full
structured parse, and it keeps hand-written `src/` and `test/` code OFF the whole-file parse even when
a file embeds an `MSH|…` string in a comment. `test/fixtures` (the root's own path) is included
because an index entry at exactly that path is the fixture root REPLACED by a blob. Measured twice on
`d8d3be3`: the same payload gave six segment-aware hits staged at `test/fixtures/<name>.hl7` and exit
0 staged at `test/fixtures`. `test` and `src` are deliberately NOT included: neither is an HL7 corpus.

🛑 **A CONSTRAINT THE CURRENT `DetectContext` FORCES ON ANY CALLER, AND IT IS A GAP.** `DetectContext`
hands a detector the reported LOCUS and never the undecorated path, so a union-route target arrives as
`test/fixtures/x.hl7 (as git carries it)` — which matches neither the `.hl7` suffix nor the fixture
prefix. Left unhandled, **every `.hl7` fixture read out of the object store silently drops from the
whole-document parse to the shape floor.** The workaround on this branch is to strip a trailing
parenthesised group, which is string-munging a caller must not have to do. See gap G4.

## 13. Embedded-literal extraction. **UNIVERSAL shape, hl7 values.**

An inline fixture is a TypeScript string literal, so the whole-document parse never sees it. This pass
pulls format runs out of hand-written source and gives them the same field map.

```ts
embedded: {
  eraseInterpolations: /\$\{[^{}]*\}/g,   // FIRST, and it collapses to nothing so field positions hold
  escapeSequencesAsSeparators: /\\r\\n|\\r|\\n/g,
  runStartsAt: /(?<![A-Za-z0-9_])(<PHI_FIELD_SEGMENTS>)\|/g,   // lookbehind keeps `RAPID|` out
  runEndsAt: /["'`]/,                      // the first source quote: after it is program text
  delimiters: "defaults only",             // an embedded run has no reachable MSH-2
  unknownSegmentBackstop: false,           // a noise cannon over TypeScript
}
```

Three residuals, each measured, none of which the parameterization removes:

- **Any value reached through an interpolation is erased, including one whose literal sits in the same
  file.** Measured: `const fam = "<surname>"` then `` `PID|1||<mrn>^^^HOSP^MR||${fam}^${giv}||<dob>|F` ``
  exits 1 on the MRN and the DOB and is SILENT ON THE NAME. This pass reads LITERALS IN FIELD POSITION
  and evaluates nothing.
- **The run is cut at the first source quote, and that cuts HL7 data too.** `""` is HL7 v2's
  explicit-null field value (grounded in this repo's own `src/model/field.ts`, whose `isNull` is true
  iff the field was exactly those two characters). Measured, same bytes both ways:
  `PID|1|""|MRN001||<surname>^<given>||<dob>|F` exits 1 with `PID-5` and `PID-7` at a `.hl7` path and
  exits 0 as an inline literal, because the extracted run is `PID|1|`. `O'Brien` truncates identically.
  This is a MISS, not a false positive, and teaching the cut about quoting is not the repair: the
  enclosing quote style is not knowable from one line, and a wrong guess reads program text as patient
  data.
- **Custom delimiters written inline are covered at the floor only.** The committed corpus keeps its
  custom-delimiter cases as real `.hl7` fixtures, which get the full scan.

---

# Part 2 — what the engine must parameterize

Ordered by whether it blocks this repo's adoption.

## G1 — `ADDR`, the address declaration. **BLOCKING.**

- **Where:** `AllowList`, `loadAllowList`, `DetectContext.allow`.
- **Add:** `addresses: Set<string>`, parsed from the `ADDR` tag, **lower-cased** (the detector
  compares a lower-cased street line).
- **Default:** an empty set when the tag is absent, exactly like the other four.
- **Why a caller-side default cannot cover it:** the file is the engine's to parse; a caller can only
  re-read it, which is the machinery this item deletes. Measured cost of not having it: 17 hits, exit
  1, over a corpus every one of whose addresses is declared synthetic.
- **UNIVERSAL.** Every standard here with a demographic block has street addresses.

## G2 — `Target.tolerateVanish`, the enumerate-then-read window. **NOT blocking; hl7 is the only repo known to have carried it.**

- **What it covers, exactly, and no wider:** `ENOENT` on a walk target that git does **not** track,
  raised between the walk's enumeration and its read. Reported as UNOBSERVED (named on stderr, the
  clean line qualified) rather than refusing.
- **Proposed parameter:**

  ```ts
  /**
   * @default "refuse"
   */
  vanishedUntrackedWalkTarget?: "refuse" | "report-unobserved";
  ```

- **Default: `"refuse"`.** Tolerance must be explicit and opt-in. Three reasons, all measured in the
  superseded scanner rather than argued: a TRACKED file must never be tolerated (the committed corpus
  is what the gate promises to have observed); only `ENOENT` may be (an `EACCES` or `EISDIR` is a scan
  that failed, not a file that went away); and the carve-out carried its own residual — its re-check
  was keyed on the PATH the walk enumerated, not on content, so a rename or a hard-link-then-unlink
  left bytes unscanned under a clean report.
- **What the engine must also do if it honours the tolerance,** because these were the halves that
  made it safe: (a) re-check after the sweep and REFUSE if the file is back on disk, since the sweep
  then skipped something that exists; (b) qualify the clean line and name the paths on stderr, so no
  log reader sees an unqualified OK; (c) run that re-check BEFORE the union route, not after, so a
  union refusal cannot leave the skip undisclosed.
- **Why a caller-side default cannot cover it:** it is bookkeeping over the engine's own enumeration.
  A caller sees neither the walk's target list nor the read failure.
- **hl7's position:** hl7 does **not** need the tolerance to go green. Its exposure is bounded and
  measured — the walk roots are `test/fixtures`, `test` and `src`, and this repo's known racing
  transient (`tsup.config.bundled_<hash>.mjs`, written and removed by a build
  `test/docs-content.test.ts` starts) is written at the REPO ROOT, under no scan root. What is newly
  exposed is an editor / atomic-save transient beside a test or a source file. **So hl7 accepts
  `"refuse"`**, and the parameter is requested so the tolerance is available to a sibling whose roots
  do cover a build output directory, rather than being re-invented locally there.

## G3 — the per-root observation rule. **NOT blocking; a real property lost on adoption.**

- **What it was:** `all` mode REFUSED unless EVERY declared scan root yielded at least one file the
  **walk** actually read, naming the starved roots. Deliberately NOT satisfiable by the index route.
- **Proposed parameter:**

  ```ts
  /**
   * @default "skip"
   */
  unobservedScanRoot?: "skip" | "refuse";
  ```

- **Default: `"skip"`**, which is what 0.0.2 does today, so the parameter changes no consumer that
  does not ask for it.
- **What it catches that nothing else does:** measured on this repo at `04e4bc6`, three ways, each
  printing `OK: no hits` at exit 0 — `test/fixtures` moved away, `test/fixtures` replaced by a
  DANGLING symlink, and `src` moved away. Neither state is an enumeration error: the walk returns
  early on a root `existsSync` cannot resolve, and `existsSync` FOLLOWS a link, so absent, dangling
  and empty are one thing to it.
- **What it does NOT catch, so the parameter is not oversold:** its granularity is the DECLARED ROOT
  and nothing finer. A directory missing from INSIDE a root still goes unobserved; a root that is
  itself a symlink with no walked parent is followed and the rule is satisfied by whatever is on the
  other side; and it is a FLOOR OF ONE, so one clean fixture satisfies a root holding many.
- **What already covers the PHI question, and it is a different question:** the union reads the bytes
  git carries at every in-scope tracked path, so a root absent on disk still has its TRACKED corpus
  read out of the object store and a violator among those bytes still exits 1. What is lost is the
  sweep refusing to give a verdict when a declared root yielded nothing on disk.
- **UNIVERSAL** in mechanism; whether to opt in is per-repo.

## G4 — the detector needs the undecorated path as well as the locus. **NOT blocking; silently degrading.**

- **What breaks:** `DetectContext.path` is the LOCUS, which the union route decorates as
  `<path> (as git carries it)`. A caller whose tier assignment keys on a path suffix or prefix (hl7's
  `.hl7` / `test/fixtures/`) therefore mis-tiers **every tracked document read out of the object
  store**, dropping it from the whole-document parse to the shape floor — silently, at exit 0.
- **Proposed:** add `relPath: string` to `DetectContext` (the undecorated, repo-relative,
  forward-slashed target path), keeping `path` as the locus that hits are raised against.

  ```ts
  interface DetectContext {
    /** The reported LOCUS. Raise hits against this and nothing else. */
    path: string;
    /** The target's own repo-relative path, undecorated. For SCOPE decisions, never for a hit. */
    relPath: string;
    ...
  }
  ```

- **Default:** none needed; it is additive.
- **Why a caller-side default cannot cover it:** the only caller-side recovery is to string-strip a
  trailing parenthesised group, which guesses at an engine-owned label and goes stale silently the
  day a second origin is added.
- **UNIVERSAL.** Any parser whose tier assignment keys on a path is exposed; the file-extension test
  is the common case.

## G5 — the detector kinds themselves, per the founder's re-scope. **UNIVERSAL.**

The five kinds in section 10 are the same five in every sibling. If the engine ships the KINDS, each
repo declares only:

- a **locator vocabulary** (section 9): for HL7 v2 a `segment -> field positions` map per kind, plus a
  component offset for the two name types; for a positional format it would be a different locator
  type. This is the one part that genuinely cannot be shared, and the engine should take it as an
  opaque, per-format locator the repo's grammar module resolves.
- a **grammar** (section 11) and a **tier assignment** (section 12).
- the small **shape constants** in section 10 (the `555` marker, the 6-9 digit MRN window, the street
  line regex, the noise-token list) — every one of which I judge UNIVERSAL as a default, with a
  per-repo override.

---

## Judgement, for the `config` worker

**Universal — the engine should own the mechanism and ship a default:** all five axes (already);
the `ADDR` tag; the five detector kinds and their shape constants; the noise-token list; the
name-tokenizer rules including the CJK single-character carve-out; the address street-line regex; the
phone digit floor and fake-exchange marker; the SSN and bare-MRN digit windows; the
document-versus-embedded tier split; `unobservedScanRoot`; `vanishedUntrackedWalkTarget`;
`DetectContext.relPath`.

**Genuinely hl7-only — data this repo must declare:** the segment-and-field locator maps; the
`KNOWN_SEGMENTS` list; the HL7 delimiter model (`MSH-1` / `MSH-2`, defaults, header segment ids);
MLLP / BOM framing; the segment-line regex and case-insensitive segment ids; the escape-sequence
erasure the name tokenizer runs first; the fixture-likeness paths; the embedded-run start and end
rules.

**And one thing that is neither, recorded so it is not designed away:** the three embedded-literal
residuals in section 13 are properties of reading source text rather than of any parameterization.
Moving that pass into the engine does not close them, and a docblock there must not say it does.
