# Changelog

## 0.1.0

### Minor Changes

- 0ee807f: Schema emission for the serialized message projection: the library now authors the JSON Schema and Zod description of the object `toJSON()` returns, so a consumer validating a snapshot no longer transcribes a shape they do not own.

  `messageJsonSchema()` returns a JSON Schema document at the `2020-12` dialect describing `SerializedMessage`: encoding characters, segments, fields, repetitions, components, subcomponents, warnings and the optional profile. `messageZodSource()` returns Zod schemas as TypeScript SOURCE TEXT to write into your own project. `emitMessageSchema(target)` is the named-target route over both, with `SCHEMA_EMIT_TARGETS`, `SchemaEmitTarget`, `isSchemaEmitTarget`, `SchemaTargetError`, `JSON_SCHEMA_DIALECT`, `JsonSchemaDocument` and `JsonSchemaNode` alongside it. Both artifacts are also committed under `schema/` and re-checked on every test run.

  **Still zero runtime dependencies, and still none in development either.** The Zod artifact is TEXT: nothing in `src/` imports `zod` or references a `zod` value, and no JSON Schema validator was added to run any of this. The emitted `import { z } from "zod"` resolves against the consumer's own install, and which `zod` major that is stays theirs.

  **Nothing here validates anything.** Both functions build a description and return it. No message is read, no schema is evaluated against a value, and no finding, diagnostic or warning is produced. Conformance checking is a separate surface and this is not an input to it.

  **The description is measured, not transcribed, which is a difference you can observe.** `EncodingCharacters` declares an optional `truncation` member and the serializer copies exactly five keys, never that one, so a v2.7 message whose MSH-2 carries a truncation character has it on `msg.encodingCharacters` and not on `msg.toJSON().encodingCharacters`. The emitted schema declares the five the snapshot really contains and permits no sixth. The warning `code` enumeration is read from the warning registry in both directions, the fixture corpus is walked against the document at every nesting level on every test run, and the two artifacts are compared member for member with the Zod side recovered from its own emitted text.

  **No message content reaches the output, by construction and by test.** Emission is a function of the library rather than of anything it has parsed: the same version emits byte-identical output whatever has been parsed, in whatever order. The document carries no `default`, no `examples` and no sample value, and the only literals in either artifact are the dialect URI, member and type names, and the registry's warning codes.

  **Additive only.** No existing export was removed, renamed or re-typed, no parse result changed, and no serialized byte moved.

- 3d33917: Five new typed builders close the gap between what the library can READ and what it can AUTHOR: orders (`buildOrm`), scheduling (`buildSiu`), clinical documents (`buildMdm`), charges (`buildDft`) and immunizations (`buildVxu`), plus optional prior-identity content on the ADT typed init so merge, move and identifier-change events can be authored spec-clean.

  Until now the read side surfaced orders, appointments, documents, charges, immunizations and identity events, while the emit side offered exactly three typed builders (`buildAdt`, `buildOru`, `buildAck`) beside the untyped `buildMessage`. A consumer sending a scheduling notification, a document notification, a charge, an immunization update, an order or a patient merge had to hand-assemble segments and delimiters, which is the class of work the encode-safe path exists to remove.

  **Every new builder is the mirror of its read helper.** `buildSiu` takes the appointment identifiers, timing and resource groups that `msg.appointments()` returns; `buildMdm` takes the document header and body that `msg.documents()` returns; `buildDft` takes the charges `msg.charges()` returns; `buildVxu` takes the doses `msg.immunizations()` returns; `buildOrm` takes the orders `msg.orders()` returns. Values go through the same encode-safe path the existing builders use, so a delimiter, repetition or escape character inside a supplied value is escaped as data and can never forge a field or component boundary.

  **The support claim is published and checkable.** `SUPPORTED_BUILDER_MESSAGES` lists every (message code, trigger event) pair the typed builders can author as a structurally complete message, `supportsBuilderMessage(code, event)` answers for one pair, and `TYPED_BUILDER_COVERAGE` records what each builder can emit. The set is DERIVED from the same published message structures the parser checks against, intersected with what each typed init can supply, so it cannot claim a pair whose structure needs a segment no init can populate: `ADT^A15` needs `PRT` and `ADT^A20` needs `NPU`, and neither is claimed. One invariant test builds every published pair and requires a zero-warning re-parse with no missing expected group.

  **Absent content is refused, never emitted incomplete.** Asking for a pair without the content its published structure requires is a typed `TypeError` naming the message type and the missing content: an `MDM^T02` with no document body, a `DFT^P03` with no transaction, an `SIU` with no resource group, an `ADT^A40` with no prior identity. Supplying an empty collection is refused the same way, and an init that is not an object at all is refused before it is dereferenced.

  **A trigger event outside the set is still emitted, not rejected.** The published set is a claim about structural completeness, not an allow list: a builder that takes a trigger event assembles the content supplied for any event, and the structure summary on the re-parsed message reports what is missing, exactly as it does for a message that arrived from anywhere else. Every event the shipped builders accept today, they still accept.

  **No money as a float, and no fabricated clinical value.** A `DFT` amount is supplied as its typed parts (price, denomination, price type) and every part travels verbatim: nothing parses an amount to a number, rounds it, or infers a currency. Across all five builders an omitted optional member becomes an absent field, never a defaulted value; a vaccination action code and a document completion status in particular are emitted only when supplied, and `MDM`'s completion status (TXA-17) and availability status (TXA-19) stay on separate positions and are never merged.

  **Two behaviour changes to check before you upgrade.** Everything else here is additive: `buildOru`, `buildAck`, `buildMessage`, the parser, the structure registry and the vendored publication snapshot are unchanged in behaviour, and a message the ADT builder emits for a call it already accepted is byte-identical to before.
  1. **`buildAdt` now refuses a merge event with no prior identity.** For the ten trigger events whose published structure requires `MRG` (A40, A41, A42, A43, A44, A45, A47, A49, A50, A51), `buildAdt("A40", { patient })` returned a message carrying a `MISSING_EXPECTED_GROUP` warning before and now throws a `TypeError` naming `ADT^A40` and the member that would supply the missing segment. Add `priorIdentity` to those calls, or use `buildMessage` where an incomplete message is what you want. Every other ADT trigger event, including one the published structures do not recognize, is still emitted exactly as before.
  2. **`msg.identityEvents()` recognizes five more trigger events.** A45 (move visit information) and the identifier-change family A47, A49, A50 and A51 previously returned `[]`; they now return an event carrying the MRG-sourced `prior` party, the PID-sourced `surviving` party and the constant `direction: "MRG_TO_PID"`, like every other identity event. The recognized set is now floored by the published message structures, so it cannot fall behind them again. `IdentityEventKind` gains a `"change"` member for that family: an identifier change replaces one identifier on one record, so it is deliberately NOT reported as a `"merge"`, and code that acts on `kind === "merge"` keeps acting on exactly the events it acts on today. An exhaustive `switch` over `IdentityEventKind` needs a `"change"` arm.

