/**
 * scripts/check-no-internal-refs.mjs
 *
 * Founder directive, 2026-07-27: NO INTERNAL PROJECT BOOKKEEPING ON A PUBLIC SURFACE.
 * Anything a consumer reads (a GitHub release body, README.md, docs-content/, the npm package
 * description, a site page) describes what the software does and what changed. It must never
 * carry our internal bookkeeping: item identifiers, phase and wave language, sweep and
 * programme names, ADR numbers, internal repo paths, or process commentary about how the
 * artifact came to exist. The founder's words: "The releases should also not speak on anything
 * regarding phases, etc. That has no relevance to the user consuming it. This goes for readmes
 * and documentation as well."
 *
 * THIS FILE IS A CALLER, NOT A SCANNER, and that is the whole point of it. The detection rules,
 * the self-test floor, the enumeration, the completeness refusals, the tarball drift tripwire
 * and the hit report all live in `@cosyte/script-utils/internal-refs`, published from
 * `cosyte/config` and pinned here to an exact version. This repository used to carry its own
 * 1044-line copy of that machinery, whose own disclosed residuals said the prefix list was
 * duplicated from the source list, that the two could drift, and that the cross-repo fix was
 * ONE shared implementation rather than one patch per copy. This is that fix taken: a new
 * programme prefix or a closed detector hole now costs one publish and a version bump, not one
 * review per repository. Nothing here re-implements a rule, and a second copy of one must never
 * appear below: a rule that is here as well as in the package is a rule that drifts.
 *
 * WHAT THIS FILE OWNS is the axis set, which is the part that is genuinely this repository's:
 * what our prefixes are, which standards designations must never be flagged, what our public
 * surface is, what our tarball already accounts for, and that the source doc-comment pass runs.
 * The reasoning for each is kept WITH it, below, because every one of these was paid for by a
 * public defect or by a refuter catching a collision against a live draft, and a reader who has
 * not hit them will tidy the guard away as over-complication.
 *
 * AFTER-INSTALL, DELIBERATELY, AND FAIL-CLOSED. Reaching a published package by specifier means
 * the gate cannot run before `pnpm install`. The alternative was a checked-in copy reached by
 * relative path, which is a hand-maintained variant of the very file this replaces. So the
 * property "the gate runs even if the install is broken" is traded for this one: an install
 * that failed, or a shared implementation that cannot be reached, EXITS NON-ZERO AND NEVER
 * PRINTS THE OK LINE. There is no fallback scanner behind this import and there must never be
 * one, because a fallback is a second copy of the rules wearing a different hat.
 *
 * Run it locally with `pnpm check:no-internal-refs`.
 */

/**
 * Known project and programme prefixes. THE KEYING IS ON THESE, NEVER ON THE `WORD-N` SHAPE.
 * That trap is sharpest in THIS repository of all of them: `HL7-N` and `MLLP-10` are ours, but
 * `MSH-2`, `PID-3`, `OBX-5`, `SCH-11`, `TQ1-7` and `NM1-03` are HL7 and X12 segment-field
 * references and are exactly the reference material a consumer of an HL7 parser needs. A shape
 * rule destroys the documentation it was added to protect. The cost is that a new programme
 * means adding its prefix to this list, and nothing catches it until someone does. That is the
 * cheaper of the two mistakes.
 *
 * `PKG` IS DELIBERATELY ABSENT, and it is present in the estate's source list. `PKG` is HL7
 * v2's Chapter 17 Item Packaging segment, so `PKG-1` and `PKG-4` are segment-field references a
 * consumer of an HL7 parser can legitimately need. Guarding it would take a second exclusion;
 * dropping it costs one prefix that has never been minted as an hl7 item. When the collision is
 * with clinical reference material, the reference material wins.
 */
const PROJECT_PREFIXES = [
  "PARSERS-PUBLIC",
  "DOCS-CONTENT",
  "KNOWLEDGEBASE",
  "TERMINOLOGY",
  "PATHWAYS",
  "TRANSFORM",
  "WEBSITE",
  "STAGING",
  "SUPPLY",
  "NCPDP",
  "ASSETS",
  "EMDASH",
  "README",
  "CONFIG",
  "DICOM",
  "SYNTH",
  "DEID",
  "CCDA",
  "ASTM",
  "MLLP",
  "FHIR",
  "CREW",
  "DOCS",
  "PERF",
  "SYNC",
  "VERSION",
  "PUBLIC",
  "HL7",
  "X12",
  "IAC",
  "CLI",
  "KB",
  "PW",
  "PUB",
  "CI",
  "REAL",
  "TERM",
  "WF",
  "VERIFY",
];

