# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

## [Unreleased]

The first pre-alpha release (`0.0.1`) will ship the complete v1 API surface below. An earlier
`0.1.0` tag was prepared but never published, so the package begins its public history at `0.0.x`,
per the cosyte version ladder (`0.0.x` until first alpha).

### Added

- **Parser** — `parseHL7(raw, optionsOrProfile?)` with a lenient default
  parser that handles vendor-quirky HL7 v2.1–v2.8 input, and a
  `{ strict: true }` mode that escalates every Tier-2 deviation to a thrown
  `Hl7ParseError`. Accepts `string` or `Buffer` input; honours MSH-18
  character set with a user `charset` override option.
- **Warning system** — 13 stable Tier-2 warning codes with positional
  context (`segmentIndex`, `fieldIndex`, `repetitionIndex`, `componentIndex`,
  `subcomponentIndex`): `MLLP_FRAMING_STRIPPED`, `FIELD_WHITESPACE_TRIMMED`,
  `UNKNOWN_ESCAPE_SEQUENCE`, `TIMESTAMP_FALLBACK_FORMAT`, `SEGMENT_CASE`,
  `EXTRA_FIELDS`, `UNKNOWN_SEGMENT`, `DUPLICATE_REQUIRED_SEGMENT`,
  `ENCODING_MISMATCH`, `MISSING_REQUIRED_FIELD`, `OUT_OF_ORDER_SEGMENT`,
  `VERSION_MISMATCH`, `UNKNOWN_CHARSET`. Exposed via `msg.warnings` and the
  `onWarning` callback.
- **Fatal errors** — 4 Tier-3 fatal codes always thrown as `Hl7ParseError`
  (even in lenient mode): `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`,
  `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Each error carries
  `message`, `position`, and `snippet`.
- **Structural model** — immutable `Hl7Message` with dot-path access
  (`msg.get("PID.5.1")`, `msg.get("OBX[2].5")`), typed `Segment` and
  `Field` wrappers, and `msg.segments("OBX")[0].field(3)` traversal.
  Safe-access semantics (`undefined` / `[]` for missing paths, never
  throws).
- **Composite types** — parsed instances and exported TypeScript
  interfaces for XPN, XAD, CX, CWE, CE, XTN, PL, TS/DTM, NM, HD, and XCN
  (11 types). Also available under the `HL7` namespace:
  `import { HL7 } from "@cosyte/hl7"; type T = HL7.XPN`.
- **Named helpers** — one-line extraction for the most common HL7
  fields: `msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`,
  `msg.orders()`, `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`,
  `msg.insurance()`. All helpers return `undefined` / empty arrays for
  missing optional data — they never throw.
- **Mutation** — `setField`, `addSegment`, `removeSegment` on
  `Hl7Message`. Direct field mutation on unwrapped objects has no effect
  (immutability by default).
- **Serialization** — `msg.toString()` emits spec-clean HL7 regardless
  of input quirks (Postel's Law); `msg.toJSON()` returns a structured
  JSON tree; `msg.prettyPrint()` returns a human-readable multi-line
  string for logs. Escape sequences are re-encoded on serialize.
- **Message builder** — `buildMessage({...}).addSegment(...).toString()`
  constructs valid outbound HL7 from scratch, with helpers for control
  IDs and HL7 timestamps.
- **Profile system** — `defineProfile()` API with `extends` composition
  (single parent or array), merge semantics (scalars overwrite, arrays
  concat+dedupe, `customSegments` deep-merge per key, `onWarning` chains),
  `profile.describe()` introspection, `profile.lineage`, and
  `ProfileDefinitionError` with actionable messages on invalid input.
- **Default profile management** — `setDefaultProfile(p)`,
  `getDefaultProfile()`, `setDefaultProfile(null)`. Explicit arguments
  override; `parseHL7(raw, { profile: null })` opts out for a single call.
- **Five built-in vendor profiles** — `profiles.epic`, `profiles.cerner`,
  `profiles.meditech`, `profiles.athena`, `profiles.genericLab`. Each
  authored through the public `defineProfile()` API with date-format
  fallbacks and named Z-segments.
- **Segment.get(name)** — resolve custom-segment fields by declared
  name (e.g., `msg.segments("ZDP")[0].get("departmentCode")`) when a
  matching profile is applied.
- **Three runnable examples** — `examples/extract-patient-info.ts`,
  `examples/read-lab-results.ts`, `examples/modify-and-resend.ts`, each
  runnable via `pnpm tsx examples/<file>.ts` and smoke-tested via
  `pnpm examples` in CI.
- **Profile starter kit** — `examples/profile-starter-kit/`, a
  publishable template with its own CI + publish workflows,
  `CUSTOMIZING.md` walkthrough, and placeholder tokens
  (`{{YOUR_ORG}}` / `{{PROFILE_NAME}}`) that turn into a ready-to-publish
  profile package in minutes.
- **Documentation** — comprehensive README (value prop, quickstart,
  feature list, HL7-in-90-seconds primer, three access patterns, full
  cookbook, Profiles section, Real-World Tolerance table, Error
  Handling, Roadmap), `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`
  (MIT).
- **Tooling** — strict TypeScript (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`), dual ESM + CJS build via tsup, Vitest
  with ≥ 90% per-directory branch coverage on `src/parser/`, `src/model/`,
  `src/helpers/`, `src/serialize/`, `src/builder/`. Lint, format, and
  TypeScript settings come from the shared `@cosyte/*` config packages
  (ESLint 9 + `typescript-eslint`). CI across Node 22 / 24.

### Changed

### Deprecated

### Removed

### Fixed

### Security

[Unreleased]: https://github.com/cosyte/hl7/commits/main