- 3ef4bfd: Conformance profiles: condition predicates, evaluated against the message.

  A conditionally-used element could previously be declared but not decided. The engine derived no outcome from the message: a `C(t/f)` rule applied an outcome only when the caller handed it one, and `C`, `CE` and `B` had their presence skipped entirely. That is what made an empty findings list weaker than it read. Some elements were not assessed, they were stepped over, and an element whose presence nothing evaluated is indistinguishable from one that passed.

  A rule may now declare a **condition predicate** on its `condition`, and the engine evaluates it against the parsed message and applies the outcome it selects. The predicate shape follows the published condition-predicate definition language: a LOCATION naming an element in the same message (segment, then the 1-indexed field, component and subcomponent), a VERB from the closed set (`is`, `is not`, `contains`, `does not contain`, `matches`, `does not match`) with a value list the author supplies, or a presence statement (`is valued`, `is not valued`), and `AND` / `OR` / `XOR` connectors that nest. Each negative verb is the exact complement of its positive twin for one value, but not for a location that repeats: see below. A regular-expression value is anchored over the whole value and read in Unicode mode.

  **The three usage codes a predicate may sit on, and the outcomes each selects.** A declared conditional `C(t/f)` carries its outcomes explicitly. The bare conditional codes carry theirs by definition, and both branches are the ones IHE ITI TF Vol.2 Appendix C states: a satisfied `C` is Required and an unsatisfied one Not-permitted; a satisfied `CE` is Required-but-may-be-Empty against the same Not-permitted. `B` is deliberately excluded, for the same reason its presence behaviour was a bounded choice rather than a sourced one: the methodology lists it among the allowable indicators and carries no definition text for it, so nothing says what a predicate on a `B` element would decide.

  **A predicate the message cannot decide is reported, never guessed.** A presence statement is always determinate, because an element the message does not carry is simply not valued. A comparison against an element the message does not carry is not: the language compares content and there is no content to compare, and deciding it false would fabricate an answer that turns a required element into a permitted absence. That case now yields a new finding code, `PROFILE_CONDITION_UNEVALUATABLE`, and the element's presence is not assessed. A connected predicate is undecidable exactly when its result depends on an undecidable operand, so `AND` is false as soon as one side is false, `OR` is true as soon as one side is true, and `XOR` always needs both.

  **Where a location reads, and what a negative verb asks there.** A repeating field or a segment occurring more than once needs only one match: a statement is true when one or more of those repetitions or occurrences satisfies it, the language's default occurrence semantics, negative verbs included. Read that last clause carefully, because it is where a predicate is easiest to misread: `is not` is true when SOME repetition is not a listed value, not when every repetition is not one, so at a repeating location a verb and its negative can both decide true against the same value list (`PID-3.1 is 'MRN1'` and `PID-3.1 is not 'MRN1'` are both true for `PID-3 = MRN1~MRN2`). A negative verb is not a way to ask whether NO repetition is a listed value; the language carries no negation connector, so that question cannot be written in a predicate. Where the location carries exactly one value the pair does behave as an exact complement, and where it carries none neither half decides. Presence asks whether there is any content at or below the coordinate, which is the reading the `R` and `X` checks already use for a field; a comparison reads the value AT the coordinate, with an omitted component and subcomponent both defaulting to `1`, exactly as a field rule's own `component` default does.

  **Refused rather than guessed**, every one as `PROFILE_MALFORMED`, with the never-throws invariant intact and no message rule evaluated against a profile the engine cannot trust: a verb or presence statement outside the published sets; a comparison with no value list, an empty one, or one carrying a non-string (a sparse array's holes count: a length is not a value list); a regular expression the platform cannot compile; a location naming no addressable element (a bad segment name, a non-positive index, a component with no field, a subcomponent with no component); a comparison whose location stops at the segment, which has no single content to compare; a statement declaring none or more than one of `presence`, `verb` and `connector`, where a key set to `undefined` still declares it, so a statement assembled from an options bag has to omit the keys it does not use rather than pass them through empty; a nesting deeper than the language defines, which is also what stops a self-referential predicate; a predicate on a rule whose usage is not conditional, including one with no usage at all; and a predicate arriving as `null`, an array, a string or any other shape a type check could not have stopped. `defineConformanceProfile` refuses all of them at authoring time.

  **A rule takes its outcome from the predicate or from a caller-supplied resolution, never from both.** A resolution naming the locus of a rule that declares a predicate is now a `PROFILE_MALFORMED` finding rather than a precedence question: silently preferring either source would decide a patient-safety question by accident of implementation order.

  New public surface: the `ConditionPredicate`, `PresencePredicate`, `ComparisonPredicate`, `ConnectedPredicate`, `PredicateLocation`, `PredicateVerb`, `PredicatePresence` and `PredicateConnector` types, the `PREDICATE_VERBS` and `PREDICATE_CONNECTORS` vocabulary listings, the `condition` member on segment and field rules, and the `PROFILE_CONDITION_UNEVALUATABLE` finding code. The predicate types are discriminated, so a verb outside the closed set and a comparison with no value list are both compile errors where the profile is written in TypeScript.

  **Additive for every existing profile.** An omitted `condition` is not a condition: a rule that declares none behaves exactly as it did before. `C`, `CE`, `B` and a declared conditional that nothing decides still have their presence not evaluated, with their length, value-set and cardinality rules applied on the same terms; a caller-supplied resolution still selects the outcome for a rule that declares no predicate; and every existing refusal, its wording and the order the diagnostics come back in are unchanged. `FINDING_CODES` gains one entry and renames none, so a consumer switching on it exhaustively is the one shape of code that needs an arm added.

- 249d34c: Profiles can now name fields on STANDARD segments, not just on Z-segments: `segmentOverrides: { PID: { fields: { siteMrn: 19 } } }` makes `seg.get("siteMrn")` read PID-19 on every PID in the message.

  A site that stuffs its own value into a standard field is the normal case on a real integration: a second MRN in PID-19, a local severity code in AL1-4, a site dose qualifier in RXA-6. Until now a profile could only name fields on its own Z-segments, so those reads fell back to a bare position typed by hand at the call site, which is exactly the read that drifts silently when a feed changes. `segmentOverrides` gives them a name in one place. Positions are 1-indexed HL7 positions, identical in meaning to the argument of `seg.field(n)` and including the MSH convention (a binding at 1 is the field separator, a binding at 3 is the sending application), so `get(name)` and `field(position)` always agree. It merges through `extends` under the rule `customSegments` already uses: per segment type, the child's binding wins at any position both declare and the parent's bindings elsewhere survive. `describe()` reports the overridden segment names on their own line.

  **It is a SEPARATE option from `customSegments`, not a relaxation of it.** That map still refuses anything but a Z-segment, and it is what decides which segments the parser treats as profile-claimed for `UNKNOWN_SEGMENT`: a standard name inside it would change which segments warn. Keeping them apart also means an author reading a profile literal can see at a glance which declarations touch standard clinical fields. A Z-segment key in `segmentOverrides` is refused at definition time and pointed back at `customSegments`; a key that is not a standard segment name is refused too, with the canonical spelling suggested when only the case was wrong; a position that is not a positive integer is refused naming the profile, the segment and the field.

  **ADDITIVE ONLY, and this is the point rather than a side note.** HL7 v2 messages carry PHI, and an alias that re-pointed an existing accessor would hand a downstream consumer a different clinical value with nothing to notice: no warning, no diff, and no way to undo a dose already acted on. So an override creates new named reads and changes no existing read. Positional access, dot-path lookups (`PID.siteMrn` is still a syntax error; dot-paths stay positional), the typed clinical accessors (`msg.patient?.mrn` still reads PID-3), the warning list, `toJSON()`, the byte-exact `toString()` and the whole write path are what they were. Parsing one message twice, once with the overrides and once with the same profile stripped of them, is asserted equal across every one of those observables. `Profile` and `DefineProfileOptions` gain an optional `segmentOverrides` member; nothing is removed or renamed, and the package still has zero runtime dependencies.

- a8d5f2e: Conformance profiles: a value set can now be bound to the coding system its codes must come from.

  A field rule could say "this code must be one of these" and nothing more. The message says more: a coded element carries the sender's claimed coding system right beside the code, and the engine never read it. So a feed sending a plausible, permitted-looking code labelled with the wrong system validated clean, which is a false negative on the results path rather than a completeness nicety: what a certified reportable-lab interface most needs to assert about OBX-3 is precisely which vocabulary the code came from.

  A field rule may now declare `codingSystem`, and optionally `codingSystemComponent`. With a binding declared, each present, non-empty repetition has its coding-system component compared against the binding, and a mismatch is the new `FINDING_CODES.PROFILE_CODING_SYSTEM_MISMATCH`.

  **The new code is distinct from `PROFILE_VALUE_NOT_IN_SET` on purpose.** "A code we do not accept" and "a code that looks right but claims the wrong system" are two problems with two remedies, and one code for both would hide the second inside the first. The two checks are also INDEPENDENT: a permitted code carried under the wrong system yields exactly one coding-system finding and no value-set finding, and a code wrong on both counts yields exactly one of each.

  **Comparison is by resolved identity, never string equality.** Both sides go through the Table 0396 provenance map this library already ships, so `LN`, `LOINC`, `loinc` and `  LN  ` all match a binding of `LN`, and `SCT`, `SNOMED` and `SNOMEDCT` all match a binding of `SCT`. Comparing raw strings would report a mismatch for a correct feed that wrote an accepted spelling, which is the worst outcome available here.

  **The coding-system component defaults to two positions after the checked one**, which is the coded element's own code-to-system relationship: a code at component 1 puts its system at component 3, and an alternate code at component 4 puts its alternate system at component 6. So a rule checking the primary triplet declares neither key, and a rule checking the alternate triplet sets `component` alone. `codingSystemComponent` overrides the offset for a field whose layout does not follow it. Checking both triplets from one rule is not supported: declare two rules on the same field.

  **An absent or blank claim is a finding, never a pass.** A present, non-empty repetition whose coding-system component is missing entirely, empty, whitespace-only, or names a system that cannot be resolved is reported with the same code. Deciding otherwise would let the exact case the binding exists for pass by omitting a component. An EMPTY repetition is not reported (it claims no code, so it has no provenance to be wrong about), and an absent or empty FIELD is still left to its usage code: `PROFILE_REQUIRED_ABSENT` for `R`, nothing for `RE`, `O`, `C`, `CE` or `B`.

  **A binding this library cannot resolve is refused when the profile is DEFINED**, as `PROFILE_MALFORMED` from `validateAgainstProfile` and a thrown `ProfileDefinitionError` from `defineConformanceProfile`, rather than compared at validation time against a system that cannot be resolved. The same refusal covers an identifier that is not a string, is empty or whitespace-only, a `codingSystemComponent` that is not a positive integer, a `codingSystemComponent` declared without an identifier, and a binding on a rule that declares no `valueSet`: a binding with nothing to bind is a defect, not a system-only check. Validation still never throws for any of them.

  **The recognition set is a deliberate SUBSET of the published registry, not all of it.** It is the same safety-relevant map that backs `codingSystem()` and `KNOWN_CODING_SYSTEMS`, so an identifier that is genuinely registered but outside that map is still refused, and the refusal says the identifier is not one this library recognizes rather than that it is unregistered. That is the fail-safe direction, and it means a local or site-specific coding system cannot be bound at all: keep the bare `valueSet` form for those rules. Widening the map is a separate change with its own per-entry sourcing.

  **No PHI, on the same terms as every other finding.** A coding-system finding names the EXPECTED system and the structural locus (segment, field, the component it read, repetition, occurrence) and nothing else. It never carries the offending claim or any other value taken from the message, and the expected identifier it does carry is the resolved registered acronym read out of the library's own frozen map rather than whatever spelling the profile author wrote.

  **This checks the sender's claim, never the code.** Nothing here verifies that a code exists in the system the message names, or that the system is current. hl7 still ships no code set, bundles no value set and makes no network call; membership stays a literal check against the array you supply.

  Unchanged, and deliberately: the bare `valueSet: readonly string[]` form is untouched and still first-class. A rule that declares no binding produces exactly the findings it produced before, in the same order, with the same codes, messages and severities, and can never emit the new code. The binding is purely additive and opt-in, and it constrains rather than relaxes: no profile that authored cleanly before is newly refused, and no message that validated cleanly before newly fails on a rule that did not opt in.

- 4ad3469: Message-structure awareness is now DERIVED from HL7's published, machine-readable message structures instead of hand-transcribed, it recognizes 94 (message code, trigger event) pairs instead of 32, and every warning names the missing SEGMENT and traces to the publication it came from.

  The registry used to be a hand transcription of the v2.5.1 chapters: twelve message codes, eight ADT trigger events, one hand-picked "anchor" segment per group, and no traceable link to any published structure. A consumer could not be told that their `ADT^A01` was missing a segment the standard marks required, and could not audit where an expectation came from.

  **The publication is vendored, not cited.** A byte-for-byte snapshot of HL7's published message-structure definitions and its two control manifests ships under `vendor/hl7-v2ig/`, and a committed offline generator derives the registry from it. There is no network call at build time or at run time, and re-running the generator in a checkout with no network access reproduces the committed artifact byte for byte.

  **The provenance ships with the code.** The new `STRUCTURE_REGISTRY_PROVENANCE` export names the publication and the exact commit it was read at, the byte count, sha256 and upstream URL of all 83 vendored files, the variant family behind each referenced structure, and the structure id behind each recognized pair. `findMessageStructureDefinition(messageCode, triggerEvent)` reaches the entry behind a warning, and every entry carries `requiredSegments`, `structureId`, `structureIds` and a `derivation` of `published` or `retained-transcription`.

  **Three derivation rules, all conservative in the same direction.** A segment is expected only when its minimum is at least one along the whole path from the structure root, so a segment the publication marks required inside a group it marks optional is not expected: a conformant `ORU^R01` with no `OBX` and no top-level `PID` stays warning-free. Where the publication splits a structure into single-uppercase-letter variants, a segment is expected only when every member of the family requires it. A pair with no entry is still silent.

  **What consumers will notice: warning volume rises on non-conformant traffic.** More trigger events are recognized, so messages that used to be `recognized: false` are now checked. More segments are expected per pair, most visibly `EVN` across the whole ADT family and in `MDM` and `DFT^P03` too (the previous table excluded it deliberately, for every message code, which is exactly what stopped the library reporting a genuinely missing required segment), plus `PV1` in `MDM`. And an `ORU^R01` carrying `OBX` but no `OBR` now warns, where the old anchor accepted either. If your channel treats a `MISSING_EXPECTED_GROUP` warning as a rejection, sample your traffic before upgrading.

  **`missingGroups` now holds segment names.** It used to hold hand-picked group labels such as `"result"` and `"patient"`; it now holds `"OBR"`, `"EVN"` and the like. The field, its type and its meaning ("what is absent") are unchanged, and the new `missingSegments` and `requiredSegments` on `msg.structure` say the same thing under clearer names. `structureIds` records which published structures the verdict came from.

  **Nothing was removed.** Every value the entry point exported still exports, no exported type lost a field, and the warning code set is unchanged at twenty: a structural finding is still `MISSING_EXPECTED_GROUP`, still Tier-2 and additive, still never a throw, and still carries no field value. The retired `missingExpectedGroup` factory is retained and still works; the parser now calls the new `missingRequiredSegment`, which names the segment and the published structure.

  **One entry is not derived, and says so.** The publication carries no `ORM_O01` at all: it is absent from the 305-entry structure manifest and its raw path answers 404. `ORM^O01` is the commonest legacy order message and was recognized before, so it is retained with its previous expectation (`ORC`), marked `retained-transcription`, and carries the reason it could not be derived. Eight `ADT` merge messages that the publication's own message list names no structure for are recorded as unresolved by the generator and left silent, rather than guessed.

  `docs-content/spec-notes-structure.md` carries the full table, the derivation rules, and every difference from the previous transcription adjudicated segment by segment.

- 7abca94: Typed message overlays: `msg.is("ADT^A01")` answers at run time and narrows at compile time, so a message-type check now scopes everything after it.

  A parsed message used to say what it was through `meta.messageCode` and `meta.triggerEvent`, both `string | undefined`, and a `switch` on them left every later access as widely typed as it was before. `msg.is(key)` closes that gap. Inside the guard the message code and trigger event are literal types rather than optional strings, and two new accessors, `part(name)` (the first segment of `name`) and `parts(name)` (every segment of `name`), take only the segment names that message type's published structure marks required. There is no cast, and no type to import per message type: the narrowed view is generic in the key (`TypedMessage<"ADT^A01">`), so a package whose export list is already large does not gain one exported name per recognized pair.

  **The key set is derived, never hand-listed.** A key is `"<MSH-9.1>^<MSH-9.2>"` (`"ADT^A01"`), or `"<MSH-9.1>"` alone for a message type the derived structure registry matches on message code alone (`ACK`, whose MSH-9.2 carries the acknowledged message's trigger event). The new `SUPPORTED_OVERLAY_MESSAGES` export enumerates all 95 of them with the segments each one's published structure requires, computed from `MESSAGE_STRUCTURE_DEFINITIONS` at module load, and a test compares the claim to that registry in both directions so it can never name a pair the structure net does not recognize.

  **Nothing is typed as guaranteed-present, deliberately.** The parser is lenient and a real `ADT^A01` arrives with no `PID` often enough that the library warns rather than refuses, so `part` returns `Segment | undefined` and `parts` a possibly-empty list for every name, required or not. An overlay that promised presence would delete the optional chain from consumer code and turn a truncated feed into a crash. Such a message still answers `true`, still carries its `MISSING_EXPECTED_GROUP` warning, and still reports the absence on `msg.structure`.

  **A non-key string is a documented `false`, never a throw.** The comparison is on the (MSH-9.1, MSH-9.2) pair the parser extracted, so a message whose MSH-9 carries the three-component `ADT^A01^ADT_A01` matches the key `"ADT^A01"`, while the string `"ADT^A01^ADT_A01"` matches no key at all: `is` does not parse its own argument, and `msg.meta.type` is still the raw MSH-9 string. An unrecognized type, an empty string, or a value computed at run time answers `false`; a runtime-computed `string` returns a plain `boolean`, because it cannot narrow anything.

  **Additive only.** No existing export was removed, renamed or re-typed, no parse result, warning code, warning position or serialized byte changed, and the package still has zero runtime dependencies. `is`, `part` and `parts` are new members on `Hl7Message`; `part` and `parts` are callable with any segment name on a message that has not been narrowed, and `segments()` is unchanged, so no caller is pushed into a cast.

- f34cdc4: Typed custom-segment field names: `seg.get("departmentCode")` is now checked against the names the applied profile declares for that segment type, so a typo fails to compile instead of silently reading nothing.

  A profile author already told the parser exactly which fields a custom Z-segment carries (`customSegments: { ZDP: { fields: { departmentCode: 3 } } }`), and at run time that declaration was honoured. At compile time it was thrown away: the factory returned the widened `Profile` interface, whose `customSegments` is `Record<string, CustomSegmentDefinition>`, and the reader was `get(name: string)`. So `seg.get("departmentCod")` type-checked perfectly and returned `undefined` at run time, which is the exact class of mistake the "missing names return `undefined`, not a synthetic empty Field" design was written to surface: invisible until someone reads a blank department on a report. `defineProfile()` now carries its declarations in the type it returns, `parseHL7`, `splitBatch` and `parseStream` thread them onto the message, and `segments`, `getAll`, `part` and `parts` hand each segment the names declared for its own type.

  **Narrowing is per segment type, never a flat union.** A profile that declares `ZDP` and `ZRS` gives a `ZDP` segment only its `ZDP` names; passing a `ZRS` name to a `ZDP` reader is a compile error, because the runtime lookup is per segment too and a name resolved against the wrong segment is a wrong position, not a missing one. Built-in profiles narrow straight from the namespace object (`parseHL7(raw, profiles.epic)`), with nothing to re-declare or annotate at the call site.

  **The fallback is permissive everywhere the declaration is not statically known.** No profile argument, a value typed as the general `Profile` interface, a profile resolved from the `setDefaultProfile` registry, a segment type the profile does not declare, a segment declared with an empty field map, a profile declaring no custom segments at all, and the undifferentiated `msg.allSegments()` walk all keep the `string`-accepting signature. An unknown declaration is a reason to say nothing, not a reason to reject, so no existing caller gains a type error. A profile built with `extends` accepts the names it inherits and the names it adds.

  **Nothing is typed as guaranteed-present.** A declared name whose position the wire message does not carry still reads `undefined`, so a declared name is typed `Field | undefined` exactly like any other. An overlay that promised presence would delete the optional chain from consumer code and turn a short segment into a crash.

  **Types only, and additive.** No parse result, position, warning, warning code, profile merge or serialized byte changed; the same names resolve to the same fields as before, and the package still has zero runtime dependencies. A profile built by the factory is still assignable to `Profile` with no cast, so every existing API that accepts the interface keeps accepting it. The new exported types are `DefinedProfile`, `ProfileFieldName` and `ProfiledMessage`; `Segment` gains an optional type parameter that defaults to today's `string`, and `BatchMessageEntry`, `Batch`, `BatchSplitResult` and `StreamMessageEntry` gain one that defaults to `Hl7Message`.

- e071ab8: Opt-in published-structure validation: `validateMessageStructure(msg)` checks a parsed message's segment order, occurrence counts and unnamed segments against HL7's own published message structure for its trigger event.

  `msg.structure` already answered "is a segment the publication requires actually present?", and `validateAgainstProfile` already answered "does this message meet the spec I wrote?". Neither answers the question an integration engineer asks before a feed goes live: does this message follow the shape HL7 publishes for this trigger event, in the published order, with each segment appearing as many times as the publication allows. Getting that answer used to mean hand-writing a conformance profile per trigger event, which is work the publication has already done and this package already vendors.

  **The expectation is derived, not written down.** The offline generator already read each vendored element's minimum and its segment type and discarded the rest; it now keeps the rest. A second generated artifact records, per published structure variant, one node per published element carrying its position among its siblings, its minimum, its maximum and its enclosing group, in the publication's own order. Nothing is hand-picked and nothing is filtered, the unbounded marker is carried through as itself rather than as a large number so a freely repeating segment can never yield an upper-bound violation, and an element whose maximum is neither that marker nor a non-negative integer at least as large as its minimum now refuses the derivation naming the file. The presence-only registry is byte-identical: no existing expectation moved.

  **Three checks, three stable codes, one PHI-free locus.** `STRUCTURE_SEGMENT_OUT_OF_ORDER` names a segment arriving where the published order does not allow it, `STRUCTURE_SEGMENT_CARDINALITY` names a segment occurring fewer times than the published minimum along the path from the structure root or more times than its maximum, and `STRUCTURE_SEGMENT_UNEXPECTED` names a segment the publication does not mention at all, a `Z` segment included, at `warning` severity because HL7 reserves them for exactly that. Every locus is a segment name, a 0-indexed occurrence and a published structure id; no field, component or subcomponent value is ever read into a finding.

  **Ordering is asked against the published bounds themselves.** The order question is answered by simulating the published structure with every bound honoured at the locus the publication states it: a group it lets occur more than once may repeat, which is what lets a conformant `ORU^R01` carry `OBR OBX OBR OBX` without complaint; a group it bounds at one occurrence may not be re-entered, so a `VXU^V04` whose `PV2` arrives before its `PV1` is reported; and no occurrence of a group may begin without the child the publication requires first, so an `ADT^A01` whose `IN2` arrives before its `IN1` is reported too, though `INSURANCE` repeats and both counts are inside their bounds. One bound is dropped, and only where the cardinality check has already reported it for that segment name: too few occurrences drops its minimum, too many drops its maximum, so a count defect is one finding rather than a count finding plus every segment after it reading as misplaced. Where two segments arrive in an order the publication does not allow, the finding names the one that arrived late: the segment the publication puts first and the message delivered second. That is not always where the reading stopped, because the publication is often free to skip past the segment a message delayed and carry on, so the pair is identified by exchanging adjacent segments and asking whether the publication derives the result. Every adjacent pair is asked, not a shortlist near the stop: in a message that repeats a group the pair can sit well in front of it, as in an `OML^O21` carrying three orders whose first order's note is delivered after the second order's `ORC`, where the reading goes on for six more segments. Where more than one pair would do, the earliest is named, and the whole search costs one pass backwards over the message and one forwards however long it is. Where the publication splits a structure into variants, conforming to one variant is conforming to the family: findings come back only when every variant is violated, they are exactly one named variant's rather than a merge, and the same message selects the same variant every time.

  **"Not validated" is a distinct answer from "no findings".** A message type the registry does not model, the one retained transcription (`ORM^O01`), a structure resolving to an empty expectation, and a message carrying no readable message type each return `validated: false` with a reason and zero findings, rather than an empty findings list that reads as approval or a shower of unexpected-segment findings. Zero findings on a validated message is still not a conformance attestation: field content, datatypes, value sets and HL7 tables are unchecked, coverage is twelve message codes, and the publication is vendored at a fixed commit.

  **Additive and strictly opt-in.** No existing export was removed, renamed or re-typed, no new warning code exists, no parse behaviour changed, `msg.structure` is unchanged against every existing fixture, and validating a message leaves its segments, warnings and serialization byte-identical. A caller who never asks sees nothing new at all, which is deliberate: folding these findings into the default parse would start rejecting live traffic in every channel that treats a warning as a rejection.

- ea09919: Conformance profiles: a profile can now declare which conformance LEVEL it claims, every result echoes the level in force, and a claim of the implementable level is checked rather than believed.

  A zero-finding result was ambiguous in the one way that matters. It could mean "every element of this interface was determined and none was violated", or it could mean "the profile left optionality in place, so parts of the message were never assessed at all", and nothing on the result told the two apart. The HL7 conformance methodology draws exactly that line between profile LEVELS: a complete assessment of an interface declaring conformance to an implementable profile can be determined, while for standard-level and constrainable-level profiles not all aspects can be.

  A profile may now declare `level`, one of the three the methodology defines, and `PROFILE_LEVELS` exports them as a frozen listing ordered from the least constrained to the most: `standard`, `constrainable`, `implementable`. The new `ProfileLevel` type makes the declaration a compile-time-checked member of the profile rather than a bare string.

  **Every `ConformanceResult` now carries `level`**, beside `profileName`. It is present on every result, including one for a profile so malformed that even its name fell back to a sentinel, so a consumer reading it never has to check whether it is there.

  **Declaring no level claims `constrainable`**, the weaker of the two claims a working profile can make. So a profile written before the declaration existed never reads as an implementable one, keeps producing exactly the findings it produced before, and is echoed at the level it was actually assessed at.

  **A claim of `implementable` is CHECKED when the profile is defined.** The methodology's terminus is that in an implementable profile ultimately only two possibilities are allowed, either a specific element is supported (`R` or `RE`) or it is not (`X`), and that a conditional usage's true and false outcomes must also be defined only as `R`, `RE` or `X`. Three things refuse the claim, each `PROFILE_MALFORMED` naming the offending rule's structural locus and the offending declaration: a usage the level does not admit (`C`, `CE`, `O` or `B`), a declared conditional carrying an outcome it does not admit (`C(R/O)`), and a rule that declares no usage at all, since an omitted usage means Optional and the level asserts optionality is gone. That last one applies to segment, field and component rules alike, and it is the one place an omitted usage is ever refused: it is refused because the profile asked to be held to it. `C` and `CE` are refused even though the engine knows outcomes for them, because the methodology requires an implementable profile's conditional outcomes to be defined and a bare code defines them nowhere in the profile; an author who means `C` at this level writes `C(R/X)`.

  **A refused claim is never the level echoed.** It falls back to `constrainable`, and that holds for any profile defect rather than only a level-derived one, because a run that returned diagnostics instead of assessing the message verified no claim of completeness, and a defect anywhere in a profile can stop the gate from ever reaching the rules below it.

  **The level changes no message check.** It alters nothing about which findings fire for a given message, their severity, cardinality behaviour, predicate evaluation, or the value-set and coding-system checks. It decides whether the profile is refused, never what the message is found to be. A level that is not one of the three, including a value of the wrong type reaching the engine through an unchecked cast, is `PROFILE_MALFORMED` from `validateAgainstProfile` and a thrown `ProfileDefinitionError` from `defineConformanceProfile`, on the same terms as every other profile defect; the engine still never throws.

  **And zero findings at `implementable` level is still not an attestation.** The level is the author's claim, checked for internal consistency against the profile itself, never an external, third-party or accredited statement.

- 146cd86: Conformance profiles: a field rule can now say what its components ARE, and content in a component you never declared is a finding rather than a pass.

  A profile graded only what it wrote down. A field rule could say a field is Required, how many times it may repeat, how long its checked component may be and which codes that component may carry, and nothing at all about the field's SHAPE. So a vendor stuffing a fourth component into a field you specified with three validated clean. The HL7 conformance methodology does not read that as harmless extra content: the presence of unexpected content for an element the profile does not specify is a conformance violation, and its own worked example is exactly that case, data present for a fourth component where the profile defines three.

  A field rule may now declare `components`: a list of 1-indexed component positions, each with an optional usage code and an optional severity. Three things follow from it.

  **A component's cardinality is IMPLIED by its usage and may not be declared.** The methodology requires an explicit cardinality range for segment groups, segments and field elements, and states that component elements do not include one: the range is implicitly associated with the element and follows from its usage code. `R` implies `[1..1]`, `RE` and `O` imply `[0..1]`, and `X` implies `[0..0]`. A component carries no repetition construct in HL7 v2, so each of those reduces to presence: per present repetition, `R` with nothing at that component is `PROFILE_REQUIRED_ABSENT` and `X` with something there is `PROFILE_NOT_PERMITTED`, both at a locus naming the component. A `cardinality` on a component rule is `PROFILE_MALFORMED`, not a constraint the engine quietly honours, because honouring it would let a profile declare a range the methodology says a component cannot have.

  **Declaring component rules CLOSES the field's component set**, which is what makes undeclared content decidable at all. A present repetition carrying a non-empty value at an index no rule declares is the new `FINDING_CODES.PROFILE_UNDECLARED_CONTENT`, one finding per undeclared index per repetition, at a locus naming the segment, the field, the component, the repetition and the segment occurrence.

  **A field rule that declares no component rules declares no depth**, is checked exactly as it always was, and can never emit the new code. What counts is the rules, not the key: omitting `components` and passing an empty list say the same thing, since neither carries a component rule. `components: []` is never read as "this field has no components", which would turn a list built by a filter that matched nothing into a finding for every component of every repetition. The check is additive and opt-in per rule, so no message that validated cleanly before newly fails on a rule that did not opt in.

  **The new code is a MEMBER of an exported union consumers narrow on.** `FINDING_CODES` and the `FindingCode` type both gain `PROFILE_UNDECLARED_CONTENT`, so an exhaustive `switch` over `FindingCode` that compiled before now has a missing case. That is the intended cost of a distinct code: "a value we do not accept" and "content in an element the profile never specified" are two problems with two remedies, and folding the second into an existing code would hide it inside the first.

  Separately, and applying to segment rules and field rules whether or not they declare components, **a usage paired with a cardinality the methodology disallows is now refused when the profile is DEFINED**. A Required element's minimum cardinality must be 1 or greater; any other declared usage takes a minimum of 0; `X` admits `[0..0]` and no other maximum. The one exception is the methodology's own: `RE` may carry a minimum above 0 to express an element that is not always present but has that many occurrences when it is. Refusal is `PROFILE_MALFORMED` from `validateAgainstProfile` and a thrown `ProfileDefinitionError` from `defineConformanceProfile`, on the same terms as every other profile defect.

  **That refusal is a behaviour change for an existing profile.** A profile pairing `C`, `CE`, `O`, `X`, `B` or a declared conditional with a minimum cardinality above 0, or pairing `R` with a minimum of 0, or pairing `X` with a maximum other than 0, validated before and is refused now. It was never a constraint an author could have meant: a Required element permitted to be absent, or a not-supported element permitted to occur, is a profile contradicting itself, and the methodology's own table pairs `C(R/X)` with `[0..5]` rather than `[1..5]`, letting the condition supply the rest. Rewriting such a rule means dropping the minimum, or moving to `RE` where the exception applies.

  **No PHI, on exactly the terms every other finding holds.** An undeclared-content finding names the structural locus and the NUMBER of components the field rule declares, and nothing else. It never carries the surprising value or any substring of it, and this is the finding most tempted to: an author reading "there is content you did not declare" wants to know what it was, and the component is undeclared precisely because the profile says nothing about it, which makes its content unconstrained message content. The locus says where to look in the message the caller already holds. The malformed-profile details are profile shape only, and the usage/cardinality detail deliberately does not echo the offending usage token, so an unresolved conditional and `B` stay findings-identical to `C` down to the defect text.

  **Still bounded, and deliberately.** Undeclared-content detection is scoped to a field whose rule declares component rules, so an undeclared segment, an undeclared field and an undeclared sub-component are all still unchecked and the check is only as deep as the profile you wrote. Sub-component rules are not supported. Nothing here relaxes an existing check, the parser is untouched, and its warning and fatal code sets are unchanged. `findings.length === 0` is still not a conformance attestation.

- ce1171e: Conformance profiles: a declared conditional usage `C(a/b)`, the `B` indicator, and caller-supplied resolutions.

  A profile could previously declare only `R`, `RE`, `C`, `CE`, `O` or `X`. Two indicators the HL7 v2 conformance methodology allows in a message profile were missing: the declared conditional `C(a/b)`, which carries an explicit true and false usage outcome, and `B` (Backward Compatible). Without `C(a/b)` there was no path from a profile this engine can express to an implementable one. A rule may now declare either, on segment rules and field rules alike, and `usageOutcomes(rule)` reads a declared conditional's two outcomes back as separate simple codes (`undefined` for a rule whose usage is simple or absent, never a throw).

  `validateAgainstProfile` takes a third, optional argument: an ORDERED LIST of resolutions, each naming a locus (segment name, plus the 1-indexed field position when the target is a field rule) and a boolean outcome. A resolved rule is evaluated exactly as the same rule declared with that outcome as its usage, for every occurrence of the segment and every repetition of the field. The container is a list rather than a map keyed by locus on purpose: two resolutions at one locus are a defect that has to be REPORTED, and a keyed container cannot represent the input that triggers it, so the defect would be undiagnosable. The list order is also the order the diagnostics are reported in: a defect stands where it was supplied whatever KIND it is, and a locus reported once stands where that locus FIRST appeared. Diagnostics about the profile's own shape still come before all of them.

  **The engine still evaluates no condition predicate and derives no outcome from the message.** That boundary is unchanged and is the reason the resolution comes from the caller. This supersedes the previous framing that a declared conditional's outcomes would be recorded but not resolved: they are recorded AND applied, by the caller's decision rather than the engine's.

  New public surface: the `usageOutcomes` function, the `UsageResolution` and `UsageOutcomes` types, and the `SimpleUsageCode` / `DeclaredConditionalUsage` / `UsageCodeRegistryEntry` types.

  **Two exported shapes are now distinct, and that is a type-level break for one shape of consumer code.** `UsageCode`, the type a rule's `usage` is declared with, is now the seven simple codes plus the declared-conditional template `C(t/f)`; an exhaustive `switch` over it no longer compiles without arms for `B` and for the conditional form. `USAGE_CODES` is typed as `readonly UsageCodeRegistryEntry[]`, which additionally admits the placeholder `"C(a/b)"` and is therefore NOT assignable where a rule usage is expected. Neither type widens to a bare `string`: the typo `"RQ"` is still a compile error.

  `USAGE_CODES` now lists eight entries: `R`, `RE`, `C`, `CE`, `O`, `X`, `C(a/b)`, `B`, with the previous six keeping their positions. It is a published vocabulary LISTING, not a membership test for what a rule may declare: `C(a/b)` is listed and is refused on a rule (`a` and `b` are placeholders for usage codes, not usage codes), while `C(RE/X)` is accepted on a rule and is not listed.

  Every refusal now NAMES the offending token instead of only listing the permitted set, on both the validation path and the fail-fast `defineConformanceProfile` gate, so an author debugging a typo no longer has to diff their profile against the vocabulary. A token is echoed as a whole, bounded to its first 32 characters; a usage that is not a string names the value's TYPE rather than echoing its content. A resolution that matches no declared rule, matches more than one, targets a rule whose usage is not a declared conditional, or is duplicated at one locus is a `PROFILE_MALFORMED` finding, and so is a resolution argument that is not a list of well-formed resolutions: a mis-typed argument must never be read as "no resolutions" and return a clean result for elements nothing checked.

  Unchanged: omitting `usage` on a rule still means Optional and is still never refused; `C`, `CE`, `B` and an unresolved declared conditional are not presence-checked, with their length, value-set and cardinality rules applied on exactly the terms a `C` rule gets today; and a profile drawn only from the previous six codes validates to the same findings, in the same order, as before.

  `B`'s presence behaviour is this library's own bounded choice, not a sourced requirement: the methodology lists `B` among the allowable indicators and carries no definition text for it, so the reading taken is the one that imposes no presence obligation. A declared conditional's outcomes may be any simple code here because this engine targets the constrainable profile level; the methodology's restriction of an implementable profile to `R`, `RE` or `X` is not enforced, since a profile cannot yet declare which level it claims.

### Patch Changes

- 5c0ebee: Tooling: the pending release queue and the public export surface are now checked rather than assumed.

  The version a release lands on is decided by the strongest bump type in `.changeset/`, and nothing read those frontmatter lines at review time. Every pending declaration in this repository asked for `patch`, because the contributor guidance told every contributor to pick `patch` on the `0.0.x`-until-first-alpha ladder, so a queue that includes five new typed builders, conformance condition predicates, coding-system bindings, profile levels, component rules and a re-sourced message-structure registry could not resolve to anything but another `0.0.x`. A published version number cannot be recalled, which makes "we thought that one was a patch" unrecoverable rather than merely wrong.

  `scripts/release-readiness.ts` reads the checkout alone and reports every pending declaration with the bump type it carries, the strongest bump in the queue and the version that resolves to, and it refuses rather than guesses: frontmatter it cannot parse, a declaration for another package, a bump type outside the published three, a file declaring the package twice or not at all, and a file the committed readiness record never classified are each named with their defect instead of skipped. An empty queue is reported as nothing to release rather than as a clean one, and a `major` is never certified, because a first stable release is a decision a human makes deliberately. The arithmetic is cross-checked against the real `changeset version` over a throwaway copy of the checkout, so the check cannot drift from the tool it describes.

  `scripts/api-surface.ts` writes down what `dist/index.d.ts` exports, one entry per name with its kind, its printed type and its members, and compares a fresh build against the committed inventory. Nothing else in this repository fails when an export leaves the bundle, changes shape or arrives unannounced. It never rewrites its own baseline on a mismatch, because a check that heals itself always passes and therefore measures nothing, and it never reports an empty surface as a match: absent, empty or export-less declarations are a missing input, not a verdict, which is the same window `scripts/attw.mjs` was built to refuse.

  The contributor guidance no longer instructs patch-only changesets. A change that adds behaviour takes a `minor` and a change that corrects behaviour takes a `patch`.

- 94f0b83: Parser: an order-ambiguous slash date is now refused instead of read as US-order.

  `BUILTIN_DATE_FALLBACKS` carries `MM/DD/YYYY` and not `DD/MM/YYYY`, so a day-first sender's `05/07/1988` in MSH-7 parsed as May 7 1988. It did not fail, it warned only with the generic `TIMESTAMP_FALLBACK_FORMAT`, and the value it produced was a plausible, wrong calendar date. In a library whose messages carry clinical content, a confident wrong date is the failure nobody notices.

  When no declared format has matched, a slash-separated numeric date whose first two components are both in 1-12 now resolves to nothing. `msg.meta.timestamp` comes back `valid: false` with an `ambiguity` report on it: `code: AMBIGUOUS_DATE_ORDER`, the raw value, and both candidate readings as `{ format, month, day, isoDate }`, so a consumer can see exactly what was declined and what to declare. That is a stable identifier of its own, distinct from `TIMESTAMP_FALLBACK_FORMAT`, so "ambiguous, refused" is now distinguishable from "malformed" (no timestamp at all) and from "resolved via a fallback" (`valid: true` with a `matchedFormat`).

  **Migration, one line.** If you relied on the previous US-order default, declare it: `parseHL7(raw, { dateFormats: ["MM/DD/YYYY"] })`, or add it to your profile's `dateFormats`. A day-first feed declares `["DD/MM/YYYY"]` and gets 5 July. Declared formats are tried ahead of the built-ins, resolve the value, keep the existing `TIMESTAMP_FALLBACK_FORMAT` semantics, and never report ambiguity; options precede profile in the merged order, so an over-complete declaration listing both orders resolves deterministically on the first.

  Only genuinely two-way values are refused, and the change is narrow by construction. `07/25/1988` has one reading (there is no month 25) and still resolves as July 25. `05/05/1988` has two readings that agree and still resolves. Strict HL7 timestamps, ISO-8601 values and `YYYY-MM-DD` values are untouched, with the same precision, timezone fidelity and `matchedFormat` as before. A value illegal under both readings, such as `13/13/1988`, still reports no timestamp and reports no ambiguity: malformed and ambiguous are different facts and are not conflated. An empty MSH-7 behaves exactly as it did.

  Two things deliberately did not change. `DD/MM/YYYY` was **not** added to the built-in fallback list: it is consulted only as a probe for the second reading and never resolves a value, so an unambiguous day-first value such as `25/07/1988` still fails loudly rather than newly parsing, and the accepted-input set is not widened. And no warning code was added or renamed: `Hl7Message.warnings` is frozen at construction while `msg.meta` is built lazily afterwards, so a warning raised there could never reach a consumer, and the report travels on the timestamp value instead.

- 60bdef6: Docs: the README no longer advertises shipped capability as future work.

  The roadmap section listed three items as not yet available that the package already exports: incremental parsing of batch files too large to buffer, JSON Schema and Zod emission for what `toJSON()` returns, and profile-declared field names carried into the type system. It also named `createHL7Stream()`, a symbol this package has never exported, when the shipped streaming parser is `parseStream`. The status section repeated the same claims and told the reader that nothing on that list was exported yet, so the front page a consumer reads on npm and on GitHub described three available features as unavailable and pointed at an entry point that does not exist.

  The roadmap now records an empty forward list and says where each of those capabilities is documented, and the status section states that they ship and are covered by its stability claim. The permanently out-of-scope list is unchanged, and no behaviour, export or type changed.

- f045b27: Tooling: the PHI scanner now refuses over a file it listed and never opened, instead of reporting on the ones it did.

  `scripts/phi-scan.ts` counted a run as clean once every target it actually read came back clean. A target that left the read set was simply gone from the reckoning. Measured against the previous release, in a throwaway repository laid out like this one, with the bypassed path logged in `phi-scan-overrides.md` exactly as the rejection gate instructs: naming a violator and a second file, and withdrawing the second with `--allow-fixture`, exited 1 naming only the violator. So the same command line over a corpus whose only violator is the withdrawn file exited 0 and printed "OK: no hits", byte-identical on standard output and exit code to a genuine clean run over the same tree, with one of the two declared files never opened.

  A target this run enumerated and never read now refuses at exit 2, in every mode, naming the paths. It is a set difference between what the enumerating routes declared and what was actually read, never a size comparison: a count counts the files that were read, which is exactly the arithmetic that hides which ones were not, and it still would not say which. Both halves of the full sweep declare into the same set, so the accounting stays exact if either route's scope changes; today a whole-file bypass is the only thing that can leave a target unread, because every other way of failing to read one already refused.

  A second, related state is closed with it. A bypass naming a path the run does not enumerate subtracts nothing, so it was accepted, its audit entry was checked, and it was then ignored: naming one clean file and bypassing a second file whose invented name tokens the scanner detects exited 0 with "OK: no hits", having never opened the named file at all. That now refuses at exit 2 too.

  What it costs, decided rather than stumbled into: a whole-file `--allow-fixture` bypass can no longer reach exit 0 in any mode. The flag, its bypass log and its rejection gate all stay, and they still demand a committed audit entry naming the path; the run now ends in a refusal that names the file instead of a green line that does not. The remedy that reaches a clean run is `scripts/phi-allow-list.txt`, a token-level declaration reviewed per value that leaves the file read, and the bypass log already told developers to prefer it. The hit report no longer offers the flag as a remedy, because following that advice walked a developer from exit 1 into exit 2.

  That remedy does not cover every hit, and the report now says so rather than sending developers to a file that cannot help them. The allow-list declares names, dates of birth, addresses, identifiers and email domains. A dashed Social Security number and a phone outside the 555 fake-exchange convention are matched by detectors that consult no declaration at all, so for those two, with the file still in scope, the value itself has to change. The bypass used to clear them, so this is a real narrowing and is recorded as one.

  One carve-out, named rather than left to be discovered: an untracked file the sweep listed and that is gone from disk by the time it is read has no bytes to read. That stays a reported skip at exit 0, the behaviour the enumeration race already had, and it cannot be used to smuggle a bypass past the rule, because the tolerance exists only in the full sweep and a bypass always puts the run in another mode. A tracked file, and any failure that is not a missing file, still refuse.

- dfac162: Segment names are matched without regard to case, so a sender shipping `pid` or `obx` no longer loses the segment.

  Segment lookup was case-sensitive, and nothing normalized a segment name. A message whose PID arrived as `pid` or `Pid` returned `undefined` from `msg.patient`; a message whose OBX arrived as `obx` returned `[]` from `observations()`, so a haemoglobin of 7.1 g/dL flagged `L` was absent from a parsed result feed. Both cases warned, but the warning said the segment was `UNKNOWN_SEGMENT`: "not in HL7 spec and no profile claim". `PID` and `OBX` are in the standard, so the one diagnostic a reader had pointed away from the cause. The data was still reachable through `allSegments()`, so nothing was lost from the parse itself, but every typed accessor above it read the message as if the segment were not there.

  A segment name on the wire is now folded to its canonical uppercase spelling for every lookup that asks which segment it is: `msg.segments()` and `getAll()`, the dot-path resolver, `msg.patient`, `observations()`, `medications()`, `notes()`, `appointments()`, `msg.structure`, profile claims on custom Z-segments, and the `setField` / `setComposite` / `removeSegment` writes, so a write targets the segment a read found. `SEGMENT_CASE` reports the deviation, which is what that code was reserved for and it had no emit site until now. `UNKNOWN_SEGMENT` still fires for a name no folding can recognise, and now says the comparison ignored case. The two are mutually exclusive: `SEGMENT_CASE` claims a segment resolved, so it is never reported for a name that resolved to nothing.

  Both the wire spelling and the `segments()` / `getAll()` query are folded, so **neither spelling stops working**. This matters for anyone already on a lowercase feed: because `Segment.type` used to carry the wire spelling verbatim, `msg.segments("obx")` was the call that returned the segment and `msg.segments("OBX")` was the one that returned nothing, so a consumer will have written the sender's spelling as a workaround. Both now return it. The dot-path keeps its uppercase-only **query** contract: `msg.get("obx.5")` still raises a `TypeError`, as it always has. What it resolves did change, which is the point: `msg.get("OBX.5")` now reaches a segment the sender spelled `obx`, where it used to return nothing.

  The fold is **ASCII-only**, and that is the load-bearing part rather than an implementation detail. Uppercasing by the Unicode rules turns a dotless Turkish `ı` into `I`, so `pıd` would become `PID` and the demographics of a segment the sender never sent would read as a real patient. Only `a`-`z` are mapped, so a lookalike stays unrecognised and reports `UNKNOWN_SEGMENT`, which is the honest answer.

  The spelling that arrived is preserved, not corrected: it stays on `RawSegment.name` and is what `toString()` re-emits, so the byte-exact round-trip is unchanged. `Segment.type` now reports the canonical spelling, since that is the field every lookup compares and the field a consumer switches on; read `Segment.raw.name` for what the sender actually sent.

  Strict mode accepts nothing it rejected before. Every input that threw still throws: a known segment that is merely miscased throws `SEGMENT_CASE`, and an unrecognised segment still throws `UNKNOWN_SEGMENT`, the code it always threw. A lowercase `msh` remains the `NO_MSH_SEGMENT` fatal, deliberately: MSH is what delimiter discovery reads before any segment name exists to fold, so widening it would change what counts as a message at all.

  One input strict now **rejects** that it accepted before: a hand-rolled profile object keyed with a lowercase `customSegments` name, parsed against a matching lowercase segment. It claimed the segment then and still does, so the parsed result and the profile claim are unchanged; the lenient parse gains one `SEGMENT_CASE` warning, which is what strict promotes to a throw.

- 0ebfd0b: Docs: the published bundle now documents every warning and fatal code, and a repository command proves the bundle's shape on every change.

  `docs-content/troubleshooting.md` told a reader that the 20 warning codes were a public, versioned contract and pointed at Core Concepts "for what each one means". No page carried that reference, and seven of the 20 keys of `WARNING_CODES` appeared nowhere in the bundle at all: `MLLP_FRAMING_STRIPPED`, `FIELD_WHITESPACE_TRIMMED`, `EXTRA_FIELDS`, `DUPLICATE_REQUIRED_SEGMENT`, `MISSING_REQUIRED_FIELD`, `OUT_OF_ORDER_SEGMENT` and `ACK_NO_CORRELATION_ID`. So the site promised a reference for a versioned contract and did not carry it. A new page, "Warning and fatal codes", now lists all 20 `WARNING_CODES` keys and all 4 `FATAL_CODES` keys with a description of each, and the troubleshooting sentence points there.

  Page metadata is uniform. Every one of the 23 pages carries `id`, `title`, `sidebar_label` and a `description` of at most 160 characters, so the site has a per-page summary to render and to hand to a search index. `benchmarks.md` carried no frontmatter at all and now does; six pages gained a `sidebar_label`; five carried a `sidebar_position` that this site never consults, because the bundle ships an explicit `sidebars.json`, and those are gone. Internal links were written two ways, `./page.md` on 15 and `./page` on 7; all 22 are now the `.md` form.

  `pnpm check:docs` is the new gate, wired into a pull-request workflow. It refuses a missing or unparseable frontmatter block, an `id` that disagrees with its filename, an over-long or empty `description`, a stray `sidebar_position`, a sidebar id with no page, a page no sidebar reaches, an internal link that is extensionless or dangling, a code in the source registries and not on the reference page, a code on the page that no registry defines, and a code listed without prose beside it. It also refuses to report a clean result it did not measure: an empty `docs-content/`, an absent `sidebars.json` and a file it enumerated but could not read are all failures rather than passes.

  It carries a sample-data floor that nothing else in this repo covers. `pnpm phi-scan` deliberately does not read markdown, and `docs-content/` is published to the documentation site and shipped in the release tarball, so a sample value on one of these pages had no gate in front of it. Any line shaped like an HL7 segment is now refused if it carries a nine-digit dashed identifier, a telephone number whose exchange digits are not `555`, or an email address outside `example.com` and `example.org`.

  No parser behaviour changes here. The code registries are read, never modified; `pnpm pack:docs` keeps its existing contract and still refuses without `intro.md` and `sidebars.json`.

- ea5b9c6: Tooling: the PHI scanner's full sweep now reads the bytes git carries, not only the working tree.

  `pnpm phi-scan` with no arguments walked three declared directories on disk and reported on what it found there. Reconciling that against the paths git tracks is satisfied by decoy content: a directory that mirrors the tracked names over clean files leaves every root yielding and the committed corpus unopened, and it printed "OK: no hits" at exit 0. The sweep now also reads every path in the git index, as a union with the walk, so a clean result is one that was measured rather than assumed.

  Eight states that reported clean at exit 0 are closed, each measured against the previous release and each pinned by a test: a walk root swapped for a decoy directory; one file replaced by a clean decoy; a message under an undeclared top-level directory; a tracked file absent from the working tree; PHI behind a walk root that is itself a symlink; a tracked symbolic link or gitlink outside every walk root; an unmerged index entry; and an empty index, which used to satisfy every check vacuously.

  It also reads directories nobody declared. The runnable example messages under `examples/data/` had never been scanned by either route; two of them carried a date of birth, a street address and person-name tokens that were in no allow-list, and those tokens are declared in the allow-list now. A new directory's committed bytes are in scope from the moment git tracks something in it. For a file that is not itself a message, that buys the dashed-SSN and non-test-email floor and nothing else.

  Unchanged deliberately: the pre-commit route keeps its own scope, because what it enumerates decides what a commit is blocked on; and the per-root observation rule stays a statement about the walk, so a directory emptied on disk still refuses. The residual is written down rather than implied: working-tree bytes at a path outside every walk root are read by neither route, tracked or not, so a tracked file out there with unstaged edits is judged on its staged bytes. The gate remains detective rather than preventive on every route: it guarantees PHI is never carried silently, not that it never touched the disk.

## 0.0.10

### Patch Changes

- 68898a3: The README lockup now links to cosyte.com (`ASSETS`).

  The `<picture>` block above the H1 is wrapped in an anchor to https://cosyte.com, per the founder
  requirement of 2026-08-06. Nothing inside the block moved: the `<source>`, the `<img>`, the alt text
  and both tile URLs are byte-identical.

  What the anchor does was measured on both surfaces by `fhir`, not assumed, because fourteen READMEs
  carry this shape. On GitHub the anchor works and the colour-scheme switch keeps working, because the
  `<img>` stays a direct child of `<picture>`, which is the condition the HTML spec puts on `<source>`
  applying at all. On an npm package page the anchor is lost: npm wraps a README image in its own
  anchor to the image file, a nested anchor is not representable, so the parser closes ours early and
  the image ends up linked to the image file rather than to cosyte.com. Shipped anyway by founder
  decision of 2026-08-07: on npm that is no worse than the unlinked lockup it replaces, and GitHub is
  where these READMEs are read.

## 0.0.9

### Patch Changes

- 3ac0c28: `CHANGELOG.md`, which ships inside the tarball, is now written by the release instead of by hand, so it stops describing already-published code as unreleased.

  `.changeset/config.json` set `"changelog": false`, so no release ever wrote a version heading
  into `CHANGELOG.md` and nothing ever rolled `[Unreleased]` over. Every published version of this
  package therefore carried a changelog with **no version headings at all**: one `[Unreleased]`
  heading over the whole history, and a preamble stating that the first pre-alpha release "will
  ship" the API surface listed below it, in a tarball that had shipped that surface several
  versions earlier. `CHANGELOG.md` is listed in `package.json` `files`, so this was text on the
  disk of everyone who installed the package, not internal bookkeeping.

  **The flag is what changed, not the prose.** Correcting the sentence by hand would have left the
  mechanism that wrote it, and the next release would have drifted the same way. `changelog` now
  names the generator that ships with Changesets, so a release writes its own version heading and
  its own entry from the changesets it consumed, and **the changeset summary is now the changelog
  entry**. Nothing new is depended on: the generator is an entry point of `@changesets/cli`, which
  was already a dev dependency.

  **The file's shape changed with it, deliberately.** Changesets prepends a release by replacing
  the first newline in the file, so exactly one line can sit above generated output. The
  hand-written preamble sat on line 3, which means a release would have inserted itself between the
  heading and the preamble and split the header in two. The hand-maintained history has therefore
  moved under a `## Released before this file was generated` heading, with the false preamble
  replaced by an accurate one. Three pieces of hand-workflow scaffolding were dropped and no entry
  was reworded: the `[Unreleased]` heading, its link definition at the foot of the file, and the
  five empty section stubs waiting for the next hand-written entry. The history itself is left as
  it was written rather than re-sorted into version sections, because the file never recorded which
  release each entry went out in and the text is already on disk in published copies.

  Pinned by `test/scripts/changelog-generation.test.ts`, which runs the real `changeset version`
  against the real `CHANGELOG.md` and the real config in a throwaway package rather than
  reimplementing where the tool inserts text. Eight of its ten cases are red against the previous
  state, measured on the tree this change was written against rather than recalled. **The rule it enforces is that nothing but the H1 sits above the first heading, and it is
  asserted on the released document as well as the committed one**: a rule phrased as "the archive
  heading comes second" holds only until the first release writes its own version heading there,
  which would have redded the first Version PR this configuration ever opened. The archived history
  is asserted byte identical across a release, so the run exercises this repo's own Prettier rather
  than the one Changesets bundles as a fallback. Two further controls: the same inputs with
  `"changelog": false` must write no version heading at all, so the flag is proved load-bearing
  rather than incidental; and the old file shape must reproduce the split header, so the rule is
  demonstrated rather than asserted.

  One upstream behaviour is worth knowing before debugging a release, and is recorded in that
  file: Changesets wraps the changelog write in a try/catch that only warns. A tree whose declared
  Prettier config cannot be resolved bumps the version, consumes the changeset, and writes no
  changelog at all. Reproduced here on this repo's inputs. A release that publishes with an
  unchanged changelog is that failure, not a setting that quietly reverted.

  `CONTRIBUTING.md` and `.changeset/README.md` said to add the entry to `CHANGELOG.md` by hand and
  now say to write it in the changeset. No runtime code, no public API, no warning code and no
  parse behaviour changed.

- d8d3be3: Repository PHI commit-gate only, with no runtime impact: the gate no longer reports a clean sweep over a scan root it never opened, where an absent or dangling `test/fixtures` used to print `OK: no hits` and exit 0 on the strength of `src/` alone.

  `pnpm phi-scan` with no arguments is what CI runs. It walks two roots, `test/fixtures` and `src`,
  and refused a sweep only when it had read **zero files in total**. That global rule is satisfied by
  any one surviving file, so a single `src/` module vouched for the entire fixture corpus, and one
  fixture vouched for the whole of `src`.

  Reproduced before the fix, on this checkout, three ways, each printing `[phi-scan] OK: no hits` and
  exiting **0**: with `test/fixtures` moved aside, with `test/fixtures` replaced by a **dangling
  symlink**, and with `src` moved aside. The first two leave all 106 non-markdown fixtures unread;
  the third leaves all 95 source files unread.

  **The dangling case is the sharpest, and nothing else in the scanner can see it.** `existsSync`
  **follows** the link and answers false, so `walk()` returns before `readdirSync` and the
  not-a-regular-file refusal never fires. That rule only ever classifies entries found INSIDE a root,
  and this is the root itself, so absent, dangling and empty are one state to the walk. This reporter
  prints no file count either, so unlike the sibling this remedy was ported from there was not even a
  suspicious denominator to notice.

  **The rule is now per-root.** All-mode refuses (exit 2) unless every declared root yielded at least
  one file that was actually READ, and the refusal names the starved roots. Observing nothing at all
  is the all-starved case of that one rule rather than a second rule beside it, so the existing
  wording carries. Hits found under the roots that DID yield are printed before the refusal, so an
  incomplete sweep never swallows a real finding, and the exit code is still 2 regardless.

  **Deliberately unchanged, and pinned:** `--staged` and named-path mode make no per-root promise,
  because neither enumerates a root. `--staged` legitimately has nothing to scan when a commit
  touches only markdown, and named-path mode is bounded by the caller's argv. Widening the rule to
  either was run as a mutation rather than argued: widening it to `--staged` reds 7 cases, and
  dropping the mode guard altogether reds 29.

  **The granularity is the declared root and nothing finer**, which is a real bound and is recorded
  rather than glossed. Three states still exit 0, each measured with the rule in place, each now in
  the scanner's limits list with the command that produced it, and each pinned by a characterization
  test so a change that closed one would have to say so: a directory missing from INSIDE a root
  (`mv test/fixtures/canonical ..` still prints `OK: no hits` with 27 fixtures unread); a root that
  is ITSELF a symlink, which is followed, so the rule is satisfied by whatever is on the other side
  of it; and the rule is a floor of ONE file, whatever the root used to hold.

  One shape often listed beside those is NOT open here, and it is written down so it is not ported in
  from elsewhere as though it were: a root that is a regular file, or a link to one, refuses at exit
  **2**, not the **1** this gate reserves for hits. `walk()` already wraps `readdirSync` and rethrows
  the `ENOTDIR` as an invocation error on the scanner's own channel, and an existing test pins it.

  Twelve tests added, on a throwaway repository so no starved root, no dangling link and no violator
  is ever written into the committed corpus. Five are red against the superseded global rule; the
  all-starved case is green on both, because it asserts the new rule SUBSUMES the old one rather than
  sitting beside it; three assert the rule did not widen; three are characterizations of the limits
  above. The scratch-repo helper now seeds both walk roots, which is load-bearing rather than
  tidiness: with an empty `test/fixtures` every case built on it would refuse before reaching what it
  meant to assert.

- be842bd: Repository PHI commit-gate only, with no runtime impact: the gate now reads tracked files directly under `test/`, reads an inline `PID|...` literal in hand-written source with the same field map a `.hl7` fixture gets, and no longer drops to a shape-only pass over a blob staged at exactly a scan root.

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

## Released before this file was generated

Every release section above this heading is written by
[Changesets](https://github.com/changesets/changesets) from the changesets in `.changeset/`, newest
release first. The release writes its own version heading, so nothing above this line is maintained
by hand, and a change is recorded by adding a changeset rather than by editing this file.

Everything below this heading was maintained by hand. It sat under a single `[Unreleased]` heading
that no release ever rolled over, which is why it went on describing already-shipped code as
unreleased, inside the published tarball, for as long as it did. It is left as it was written
rather than re-sorted into version sections: the file never recorded which release each entry went
out in, and this is the text that installed copies already carry on disk. Only three things were
dropped, all of them scaffolding for the hand-written workflow that no longer runs: the
`[Unreleased]` heading itself, its link definition at the foot of the file, and the five empty
section stubs that existed to receive the next hand-written entry. No entry was reworded.

The entries below follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the generated
sections above use the format Changesets writes, which is a version heading and a list of the
changes that release consumed. Versions follow the cosyte pre-alpha ladder, `0.0.x` until first
alpha, rather than [Semantic Versioning](https://semver.org/spec/v2.0.0.html) alone. An earlier
`0.1.0` tag was prepared but never published, which is why the public history begins at `0.0.x`.

### Added

- **The cosyte brand banner heads `README.md` (`ASSETS-P8`, the consuming half).** A plain markdown
  image on the first line of the file, above the H1, pointing at the absolute HTTPS URL published
  for `hl7` in the `assets` repo's `published-urls.json` contract
  (`https://cosyte.com/social/cosyte-banner-hl7-1200x300.png`, `status: live` on
  `website#59 01f988b`). Re-verified `200 image/png`, 18316 bytes, immediately before the push.

  **The shape is deliberate, and `hl7` sets it for the other thirteen consuming READMEs.** It is a
  markdown image, **not `<img>` and not `<picture>`**: whether npm's markdown sanitizer preserves a
  `<picture>` element is unverified, which is precisely why the banner artwork is self-grounded
  (opaque ground, correct against a light or dark page) and depends on no such element. A markdown
  image with an absolute HTTPS URL is the construct we are willing to assert renders on both npm and
  GitHub, so it carries no width or height attributes either. **PNG only** is a bounded policy (the
  format we assert renders on every README surface), not a demonstrated impossibility for others.
  The **alt text is content, not decoration**: it names the package and its one-line purpose,
  because it is what a screen reader on the npm page reads out, so "banner", "logo", or the file
  name would all be a wasted line.

  **SUPERSEDED on 2026-07-31 by `1aee04b`, which replaced this banner with the shared Cosyte lockup
  in a `<picture>` block.** The two paragraphs above are left exactly as they shipped rather than
  corrected, because they were true of the tree and right on the evidence available when they were
  written, and they record a real state the package passed through. This note says what changed
  under them. It shipped verbatim inside the `@cosyte/hl7@0.0.4` tarball, so it is text a consumer
  already has on disk.

  **The claim the new evidence overturns is the second one: "whether npm's markdown sanitizer
  preserves a `<picture>` element is unverified".** That is measured now. The first claim, that the
  banner is a markdown image and "not `<img>` and not `<picture>`", was a consequence of the second
  rather than an independent choice, so it went when its premise did; it is no longer true of the
  tree either way, since `README.md` now opens with a `<picture>`. What was measured: **GitHub
  honours the `prefers-color-scheme` switch**, verified on `@cosyte/astm` in dark mode, where the
  rendered image's `currentSrc` resolves to the on-dark tile and its parent element is `PICTURE`.
  **On the npm package page the `<img>` is hoisted out of its `<picture>` by the anchor wrapper**,
  so the inner fallback renders rather than the element being stripped or broken; and **npmjs.com
  has no dark mode** (founder-confirmed), so the light cut is the correct image there regardless.
  The GitHub and npm measurements above were taken on `astm` and reported into this repo rather
  than re-taken here; what was re-checked directly for `hl7` was that both tile URLs return
  `200 image/png`. **PNG only** and **alt text is content, not decoration** are both unchanged and
  still hold; only the element choice and its stated premise moved.

- **The published JSDoc is swept, and `src/` doc comments are gated
  (`pnpm check:no-internal-refs` third pass; `PUBLIC-SURFACE-HYGIENE`).** Doc comments compile
  into `dist/index.d.ts` and `dist/index.d.cts`, `dist` is the first entry in `files`, and every
  `npm i @cosyte/hl7` receives them, so what a consumer's editor renders on hover is public
  surface and the founder directive of 2026-07-27 applies to it. Re-measured with the shipped
  rules before the change: **293 distinct lines** across tracked `src/*.ts` (253 phase-rule, 39
  identifier-rule, 5 ADR, 1 jargon, 1 traceability marker), of which a local build carried
  **164 distinct lines into `dist/index.d.ts`** (137 phase-rule, 22 identifier-rule, 5 ADR,
  1 jargon, 1 traceability). After: **0 on every rule, in `src/` doc comments and in both built
  declaration files.** A consumer hovering `parseHL7`, `defineProfile`, `Medication` or
  `buildMessage` no longer reads which internal phase built it. Every `Plan N` build-order
  reference was swept in the same pass, by hand, and **the built declaration file now carries
  none**: no rule catches them, and they contradicted the `CLAUDE.md` sentence this change adds.
  For scale, the base commit's build carried 28 such lines, from 61 doc-comment lines in `src/`.

  **Identifiers were translated, never deleted, and no public export lost its documentation.**
  That is measured, not asserted: the built `dist/index.d.ts` carries **691 doc-comment blocks,
  633 documented declarations and 237 `@example` blocks before and after, and the sorted list of
  documented declaration names is byte-identical.** Heads left behind by a front-of-line strip
  were repaired: nine composite parsers wrapped `HL7-VALUE-REDECODE)` onto a continuation line,
  where a naive strip leaves `). Absent / empty components are OMITTED`.

  **Stripping the framing exposed a false claim on a published API, which is the argument for
  doing this at all.** `defineProfile`'s doc block in `dist/index.d.ts` told consumers that
  `opts.extends` was "ACCEPTED but IGNORED, resulting in `lineage === [opts.name]` regardless".
  The implementation merges parents (lineage, `dateFormats`, `customSegments`, `description`,
  composed `onWarning`) and re-validates the merged result. The text now describes what the
  function does. Four sibling claims of the same kind were also stale and are gone: `emitMessage`,
  `emitPrettyPrint`, `emitJson` and `buildMessage` were each documented as an unimplemented stub
  ("Stub throws", "Implementation lives in..."), and all four have been implemented for some time.
  Internal framing is where stale claims hide, which is why this is a correctness change and not
  a tidying one.

  **The gate now has a third pass** with its own rule array, its own extractor and its own
  positive/negative self-tests written in the language of source rather than markdown. It scans
  `/** */` text only, line by line and again over the block reflowed the way a hover tooltip
  reflows it, because multi-token rules are blind to a violation that straddles a wrap and this
  package wraps its doc comments. `//` and `/* */` comments are deliberately **not** covered and
  keep their identifiers: they do not reach `dist` (checked both directions), and the convention
  names source comments as a place identifiers belong. 61 such lines remain in `src/` by choice.

  Every claim above was checked RED against a seeded violation rather than assumed: a single-line
  violation in an exported function's JSDoc; a violation split across a wrap that a line-only
  grep scores 0 on; the same bookkeeping in a `//` comment staying green; widening the source
  identifier rule to the `WORD-N` shape failing its own negative self-test naming `MSH-2`; an
  extractor that strips the comment leader before testing the terminator reporting 66 false hits
  on a clean tree; and an extractor that yields nothing refusing to report green.

  **The ceiling is stated rather than implied shut, and "0 on all six rules" is a statement about
  these rules, not about the founder's rule.** Measured on the built `dist/index.d.ts`, what still
  ships is **144 lines carrying `D-NN` internal decision numbers** and **51 lines carrying item
  identifiers from nine prefixes the list does not hold** (`HELPERS` 14, `BIP` 15, `PROF` 8,
  `SER` 6, `MODEL` 4, `PARSE`, `WR`, `TOL`, `TYPES` 1 each). `D-NN` is the deliberate
  non-catch it has always been, because legacy SNOMED RT codes are axis-prefixed in exactly that
  shape (`D-13000`, `T-32000`, `M-80003`). The item identifiers need new prefixes added to the
  list, which is a **rule** change needing its own negative self-tests (`SER`, `WR`, `TOL` and
  `BIP` are exactly the short generic tokens that made `PKG` unsafe), so it is not smuggled in on
  the back of a prose sweep. Separately, `dist/` is untracked build output, so no checked-in gate
  can read it: this gates dist's _source_, which holds only because the dts build copies doc text
  verbatim, and the `164` figure is a hand-taken snapshot. Two "the per-X slice of Y" false
  positives, where `slice` means portion, were fixed by rewording rather than by narrowing the
  rule.

  Documentation, tooling and CI only. No change to the published package surface, parser
  behavior, or warning codes.

- **Public-surface hygiene gate in CI (`scripts/check-no-internal-refs.sh`,
  `pnpm check:no-internal-refs`, `.github/workflows/no-internal-refs.yml`;
  `PUBLIC-SURFACE-HYGIENE`).** Founder directive of 2026-07-27: no internal project bookkeeping on
  any surface a consumer reads. The remediation half of that directive was a sweep of 149 references
  across 11 repos, and a sweep regresses the first time someone writes `(CCDA-P8)` into a README, so
  the deliverable here is the gate; the sweep rides along. **50 violating lines across 15
  `docs-content/` pages were cleared** (re-measured with the shipped rules against the previous tree;
  the backlog's count of 44 was markdown-only and predates two of the rules): phase identifiers in
  page titles and headings, `HL7-N` / `HL7-J` / `HL7-ESC` / `HL7-R` / `VERIFY-AT-BUILD` item
  identifiers, a citation of `operations/roadmaps/hl7.md`, bracketed spec-trace tags (`[S-NTE]`,
  `[S-DTM-IMPL]`), an "Open-question #12", and review-process commentary ("All confirmed 3-0
  (pass 5)", "all verified 3-0 in the research pass", "Assumption logged"). One more, in `README.md`,
  was fixed by hand and is caught by no rule: a pointer to "the roadmap's known-limitations", a file
  the reader does not have. Identifiers were translated at the boundary, not merely deleted, and
  every head left behind by a front-of-line strip was repaired: a heading cut to `: datetime
precision` reads worse than the text it replaced. The datetime page needed more than a strip: with
  its phase framing gone it read as documentation of shipped behaviour while still describing, in the
  present tense, a `parseHl7TsDtm` zero-fill defect that no longer exists in the library (the API it
  planned has shipped). It is now written as what the package does, its unexecuted plan and test
  bookkeeping are gone, and a provenance claim that survived the strip in a stronger form than the
  original ("all verified against primary Ch. 2A") is removed rather than reworded. The detection
  rules are lifted
  from `cosyte/.github` `scripts/release-notes.mjs`, which is already tested byte-for-byte against
  the 14 published release bodies, and they are **keyed on known project prefixes, never on the
  `WORD-N` shape**: `MSH-2`, `PID-3`, `OBX-5`, `TQ1-7`, `NM1-03`, `PKG-4`, `ICD-10-CM`, `HL7-V2`,
  `FHIR-R4`, `DICOM-SR`, `NCPDP-SCRIPT`, `FHIR-bridge`, `HL7-defined` and the four `CSP`
  Clinical Study **Phase** field names are the reference material an HL7 parser's docs exist to
  provide, and a shape rule deletes them. That is asserted, not assumed: the script carries a
  **negative** self-test per rule, built from that material, alongside the positive one, so widening
  a rule into the `WORD-N` shape reds the gate instead of silently corrupting a segment reference on
  the next sweep. Where a rule could not be guarded it was **cut** instead: `phase` after a
  determiner ("the non-goals of this phase") is not detected at all, because catching it also caught
  "the phase of the clinical study" and "the phase of illness", and when the collision is
  with clinical reference material the reference material wins. The scan harness is the em-dash gate's,
  in mllp's variant: scan list built and `./`-prefixed in one loop so the scan stays a single command
  with stderr bound to all of it, no `sed -z`, no `-d skip`, no `-I`, `-e`/`--`, `-0 -r`, and a
  refusal to print OK from an empty list, an unreadable input, a non-regular-file entry, or any
  scanner stderr. Every one of those routes was checked RED against a seeded violation rather than
  inherited. **Every rule is also applied a second time to paragraph-joined text**, because the rules
  are multi-token and this repo hard-wraps markdown: a violation straddling a wrap was invisible to a
  line scan and one was live (`A future phase` / `may add opt-in decode`, with the gate printing OK).
  The join squeezes whitespace the way markdown does, which is load-bearing rather than cosmetic: a
  verbatim join leaves the continuation line's indentation in place, and about 600 lines of
  `docs-content/` start indented, so the pass would have missed the dominant wrap shape while
  reporting that it ran.
  It scans the public surface only (`README.md`, `TRADEMARKS.md`, `LICENSE`, `docs-content/`, and the
  npm `description` and `keywords`) because the same identifier is required on the inside:
  `CHANGELOG.md`, `.changeset/`, commits and PRs are where it belongs. A tripwire refuses the run if
  `package.json`'s `files` starts shipping anything the gate does not cover. **Three holes are measured and disclosed rather than implied
  shut:** `dist/` ships the compiled JSDoc, and the tracked `src/*.ts` files carry 253 phase-rule and
  39 identifier-rule lines, of which a local build puts 137 and 22 into `dist/index.d.ts` for every
  consumer's editor to render, unswept and ungated here because remediating ~290 source doc comments
  is its own reviewable change (**that change is the entry above, which swept them and added the
  third pass**; `dist/` is untracked, so no checked-in gate can re-derive that figure without
  building first, and that part is still true); determiner-plus-`phase` is not detected, by choice;
  and the rules catch identifiers, not English sentences about our process. Documentation and CI only: no change to the
  published package surface, parser behavior, or warning codes.
- **Em-dash brand gate in CI (`scripts/check-no-emdash.sh`, `pnpm check:no-emdash`,
  `.github/workflows/no-emdash.yml`; `EMDASH-CONFORMANCE` part 1).** The founder directive of
  2026-07-24 (`knowledgebase/06-brand/voice-and-tone.md`) bans `U+2014` outright across every cosyte
  surface and names commit messages explicitly, and the meta-repo's `documentation/conventions.md`
  has described the rule as CI-gated; it was in fact gated in only 3 repos of 10. This ports
  `knowledgebase`'s scanner (the text-only variant, correct here because hl7 tracks no binaries:
  all 414 tracked files read as us-ascii or utf-8 and none holds a NUL byte) and wires it to a
  dedicated workflow that checks **both** the tracked files and the **PR title, body, and branch
  commit messages**, the last of these on the non-default `edited` activity type so a description
  retitled after the final push is re-checked before a squash merge turns it into the commit
  message. It is a separate workflow rather than a job in `ci.yml` because `ci.yml`'s triggers drive
  the Node 22 + 24 matrix plus the examples and starter-kit `extras` job, which should not re-run on
  every PR-description edit. Within the bytes it is designed to match, the scanner refuses to report
  green from a scan it could not complete: it pins `LC_ALL=C.UTF-8` (without it GNU grep 3.8 aborts
  on `\x{2014}` and a naive port prints OK having matched nothing), self-tests against a known em
  dash before believing a clean result, fails on any scanner stderr, and refuses an empty file list.
  Two limits are documented in the script rather than engineered away: it excludes itself (it has to
  name the encodings it bans), and it matches `U+2014` as UTF-8 plus five textual encodings, so an em
  dash in a legacy-charset fixture (CP1252 `0x97`, UTF-16) scans clean and is a reviewer's job, not
  the gate's. **No content changed**: hl7 was already
  clean (0 of 53 markdown files), so this is regression prevention only. Dev-tooling only: no change
  to the published package surface, parser behavior, or warning codes.
- **Performance / throughput bar: reproducible benchmark suite + a ratio-based perf-regression guard
  (HL7-W, Phase W, sixth and final phase of the v2.4 capability arc; completes it).** `pnpm bench`
  (`scripts/bench.ts`) measures parse **throughput** (msgs/sec + MB/sec across a small ADT^A01 and a
  larger multi-OBX ORU^R01), **per-message retained memory**, and the **streaming peak memory** that
  substantiates `parseStream`'s O(one-message) claim, over synthetic in-process inputs (no PHI, no
  fixtures). Indicative numbers are published in `docs-content/benchmarks.md`. A CI-gating
  perf-regression guard (`test/perf/perf-regression.test.ts`) fails on a regression while staying
  non-flaky across runners: every assertion is **relative**, not an absolute floor: throughput
  **linearity by message count** (`t(4N)/t(N) ≤ 10`, min-of-runs; catches super-linear-in-count),
  **linearity by message size** (`t(4S)/t(S) ≤ 10`; catches an O(n²)-in-length tokenizer regression),
  and streaming **read-ahead ≤ 2** (a pure count, the O(one-message) memory invariant as a perf gate,
  which trips if `parseStream` ever buffers the file); one coarse absolute liveness floor (~100× below
  real throughput) trips only on a catastrophic hang. Absolute memory numbers are published from the
  benchmark (which forces GC via `--expose-gc`); the gate deliberately avoids un-GC'd `heapUsed` deltas.
  **No behavior change**: measurement + a guard only; parse output is byte-identical, no `src/`
  runtime code touched, no public API added. New: the `bench` package script and the `benchmarks` doc.
- **FHIR-bridge readiness: a versioned IR-stability contract + coverage proof (HL7-V, Phase V, fifth
  of the v2.4 capability arc).** Documents and **versions** the mapping-source IR that
  `@cosyte/transform` builds against, and proves, firsthand against the HL7 **v2-to-FHIR** IG
  (v1.0.0, FHIR R4), that hl7 surfaces the source paths the IG references. **No v2→FHIR mapping is
  added to hl7.** hl7 constructs no FHIR resource, ships no ConceptMap, translates no terminology;
  that stays in `@cosyte/transform`. This is documentation + a coverage test over **existing** surface;
  no new runtime API.
  - **IR Contract v1.0.0** (`docs-content/spec-notes-fhir-bridge.md`) pins the stable mapping surface:
    dot-path source addressing (`msg.get`/`resolvePath`/`parsePath`, `segment.field[.component]`
    one-to-one with the IG), the twelve typed composites (`Field.asXpn`/`asCx`/`asCwe`/…, the
    datatype-map inputs), code-system provenance, `parseDtm` datetime precision + timezone, the text
    codec (`decodeText`/`renderText`/`Field.render`), and message metadata, with a **semver
    deprecation posture** so `transform` can build once without forcing later hl7 churn.
  - **Coverage proof** (`test/fhir-bridge-coverage.test.ts`) grounds against the IG's vendored raw
    segment-map CSVs + its public sample corpus (provenance in
    `test/fixtures/fhir-bridge/PROVENANCE.md`). Invariants: every IG-referenced field-level source path
    is **addressable** (no hl7-side gap); every path the public sample **populates** resolves through
    the IR (**63/63** exercised paths surfaced); the datatype-map shapes (XPN, CX with assigning
    authority, CWE provenance, DTM precision+tz, rendered narrative) surface from the sample; and the
    package exports carry **no** FHIR-typed symbol (scope-boundary guard).
  - **Gaps recorded honestly.** The IG's public sample corpus is, verified firsthand, **one** v2
    message (`MDM^T02`), not the multi-family `samples/` the roadmap assumed. **233 of 296**
    IG-referenced field paths are un-exercised by that single sample: a **corpus-coverage** gap (the
    thin sample set), **not** a hl7 reachability gap (hl7 addresses all 296 generically).
- **Conformance-profile tooling: `validateAgainstProfile` (HL7-U, Phase U, fourth of the v2.4
  capability arc).** hl7 could parse and author messages and flag missing spec-Required segment
  groups (`msg.structure`), but could not answer "does this feed meet _our_ interface spec?"
  `validateAgainstProfile(message, profile)` runs a **consumer-authored declarative conformance
  profile** and returns **typed findings**.
  - **BYO profile + value sets: the deliberate scope boundary.** The profile schema is a bounded
    subset of the HL7 v2 Message-Profile / NIST-IGAMT model: per-segment/field usage
    (`R`/`RE`/`C`/`CE`/`O`/`X`), cardinality, length, and value-set binding against a
    **consumer-supplied** code list. hl7 ships **no** vendor/IHE/regulatory profile, **no** bundled
    code set (no LOINC/SNOMED/ICD/RxNorm lookup), and makes **no** network call, the sanctioned
    functionality-plane replacement for the retired vendor-corpus arc.
  - **Four invariants.** The engine **never throws**. A malformed profile yields `PROFILE_MALFORMED`
    findings, not an exception (never a silent pass); the optional `defineConformanceProfile` is a
    fail-fast authoring gate that _does_ throw `ProfileDefinitionError`. A **valid message yields zero
    findings**. **No finding carries PHI.** Each names the structural locus (segment / field /
    component / repetition / occurrence) and the rule, never the offending value. Validation is
    **read-only**. `C`/`CE` presence is not evaluated (no conditional-predicate language, a
    documented boundary), keeping valid⇒zero-findings airtight. Property-tested for never-throws,
    read-only, and well-formed PHI-safe findings across message × profile pairs.
  - **"No findings" is explicitly NOT a conformance attestation.** It means no _declared_ rule was
    violated, nothing about undeclared parts of the message and no conformance certification.
  - New public exports: `validateAgainstProfile`, `defineConformanceProfile`, the `conformance`
    namespace, `FINDING_CODES`, `USAGE_CODES`, and the `ConformanceProfile` / `SegmentRule` /
    `FieldRule` / `Cardinality` / `UsageCode` / `ConformanceFinding` / `FindingLocus` / `FindingCode`
    / `FindingSeverity` / `ConformanceResult` types. Six additive finding codes:
    `PROFILE_REQUIRED_ABSENT`, `PROFILE_NOT_PERMITTED`, `PROFILE_CARDINALITY`, `PROFILE_LENGTH`,
    `PROFILE_VALUE_NOT_IN_SET`, `PROFILE_MALFORMED`. Additive: no change to existing output. Distinct
    from the parse-profile system (`defineProfile`/`profiles`). See
    `docs-content/spec-notes-conformance.md`.
- **Streaming / incremental parse: `parseStream` (HL7-S, Phase S, third of the v2.4 capability
  arc).** hl7 could only parse a message (`parseHL7`) or a whole in-memory batch (`splitBatch`). A
  large ELR/IIS/lab file or a live feed had to be fully buffered first. `parseStream(source, opts?)`
  parses **incrementally**: it consumes a chunked source (a Node `Readable`, an async-iterable, or an
  iterable of `string`/`Buffer` chunks) and **yields one message per `MSH`-delimited boundary** as it
  completes, with **O(one-message)** memory, the whole stream is never retained.
  - **Chunk-boundary invariant.** A message split across chunk boundaries (mid-segment, mid-field,
    even mid-`MSH|^~\&`) is reassembled; feeding the same bytes in 1-byte chunks vs. one big chunk
    yields **identical** messages. A `\r\n` terminator straddling a chunk boundary is not mistaken for
    a bare `\r`; `\r` / `\r\n` / `\n` are all tolerated. Property-tested across randomized chunk
    boundaries and 1-byte chunks.
  - **No second grammar.** Each demarcated message is parsed by the shipped `parseHL7` (the second
    argument (profile / `strict` / `charset` / `dateFormats`) is forwarded per message), so a
    streamed message is byte-for-byte what `splitBatch` produces for the same bytes.
  - **Isolation, never a dropped tail.** A malformed message mid-stream surfaces as an isolated typed
    failure entry (the `Hl7ParseError`) and the stream **continues**. It never suppresses later
    messages. Batch-envelope segments (`FHS`/`BHS`/`BTS`/`FTS`) act as boundaries and are never
    yielded, so **yielded count == `MSH` count** (envelope count reconciliation stays `splitBatch`'s
    job). A final message with no trailing terminator is still yielded in full, flagged via the new
    stream-level `UNTERMINATED_STREAM_MESSAGE` warning on the entry's `streamWarnings` (never on
    `Hl7Message.warnings`, never a throw).
  - Consumes an **already-de-framed** stream. MLLP `<SB>…<EB><CR>` framing/timing/TLS remain
    `@cosyte/mllp`'s. New public exports: `parseStream`, `unterminatedStreamMessage`, the
    `Hl7StreamSource` / `StreamMessageEntry` types, and the `UNTERMINATED_STREAM_MESSAGE` warning code.
    Additive: no change to `parseHL7` / `splitBatch` output. See `docs-content/spec-notes-stream.md`.
- **Typed emit symmetry: composite setters + `buildAdt` / `buildOru` (HL7-T, Phase T, second of the
  v2.4 capability arc).** hl7 could read a message into typed objects but could only _write_ one
  through stringly-typed field arrays (`buildMessage(...).addSegment("PID", ["", "", "MRN"])`, the
  consumer hand-encoding `^`/`&`/`~`). Phase T makes hl7 an **authoring** library (the
  conservative-emit mirror of the read helpers) built on Phase R's encode-safe codec:
  - **`encodeComposite(kind, value)`** (and the per-type `encodeXpn`/`encodeXad`/`encodeCx`/`encodeCwe`/
    `encodeCe`/`encodeXtn`/`encodePl`/`encodeHd`/`encodeTs`/`encodeNm`/`encodeXcn`, plus
    `encodeCompositeReps` for repeating fields) turn a typed composite (an XPN name, a CX identifier
    (nested-HD aware), a TS timestamp) into a spec-clean `RawField`. **`Hl7Message.setComposite(path,
kind, value)`** sets one at a field or `field[rep]` dot-path. Component values are stored
    **decoded** and the serializer re-escapes on emit, so an embedded delimiter (`"Smith^Jr"`) is
    **escaped, never injected**. It re-parses to the exact string, never forging a component boundary.
    The **emit ∘ parse identity** holds on every modelled field (interior empties preserved, trailing
    trimmed); property-tested across all composites over the delimiter-laden alphabet.
  - **`buildAdt(event, init)`** and **`buildOru(init)`** assemble a full message (MSH + EVN + PID + PV1
    for ADT; MSH + PID + OBR + OBX for ORU) from typed inputs, generating the control id / timestamp /
    encoding characters correctly. The emitted message is **spec-clean, zero-warning, and
    structurally complete**. It re-parses with `warnings: []` and `msg.structure.missingGroups` empty
    (verified against the parser's own structure net across `A01`/`A02`/`A03`/`A04`/`A08`).
  - **Never fabricate.** A builder emits only values the caller supplied; an omitted optional field is
    an empty/absent field, never a defaulted clinical value. A required-but-absent structural input
    (`patient`, an empty ADT `event`, or an ORU with no observation) is a typed `TypeError`, not a
    guessed value. Complements the shipped `buildAck` (Phase C); the low-level `buildMessage` remains
    for the long tail. Emit is spec-clean **base standard**, not a vendor dialect.

    New public exports: `buildAdt`, `buildOru`, `encodeComposite`, `encodeCompositeReps`, the eleven
    per-type `encodeXxx` functions, `Hl7Message.setComposite`, and the `CompositeKind` /
    `CompositeValueByKind` / `BuildAdtInit` / `AdtPatient` / `AdtVisit` / `AdtEvent` / `BuildOruInit` /
    `OruPatient` / `OruOrder` / `OruObservation` types. Ships two synthetic, PHI-scanned goldens
    (`fixtures/build/adt-a01.golden.hl7`, `oru-r01.golden.hl7`) plus a property layer (emit ∘ parse
    identity + no-injection). Additive: no change to parse output or existing emit. Depends on Phase R.

- **Formatted-text rendering + a first-class text codec (HL7-R, Phase R, first of the v2.4
  capability arc).** Completes Phase A's explicit defer: the lenient parser preserves the
  presentational escapes (`\H\`/`\N\` highlight, the `\.sp\`/`\.in\`/… formatting commands, charset
  switches, vendor `\Z..\`) as un-rendered sentinels; a note surfaced to a human with those raw
  sentinels in it is **misread**. Two additions close that, as an opt-in **layer** over the unchanged
  raw extraction (Postel's Law, existing parse output is byte-for-byte identical):
  - **`renderText(input, enc?, opts?)`** turns HL7 v2 §2.7 escape/formatting-bearing content into a
    normalized **display model**: a plain-text `text` (formatting commands → whitespace/line breaks
    per a conservative, documented normalization; highlight boundaries dropped) plus highlight-aware
    `runs` (`{ text, highlighted }[]`). It **never fabricates**: a charset switch, a vendor `\Z..\`,
    or a malformed/unterminated escape is preserved as its literal characters and flagged in
    `unrenderedSequences`, never dropped or replaced with a guessed glyph. Grounded firsthand on the
    HL7 v2 Ch. 2 §2.7 escape spec (delimiter §2.7.1, charset §2.7.2/3, hex §2.7.5/6, formatting
    commands §2.7.6/7 [FT], local `\Z..\` §2.7.7/8, truncation §2.5.5.2, confirmed against the
    v2.5.1 and v2.8.2 chapter text). **`Field.render(opts?)`** is the one-call form on a parsed field.
  - a first-class **text codec**: `decodeText` / `encodeText`, also bundled as the `text` namespace
    (`text.decode` / `text.encode` / `text.render`). The load-bearing invariant is **encode-safety**:
    `encodeText` escapes every reserved character (the escape char first, then the
    field/component/subcomponent/repetition separators, the truncation char, and framing-critical
    CR/LF) so an arbitrary string round-trips (`decodeText(encodeText(s)) === s`) and re-parses to
    exactly itself with **no delimiter injection**. A value can never break framing or forge a
    component boundary. This is the safe-encode primitive Phase T (typed emit) will build on.

    New public exports: `renderText`, `decodeText`, `encodeText`, the `text` namespace,
    `Field.render()`, and the `RenderedText` / `TextRun` / `RenderTextOptions` types. Ships four
    synthetic, PHI-scanned `fixtures/text/*.hl7` fixtures (formatting note, highlight, hex+delimiters,
    inject-on-encode) plus a property layer (encode-safety over arbitrary strings; `renderText` is
    total; a formatting sentinel never survives into the plain-text render). No new warning codes.

- **`profiles.va`: eighth built-in vendor profile (VA VistA Radiology/Nuclear Medicine imaging).**
  Declares the `ZDS` Z-segment that carries the DICOM **Study Instance UID** (field 1, `RP` composite,
  the UID sits in the first component, ZDS-1.1 "Pointer") so a VistA radiology feed parses without an
  `UNKNOWN_SEGMENT` warning and `zds.get("studyInstanceUid")` resolves by name. `ZDS` is the **IHE
  Radiology** RIS↔PACS bridge segment, the same cross-vendor extension `profiles.visage` and
  `profiles.philips` declare, **not** a VA-proprietary quirk; the value this profile adds is a distinct
  **named federal source** and coverage of the shape the VA spec documents that the imaging-vendor
  specs do not: `ZDS` on **ORU** (result) messages (VistA sends `ZDS` in both ORM and ORU). Grounded in
  the **publicly published** [Radiology/Nuclear Medicine 5.0 HL7 Interface Specification](https://www.va.gov/vdl/documents/clinical/radiology_nuclear_med/ra5_0hl7is.pdf)
  (Version 3.6, Patch RA\*5.0\*203, June 2024, U.S. Department of Veterans Affairs), which documents
  "ZDS Segment Fields in ORU and ORM", not an invented quirk (ADR 0018). The spec's messaging is
  HL7-native v2.4, so the profile declares no custom date formats. Ships one synthetic, PHI-scanned
  `vendor-shapes/va/oru-r01.hl7` (ORU^R01 + ZDS) fixture whose Study Instance UID uses the Medical
  Connections free UID root, not the reserved DICOM arc. Additive: no change to existing profiles,
  warning codes, or the parse/serialize surface.

- **`profiles.philips`: seventh built-in vendor profile (Philips Vue PACS "IS Link" imaging).**
  Declares the six Vue PACS custom Z-segments, one per filler role: `ZDS` (DICOM **Study Instance
  UID**, an RP composite whose first component is the UID), `ZLK` (linked studies / linked orders),
  `ZAO` (order additional details: modality, body part, result-transfer + acquisition status,
  technician and radiologist name/id, and the vendor's custom string/number/date slots), `ZEB`
  (encrypted patient-info blob), `ZAP` (patient additional details), and `ZAV` (visit additional
  details), so a Vue PACS ORM/ADT feed parses without `UNKNOWN_SEGMENT` warnings and each field
  resolves by name (e.g. `zao.get("acquisitionStatus")`). Field positions are transcribed **verbatim**
  from the spec, including two of its own gaps (`ZAO` has no field 7; `ZAP` has no field 2). Grounded
  in the **publicly published** [Vue PACS 12.2.8 HL7 Interface Specifications](https://www.documents.philips.com/assets/Conformance%20Statements/20240409/8941f89d89aa4983aab7b14d00db578c.pdf)
  (Philips, doc HA1669 Rev A, §§5.11–5.16), not an invented quirk (ADR 0018). Vendor `TS` timestamps
  are HL7-native, so the profile declares no custom date formats. Naming the `ZEB` field is precisely
  how a consumer learns that segment is PHI-bearing and must not be logged; the profile only _names_
  fields. It never decodes, decrypts, or rewrites them. Ships two synthetic, PHI-scanned fixtures
  (`vendor-shapes/philips/orm-o01.hl7` order-filler; `vendor-shapes/philips/adt-a08.hl7`
  patient/visit-filler) with documented provenance. Additive: no change to existing profiles, warning
  codes, or the parse/serialize surface.

- **`profiles.visage`: sixth built-in vendor profile (Visage 7 imaging/PACS).** Declares the `ZDS`
  Z-segment that RIS/PACS order feeds use to carry the DICOM **Study Instance UID** (field 1, first
  component), the IHE Radiology bridge that correlates an HL7 order to its DICOM study, so an
  imaging ORM parses without an `UNKNOWN_SEGMENT` warning and `zds.get("studyInstanceUid")` resolves
  by name. Grounded in the **publicly published** [Visage 7 HL7 Interface Specification](https://www.visageimaging.com/downloads/Visage7/Visage7_HL7InterfaceSpecification.pdf)
  (V23.00, Jun 2026, Visage Imaging GmbH), its §4.4 ORM^O01 example and ZDS segment table, not an
  invented quirk (ADR 0018: public specs unblock quirk-corpus work; a _specific undocumented_ vendor
  deviation still waits on a private feed). Vendor dates in that spec are HL7-native, so the profile
  declares no custom date formats. Ships with a synthetic `vendor-shapes/visage/orm-o01.hl7` fixture
  (PHI-scanned) and a `test/fixtures/vendor-shapes/README.md` recording per-fixture provenance.
  Additive: no change to existing profiles, warning codes, or the parse/serialize surface.

- **PHI commit-scanner (`scripts/phi-scan.ts`, `pnpm phi-scan`).** A zero-dependency, HL7 v2
  shape-aware scanner that refuses fixtures (and a conservative text pass over `src/`) carrying
  real-looking PHI, so a real patient message can never be committed by accident. It parses each
  message's delimiters (`MSH-1` / `MSH-2`) and inspects only the fields that actually carry each
  category: patient / person names (PID-5/-6/-9, NK1-2, GT1-3, IN1-16, MRG-7 as XPN; PV1-7/-8/-9/-17,
  ORC-12, OBR-16, AIP-3, TXA-9, ROL-4 as XCN, reading the family/given from the correct components),
  dates of birth (PID-7 / NK1-16), SSNs (PID-19, CX identifier-type `SS`, dashed patterns anywhere),
  MRN / account numbers (PID-3 / -18), addresses (PID-11 / NK1-4 / GT1-5 / IN1-19), phones
  (PID-13/-14 / NK1 / GT1 without the `555` fake-exchange convention), non-test emails, and a
  site-defined `Z…`-segment name backstop, deliberately NOT a naive `Family^Given` text regex, which
  would trip on coded values like `CBC^Complete Blood Count^LN` (false confidence). Synthetic
  fixtures are positively declared in `scripts/phi-allow-list.txt` (HL7 v2 is byte-strict at the
  front, so an inline `# synthetic: true` header is impossible, same model as `@cosyte/dicom` /
  `@cosyte/x12`); a whole-file bypass requires `--allow-fixture` **and** an audit entry in
  `phi-scan-overrides.md`. All `git` calls use `execFileSync` array-args (never shell-form). Runs at
  pre-commit (`simple-git-hooks --staged`) and in CI (`run-phi-scan: true`); `scripts/verify.sh` now
  reports `phi-scan ✓`. Dev-tooling only: no change to the published package surface or warning codes.

- **Trademark notice (`TRADEMARKS.md`).** This package names third-party systems to describe what it
  interoperates with; the notice records that cosyte is not affiliated with, endorsed by, or
  sponsored by any of them, that every reference is descriptive, and that the built-in profiles are
  authored from public sources only. Added to `files` so it ships inside the published tarball, not
  just on GitHub. Documentation only: no runtime or API change.

- **Full documentation Diátaxis spine + doc/code-agreement gate (DOCS-CONTENT-P1).** `docs-content/`
  gains **Installation**, **Quickstart**, **Guides**, and **Troubleshooting** (with Known
  Limitations) categories on top of the existing Overview + Core Concepts, authored from the real API
  against synthetic messages, the template of record every other cosyte parser's docs copy. A new
  `test/docs-content.test.ts` runs `@cosyte/vitest-config@^0.0.2`'s `docSnippetSuite()` over the
  pages, so every ` ```ts runnable ` snippet is compiled, executed against the built package, and its
  inline `// =>` assertions checked: a documented example can never silently drift from the code.
  Bumps the `@cosyte/vitest-config` devDependency `^0.0.1 → ^0.0.2`. Documentation + test-tooling
  only: no runtime/API change; the published artifact is unchanged.

### Changed

- **The PHI gate's own enumeration no longer lets a vanished build transient refuse an entire sweep
  (`PHI-SCAN-ENUMERATE-THEN-READ-CLASS`).** `scripts/phi-scan.ts` all-mode lists its roots and reads
  each file afterwards; a file deleted inside that window threw `ENOENT` and the scanner refused with
  exit 2. `@cosyte/ccda` is where that landed for real (`ccda#80`, `747ac20`): its walk starts at the
  **repo root**, `tsup` writes and then removes `tsup.config.bundled_<hash>.mjs` there, and a
  publish-time sweep refused, failing `prepublishOnly` and blocking a real publish.

  **No CI or publish run in this repo was reachable through that window, so this is hardening, not
  the repair of a live defect here.** Say so plainly, because the temptation is to claim the bigger
  thing. The walk is rooted at `test/fixtures` and `src`, so the repo-root transient is never
  enumerated. **Verified in both directions rather than assumed, and re-derived three times in three
  separate runs:** a real `tsup` build was polled while it ran and the only transient observed each
  time was a `tsup.config.bundled_<hash>.mjs` **at the repo root**, outside both walk roots, with
  zero files appearing under either root; and the pre-fix scanner, driven against a throwaway repo
  with an untracked decoy placed **inside** `src/`, refused the whole sweep with exit 2 on the first
  read. The hash differs on every build, which is why no specific filename is quoted here. The
  immunity is scope, not design. Nothing gitignores that name (`git check-ignore` exits 1 on it),
  and `test/docs-content.test.ts` really does run a build from inside the suite while this scanner
  sweeps in all mode from another worker, so the two halves already race. **Widening a walk root,
  for any reason, reintroduces it verbatim.**

  **A narrower case was already live on a developer box rather than in CI, and the review gate found
  it. It is a class, not one filename.** `.gitignore` covers `*.swp` and `*.swo` and **nothing else
  of the kind**, so editor and atomic-save transients create and remove un-ignored files **inside a
  walk root**. Verified un-ignored: `src/index.ts~`, `src/.index.ts.swn`, `src/#index.ts#`,
  `src/index.ts___jb_tmp___`, `src/.goutputstream-abc123`, `src/4913`, and `.tmp` / `.orig` / `.bak`
  beside a source file. Before this change each is a spurious exit 2 on a developer's machine; none
  reaches CI or a publish, which is why the claim above is scoped to those.

  **The refusal was correct; the enumeration was unsound.** Refusing a scan it could not complete is
  what makes this gate worth having and it is untouched. Exactly one case is now tolerated: a file
  the walk enumerated **itself**, that git does **not track**, failing with **`ENOENT`**. It is
  written to stderr as skipped, never dropped silently, and the clean line on **stdout** is
  qualified to match (`OK: no hits (N untracked file(s) skipped, see stderr)`), so a reader watching
  stdout alone cannot take an unqualified OK from a sweep that did not observe everything it
  enumerated. A clean sweep still prints the bare line, and a test pins it exactly.

  **Five of the six bounds are pinned by a test, and which five is measured, not asserted.** Each
  was confirmed by a mutant that only its own test kills:
  - a **tracked** file that cannot be read (mutant: tolerate tracked files too);
  - any **non-`ENOENT`** failure, since `EACCES` / `EISDIR` is a scan that failed, not a file that
    went away (mutant: tolerate any errno);
  - a `git` that cannot report the tracked set, which switches the tolerance off rather than
    guessing (mutant: return an empty set instead of `null`);
  - a tracked set that comes back **empty**, the one state in which the tracked-file bound stops
    existing (same mutant). A **removed** `.git/index` makes `git ls-files` exit 0 with no output,
    which is what the `size > 0` guard catches; a **corrupt** one exits non-zero and was already
    caught by the `catch`;
  - an all-mode sweep that **observed no files at all** (mutant: drop the guard), so the tolerance
    can never decay into a clean report of a tree nothing was read from.

  **The sixth is UNPINNED and named as the gap it is:** a tolerated file that is **back on disk**
  when the sweep ends still refuses, but no test drives it. The scanner calls `git` only before the
  first read, so there is no deterministic post-read hook, and `walk()` enumerates regular files
  only, so a FIFO cannot be used as a blocking one either (both measured). Reaching it needs a timed
  re-create against a deliberately slowed sweep, and a load-sensitive sleep in a suite guarding a
  load-dependent race is the failure that race teaches. Losing that branch would cost the re-check,
  never the tolerance's bounds. **Unpinned is not unverified:** the review gate drove the branch by
  hand against a deliberately slowed sweep and it refused correctly with exit 2, and deleting the
  re-check outright still leaves all 29 tests green, which is what makes "unpinned" the accurate
  word rather than an understatement.

  **The test technique is the reusable part: no sleep and no real build.** The scanner runs
  `git check-ignore` and `git ls-files` between the walk and the first read, so a `git` shim placed
  first on `PATH` is a deterministic hook into exactly that gap. Every case runs against a throwaway
  git repo, so no decoy is ever written into this one. As a negative control the same tolerance case
  was replayed against all twelve sibling scanners, and every sibling that has not yet taken this
  change refuses it with exit 2, so the new assertion is not one a sibling's code satisfies by
  accident. **No count is quoted, deliberately:** the same command returned a different tally on
  three consecutive runs while sibling repos landed the same change underneath it, so any number
  written here would be wrong by the time it is read.

  **Residual, stated rather than closed:** the post-sweep re-check is keyed on the enumerated path,
  not on content, so the class is **content that survives at a path the walk did not enumerate**. An
  untracked file **renamed** inside the window is the obvious instance and goes unscanned under a
  clean report; a hard link followed by an unlink is the other. Both legs of the boundedness
  argument were driven by the review gate rather than argued: after `git add` the all-mode sweep
  catches the renamed file, and `--staged` reports the hit from the index **even with the file
  deleted from disk**. Closing it needs a content-addressed sweep, which is a different design
  rather than a wider bound. The `--staged` pre-commit path reads blobs from the git index
  (`git show :path`) and never depended on any of this.

  **Two PRE-EXISTING scope limits of the walk are now written down** so they are not confused with
  the window above. Both were measured, and an earlier draft of this entry claimed `--staged` covers
  the commit path in both cases; **the review gate refuted that and it is false, so read `--staged`
  as a compensating control for neither.**
  - **Regular files only**, the sharper of the two. A symlink under a walk root pointing at a
    PHI-bearing file is not enumerated, so all-mode never reads it, **and** git stores a symlink as
    its target string (mode `120000`), so `git show :path` hands `--staged` the path text rather
    than the pointed-to bytes. **Both routes report clean, driven and reproduced independently.**
    What lands in the commit is the link, not the capture, but an identifying _filename_ still
    reaches the tree and gets only the shape pass, which has no name detection. A FIFO is skipped
    rather than blocking the sweep.
  - **Working tree only.** A tracked file absent from the worktree is never enumerated in all-mode.
    `--staged` catches such a file when it is **added** (measured, exit 1), so that coverage is at
    add time and past tense: once it is committed and removed from the worktree, both routes report
    clean.

  Neither limit is changed here, and widening the walk to close either is a separate slice.

  **CLOSED for the first bullet by the "not a regular file" entry below; the second bullet still
  stands.** The paragraphs above are left exactly as they shipped rather than rewritten, because
  they described a real state the package passed through and they shipped inside a published
  tarball, so they are text a consumer already has on disk. What is no longer true of the current
  code is the whole of the first bullet, in three places rather than one: a symbolic link under a
  walk root, or staged into `test/fixtures/**` or `src/**.ts`, now **refuses the scan** on both
  routes instead of reading clean on both; **a FIFO refuses too** rather than being skipped; and the
  shape pass no longer runs on a link's target _path_, because the entry is refused before anything
  is read. The second bullet, working-tree-only, still stands exactly as written.

- **`README.md` now opens with the shared Cosyte lockup in a `<picture>` block, replacing the
  per-package banner (`1aee04b`).** The dark-ground org tile sits behind a
  `prefers-color-scheme: dark` media query with the light-ground tile as the inner `<img>`, so on a
  renderer that honours the switch the mark sits on a ground matching the page it is read on. One
  markdown image line out, four lines in: the `# @cosyte/hl7` H1, the blockquote tagline, the badge
  row and everything below are untouched.

  **Why the per-package banner goes.** It baked the package name and the one-line tagline into
  pixels, and the two lines directly beneath it repeated both. The shared lockup reads "Cosyte"
  while the H1 reads `@cosyte/hl7`, so the strings differ, the duplication goes away, and the
  heading stays.

  **The failure mode is safe**: a renderer that strips `<source>` renders the inner `<img>`, so the
  worst case is a light-ground mark on a dark page, never a missing or broken image. The block was
  copied out of `astm/README.md` rather than retyped and the two URLs then diffed byte for byte
  against that file, because a transcription error in one of them is a broken image on a public
  package page. Both were re-verified `200 image/png` (10513 and 10455 bytes) immediately before
  the push: the `live` flag in the `assets` manifest is a declaration made on evidence from another
  repo, not a fact checked here. The alt text describes the mark rather than the package, since it
  is what a screen reader on the npm page reads out and what a reader gets when the image fails.
  This supersedes the `ASSETS-P8` banner entry under **Added** above, which is annotated in place
  rather than rewritten. Documentation only: no runtime, API or packaging change.

- **Corrected stale "not yet published to npm / unpublished" language in the docs site
  (README-ORG-SWEEP).** `@cosyte/hl7` is now published on npm at `0.0.1` and public, so the
  `docs-content/installation.md` Status blockquote ("not yet published… the shape it will take at
  first publish; consume it from source or a workspace link") and the `docs-content/troubleshooting.md`
  "Pre-alpha (`0.0.x`), unpublished" note were factually wrong. Both now state the package is published
  on npm at `0.0.1` and public, still pre-alpha on the `0.0.x`-until-first-alpha ladder, with the
  `npm install @cosyte/hl7` command described as live rather than aspirational. Docs-site content only
  (not in the published tarball); no runtime or public-API change.

- **`profiles.meditech` re-grounded to a public MEDITECH spec (HL7-I, ADR 0018).** The profile's
  Z-segment map previously declared a `ZVI` "visit info" segment (`visitReason`/`admitSource`) that
  was a **community-sourced prior with no citable public source**. No public MEDITECH spec documents
  a `ZVI` segment, so, per the "encode a quirk only when a real, publicly-documented spec grounds
  it" mandate, `ZVI` was **removed** and replaced with the DFT charge Z-segments MEDITECH documents
  verbatim in its **publicly downloadable** [Ancillary Charges (LAB/PHA/ITS/IDM) Outbound](https://ehr.meditech.com/sites/default/files/documents/20240613/ancillary-charges-outbound-21.pdf)
  spec (Version 2.1, © 2021 Medical Information Technology, Inc.): `ZF1` ("PROVIDER ENCOUNTER COPAY
  DATA": `providerEncounter`, `misServiceGroup`, `serviceGroupCopay`, `visitCopay`, `copayMinimum`,
  `copayMaximum`) and `ZF2` ("ENCOUNTER PROCEDURE DATA": `setId`, `providerEncounter`,
  `encounterDate`, `encounterProcedure`, `encounterProcedureQuantity`, `encounterProcedureCharge`,
  `prvProcedureAmountPaid`, `prvProcedureAmountDue`). The profile's `YYYYMMDDHHMM` minute-precision
  timestamp format is **kept and now spec-cited**, confirmed by that spec (MSH-7 length 12; EVN-2 /
  PID-7 "Format is YYYYMMDDHHMM") and by the [Admissions and Registration Outbound](https://ehr.meditech.com/sites/default/files/documents/20240613/admissions-registration-outbound-24.pdf)
  spec (Version 2.4, © 2021): "Date and Time in Admissions. Format is YYYYMMDDHHMM". The vendor-shape
  fixture moved from `vendor-shapes/meditech/adt-a04.hl7` (ADT + `ZVI`) to
  `vendor-shapes/meditech/dft-p03.hl7` (DFT^P03 + `ZF1`/`ZF2`), synthetic and PHI-scanned. Consumers
  who relied on `ZVI` from `profiles.meditech` (an ungrounded mapping) must declare it themselves
  via `defineProfile({ extends: profiles.meditech, customSegments: { ZVI: … } })`. `epic`, `cerner`,
  `athena`, and `genericLab` remain community-sourced priors, tracked for the same treatment.

- **Dropped the "Dogfooded in production" claim from the README feature list.** The bullet asserted
  the package was "used internally on healthcare-integration projects"; no engagement has run it, so
  the claim was not accurate and has been removed ahead of the first public release. `README.md`
  ships inside the published tarball, so this is a user-visible docs change. No runtime/API change.

### Fixed

- **The PHI scan reached neither `test/**` nor an inline fixture, and dropped to a shape-only pass
at a scan root's own path (`PHI-SCAN-WALK-ROOT-SCOPE`, plus `PHI-SCAN-RENAME-BLIND-AT-PRECOMMIT`▶(b)).** Four`PRE-EXISTING`holes, each measured on`d8d3be3` before the change.

  **1. A tracked file directly under `test/` was enumerated by NEITHER route.** The walk was rooted
  at `test/fixtures` + `src`; `--staged` matched `test/fixtures/**` + `src/**.ts`. That left **115
  tracked files** scanned by nothing. A `test/<name>.ts` carrying a live
  `PID-3`/`PID-5`/`PID-7`/`PID-11`/`PID-13` printed `OK: no hits` and exited **0** on both routes,
  over bytes that give six segment-aware hits at a `.hl7` path. `SCAN_ROOTS` is now
  `test/fixtures` + `test` + `src`, and `--staged` adds `test/**` (markdown excluded, copying
  `walk()`'s rule) as a **union** clause, so nothing it enumerated before stops being enumerated.

  **2. THE HALF A WIDER ROOT DOES NOT BUY: the recogniser assumes the file IS the document, and an
  inline fixture is a `.ts` string literal.** Scope alone bought the dashed-SSN + email floor over
  those 115 files and nothing else: no name, DOB, MRN, address or phone. **55 of the 115 carry an
  inline `PID|` literal.** So there is now an embedded-literal pass (`scanEmbeddedHl7`) that pulls
  `PID|…` runs out of source and hands them the **same field map** the whole-file parse uses; the
  detectors are one shared function, not a second copy. Both halves are pinned RED-before /
  GREEN-after, **and so is the residual**: the same values written as PROSE in the same file are
  still not found. The pass is deliberately narrower than the whole-file parse and each limit is
  stated, and two of them only after review refuted the first draft. Default delimiters only (an
  embedded run has no reachable `MSH-2`); no unknown-segment backstop (a noise cannon over program
  text, so an inline `Z…` name is missed); a `${…}` interpolation is **erased, not read**
  (`familyName`, `content`, `marker` and `pidSurname` were each reported as a patient name), and the
  bound there is **any value reached through an interpolation, including one whose literal is in the
  same file** (measured: `const fam = "<surname>"` interpolated into a PID line exits 1 on the MRN
  and DOB and is **silent on the name**); and **a run is cut at the first source quote, which cuts
  HL7 data too** (the two-character literal `""` is HL7 v2's explicit-null field value, grounded in
  this repo's own parser rather than a clause number nobody verified, so
  `PID|1|""|MRN001||<surname>^<given>||<dob>|F` exits **1** at a `.hl7` path and **0** inline,
  because the extracted run is `PID|1|`; `O'Brien` truncates identically). The last one is a MISS
  and is written down rather than patched: the enclosing quote style is not knowable from one line,
  and a wrong guess reads program text as patient data.

  **`src/` changed intent, not just scope**, and the comment that said otherwise is corrected: the
  embedded pass runs on **every** non-fixture target, so a JSDoc `@example` carrying a PID line with
  a non-allow-listed name now reds (measured: exit 0 on `d8d3be3`, exit 1 here). This repo
  hard-requires an `@example` on every public export, so a new example must use allow-listed tokens
  or add its own, exactly like a fixture. The committed corpus is green as it stands.

  **3. ▶(b): a regular blob staged at exactly `test/fixtures` got the shape floor only, and
  `--staged` IS the pre-commit hook.** Scope and the mode check passed it through; the **detector
  gate** dropped it, because `looksLikeHl7` wanted a `test/fixtures/` prefix or an `.hl7` suffix and
  the root's own path has neither. Measured twice: six segment-aware hits at
  `test/fixtures/<name>.hl7`, exit **0** at `test/fixtures`; a dashed SSN in the same blob exited
  **1** either way, so the floor held and only the segment-aware tier was missing, so it is one clause, not
  a new rule.

  **4. `-B` IS NOT INERT, AND THIS SCANNER SAID IT WAS** (found by `terminology#45`, reproduced
  here). The permissive half of a "do not add these flags" paragraph. The mechanism is sharper than
  "a `B` record `AMTU` drops": a complete rewrite under `-B` prints status letter **`M`** with a
  break score (the digits move with how much old content survives, so none are quoted here), one
  path, which `RAW_RECORD` parses happily. But `--diff-filter`
  classifies a broken pair as **`B`** whatever letter it prints. `--diff-filter=AMTU` returns empty;
  `B` and `AMTUB` return the record. Through the scanner over a staged dashed SSN in a wholly
  rewritten in-scope file: shipped argv exit **1**, same argv plus `-B` exit **0**. The filter is
  now `AMTUB`, which costs the enumeration nothing (git cannot emit a broken pair without the flag).
  **The pin that let the false claim live was a pin on a RENAME**, the one shape `-B` leaves alone.

  **Two behaviour changes from `test` becoming a root.** `test/fixtures` is now an ENTRY INSIDE a
  walked root, so a symlink there is refused by name at exit **2**, dangling or not: that closes,
  **for `test/fixtures` only**, the "a root that is itself a symlink is followed" residual below.
  It does not generalise: `src` and `test` have no walked parent, so both are still followed, and
  the boundary is the PARENT, not the root. And the roots now NEST, so coverage credits **every**
  root a file sits under rather than the first (crediting one would starve the other permanently,
  and which one depended on list order with nothing saying so); walked entries are de-duplicated
  for the same reason.

  **The scanner's own test file could not be resolved with the allow-list**, and that is the
  interesting part: it holds deliberate violators, every one asserted on, so allow-listing them
  would make the positive tests vacuous and carving it out of the scan would be the gate excusing
  itself from its own rule. Its violator identities are **assembled at runtime** instead (the
  discipline the file already used for its SSN sentinel), so the temp files it builds still carry
  the full violator bytes and the tracked file holds no PHI-shaped run. One registrable `.org`
  email in it became a permanently unregistrable `.invalid` one on the way past. Every other new
  allow-list token was **surfaced by the gate**, not guessed at. **23 net new tests** in
  `test/scripts/phi-scan.test.ts` (78 to 101), plus several existing ones rewritten where the
  widening inverted their verdict, each change of verdict recorded rather than deleted.

  **Two `PRE-EXISTING` minors folded in with this item are ALREADY CLOSED here and were not
  reopened**, measured rather than assumed: a missing or unreadable allow-list exits **2** (not the
  **1** reserved for hits), `readdirSync` failing on a root exits **2**, and unmerged (`U`) entries
  are already in the filter.

- **The PHI scan's observation rule was GLOBAL, so one root vouched for the other
  (`PHI-SCAN-OBSERVED-NOTHING-IS-GLOBAL`).** `pnpm phi-scan` with no arguments (what CI runs) walks
  two roots, `test/fixtures` and `src`, and refused a sweep only when it had read **zero files in
  total**. Any one surviving file satisfied that, so a single `src/` module vouched for the whole
  fixture corpus and vice versa. **Reproduced on `04e4bc6` before the fix, three ways**, each
  printing `[phi-scan] OK: no hits` and exiting **0**: `test/fixtures` moved aside, `test/fixtures`
  replaced by a **dangling symlink**, and `src` moved aside. The first two leave all 106
  non-markdown fixtures unread; the third leaves all 95 source files unread.

  **The dangling case is the sharpest, and nothing else in the scanner can see it.** `existsSync`
  **follows** the link and answers false, so `walk()` returns before `readdirSync` and the
  not-a-regular-file refusal never fires: that rule only ever classifies entries found **inside** a
  root, and this is the root itself. Absent, dangling and empty are one state to the walk. This
  reporter prints no file count either, so there was not even a suspicious denominator to notice.

  **The rule is now per-root.** All-mode refuses (exit **2**) unless **every** declared root
  yielded at least one file that was actually read, and the refusal names the starved roots.
  Observing nothing at all is the all-starved case of that one rule, not a second rule beside it,
  so the previous wording carries. Hits found under the roots that **did** yield are printed before
  the refusal, so an incomplete sweep never swallows a real finding; the exit code is still 2.

  **Deliberately unchanged:** `--staged` and named-path mode make no per-root promise, because
  neither enumerates a root. `--staged` legitimately has nothing to scan when a commit touches only
  markdown, and named-path mode is bounded by the caller's argv. Both boundaries are pinned by
  tests, and widening the rule to either was run as a mutation rather than argued.

  **The granularity is the declared root and nothing finer, which is a real bound, not a slogan.**
  Three states still exit **0**, each measured with the rule in place and each now recorded in the
  scanner's own limits list with the command that produced it and pinned by a characterization
  test: a directory missing from **inside** a root (`mv test/fixtures/canonical ..` still prints
  `OK: no hits`, 27 fixtures unread); a root that is **itself a symlink**, which is followed, so
  the rule is satisfied by whatever is on the other side of it; and the floor is **one file**,
  whatever the root used to hold. One shape often listed with those is **not** open here and is
  written down so it is not ported in as if it were: a root that is a regular file, or a link to
  one, refuses at exit **2** rather than the 1 this gate reserves for hits, because `walk()`
  already wraps `readdirSync` and rethrows the `ENOTDIR` on the scanner's own channel.

  Repository commit-gate only. No runtime or API change.

- **A staged RENAME bypassed the PHI scan's pre-commit route entirely
  (`PHI-SCAN-RENAME-BLIND-AT-PRECOMMIT`).** `git diff --cached --raw --diff-filter=AMT` returns
  neither `R` (rename) nor `C` (copy), and rename detection is on by git's default, so
  `git mv <link> test/fixtures/<name>` staged as `:120000 120000 <sha> <sha> R100` with **two**
  paths and the filter deleted the record outright. **Reproduced on `ae4a35f` before the fix**, in
  a throwaway repo: an ordinary `git mv` put a mode-`120000` entry under a scan root and
  `pnpm phi-scan --staged` printed `OK: no hits` and exited **0**. A rename that also
  **substitutes a real name** into the moved file passed the same way (measured at `R098`, mode
  `100644`, a real-looking surname in the staged blob). The gap is at **pre-commit**; the all-mode
  sweep is the backstop, and it saw both.

  **The remedy is `--no-renames`, and it needs no stride work and no scope decision.** An earlier
  reading of this gap said admitting `R`/`C` required the two-path `--raw` record shape handled;
  that reading was wrong, and the previous entry in this file repeated it. Turning detection off
  makes the destination arrive as an ordinary single-path `A`
  (`:000000 120000 0000000 <sha> A`) and the source a `D` the filter already drops. Verified under
  `diff.renames=true|copies|false|1` and `diff.renameLimit=1`: every one yields the same
  single-path `A`, so the two-field stride is **structural** rather than conditional on the
  caller's git config, and the new enumeration **contains** the old one (pinned by
  a test that compares the two path sets under each of those settings).

- **A staged COPY bypassed the same route, and no rename fixture reaches it.** With
  `diff.renames=copies`, copying an out-of-scope PHI-bearing file INTO a scan root stages as a
  genuine `C100` two-path record and was dropped exactly as a rename was: measured **exit 0**
  before and **exit 1** after. One precondition is
  recorded because it is easy to state this too broadly: config-only copy detection also needs the
  COPY SOURCE modified in the same staged diff. Without that, git finds no copy source, the record
  arrives as an ordinary `A` that even the old argv enumerated, and a naive copy fixture passes on
  both scanners while proving nothing.

- **A scan ROOT'S OWN path was outside the `--staged` filter, on both roots.** An index entry at
  exactly `test/fixtures` or exactly `src` is never a directory, because git records no entry for
  one, so it is a scan root REPLACED by a blob, a link or a gitlink. The prefix test alone let that
  through: measured **exit 0** over a staged mode-`120000` `test/fixtures`, and again over `src`.
  The filter now matches each root's own path as well as the prefix. This is the one **addition to
  the path scope** in this change, and it is stated as such rather than filed under "narrowing".
  The `.ts` suffix rule is deliberately not applied to `src`'s own name: that rule is a judgement
  about bytes the route could have read, and the name of an entry that replaced a walk root is no
  evidence about what is on the other side of it.

- **The PHI scan reported clean over an UNMERGED path.** `U` is returned by neither `AM` nor
  `AMT`, so a conflicted in-scope path made `--staged` print `OK: no hits` and exit **0** over an
  index it structurally cannot read (measured, with a real-looking surname in one of the stages).
  Such a path is recorded at one or more of stages 1/2/3 and never at stage 0, so `git show :<path>`
  fails outright
  and there is no one staged blob to scan. It is now enumerated and **refused** (exit 2), with its
  own message: a `U` record's destination mode is `000000`, and the existing mode refusal's
  sentence about `git show` handing back a target path is false for an unmerged regular file.
  **The bound, stated precisely:** git itself refuses to commit while a path is unmerged, so this
  was never a route to a committed leak. What it was is the gate attesting clean over a state it
  never observed, and `pnpm phi-scan --staged` is run by hand and from scripts as well as from the
  hook.

- **The PHI scan exited 1, its code for HITS FOUND, when it had not scanned anything.** A missing
  or unreadable `scripts/phi-allow-list.txt` and a walk root `readdirSync` could not list both
  threw out of `main` uncaught, and node reports an uncaught throw as exit **1**, with a v8 stack
  trace in place of the scanner's own diagnostic. Both now refuse with exit **2** and a named
  `[phi-scan]` line, and a top-level backstop catches whatever else throws so nothing can reach
  node's default handler again. Nothing downstream reads the difference today (both codes are
  non-zero and the gate blocks either way); a caller that ever split them would have read a scan
  that never started as a scan that found PHI.

- **The PHI scan read a symbolic link as clean on BOTH of its enumerating routes
  (`PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES`).** A link under a scan root pointing at a PHI-bearing
  file passed the gate twice over. **Reproduced on `5debd18` before the fix**, in a throwaway repo,
  with a synthetic name-bearing HL7 message placed outside the walk roots and a link to it at
  `test/fixtures/leak.hl7`: all-mode printed `OK: no hits` and exited **0**, `--staged` after
  `git add` did the same, and naming the target file explicitly exited **1** with seven hits
  (`PID-5` twice, `PID-7`, `PID-11`, `PID-3`, and the shape pass's `(ssn)` and `(email)`). The
  payload was always detectable; the two routes never looked at it.

  **Two mechanisms, two fixes, and neither route is made to follow the link.** `walk()` enumerates
  `Dirent.isFile()`, which is an lstat answer, so a link is neither a file nor a directory and fell
  out of the loop silently; `isDirectory()` answers false for a **linked directory** too, so a whole
  subtree left the same way. `--staged` reads content with `git show :<path>`, and git stores a link
  as its **target path** under mode `120000`, so that route was handed the path text and never the
  target's bytes. That route is this package's pre-commit hook. Following a link would read bytes
  the enumeration does not control (outside the repo, a loop, a device, a FIFO that blocks the gate
  forever), and git does not carry those bytes anyway, so a hit on them would be a claim about
  something no commit contains. **The enumeration is narrowed instead:** an in-scope entry that is
  not a regular file **refuses the scan** (exit 2), naming every offender rather than the first.
  `--staged` reads `git diff --cached --raw -z` so the destination mode is visible, and refuses
  `120000` and `160000`; an unparseable `--raw` record refuses too, rather than scanning a list that
  may be short.

  **`--diff-filter=AMT`, and the `T` is load-bearing.** Replacing a **tracked** regular file with a
  link is neither an add nor a modify: git raises it as a typechange
  (`:100644 120000 <sha> <sha> T`), so `--diff-filter=AM` deleted the record before any mode could
  be read and the mode check was unreachable for exactly the files the repo already had. Measured
  here: with `AM` the raw output for that stage is empty. Admitting `T` also scans the **reverse**
  typechange, a link replaced by a real file carrying PHI, as the file it became.

  **A refusal names the entry's own repo-relative path and an engine-owned kind token, never the
  link target**, which is working-tree text that can itself carry PHI. The scanner's docblock states
  the risky target shape in the abstract rather than showing one, because a diagnostic about a PHI
  leak is itself a PHI surface and that applies to the prose explaining it.

  **Two behaviour changes that fall out of the same narrowing, both measured, both intended.** A
  FIFO under a walk root used to be skipped (base exit 0) and now refuses (exit 2, named as
  `a FIFO`). And an SSN or email shape sitting in a link's target _path_ used to fire on the shape
  pass under `test/fixtures/` and now never runs, because the entry is refused before anything is
  read. A refusal that names the entry is a better answer than a hit that only describes a filename,
  so both are the intended trade rather than a loss.

  **What this does NOT close, stated so it is not read as wider than it is.** `R` (rename) and `C`
  (copy) are still not enumerated by `--staged` at all, so a staged rename that appends PHI passes
  that route; admitting them needs the two-path `--raw` record shape handled, which is a scope
  decision rather than this one. If such a record ever reached the parser the field stride would
  desync and it refuses, which is the safe outcome.
  **CORRECTED 2026-08-04, ON BOTH CLAUSES, and left in place rather than edited because it
  shipped. Read this note before acting on the paragraph above it: the paragraph now describes a
  hole that is CLOSED.** (a) `R` and `C` really were not enumerated by `--staged`, and a staged
  rename into a scan root really did pass that route, but that is no longer true: the route reads
  `--no-renames`, so the destination arrives as an ordinary single-path `A` and is scanned. (b)
  Closing it needed neither the two-path `--raw` record shape nor a scope decision, which is what
  the second clause asserted; `--no-renames` does it under every `diff.renames` and
  `diff.renameLimit` setting, with the record stride untouched. A first draft of this note rebutted
  only (b) and left (a) reading as a live hole under a "What this does NOT close" heading, which a
  reviewer caught. See the `PHI-SCAN-RENAME-BLIND-AT-PRECOMMIT` entry at the top of this section
  for the measurement.
  `--staged`'s path scope is unchanged
  (`test/fixtures/**` and `src/**.ts`), and the walk's gitignore exemption is unchanged: an ignored
  link is out of scope by the same rule that already excludes an ignored file, though an entry in
  the index cannot be excused that way. That prefix is literal, so a link staged at exactly
  `test/fixtures` (the root itself, not an entry under it) is outside the `--staged` filter and is
  unchanged here; it is not both-routes-blind, because `readdirSync` resolves a symlinked walk root
  and all-mode reads straight through it (measured, exit 1 on the PHI). **(c) CLOSED 2026-08-04:
  the `--staged` filter now matches each root's own path as well as the prefix, on both roots.**
  A tracked file absent from the worktree is still caught at `git add` time only. The enumerate-then-read tolerance and the
  refuse-a-sweep-that-observed-nothing rule are untouched.

  Pinned by 19 cases in `test/scripts/phi-scan.test.ts`, **8 of them red on `5debd18`**, all against
  throwaway git repositories so no link and no violator is ever written into the committed corpus.
  The payload is name-bearing and the link target's own filename carries a name, so the
  "never echo the target" assertions are not vacuous.

- **The `attw` publish gate reported a pass on a tarball that carried no types (`ATTW-FALSE-GREEN-PORT`).**
  `package.json` ran `attw --pack .`, and that command prints "This package does not contain types."
  and **exits 0**. Every caller that reads the status, including `prepublishOnly` and the shared CI
  pipeline, read the 0. A false red costs an hour; a false green merges.

  **The defect is `attw`'s exit code, not the invocation and not concurrency.** In this repo's own
  `@arethetypeswrong/cli@0.18.4`, `dist/getExitCode.js` opens with `if (!analysis.types) return 0`,
  so the problem list is never consulted. No `--profile`, `--ignore-rules` or config setting reaches
  that early return. For a package that ships types, "does not contain types" does not mean "fine,
  untyped"; it means the declarations were not in the tarball, which is a broken publish.

  **Reproduced here with no concurrency at all** (2026-08-03, Node 22): `rm -f dist/index.d.ts
dist/index.d.cts && pnpm attw` and `rm -rf dist && pnpm attw` both printed the sentence and exited 0. A race only supplies the condition. `tsup` emits the JS bundles in one pass and the declaration
  files in a later one, so there is a window in every build of this package where `dist/` holds
  `.mjs`/`.cjs` and no `.d.ts`: timed on two clean builds here, `dist/index.mjs` appeared at 3.57s
  and 3.58s and `dist/index.d.ts` at 5.81s and 5.65s, a window of 2.24s and 2.07s. A concurrent
  build or `pnpm clean` in the same working tree lands `attw` in it. **That is deliberately not
  answered with a lock, a lease or a build queue**: the gate has to be able to say its own inputs
  were missing, whatever removed them.

  **The fix is `scripts/attw.mjs`, and it carries two nets that catch different things.** A
  **preflight** checks that every relative artifact path `package.json` promises (`main`, `module`,
  `types`, `typings`, and every string leaf of `exports`) exists and is non-empty before `attw` runs;
  it is structural, does no string matching, and names the missing file. A path written **without** a
  leading `./` counts: `"types": "dist/index.d.ts"` is legal for those four fields and is normalized
  rather than skipped, since skipping it would leave the preflight quietly narrower than every
  sentence describing it. Wildcard `exports` patterns (they name a set, not a file), absolute paths
  and `package.json` itself are skipped. A manifest that declares **nothing** is refused rather than
  passed, because a preflight with no inputs is not a preflight that succeeded. A **post-check** fails
  when
  `attw` still reports an untyped package, which is the case the preflight structurally cannot see:
  declarations present on disk but excluded from the tarball by `files` or `.npmignore`. **No
  instance of that second case is on record in this repo.** The post-check reads a printed sentence,
  so the routes that would hide it are refused rather than tolerated: `--quiet`, `-q`,
  `--format json`, `-f json`, `--format=json`, `-fjson`, `-qP`, `-Pf json`, a `.attw.json` setting
  `quiet` or `format`, and `--config-path`. Each of the first nine was measured against this
  package's own untyped tree to return exit 0 with the sentence absent; `--config-path` is refused by
  inference, not measurement. The refusal is by option name, wholesale, not by value. Other arguments
  are still forwarded, so `--profile node16`, `--no-summary`, `--no-emoji` and `--no-color` work.

  **Short options are matched by letter anywhere in the cluster, not by whole token, and that is not
  cosmetic.** `commander` bundles short options and lets a value ride on the end, so `-fjson`, `-qP`
  and `-Pf json` are `--format json` and `--quiet` in another spelling. Measured against a package
  whose declarations sit on disk but are excluded from `files`, which is the one shape only the
  post-check can see, a token-matching guard returned **exit 0** on `-fjson` and on `-Pf json`.
  `-qP` was caught, but only by the empty-transcript net rather than by the refusal.

  **A second class of argument is refused for a different reason, and calling it blinding would be
  wrong.** `--help`, `-h`, `--version` and `-V` print and exit 0 without analysing anything: measured
  on the untyped fixture at 2766 and 48 bytes of output, exit 0, no untyped sentence. The transcript
  is non-empty, so the empty-transcript net does not fire either, and the gate would have read a pass
  off a run that checked nothing. `--definitely-typed` is refused alongside them **by inference, not
  by measurement**, and the distinction is kept because the measurement was attempted and did not
  reproduce: with a version range the untyped sentence still printed. It is refused on a reading of
  the CLI, where a value that looks like a path merges external declarations into the analysis, which
  would let a package that ships none come back typed. `--no-definitely-typed` is a distinct option
  name and is deliberately not refused.

  **Both of this repo's manifests are fixed, because the census that matters is manifests rather
  than repo roots.** `package.json` and `examples/profile-starter-kit/package.json` each ran the
  bare CLI, and the kit is a template a consumer copies out and publishes from, so leaving it would
  have re-minted the false green in every generated package. The kit gets its own copy, whose code is
  **byte-identical** to the root one below the docblock and is pinned that way by a test; only the
  comment differs, because one is written for a maintainer here and the other for a consumer who
  copied the kit out. Two copies of a gate drift, and the kit's copy is executed by nothing in this
  repo's CI, so the identity pin is what makes the behavioural tests true of both.

  `test/scripts/attw-gate.test.ts` pins the defect and the remedy against the real binary: that bare
  `attw` exits 0 on both shapes (declarations unpacked, and declarations never built) and on
  `-fjson`, that the wrapper reds each of them, that the preflight names a missing, an empty and a
  `./`-less artifact and refuses a manifest that declares none, that a real `attw` failure still
  propagates `attw`'s own status, that the wrapper is transparent on a well-formed package and does
  not refuse the options that blind nothing, and that each refusal holds. If a future `attw` fixes
  the exit code or rewords the sentence, the suite reds and sends the reader to the wrapper rather
  than letting the net go quietly slack. No runtime or API change; this is a build and publish gate
  only.

- **A warning or error message could carry clinical text into a log line (`HL7-WARN-MSG-PHI`).**
  No options were required to reach it: plain `parseHL7(raw)` on lenient defaults.

  **The mechanism.** `normalize()` rewrites every `\r\n` and `\n` in the input to `\r` before
  segment splitting, unconditionally and with no field awareness. HL7 v2 Ch. 2 fixes the segment
  terminator as `<CR>` and provides `\.br\` (§2.7.6) precisely because a literal line break cannot
  appear inside a field, but real senders emit raw breaks inside narrative fields (`OBX-5`, notes,
  embedded documents), which is exactly the class of sender violation this parser exists to
  tolerate. When one occurs, the remainder of that field becomes a forged segment, and `tokenize()`
  takes the whole line as its segment identifier because a line with no field separator offers no
  other candidate. `UNKNOWN_SEGMENT` then interpolated that "identifier" uncapped, putting synthetic
  name, date of birth and medical record number into `Hl7ParseWarning.message`. Under
  `{ strict: true }` the same text reached the thrown `Hl7ParseError.message`, and therefore
  `.stack`.

  **The disclosure was inverted, which is what made it consequential.** Guidance said to redact
  `Hl7ParseError.snippet`. On the strict path `snippet` holds the head of the message (usually the
  MSH header) while `message` held the payload, so a consumer following the documented mitigation
  exactly still logged the data. `message` is also the field a logger prints by default and the one
  `stack` embeds.

  **The fix: bound at the factory, not at the call site.** A token taken from input is echoed only
  when it matches the form the spec defines for it, and becomes `<withheld>` otherwise. A length cap
  was rejected because truncating still emits the first N characters of a patient name. Segment
  identifiers are held to exactly three alphanumerics (HL7 v2 Ch. 2 §2.5), with equivalent forms for
  MSH-9 types and MSH-12 versions. Conforming tokens render byte-identically, so `PID`, `ZZZ` and
  every legitimate Z-segment name are unchanged and well-formed input sees no behaviour change:
  1653 existing tests pass untouched. Placing the check in the factories rather than at the one live
  call site also covers the six factories currently exported but unreached, and consumers who
  construct warnings themselves.

  **Charset labels are bounded by registry membership, not by spelling, and that distinction was
  earned the hard way.** The first version of this fix used a shape test for them too, and a refuter
  broke it: the shape admitted all five of the PHI-shaped markers this repo's own property suite
  defines, including an 18-character patient name. Table 0211 is a **closed** table and
  `UNKNOWN_CHARSET` fires precisely when a label is absent from it, so at the moment of the warning
  there is no spec-defined spelling left to test against, and `UNICODE UTF-8` and a patient name are
  shape-siblings. No regex can separate them. A label is now echoed only when `resolveCharset`
  recognises it.

  **What is bounded, stated without overclaiming.** `snippet` is the only field carrying input
  verbatim and unbounded, so it is the one to redact first. A message cannot carry a field's value,
  but it can carry a residue of up to three characters when a malformed line happens to look like a
  segment identifier. No absolute "never carries field content" claim is made anywhere in this
  package, because the code cannot honour one.

  **Two adjacent surfaces bounded in the same pass.** `UNKNOWN_CHARSET` and `ENCODING_MISMATCH`
  interpolate a value read as MSH-18, which on a message carrying no segment terminators is not
  MSH-18 at all but the 18th `|`-token of the flattened input, commonly a data field. That path is
  Buffer-only, and `parseStream` and `splitBatch` re-encode each split message to a Buffer, which is
  the ordinary MLLP and file ingestion shape, so it is not an exotic corner.
  `MISSING_EXPECTED_GROUP` and `MERGE_MISSING_PRIOR_OR_SURVIVOR` interpolate MSH-9.

  **The test gap is the real finding.** The PHI property suite could not reach this position: every
  generated marker sat after a `|`, so it was always a field value to the tokenizer, while the only
  position that leaks is a line's **leading** token. A green suite over an unreachable case is
  indistinguishable from a correct one. New generators emit the real trigger (a field-internal `\n`
  and `\r\n`) across the lenient and strict arms, asserting on `.stack` separately from `.message`
  because most error reporters ship the stack off-box, and pinning the escalated code on both
  strict properties so neither can pass vacuously if some other warning escalates first. A second
  set covers the Buffer/MSH-18 path, which every string-input generator in the suite structurally
  misses, and a third asserts the invariant on the parsed **model**. All ten new tests fail on the
  code they were written against and pass on this one.

  **The same lesson applied to this fix's own first draft, which is why it now bounds the model
  too.** Bounding the warning message protected this package's diagnostics and nothing else.
  `Segment.type` still carried the entire forged line, so a consumer that reads the model and builds
  its own report from that "identifier" wrote clinical narrative into it, on lenient defaults, with
  no options set. **A diagnostic-surface fix does not protect a downstream package that reads your
  model and builds its own diagnostics from it. Bounding at the model protects both.**
  `Segment.type`, `Hl7Message.version` and the unrecognized branch of `MessageStructure` now carry
  bounded identifiers, and the shared primitive moved to `src/parser/tokens.ts` so the parser and the
  model use one bound rather than two.

  **One bound deliberately not taken, named rather than left implicit.** On the _recognized_ branch
  of `MessageStructure`, `triggerEvent` is echoed verbatim, and a definition matching on message code
  alone (`ACK`) accepts an arbitrary MSH-9.2. Left unbounded on purpose: no real sender putting
  narrative in MSH-9.2 is grounded in a de-identified document, and widening the guard there is a
  separate change, not a silent extension of this one. An earlier comment in that file asserted the
  branch returned registry values and could not carry input, which was false; the claim is corrected
  rather than the guard grown.

  **What stays unbounded, deliberately, because bounding it would be a mis-parse.** The model
  separates **identifiers** from **values**. `Meta.*` is the documented value view of the MSH header;
  `Segment.fields`, `Segment.raw` and `Hl7Message.rawSegments` are the raw tokenization the
  byte-verbatim round-trip serializes from; `toString()` / `toJSON()` / `prettyPrint()` are the
  message itself. Those are content surfaces and say so. `meta.version` in particular keeps MSH-12
  exactly as it arrived and is what the v2.7 MRG field-scoping reads, so bounding
  `Hl7Message.version` changes no clinical field selection.

  **Docs corrected in both directions.** `docs-content/troubleshooting.md` asserted that warning
  messages never echo a field's value, an overclaim; it and the equivalent assurances in
  `normalize.ts` and `warnings.ts` now state the check that makes it true. The `Hl7ParseError`
  disclosure now says `snippet` is the field to redact first, rather than claiming a message is
  clean. `README.md` called the snippet an excerpt of "the offending input" when it is always
  taken from the start of the message; the wording is corrected rather than the behaviour, because
  re-pointing the snippet at the deviation's own segment would move more clinical content into the
  single unredacted field.

  **Not a mis-parse.** Parsed values were always correct; this was a diagnostic-surface leak.
  Consumers on any published version up to and including `0.0.3` should treat
  `Hl7ParseWarning.message` and `Hl7ParseError.message` as potentially carrying field content for
  feeds they do not control until they upgrade.

- **Stale counts in `docs-content/`, found while correcting the PHI wording.** The warning-code
  count was given as 19 in three places (it is 20), and two pages quoted a published npm version
  that was two releases stale. Both now point at the registry rather than restating it, which is the
  only way a doc page stops drifting from it.

- **Four false claims in the README's feature list, each re-derived from source rather than from
  memory (`README-CLAIM-DRIFT`).** Every number and version below was measured against the thing it
  describes, in the order a consumer would have to trust it:
  1. **Node 18+ to Node 22+**, in the badge (`node-%3E%3D18`) and in the prose. `engines.node` is
     `>=22.0.0` in `package.json` and in the registry (`npm view @cosyte/hl7 engines`), and CI runs
     the 22 + 24 matrix. This was the one with a consumer-visible consequence: `npm i @cosyte/hl7`
     on Node 18 warns on engines while the package page says 18 is supported.
  2. **ES2022 to ES2023.** `@cosyte/tsconfig/base.json` sets `"target": "ES2023"` and
     `"lib": ["ES2023"]`, and this repo's `tsconfig.json` extends it without override.
  3. **18 to 20 stable warning codes.** `WARNING_CODES` in `src/parser/warnings.ts` has 20 keys, and
     `test/warning-codes.snapshot.test.ts` already asserted `toHaveLength(20)`. A green test suite
     and a wrong package page coexisted. **No other surface says 18, but that is not the same as the
     count now being consistent**: further down `README.md`, an inline prose list of 16 code names is
     still introduced as "the full list of Tier-2 codes", and `docs-content/` says 19 in three
     places. Those are pre-existing, outside this feature list, and left for their own change rather
     than folded in here.
  4. **"Every public export has JSDoc + `@example`" to "every public function and class."** Measured
     over the 213 names in the built `dist/index.d.ts` export list: all **79 functions** and all
     **5 classes** carry both, but of 17 value constants one (`ERR_CONDITION_CODE_SYSTEM`) has JSDoc
     with no `@example`, and while all **109 type-only exports carry JSDoc, only 73 carry an
     `@example`**. The three aliased namespace exports (`HL7`, `conformance`, `text`) fail the old
     wording outright: two carry no JSDoc at all and the third has no `@example`. The narrowed
     sentence is exactly true; the old one was not.

  **The rest of the feature list was checked the same way and is correct**, so it is unchanged:
  4 fatal codes (`FATAL_CODES` has exactly 4 keys), 8 built-in vendor profiles (the frozen `profiles`
  namespace has 8, and the eight vendor names match), zero runtime dependencies (`dependencies` is
  present and empty, and there is no `peerDependencies`), `noUncheckedIndexedAccess` (true in the
  inherited base config), dual ESM + CJS (the `exports` map resolves `import` to `.mjs`/`.d.ts` and
  `require` to `.cjs`/`.d.cts`, and `attw` passes node10, node16-CJS, node16-ESM and bundler), and
  the two linked paths (`examples/profile-starter-kit/`, `docs-content/spec-notes-escapes.md`) both
  resolve.

  **`CLAUDE.md` already said Node >= 22 and Target ES2023, so the repo contradicted itself and
  nothing caught it.** The two files drifted in opposite directions because only one of them is read
  by a consumer, and it is the one that drifted. No gate compares a README claim to the config it
  describes, which is why these were found by hand.

- **`scripts/sync-version.mjs` hardened against two latent defects, and gated in CI
  (SYNC-VERSION-HARDENING).** Follow-up hardening on the VERSION-SYNC script; ported byte-identically
  across `hl7`, `x12`, and `mllp`. (1) The version was spliced into `src/index.ts` via
  `String.prototype.replace` with a _replacement string_, which interprets `$&`, `$1`, `` $` ``, etc.,
  so a version like `1.2.3-$&x` would inject the matched text and corrupt the `VERSION` constant while
  exiting 0. The replacement is now a replacer _function_, whose return value is inserted literally.
  (2) The declaration regex was non-global, so `.replace` silently rewrote the _first_ match; a
  column-0 decoy (e.g. inside a comment) ahead of the real declaration could be edited instead. The
  script now matches globally, asserts exactly one declaration, and exits non-zero loudly otherwise.
  Neither defect is reachable through Changesets today and both previously failed loud rather than
  shipping a lying `VERSION`, so this is hardening, not a fix for an observed break. The
  `format`/`format:check` globs now cover `scripts/**/*.mjs` so the script is prettier-gated in CI (it
  was matched by no glob before). Build tooling only: no runtime or public-API change.
- **The Release workflow can actually start.** `.github/workflows/release.yml` calls the shared
  `cosyte/.github` pipeline, which requests `contents`/`id-token`/`pull-requests: write`, but declared
  no `permissions:` of its own, so it inherited the repo default of `contents: read`. A called
  workflow may only downgrade the caller's `GITHUB_TOKEN`, never escalate it, so GitHub rejected the
  workflow at startup (~1s, no jobs, no logs). Every Release run from June 2026 until now failed this
  way, unnoticed, because a `startup_failure` produces no logs to read. The caller job now declares
  the three scopes explicitly. CI-only: no runtime or API change.

- **The `VERSION` export now tracks `package.json`, and the missing `version` script is restored
  (VERSION-SYNC).** Two latent release bugs, both of which would have bitten at the first publish.
  (1) `VERSION` was hardcoded `"0.0.0"` in `src/index.ts` while `changeset version` bumps only
  `package.json`, so a published `0.0.1` would have shipped an export reading `"0.0.0"`. Every
  consumer asserting on or logging `VERSION` told the wrong version of the parser they were running.
  New `scripts/sync-version.mjs` rewrites the constant from `package.json` (idempotent; exits
  non-zero if the declaration is renamed rather than silently no-op'ing). (2) **No `version` script
  existed at all.** The shared `cosyte/.github` release workflow drives Changesets with
  `version: pnpm run version`, which would have failed with `ERR_PNPM_NO_SCRIPT`, so the "Version
  Packages" PR could never have been opened. `test/sanity.test.ts` now compares `VERSION` against
  `package.json` rather than asserting its shape against a regex. The old test would have stayed
  green through exactly this drift. Ported from `@cosyte/mllp` (MLLP-10); `hl7` is the canonical
  form the siblings mirror. No version bumped, nothing published, still `0.0.0`.

- **Value reads no longer double-decode (HL7-VALUE-REDECODE). Behavior change on a rare, spec-legal
  input (pre-alpha).** The tokenizer already unescapes every subcomponent once on parse, but
  `Field.value`, the dot-path `get()`/`resolvePath`, and the composite coercions (`asXpn`/`asCwe`/`asCx`/…
  via the shared `readSubcomponent`, plus `asNm`/`asTs`) ran a **second** `unescape` over the
  already-decoded value. A value whose own decoded bytes look like an escape was therefore decoded
  twice: a wire `\E\F\E\` decodes once to the literal `\F\`, which the second pass wrongly turned into
  the field separator `|`. Readers now return the once-decoded subcomponent verbatim
  (`field(5).value` of `A\E\F\E\B` is `A\F\B`, not `A|B`); the common single-escape case is unchanged
  (`\F\` → `|`), and emit stays byte-verbatim (the HL7-ESC raw overlay is a separate, untouched path).
  Found by the HL7-ESC conformance-refuter; pinned by `test/value-redecode.test.ts`.

### Changed

- **Datetime precision + timezone fidelity: the TS/DTM composite (roadmap
  Phase N). Breaking (pre-alpha).** `field.asTs()` and every helper datetime now
  return the fidelity `TS` (`DtmParts`: `{ raw, valid, precision, year, month
(1–12, spec-native), day, hour, minute, second, fractionalSeconds (verbatim),
hasTimezone, offsetMinutes }`) instead of the old `{ raw, date }`. HL7 v2
  Ch. 2A DTM sets a value's **precision** by how many characters are populated,
  and a missing offset defaults to the **sender's** local zone, not UTC. The
  prior code zero-filled truncations (`|1970|` → `1970-01-01T00:00:00Z`) and
  coerced an offset-less value to UTC, which silently shifted a day-only birth
  date `|19880705|` to the previous calendar day in any negative-offset zone
  [S-DTM-IMPL]. Now precision is preserved (no zero-fill), a missing offset is
  **flagged** (`hasTimezone: false`) and never resolved, and no eager `Date` is
  built. An absolute instant is materialized **only on explicit request** via
  `dtmToDate(ts, { assumeOffsetMinutes? })`, which returns `undefined` for an
  offset-less value rather than guessing UTC. Applies to `meta.timestamp`,
  `patient.dateOfBirth`, `visit.admit/dischargeDateTime`,
  `observations.observedDateTime` + `TS`/`DT` observation values,
  `allergies.onsetDate`, `diagnoses.dateTime`, `insurance.effective/expirationDate`,
  and `immunizations.administered/expirationDate`: each `Date → TS`. Fidelity
  only: no localization, timezone conversion, or arithmetic; `HHMM=0000` is never
  rolled to the previous day. New public exports: `parseDtm`, `formatDtm`,
  `dtmToDate`, and types `DtmParts` / `DtmPrecision` / `DtmToDateOptions`. **No
  warning-code change** (a missing timezone is the structural `hasTimezone: false`
  flag, not a warning). See `docs-content/spec-notes-datetime-precision.md`.

### Removed

- **`parseHl7Timestamp` (and its `ParseHl7TimestampOptions` type), removed
  (Phase N, breaking).** The Date-returning, UTC-assuming timestamp helper is
  replaced by the fidelity `parseDtm` + explicit `dtmToDate`, with
  `parseDtmCascade` covering the MSH-7 user-format fallback path.

### Fixed

- **Escape-sequence emit is now byte-verbatim across the full alphabet
  (HL7-ESC).** The decoded tree conflated recognize-and-preserve escapes (`\H\`,
  `\N\`, `\.sp\`/formatting, `\Cxxyy\`/`\Mxxyyzz\` charset switches, vendor
  `\Z..\`) and hex escapes (`\X41\`) with literal backslashes, so serialize
  **double-escaped** the former (`\H\` → `\E\H\E\`) and **decoded** the latter
  (`\X41\` → `A`, and non-canonical hex casing `\X0d\` → `\X0D\`). Emitted output
  was spec-clean and lossless-as-text but **not byte-verbatim**. A byte-level
  MSA-2/MSH-10 correlation (HL7 v2 §2.9.2.2) could fail. The tokenizer now
  records each affected subcomponent's **original wire bytes** in an internal
  `RawComponent.rawSubcomponents` overlay and the serializer emits from it
  verbatim, so `parseHL7(x).toString()` and `Field.text` reproduce the sender's
  exact escape bytes. `buildAck`'s MSA-2 echo is byte-exact for a
  default-delimiter sender; a **custom-delimiter** sender is re-delimited
  spec-cleanly (the overlay is bypassed when the ACK's encoding differs from the
  inbound's, the sender's raw bytes would otherwise corrupt MSA-2's structure
  under default delimiters, and the decoded id re-parses back correlation-correct
  per §2.9.2.2). **The `\X..\` policy is
  decode-on-read, re-encode-on-emit** (the decoded value surface is unchanged;
  the wire bytes (value and casing) are preserved). Delimiter/newline escapes
  are unaffected (they already round-trip through `reescape`); a decoded CR still
  re-emits as `\X0D\` to protect wire framing. **No public-surface break.**
  `Field.value` and every composite/`toJSON` read the same decoded values as
  before; the overlay is `@internal` and absent from escape-free messages. See
  `docs-content/spec-notes-escapes.md`.
- **PHI leak in the warning surface: `fieldWhitespaceTrimmed` and `unknownEscapeSequence` no
  longer embed field-body content (HL7-TOKENIZE-PHI).** Both builders previously interpolated
  slices of the field VALUE directly into `Hl7ParseWarning.message`
  (`fieldWhitespaceTrimmed`'s before/after strings; `unknownEscapeSequence`'s raw escape body, and
  on an unterminated escape the **entire rest of the field**), so a clinical NTE-3/OBX-5 free-text
  value (PHI) carrying a stray `\` or surrounding whitespace could surface a payload fragment in
  `Hl7Message.warnings`, a leak, since every other warning builder is structural-facts-only.
  `fieldWhitespaceTrimmed`'s signature changed to take leading/trailing **counts** instead of the
  original/trimmed strings; `unknownEscapeSequence` now reports only the escape body's **length**
  plus, when the body's first character is a recognized HL7 escape-identifier letter (`F S T R E
X C M Z H N` or a `.`-prefixed formatting escape, structural HL7 grammar, not PHI), that single
  letter, never the body text. A new `unterminatedEscapeSequence` factory (still
  `UNKNOWN_ESCAPE_SEQUENCE`) covers the unterminated-escape case with no content and no
  tail-length. **No change to parse tolerance or round-trip fidelity.** The escape sequence and
  the whitespace are still preserved verbatim in the parsed/emitted output; only the WARNING
  message lost the body. The `FIELD_WHITESPACE_TRIMMED` / `UNKNOWN_ESCAPE_SEQUENCE` codes are
  unchanged and stable (see `test/warning-codes.snapshot.test.ts`). This is a message-format fix,
  not a breaking change to the code registry.
- **`buildAck` now echoes the full inbound MSH-10 field into MSA-2.** The raw
  field structure is carried over whole (delimiters and repetitions included)
  instead of the component-1-only `meta.controlId` scalar. A vendor-quirk
  control id carrying an unescaped delimiter (`ID^X`) was previously truncated
  to `ID` silently, under a confident positive ACK. A sender correlating on
  the raw MSH-10 bytes (as `@cosyte/mllp`'s client does) would never match the
  ACK and resend indefinitely (HL7 v2 §2.9.2.2: an MSA-2 mismatch is a
  correlation failure). The no-correlation fail-safe now keys on the raw field
  carrying any content, so a leading-delimiter id (`^X`) correlates instead of
  being spuriously downgraded. The echo is now **byte-verbatim** across the full
  escape alphabet (see the escape-fidelity entry below). The earlier
  canonicalization limits (hex escapes decoding to their byte, preserved escapes
  re-emitting as escaped literal text) are resolved. The only remaining
  transform is structural: the ACK emits with default encoding characters and
  trailing insignificant empties canonicalize (D-02).
- **`reescape` now emits a literal CR in decoded content as its `\X0D\` hex
  escape** instead of passing it through raw. A spec-legal `\X0D\` in any
  inbound field decoded to a bare CR (the HL7 segment separator) and
  re-serializing it corrupted the emitted message's framing (a phantom
  segment split mid-field, silently). Reachable through `buildAck`'s MSA-2
  echo among every other emit path; now structurally safe and round-trip
  stable.
- **`interpretAck` surfaces MSA-2 whole** (read-side symmetry).
  `Acknowledgment.controlId` is now the field's canonical wire text
  (`Field.text`), not its first component.

### Added

- **Scheduling / document / charge breadth helpers: `appointments()`,
  `documents()`, `charges()` (roadmap Phase Q, P2).** Three new message-family
  helpers on `Hl7Message`, each mirroring the existing extractor pattern (typed,
  frozen, never-throws, not memoized):
  - **`appointments()`** over **SIU** (S12/S13/S14/S15/S26), projects each
    **SCH** into a typed `Appointment`: placer/filler appointment ids (SCH-1/2),
    **SCH-25 filler status** (Table 0278, verbatim), **SCH-11** start/end timing
    (TQ.4/TQ.5, fidelity `TS`), and the **AIS/AIG/AIL/AIP** resource groups that
    follow it, surfaced as `AppointmentResource`s tagged `service` / `general` /
    `location` / `personnel` (the personnel/provider resource also carries a
    typed `XCN`).
  - **`documents()`** over **MDM** (T02/T04/T06), projects each **TXA** into a
    typed `ClinicalDocument` with the OBX narrative body grouped positionally
    under it. **Completion status (TXA-17, Table 0271) and availability status
    (TXA-19, Table 0273) are surfaced as DISTINCT fields and NEVER conflated.** A
    document can be _available_ before it is _authenticated_, and reading a
    preliminary document as final is the clinical harm this split prevents. Both
    are verbatim / provenance-only.
  - **`charges()`** over **DFT** (P03), projects each **FT1** into a typed
    `Charge`: FT1-6 transaction type (Table 0017), FT1-7 transaction code (the
    institution charge code, CWE), FT1-11/12 extended/unit amounts, and the
    repeating FT1-19 diagnosis linkage. **No billing logic and no
    money-as-float.** Amounts are surfaced as their **canonical CP wire text**
    (e.g. `"150.00^USD"`), never parsed to a `number`.

  New public types: `Appointment`, `AppointmentResource`, `ClinicalDocument`,
  `Charge`. Breadth helpers only: not a scheduling-workflow state machine,
  signature verification, or a claims/pricing engine (roadmap §9
  known-limitations). Never throws on malformed input (HELPERS-07); missing
  fields → omitted keys.

- **NTE narrative grouping: notes attached to their parent by position (roadmap
  Phase P, P1).** NTE (Notes and Comments) segments are now grouped to their
  parent **by position** and surfaced on the relevant helper output. An NTE
  inherits its meaning entirely from the segment it immediately follows (HL7 v2
  Ch. 2, no link field), so attachment is positional: in an ORU
  (`{ [ORC] OBR [{NTE}] [{ [OBX] [{NTE}] }] }`, Ch. 7) a note after `OBX` lands on
  **that result** (`observation.notes`), a note after `OBR`/`ORC` on the **order**
  (`order.notes`: ORC notes first, then OBR), and a note after `PID` on the
  **patient** (`msg.patient.notes`). A note with **no recognized preceding
  parent** (after `MSH`, or after an unsupported segment like `PV1`/`AL1`) is
  surfaced at **message level** via the new **`msg.notes()`**. **Fail-safe,
  never mis-attached, never dropped:** the parent is the _nearest preceding
  non-NTE segment_ (consecutive NTEs chain; any intervening non-parent segment
  resets the target). Order-level notes mirror the `orders()` state machine.
  notes after an `ORC` are buffered and flushed onto the OBR that opens the
  order, so **several `ORC`s before one `OBR` all contribute** in document order,
  not just the last. A note whose recognized parent has **no surfaced
  projection** (a **later `PID`** in a multi-patient ORU (patient view is the
  first PID), or a **trailing/dangling `ORC`** whose order never opens) is
  routed to `msg.notes()` rather than vanishing. Each non-empty **NTE-3 (Comment,
  FT, repeating)** repetition is one note line, with the **full** repetition text
  reassembled + HL7-unescaped, so a non-conformant raw `^`/`&` (which tokenizes
  NTE-3 into components) is preserved, not silently truncated. New optional
  `notes?: readonly string[]` on `Observation`, `Order`, and `Patient` (omitted
  when empty, frozen when present). **Additive only: no rename, no removal, no
  new warning code.** Deferred: NTE-2 (source of comment) / NTE-4 (comment type)
  interpretation, FT formatting-command rendering, and first-class
  `patient.notes` on a 2nd+ `PID`'s group. See `docs-content/spec-notes-nte.md`.
- **Character-set / encoding decode: MSH-18 / Table 0211 (roadmap Phase O,
  P1).** `parseHL7` now resolves a `Buffer` input's declared character set from
  **MSH-18** and decodes the byte stream to text **before** tokenization, through
  a frozen HL7 **Table-0211 registry** (`resolveCharset` / `canonicalCharset`,
  exported). MSH-18 is honoured as a **repeating** field. The **first**
  occurrence is the message default; a blank field is 7-bit **ASCII**. Decodes
  **`8859/1`** via Node's true `latin1` (byte-exact; Node's WHATWG
  `TextDecoder("iso-8859-1")` is windows-1252 and remaps the C1 range, so it is
  not used), ASCII / **UTF-8** (`UNICODE UTF-8` / `UNICODE`), and the faithfully
  decoded **ISO-8859** sets (`8859/2`–`8859/8`, `10`, `13`–`16`); `8859/9` and
  `8859/11` are **recognized but preserved verbatim** because Node's ICU aliases
  them to windows-1254/874 (which remap the C1 range, no faithful decoder). The
  multibyte / ISO-2022 East-Asian sets (`ISO IR14/87/159`, GB 18030, KS X 1001,
  CNS 11643, BIG-5) and UTF-16/32 are likewise **recognized and preserved
  verbatim** (full stateful decode is a documented non-goal). The §2.7.4 charset-switch escapes (`\Cxxyy\` / `\Mxxyyzz\`) are
  recognized by the escape layer and preserved. **Fail-safe (never guess, never
  silently corrupt):** decoding is **strict** (`fatal: true`) except byte-exact
  `8859/1`, so a byte invalid/undefined for the declared set does **not** become a
  silent `U+FFFD`. The bytes are read as a `latin1` 1:1 mapping and a warning
  fires: new **`UNSUPPORTED_CHARSET`** for a recognized set that was not decoded
  (never-decoded, or a strict-decode failure), existing `UNKNOWN_CHARSET` for a
  value not in Table 0211. Recoverability is exact for single-byte content;
  multibyte content is best-effort (a code-unit byte can coincide with a structural
  delimiter, documented). **Behaviour change (pre-alpha):** `UNKNOWN_CHARSET` now
  reads bytes as `latin1` instead of falling back to UTF-8. Both warnings carry the
  charset code only (never a field value) so no PHI is exposed. New public warning
  code `UNSUPPORTED_CHARSET` (`WARNING_CODES` 18 → 19). See
  `docs-content/spec-notes-charset.md`.

- **Order / medication timing: `order.timings` + `med.timings` (roadmap
  Phase M).** `orders()` and `medications()` now surface the timing **structure**
  of an order/medication as a typed `OrderTiming[]`, read from the `TQ1` segment
  (HL7 v2.5+, Ch. 4 §4.5.4) or the **legacy embedded TQ** data type in `ORC-7` /
  `RXE-1` (pre-v2.5, Ch. 2A §2.A.81, detail withdrawn as of v2.7). Modelled:
  TQ1-2 quantity (CQ), **TQ1-3 repeat pattern (RPT, Table 0335)**, TQ1-4 explicit
  time, TQ1-6 service duration, TQ1-7/-8 start/end (DTM → the Phase N fidelity
  `TS`), TQ1-9 priority (CWE), and **TQ1-14 total occurrences (NM), not TQ1-11**
  (the Text Instruction). The repeat pattern is surfaced **verbatim**
  (`repeatPattern.code`), never normalized, resolved to clock times, or mapped
  to a different frequency (reading `Q6H` as "daily", or losing a `BID`, changes
  the administered dose count). A provenance-only `kind`
  (`parametric`/`named`/`unknown`) never drives a schedule; a `parametric`
  `Q<integer><unit>` template surfaces its **load-bearing integer** on
  `repeatPattern.interval`, never dropped. `TQ1` vs the legacy embedded TQ is
  chosen **by presence** (`source: "TQ1" | "legacy"`). The legacy field is read
  only when no `TQ1` accompanies the group, so the same timing is never
  double-counted and a legacy-only timing is never dropped (the legacy source is
  `ORC-7` for an order, `RXE-1` or the preceding `ORC`'s `ORC-7` for a
  medication). Timings group positionally. A `TQ1` may sit either side of the
  order detail, an intervening `ORC` re-scopes a following `TQ1` to the next
  order, and multiple `TQ1` segments each surface (a tapering schedule). New
  public types `OrderTiming`, `RepeatPattern`,
  `RepeatPatternKind`, `TimingQuantity`; `Order` / `Medication` gain an
  always-present `timings` array. **Additive only:** no rename, no removal, **no
  new warning code**. hl7 surfaces the timing structure only; it does not compute
  schedules, resolve "institution-specified times", or interpret sig. Non-goals:
  `TQ2` beyond segment recognition, schedule computation, 2nd+ repetitions of
  repeating timing fields. Never throws (HELPERS-07). See
  `docs-content/spec-notes-timing.md`.

- **`splitBatch()`: batch / file envelope splitting (roadmap Phase L).**
  Demarcates the individual `MSH`-led messages inside an HL7 v2 batch/file
  stream (`[FHS] { [BHS] { MSH… } [BTS] } [FTS]`, HL7 v2 Ch. 2 §2.10.3) and
  hands each one back parsed: either `{ ok: true, message }` or, for a message
  that trips a Tier-3 fatal, `{ ok: false, error }`. A **malformed message
  mid-batch is isolated**, never suppressing its siblings; a **bare single
  message** (no envelope) passes straight through. Declared counts are
  reconciled: **BTS-1** (batch message count) against the messages in the
  batch, **FTS-1** (file batch count) against the batches in the file, and a
  mismatch surfaces the new Tier-2 `BATCH_COUNT_MISMATCH` warning **without ever
  dropping the tail**; an absent (`[0..1]`) or non-numeric count tolerantly
  disables reconciliation. A `BHS`/`FHS` header with no matching `BTS`/`FTS`
  raises the new `BATCH_MISSING_TRAILER` warning (`splitBatch` warns, never
  rejects: enforcing a mandatory envelope is the caller's call). Batch-level
  warnings live on the returned `BatchSplitResult.warnings` (never on
  `Hl7Message.warnings`) and carry **counts / segment names / positions only,
  no PHI**. A `Buffer` stream round-trips through `latin1` so each message's own
  MSH-18 charset resolution runs on its original bytes. Kept a **separate
  surface** from `parseHL7` (which rejects non-`MSH`-first input by design).
  New public exports: `splitBatch`, the `batchCountMismatch` /
  `batchMissingTrailer` factories, and types `Batch` / `BatchSplitResult` /
  `BatchMessageEntry` / `BatchEnvelopeSegment` / `BatchEnvelopeName`. **Two
  additive Tier-2 warning codes** (`BATCH_COUNT_MISMATCH`,
  `BATCH_MISSING_TRAILER`). The stable warning-code contract grows 16 → 18.
  `batches` holds each message run delimited by a `BHS` and/or a `BTS` (a run
  with neither is still yielded in `messages`, wrapped in no batch); FTS-1
  reconciles **per-file** so concatenated files raise no false mismatch. Split-only: no
  batch ACK generation, no envelope enforcement, BTS-3 totals surfaced but not
  reconciled, no transport de-framing (that is `@cosyte/mllp`). Two structural
  limits are documented: reserved envelope names are matched by name (a body
  literally containing `FHS`/`BHS`/`BTS`/`FTS` is mis-split, its tail surfaced
  as a `NO_MSH_SEGMENT` failure, never silently dropped), and one file envelope
  per stream is the modelled case. See `docs-content/spec-notes-batch.md`.
- **`identityEvents()`: patient-identity / merge events (roadmap Phase K, P0
  safety).** `msg.identityEvents()` recognizes the ADT identity-management
  trigger family: merges (A18/A34/A35/A36/A39/A40/A41/A42), moves (A43/A44),
  link/unlink (A24/A37), person add/update (A28/A31). It surfaces every
  party **labelled by role with segment provenance**: the `surviving` party is
  only ever sourced from PID/PV1, the `prior` (non-surviving) party only ever
  from MRG, and the merge direction is the spec constant `MRG_TO_PID` (HL7 v2
  Ch. 3, A18: PID carries the surviving information, MRG the non-surviving),
  never inferred from content. Repeating PID+MRG groups yield one event each.
  Fail-safe: an incomplete MRG→PID pair (no MRG, an orphaned MRG (which is
  never dropped), or a PID with no surviving identifier) surfaces what is
  present plus a new event-scoped Tier-2
  **`MERGE_MISSING_PRIOR_OR_SURVIVOR`** warning carrying structural facts
  only (never an identifier or name, no PHI). The MRG field map is
  **version-scoped**: the backward-compat single-ID fields (MRG-4 / PID-2,
  withdrawn as of v2.7) are not read when MSH-12 declares v2.7+. Applying the
  merge (re-pointing data) stays the consumer's job. New public surface:
  `Hl7Message.identityEvents()`, types `IdentityEvent` / `IdentityParty` /
  `IdentityEventKind` / `IdentityRole`, the `mergeMissingPriorOrSurvivor`
  factory, and the `MERGE_MISSING_PRIOR_OR_SURVIVOR` code. Additive only.
- **`MRG` is now a known segment.** Parsing a merge message no longer emits
  a spurious `UNKNOWN_SEGMENT` warning for MRG.
- **`Field.text`**: the field's canonical wire text (full repetitions/
  components/subcomponents re-serialized with the active delimiters), the
  whole-field counterpart to the component-1-only `Field.value`.
- **`downgradePositiveAck(code)`**: the single upstream source of truth for
  the fail-safe downgrade pair (`AA`→`AE`, `CA`→`CE`; everything else passes
  through), now exported so `@cosyte/mllp`'s `ack-from-hl7` adapter reuses it
  instead of carrying a divergent copy. **`isPositiveAck`** is exported
  alongside it.

### Documentation

- **Adopted the documentation IA spine in `docs-content/`** (umbrella DOCS-D5; reference
  exemplar for the suite). The three `spec-notes-*.md` files (coding-system provenance,
  message-type & structure awareness, version-sensitivity matrix) are now grouped under a
  canonical **Core Concepts** category on `docs.cosyte.com`. They previously existed in
  `docs-content/` but were not referenced from `sidebars.json` and so were unreachable from
  any rendered route. Each now carries minimal frontmatter (`id` / `title` /
  `sidebar_label`) so the sidebar text stays concise; the prose is unchanged. Also
  converted the two CommonMark autolinks in `spec-notes-coding-system.md`
  (`<https://…>`) to Docusaurus-MDX-safe `[text](url)` form. Autolinks parse as JSX in
  MDX 3, which silently broke the link rendering. Doc-only: no runtime/API change.

- **Added a standard-reference primer (`spec-notes-primer.md`), first under Core Concepts.**
  The other `spec-notes-*` pages are implementation notes (what the parser does about one
  spec area); the primer is the spec-grounded companion they elaborate: the v2.x encoding
  model (MSH-1/MSH-2 delimiter bootstrap, the fixed `CR` terminator, the
  field→component→subcomponent hierarchy where only fields repeat), the three field
  population states (populated / not-populated / **null** `|""|`), the abstract message
  grammar (`[ ]` / `{ }` / `[{ }]`, base `OPT` vs. v2.7+ conformance `Usage` codes, and the
  required-different-name-separator rule that makes a flat segment stream reconstructable),
  the **three**-component `MSH-9`, the acknowledgement model (`MSH-15`/`MSH-16`; `CA/CR/CE`
  vs. `AA/AE/AR`), and the `CX`/`XPN`/`XAD`/`HD` composite layouts with their version deltas.
  Cross-links the phase notes for areas they already cover rather than duplicating them, and
  records its provenance (primary Chapter 2 / 2.A text, adversarially fact-checked; the
  official HL7 spec is the text of record). Doc-only: no runtime/API change.

### Security

- **Dev-dependency advisory remediation (no runtime impact, `@cosyte/hl7`
  ships zero runtime dependencies, so the published artifact is unchanged).**
  Added scoped `pnpm.overrides` pinning two transitive **dev/build-time**
  packages to their patched releases: `esbuild` (`>=0.27.3 <0.28.1` →
  `0.28.1`; GHSA dev-server path-traversal, not reachable here: the library
  builds via `tsup`/`vitest` and never runs `esbuild serve`) and the
  `@changesets/parse` copy of `js-yaml` (`>=4.0.0 <4.2.0` → `4.2.0`;
  GHSA-h67p-54hq-rp68 merge-key DoS). The `js-yaml@3.14.2` pulled by
  `read-yaml-file@1.1.0` (via `@manypkg/get-packages` → `@changesets/cli`) is
  **intentionally left**: it calls `yaml.safeLoad`, removed/throwing in
  js-yaml 4, so it cannot be force-upgraded without breaking the release
  tooling, and it only parses trusted local repo YAML at release time. This is
  the shared canonical override block, enforced suite-wide by the
  `@cosyte/config` drift check.

### Changed

- Adopted the shared `@cosyte/*` toolchain standard: ES2023, ESLint 10 + type-checked
  `typescript-eslint`, Vitest 4, `@types/node` 22, exact-pinned dev tools, the shared
  `@cosyte/tsup-config` / `@cosyte/vitest-config`, and thin callers of the reusable `cosyte/.github`
  CI/release workflows. No public API change.
- **Test bar**: added executable PHI-safety property tests
  (`test/property/phi-safety.property.test.ts`). Locks two invariants: warning messages never echo
  field VALUES (only positional context + bounded metadata), and `Hl7ParseError.snippet` length
  stays ≤ 41 chars (40 + ellipsis) for adversarially-large inputs. Snippet **content** may carry
  PHI by design (see `parser/errors.ts:70-72`, the documented consumer-redaction boundary); the
  bound is what we lock in. Does **not** use `@cosyte/test-utils`' `assertNoSecretLeak`. That's
  for `Secret<T>` wrappers (the pathways credentials pattern) and is the wrong shape for parser-
  side PHI surfaces.
- **Coverage policy: `src/profiles/**`coverage hole closed, global`branches`floor restored to
90 (roadmap Phase J, supersedes/absorbs the`H-PHI` coverage-policy entry above).** The D10
transient relaxation is now RESOLVED: targeted tests
(`test/profiles-merge-validate-coverage.test.ts`) closed the `mergeCustomSegments`/inheritance
branches in `profiles/merge.ts`and the validator branches in`profiles/validate.ts`+`profiles/describe.ts`that were unreachable via the public`defineProfile()`API alone.`src/profiles/\*\*`now carries its own`>= 90`per-directory coverage gate
(lines/branches/functions/statements) in`vitest.config.ts`, and the global `branches` floor is
back to the canonical 90, no remaining relaxation. One line
(`validate.ts`'s `validateUniqueFieldNames`throw branch) stays intentionally uncovered and is
documented as provably unreachable by any legally-typed`Record<string, number>`(proven: no
real JS object (literal,`Map`, `Proxy`, or otherwise) can hold two same-named enumerable own
  keys), matching the module's own defense-in-depth JSDoc.
- **Reference test bar: fuzz target, PHI-exec surfaces, and a differential harness (roadmap Phase
  J, "finish the reference test bar").** Three additions, no behavior change:
  - `test/property/fuzz.property.test.ts`: a dedicated high-run-count (1000 runs/property, fixed
    seed) fuzz harness on top of the existing `lenient.property.test.ts` invariant
    ("`parseHL7` either returns an `Hl7Message` or throws an `Hl7ParseError` with one of the 4
    `FATAL_CODES`, never anything else"). Adds two generator families the existing suite didn't
    cover: delimiter-mutation (inject/duplicate/drop the five HL7 delimiters + `\r`) of REAL
    canonical-corpus messages, and truncations of those same messages at every cut point. Also
    snapshots `FATAL_CODES`/`WARNING_CODES` registry membership and asserts a "survivor
    round-trip" property (anything that parses can be `toString()`'d and re-parsed without
    throwing).
  - `test/property/phi-safety-surfaces.property.test.ts`: extends
    `phi-safety.property.test.ts` (which covers the WARNING surface) to the FATAL error-message
    surface: over PHI-shaped field values that trigger each reachable fatal code, asserts
    `Hl7ParseError.message` carries only structural/positional facts, never an echoed field value.
    Separately asserts the documented `errors.ts` snippet contract (bounded length, not
    value-absence, snippets MAY carry PHI by design, redaction is a consumer responsibility) holds
    for BOTH the direct-fatal snippet path and the strict-mode-escalation snippet path
    (`index.ts::buildSnippet`, a distinct call site). Also documents, with a round-trip test, that
    `toString()`/`toJSON()`/`prettyPrint()` legitimately contain field values (content surfaces,
    not diagnostic/log surfaces) so they're never mistaken for a leak path.
  - `test/differential/differential.test.ts`: an oracle-gated differential harness comparing
    `@cosyte/hl7` against the external **python-hl7** parser (BSD license, PyPI package `hl7`) over
    the full canonical corpus (27 fixtures): segment count + per-segment field-text parity. Skips
    gracefully (`it.skip`) when no Python + `hl7` package is available, so `verify.sh`/CI stay green
    without Python. One real, honest divergence was found and documented: `@cosyte/hl7`'s D-02
    trailing-empty-component canonicalization (`Field.text` strips trailing empty
    components/subcomponents; python-hl7's `str()` preserves them verbatim). See
    `docs-content/spec-notes-differential.md` for the full writeup, licensing bound, and other
    plausible-but-unobserved divergence classes.

### Fixed

- **Conformance: v2.7+ truncation char no longer rejects spec-conformant input** (roadmap Phase A,
  P0 correctness). `readDelimiters` previously hard-coded MSH-2 length to 4 and threw the Tier-3
  fatal `INVALID_ENCODING_CHARACTERS` on a 5-char MSH-2, so a spec-valid v2.7+ message carrying the
  truncation character (`^~\&#` and friends) was rejected outright, a fail-unsafe rejection of
  valid input. The parser now accepts both shapes: 4-char (v2.1–v2.6) and 5-char (v2.7+, spec
  §2.5.5.2, the 5th char is the truncation character, default `#`). The `EncodingCharacters` type
  gains a new optional `truncation?: string` field that is set ONLY when MSH-2 actually declared
  one, so messages that predate v2.7 round-trip with a 4-char MSH-2 unchanged. The serializer +
  builder emit the 5th char back when present; pre-v2.7 messages are unaffected.
- **Conformance: standard escape sequences no longer warn as `UNKNOWN_ESCAPE_SEQUENCE`** (roadmap
  Phase A). Six spec-defined escape families are now recognized:
  - `\P\`: truncation character. **Decoded** to `enc.truncation ?? "#"` (spec §2.5.5.2). On
    serialize, the truncation character is re-escaped back to `\P\` ONLY when MSH-2 declared one,
    so pre-v2.7 messages round-trip the character literally.
  - `\H\` / `\N\`: highlight on / off (spec §2.7.1). **Recognized but preserved verbatim.** The
    parser does not pick a presentational policy; the markers stay in the decoded string for a
    downstream renderer to consume.
  - `\.sp\`, `\.in\`, `\.ti\`, `\.fi\`, `\.nf\`, `\.ce\`: formatting commands (spec §2.7.6).
    Recognized and preserved verbatim, same rationale as highlight.
  - `\Cxxyy\` (single-byte) and `\Mxxyyzz\` (multi-byte, 4 or 6 hex): character-set switches
    (spec §2.7.4). Recognized and preserved verbatim because byte-accurate decoding requires
    charset state this module does not own.

  No public surface is removed or renamed; the `WARNING_CODES` registry is unchanged
  (snapshot test asserts additions-only). `\Z..\` (vendor-specific) and genuinely-malformed bodies
  still warn + preserve as before. New fixtures in `test/fixtures/edge-cases/` (`truncation-char-msh2.hl7`,
  `escape-highlight.hl7`, `escape-formatting.hl7`) lock the behavior, including byte-exact
  round-trip through `toString()`.

- **Conformance: SN (Structured Numeric) results no longer silently drop the comparator/range**
  (roadmap Phase B, P0 safety). An `OBX-2 = SN` value (e.g. `<^10`, `>^90`, `^100^-^200`, `^1^:^128`)
  previously fell through the plain-string branch, where `<^10` collapsed to the bare string `"<"`,
  a misread clinical result with a documented patient-harm path (a "less-than 10" result reading as
  the operator alone). `msg.observations()` now dispatches `SN` to a typed `SN` value
  (`comparator` / `num1` / `separatorOrSuffix` / `num2`). Fail-safe by construction: `num1`/`num2` are
  strict-`Number()` parsed (`undefined`, **never `NaN`**), and the comparator is surfaced ONLY when
  SN.1 is a recognized operator (`>` `<` `>=` `<=` `=` `<>`). A non-operator in the comparator slot
  is never passed off as a real relation. The comparator is preserved byte-for-byte across a
  serialize → parse round-trip. New canonical fixture `test/fixtures/canonical/oru-r01-sn-results.hl7`
  and property tests (`test/property/sn.property.test.ts`) lock the invariant over thousands of
  generated values.

- **Types resolution from CommonJS**: the `exports` map now points the `require` condition's types at
  `dist/index.d.cts` (was `index.d.ts`), fixing a "masquerading as ESM" (`attw` FalseESM) issue for
  CJS consumers.

### Added

- **Version-sensitivity hardening** (roadmap Phase H, P1). The coded-element
  composites are now robust to **append-only component growth** across HL7
  v2.1–v2.8, with **no silent truncation**. `CWE` and `CE` gained an optional
  `extraComponents: readonly string[]` that preserves any components beyond the
  modeled set verbatim and in order: **CWE component 10+** (the v2.7
  second-alternate triplet + coding-system / value-set OIDs) and **CE component
  7+**. An absent interior component is held as `""` so `extraComponents[i]`
  maps back to its HL7 component number; trailing empties are stripped and the
  key is omitted when there is nothing past the modeled set. This also unifies
  **CE↔CWE** reading. Because each accessor preserves the other's extra
  components, reading a CWE-shaped value through `asCe()` is no longer lossy (CE
  was deprecated at v2.5, withdrawn at v2.6 in favor of CWE). Parsing a coded
  element with an arbitrary number of trailing components **never throws**
  (forward-compatibility with future versions). The CWE coding-system version
  ids (CWE.7/CWE.8) were already surfaced. Added a `version-growth` property
  test (no-loss / no-throw / CE↔CWE uniformity) and the supported-version matrix
  in `docs-content/spec-notes-version-matrix.md` (incl. the **TS→DTM**
  supersession and the **MSH-21** Conformance Statement ID → Message Profile
  Identifier rename at v2.5). Additive only: `extraComponents` is a new optional
  field; no rename, no removal, no new warning code.
- **Message-type & structure awareness** (roadmap Phase G, P1). A conservative
  **misroute / truncation safety net**. `msg.structure` reports, for the common
  message types, whether the core segment groups the HL7 v2.5.1 abstract syntax
  marks **Required** for that trigger event are present; the parser also emits a
  single additive Tier-2 `MISSING_EXPECTED_GROUP` warning per absent group (e.g.
  an `ORU^R01` with no `OBR`/`OBX` result group). Keys on the **trigger event**,
  not the message family, and models **Required anchors only** (EVN in ADT, PID
  in ORU/SIU, OBR in OML/OMG/OMI, RXA in VXU are deliberately excluded) so a
  conformant-but-sparse message never warns. Every well-formed canonical
  fixture emits zero structural warnings. Recognized types: ADT
  (A01/A02/A03/A04/A05/A08/A11/A13), ORU^R01, ORM^O01, OML^O21, OMG^O19,
  OMP^O09, OMI^O23, SIU (S12–S26), MDM (T02/T06), DFT^P03, VXU^V04, ACK; an
  unrecognized type yields `recognized: false` and emits nothing. Warning-only
  (Tier-2). Lenient parse never throws, `strict` may promote; the message
  carries only structural facts (type, group, anchor names), never a field
  value (no PHI). New public surface: `Hl7Message.structure`, the
  `missingExpectedGroup` warning factory, the `MISSING_EXPECTED_GROUP` code, the
  read-only `MESSAGE_STRUCTURE_DEFINITIONS` registry, `analyzeMessageStructure`,
  and types `MessageStructure`, `StructureGroup`, `ExpectedSegmentGroup`,
  `MessageStructureDefinition` (see `docs-content/spec-notes-structure.md`).
- **Coding-system provenance** (roadmap Phase F, P1). `codingSystem(id)`,
  `codingSystemOf(coded)`, and `alternateCodingSystemOf(coded)` answer "what
  system does this code CLAIM?" off a `CWE` / `CE` (CWE.3 / CE.3 primary,
  CWE.6 / CE.6 alternate). Alias-normalized + case-insensitive
  (`LOINC` → `LN`, `SNOMED` → `SCT`, `RxNorm` → `RXN`) with the original
  spelling preserved verbatim in `claimed`; an unregistered / local id is
  surfaced verbatim with `known: false` (never dropped, never guessed); a
  no-claim input returns `undefined`. The recognized subset is the frozen,
  read-only `KNOWN_CODING_SYSTEMS`: `LN`, `SCT`, `I10`, `I10P`, `RXN`, `NDC`,
  `CVX`, `MVX`, `UCUM`. **Provenance only**: no validation, lookup, network,
  or bundled codeset. `I10` reports the registered Table 0396 claim `ICD-10`
  (the WHO base), NOT a guessed `ICD-10-CM` (see
  `docs-content/spec-notes-coding-system.md`). New public types
  `KnownCodingSystem`, `CodingSystemInfo`, `CodedSystemFields`.
- **Parser**: `parseHL7(raw, optionsOrProfile?)` with a lenient default
  parser that handles vendor-quirky HL7 v2.1–v2.8 input, and a
  `{ strict: true }` mode that escalates every Tier-2 deviation to a thrown
  `Hl7ParseError`. Accepts `string` or `Buffer` input; honours MSH-18
  character set with a user `charset` override option.
- **Warning system**: 14 stable Tier-2 warning codes with positional
  context (`segmentIndex`, `fieldIndex`, `repetitionIndex`, `componentIndex`,
  `subcomponentIndex`): `MLLP_FRAMING_STRIPPED`, `FIELD_WHITESPACE_TRIMMED`,
  `UNKNOWN_ESCAPE_SEQUENCE`, `TIMESTAMP_FALLBACK_FORMAT`, `SEGMENT_CASE`,
  `EXTRA_FIELDS`, `UNKNOWN_SEGMENT`, `DUPLICATE_REQUIRED_SEGMENT`,
  `ENCODING_MISMATCH`, `MISSING_REQUIRED_FIELD`, `OUT_OF_ORDER_SEGMENT`,
  `VERSION_MISMATCH`, `UNKNOWN_CHARSET`, `ACK_NO_CORRELATION_ID`. Exposed via
  `msg.warnings` and the `onWarning` callback.
- **Fatal errors**: 4 Tier-3 fatal codes always thrown as `Hl7ParseError`
  (even in lenient mode): `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`,
  `INVALID_ENCODING_CHARACTERS`, `EMPTY_INPUT`. Each error carries
  `message`, `position`, and `snippet`.
- **Structural model**: immutable `Hl7Message` with dot-path access
  (`msg.get("PID.5.1")`, `msg.get("OBX[2].5")`), typed `Segment` and
  `Field` wrappers, and `msg.segments("OBX")[0].field(3)` traversal.
  Safe-access semantics (`undefined` / `[]` for missing paths, never
  throws).
- **Composite types**: parsed instances and exported TypeScript
  interfaces for XPN, XAD, CX, CWE, CE, XTN, PL, TS/DTM, NM, SN, HD, and XCN
  (12 types). Also available under the `HL7` namespace:
  `import { HL7 } from "@cosyte/hl7"; type T = HL7.XPN`.
- **`SN` composite + `Field.asSn()`** (roadmap Phase B). `parseSn` /
  `SN` / `HL7.SN` export the Structured Numeric datatype (comparator,
  num1, separator/suffix, num2), and `field.asSn()` coerces an OBX-5 to it.
  `msg.observations()` returns `{ valueType: "SN", value: SN | undefined }`
  for `OBX-2 = SN`.
- **`observation.unitsAreUcum`** (roadmap Phase B). A boolean claim-check
  flag, `true` iff OBX-6's coding system (CWE.3) is exactly `UCUM`
  (HL7 Table 0396). `false` when a unit is present but not declared UCUM
  (surfaced as-is, never coerced); omitted entirely when OBX-6 is absent.
  This is a claim check only. The library does not validate UCUM grammar
  or convert units.
- **Named helpers**. One-line extraction for the most common HL7
  fields: `msg.meta`, `msg.patient`, `msg.visit`, `msg.observations()`,
  `msg.orders()`, `msg.nextOfKin()`, `msg.allergies()`, `msg.diagnoses()`,
  `msg.insurance()`, `msg.medications()`, `msg.immunizations()`. All helpers
  return `undefined` / empty arrays for missing optional data. They never throw.
- **`msg.medications()`** (roadmap Phase D, P0 safety). Projects every
  RXO / RXE / RXD / RXA segment into a typed `Medication` across the four
  pharmacy contexts (`order` / `encoded` / `dispense` / `administration`),
  grouping the RXR (route, Table 0162 + site Table 0163) and RXC
  (component) segments that follow each parent positionally, the same
  state-machine `orders()` uses for OBR → OBX. The give code carries its
  own coding-system provenance (`giveCode.nameOfCodingSystem`); the give
  **amount** (how much) and the give **strength** (concentration, RXE-25/26)
  are surfaced as **separate fields and are never reconciled**. A strength
  a coded drug (e.g. an NDC) implies never validates or overwrites the
  explicit RXE-25 strength, so a disagreement is preserved for the caller.
  Numerics are strict-`asNm()` parsed (absent/blank → key omitted, never
  `NaN`); output is frozen; not memoized. Never throws (HELPERS-07). New
  public types: `Medication`, `MedicationContext`, `MedicationAmount`,
  `MedicationStrength`, `MedicationRoute`, `MedicationComponent`.
- **`msg.immunizations()`** (roadmap Phase E, P0 safety). Projects every
  RXA segment of a VXU^V04 into a typed `Immunization`, grouping the RXR
  (route, Table 0162 + site Table 0163) and OBX (VFC eligibility / funding
  source) segments that follow each RXA positionally, and carrying
  `orderControl` from the preceding ORC of the `ORC`→`RXA`→`[RXR]`→`[{OBX}]`
  order group, the same state machine `orders()` uses for OBR → OBX. The
  action code (RXA-21, `A`/`D`/`U`) is surfaced **verbatim and never
  defaulted**. A mis-key corrupts an IIS add/delete/update dedup; the
  `recordOrigin` (administered vs historical) is derived **only** from the
  well-known NIP001 RXA-9.1 codes (`00`; `01`-`08`) and omitted otherwise,
  never guessed, with the raw RXA-9 claim always preserved on
  `informationSource`. The vaccine code carries its own provenance
  (`vaccineCode.nameOfCodingSystem`, CVX, + any CVX/NDC alternate);
  `doseAmount` is strict-`asNm()` parsed (the IIS unknown-dose sentinel `999`
  surfaced as the number `999`, never coerced). Output is frozen; not
  memoized. Never throws (HELPERS-07). New public types: `Immunization`,
  `ImmunizationRecordOrigin`.
- **Mutation**: `setField`, `addSegment`, `removeSegment` on
  `Hl7Message`. Direct field mutation on unwrapped objects has no effect
  (immutability by default).
- **Serialization**: `msg.toString()` emits spec-clean HL7 regardless
  of input quirks (Postel's Law); `msg.toJSON()` returns a structured
  JSON tree; `msg.prettyPrint()` returns a human-readable multi-line
  string for logs. Escape sequences are re-encoded on serialize.
- **Message builder**: `buildMessage({...}).addSegment(...).toString()`
  constructs valid outbound HL7 from scratch, with helpers for control
  IDs and HL7 timestamps.
- **ACK generation + interpretation** (roadmap Phase C). `buildAck(inbound,
{ code, error?, mode? })` produces a spec-clean `MSH`+`MSA`[+`ERR`…]
  acknowledgment: sender/receiver swapped (full multi-component HDs
  preserved), MSH-9 = `ACK^<trigger>^ACK`, MSA-2 echoes the inbound MSH-10,
  and each `ERR` carries an ERL location (ERR-2), a Table 0357 condition code
  as a CWE (ERR-3), and a Table 0516 severity (ERR-4), **codes and locations
  only, never echoed PHI**. `buildAck` is mechanical (emits the disposition it
  is told) with one safety override: an inbound with no MSH-10 cannot be
  correlated, so a requested positive `AA`/`CA` is downgraded to `AE`/`CE`,
  MSA-2 is left empty, and an `ACK_NO_CORRELATION_ID` warning rides on the
  returned message. It never fabricates an unverifiable positive ACK.
  `interpretAck(msg)` is the read-side: a typed `Acknowledgment` view whose
  `accepted`/`error`/`rejected` flags are derived fail-safe from MSA-1 (all
  three `false` on an absent or unrecognized code). `detectAckMode(inbound)`
  exposes the spec-exact original-vs-enhanced detection (MSH-15/16). Control
  vocabulary (Tables 0008/0357/0516/0155) ships as frozen read-only enums
  (`ACK_CODES`, `ERR_CONDITION_CODES`, `ERR_SEVERITIES`, `ACK_CONDITIONS`).
- **Profile system**: `defineProfile()` API with `extends` composition
  (single parent or array), merge semantics (scalars overwrite, arrays
  concat+dedupe, `customSegments` deep-merge per key, `onWarning` chains),
  `profile.describe()` introspection, `profile.lineage`, and
  `ProfileDefinitionError` with actionable messages on invalid input.
- **Default profile management**: `setDefaultProfile(p)`,
  `getDefaultProfile()`, `setDefaultProfile(null)`. Explicit arguments
  override; `parseHL7(raw, { profile: null })` opts out for a single call.
- **Five built-in vendor profiles**: `profiles.epic`, `profiles.cerner`,
  `profiles.meditech`, `profiles.athena`, `profiles.genericLab`. Each
  authored through the public `defineProfile()` API with date-format
  fallbacks and named Z-segments.
- **Segment.get(name)**: resolve custom-segment fields by declared
  name (e.g., `msg.segments("ZDP")[0].get("departmentCode")`) when a
  matching profile is applied.
- **Three runnable examples**: `examples/extract-patient-info.ts`,
  `examples/read-lab-results.ts`, `examples/modify-and-resend.ts`, each
  runnable via `pnpm tsx examples/<file>.ts` and smoke-tested via
  `pnpm examples` in CI.
- **Profile starter kit**: `examples/profile-starter-kit/`, a
  publishable template with its own CI + publish workflows,
  `CUSTOMIZING.md` walkthrough, and placeholder tokens
  (`{{YOUR_ORG}}` / `{{PROFILE_NAME}}`) that turn into a ready-to-publish
  profile package in minutes.
- **Documentation**: comprehensive README (value prop, quickstart,
  feature list, HL7-in-90-seconds primer, three access patterns, full
  cookbook, Profiles section, Real-World Tolerance table, Error
  Handling, Roadmap), `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`
  (MIT).
- **Tooling**: strict TypeScript (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`), dual ESM + CJS build via tsup, Vitest
  with ≥ 90% per-directory branch coverage on `src/parser/`, `src/model/`,
  `src/helpers/`, `src/serialize/`, `src/builder/`. Lint, format, and
  TypeScript settings come from the shared `@cosyte/*` config packages
  (ESLint 9 + `typescript-eslint`). CI across Node 22 / 24.