/**
 * STANDARDS DESIGNATIONS THAT COLLIDE WITH THE PREFIX LIST, excluded explicitly. Eight of the
 * prefixes above (`HL7`, `X12`, `DICOM`, `FHIR`, `NCPDP`, `CCDA`, `ASTM`, `MLLP`) are the names
 * of standards this ecosystem parses as well as the names of our projects, and a consumer of an
 * HL7 toolkit needs to read `HL7-V2`, `FHIR-R4`, `DICOM-SR`, `NCPDP-SCRIPT`, `X12-837P` and an
 * HL7 table number in the documentation. Those are reference material; `HL7-N` and `MLLP-10`
 * are ours. There is no shape that separates them, so the separation is an explicit, reviewable
 * exclusion list: it must be extended by hand, and that is the cheaper mistake. Every entry
 * here is asserted in the negative samples below.
 */
const STANDARDS_DESIGNATIONS = [
  "HL7-(?:V2|V3|CDA|FHIR|OMG|\\d{3,4}[A-Z]?)",
  "FHIR-R\\d[A-Z]?",
  "DICOM-(?:SR|RT|SEG|DIR|PS\\d)",
  "NCPDP-(?:SCRIPT|TELECOM|D\\.\\d)",
  "X12-\\d{3}[A-Z]?",
  "X12-\\d{6}",
  "CCDA-R\\d(?:\\.\\d)?",
  "ASTM-E\\d+",
];

/**
 * THE PUBLIC SURFACE, and each entry is here for a stated reason.
 *
 *   README.md      the repository's front page, and shipped inside the npm tarball
 *   TRADEMARKS.md  shipped inside the npm tarball
 *   LICENSE        shipped inside the npm tarball
 *   docs-content/  every tracked file, including sidebars.json: this is the content published
 *                  to docs.cosyte.com
 *
 * The npm-visible metadata (`description` and `keywords`) is public surface that is not a file
 * of its own; the engine extracts and scans it, and the rest of `package.json` is deliberately
 * not scanned because it is not public prose.
 */
const SURFACE_PATHS = ["README.md", "TRADEMARKS.md", "LICENSE", "docs-content"];

/**
 * WHAT THE TARBALL SHIPS THAT THE SURFACE LIST DOES NOT COVER, named rather than ignored, so
 * that a future addition to `files` trips the drift tripwire instead of passing silently.
 *
 *   CHANGELOG.md  ships inside the tarball, so it is genuinely public surface, and it carries
 *                 internal identifiers across its history. It is excluded anyway because the
 *                 convention names CHANGELOG.md as one of the places identifiers BELONG, and
 *                 because rewriting a released changelog destroys the traceability the same
 *                 convention preserves. That contradiction is ecosystem-wide and is not for one
 *                 repository to settle alone.
 *   dist          untracked build output no checked-in gate can read without building first,
 *                 and this one does not build. Its SOURCE is gated instead, by the doc-comment
 *                 pass below.
 */
const ACCOUNTED_TARBALL_FILES = ["CHANGELOG.md", "dist"];

/**
 * THE SOURCE DOC-COMMENT PASS, on, because `src/` JSDoc is public surface here: doc-comment
 * blocks compile into `dist/index.d.ts` and `dist/index.d.cts`, `dist` is the first entry in
 * `files`, and that is what every consumer's editor renders on hover. Line comments and plain
 * block comments are NOT extracted and identifiers are welcome in them: they do not reach
 * `dist`, and that is precisely the line the founder's rule draws. What a CONSUMER receives is
 * public; what only a MAINTAINER reads is not.
 *
 * THE CEILING, STATED RATHER THAN DISCOVERED: this gates the SOURCE of the published text, not
 * the published text. `dist/` is untracked build output, so a build that began transforming doc
 * text rather than copying it would decouple the two and nothing here would notice.
 */
const SOURCE_DOC_COMMENTS = { enabled: true, paths: ["src/*.ts", "src/**/*.ts"] };

/**
 * THIS REPOSITORY'S OWN MEASURED REFERENCE MATERIAL, added to the engine's self-test floor.
 * Every negative is real material from an HL7, X12, DICOM or FHIR context, or ordinary English
 * that collides with our jargon, and each one is here because a rule once destroyed it or came
 * close: the ICD-10-CM code range `P00-P96`, the `PKG` segment fields, the CSP Clinical Study
 * Phase field names, the DICOM imaging nouns, and TypeScript that reads like our word for a
 * unit of work. If a later release of the engine widens a rule into the `WORD-N` shape, the
 * floor reds here instead of deleting `MSH-2` from an HL7 parser's documentation on the next
 * sweep. Samples ADD to the engine's own; nothing here can remove one.
 */
const EXTRA_SAMPLES = {
  "internal-identifier": {
    positives: ["Item HL7-N is done, and CCDA-P7 with it"],
    negatives: [
      "MSH-2 encoding characters, PID-3 identifier list, OBX-5 value, SCH-11 timing, TQ1-7 start, NM1-03 name, PKG-1 and PKG-4 packaging, ICD-10-CM P00-P96, FHIR-bridge stability, docs-content/ layout, HL7-defined tables, HL7-0396 and HL7-0003 and HL7-396, HL7-V2 and HL7-CDA, FHIR-R4, DICOM-SR and DICOM-RT, NCPDP-SCRIPT and NCPDP-D.0, X12-837P and X12-005010, 835 remittance",
      "RXA-3 and RXE-25 and AL1-6 and DG1-5 and IN1-12 and TXA-4 and FT1-4",
    ],
  },
  "phase-or-wave": {
    positives: [
      "Phase 5b closes it (Phase W, Phase-L and the thirteenth slice landed earlier, in wave 2)",
    ],
    negatives: [
      "CSP-1 Study Phase Identifier, CSP-2 Study Phase Start Date/Time, CSP-3 Study Phase End Date/Time, CSP-4 Study Phase Evaluability; a Phase III oncology trial and a Phase II study; the acute phase reactant; the adapter stays in phase with the source system and is out of phase",
    ],
  },
  "adr-reference": {
    positives: ["Decided in ADR 0015 and restated in ADR-0021"],
    negatives: ["ADR is not a segment, and 0015 alone is a value"],
  },
  "internal-jargon": {
    positives: ["This slice adds the helper and the final slice removes it"],
    negatives: [
      "The slice thickness and the number of slices are DICOM attributes, each slice location is too, and the phase of the clinical study, the phase of illness and each phase of the trial are the reader words this rule must not touch",
      "subcomponents.slice() and path.slice(4, 8) are TypeScript",
    ],
  },
  "internal-repo-path": {
    positives: ["Roadmap operations/roadmaps/hl7.md and documentation/decisions/0015-x.md"],
    negatives: [
      "Parser operations are documented in the README, and documentation for the API is generated",
    ],
  },
  "traceability-marker": {
    positives: ["Repeating [S-NTE], and Open-question #12 resolves the direction"],
    negatives: [
      "A character range like [S-Z], a value set written [SNOMED], and open questions about the feed",
    ],
  },
};

/**
 * FAIL CLOSED ON AN UNREACHABLE IMPLEMENTATION. There is exactly one internal-reference
 * implementation reachable from this repository and nothing behind it, so an import that cannot
 * resolve is a run with no verdict, never a clean tree. It names what it could not reach,
 * writes nothing to stdout, and exits non-zero.
 */
let runInternalRefsScan;
try {
  ({ runInternalRefsScan } = await import("@cosyte/script-utils/internal-refs"));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    [
      "ERROR: check-no-internal-refs - could not reach the shared implementation",
      "       @cosyte/script-utils/internal-refs, so this run has no verdict on the tree.",
      `       ${reason}`,
      "       Install dependencies first (pnpm install --frozen-lockfile). There is no",
      "       fallback scanner behind this import, deliberately: a second copy of the rules",
      "       is the defect this gate was consolidated to remove.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

process.exit(
  runInternalRefsScan({
    projectPrefixes: PROJECT_PREFIXES,
    standardsDesignations: STANDARDS_DESIGNATIONS,
    surfacePaths: SURFACE_PATHS,
    accountedTarballFiles: ACCOUNTED_TARBALL_FILES,
    sourceDocComments: SOURCE_DOC_COMMENTS,
    extraSamples: EXTRA_SAMPLES,
  }),
);
