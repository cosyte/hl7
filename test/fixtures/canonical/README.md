# canonical fixtures

Spec-clean HL7 v2 fixtures covering the 7 message types enumerated in TEST-02
plus 2 dedicated structural cases (Z-segments and nested-subcomponents) and a
dedicated SN structured-numeric case (`oru-r01-sn-results.hl7`). The third
structural case from TEST-02 (repeating fields) is provided by
`oru-r01.hl7` (PID-3 has two repetitions: MRN ~ SSN; OBR + 3 OBX
observations).

All fixtures use:

- `\r`-separated segments, no trailing newline (parser-canonical wire format)
- HL7-native MSH-7 timestamps (`YYYYMMDDHHMMSS`), NOT vendor-flavored dates
- Synthetic patient identifiers only (CONTEXT.md D-17: no PHI, MIT-redistributable)
- Sequential control IDs `MSG00001`+ (anchored by adt-a01.hl7 and oru-r01.hl7
  from Phase 5)

## Fixtures

| File                        | Message type | Helper probe (D-20)                                                                                                |
| --------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| adt-a01.hl7                 | ADT^A01      | `msg.patient.mrn === 'MRN12345'` + `msg.visit.patientClass === 'I'`                                                |
| adt-a04.hl7                 | ADT^A04      | `msg.patient.mrn` non-undefined                                                                                    |
| adt-a08.hl7                 | ADT^A08      | `msg.patient.mrn` non-undefined                                                                                    |
| adt-a40-merge.hl7           | ADT^A40      | Phase K (`helpers-identity.test.ts`): one merge event; surviving PID-3/-18 + PV1-19 vs prior MRG-1/-3/-7; `direction === 'MRG_TO_PID'` |
| adt-a34-merge.hl7           | ADT^A34      | Phase K: v2.3 merge; `prior.legacyPatientId` read from MRG-4 (pre-v2.7 map)                                        |
| adt-a18-merge-deprecated.hl7| ADT^A18      | Phase K: backward-compat merge; PID-2 + MRG-4 legacy IDs both read on v2.3                                         |
| adt-a43-move.hl7            | ADT^A43      | Phase K: kind `move`, same MRG→PID direction                                                                       |
| adt-a24-link.hl7            | ADT^A24      | Phase K: ONE link event, two `linked` PID parties, no direction                                                    |
| oru-r01.hl7                 | ORU^R01      | `msg.observations().length > 0` + first obs `.valueType` populated; doubles as TEST-02 repeating-field structural case |
| oru-r01-sn-results.hl7      | ORU^R01      | three `SN` OBX rows: comparator (`>^90`), range (`^100^-^200`), ratio (`^1^:^128`) survive parse + byte round-trip   |
| orm-o01.hl7                 | ORM^O01      | `msg.orders().length > 0`                                                                                          |
| siu-s12.hl7                 | SIU^S12      | parse + round-trip only (no helper for scheduling)                                                                 |
| mdm-t02.hl7                 | MDM^T02      | parse + round-trip only (no helper for documents)                                                                  |
| z-segments.hl7              | ADT^A01 + Z  | `allSegments()` includes ZXX + ZYY; each emits `UNKNOWN_SEGMENT`                                                   |
| nested-subcomponents.hl7    | ADT^A01      | PID-5 component 8 subcomponent 2 resolves to `'Jones'` via `field(5).repetitions[0].components[7].subcomponents[1]` |

All canonical fixtures are exercised by `test/canonical-messages.test.ts`
(TEST-02), except the Phase K `adt-*-merge/-move/-link` fixtures, whose
parse + round-trip + helper probes live in `test/helpers-identity.test.ts`.
All also pass the structural round-trip helper from
`test/_helpers/structural-equivalence.ts` (SER-02 carry-forward).

## Adding a canonical fixture

1. Author the fixture using `\r` separators and synthetic data only.
2. Add a row to the table above documenting the helper probe.
3. Add a `describe` block to `test/canonical-messages.test.ts` asserting
   `parseHL7` succeeds + `assertStructuralRoundTrip` + the helper probe.
4. The `pnpm test:coverage` gate (Plan 06) verifies the addition does not
   regress coverage on `src/parser/`, `src/model/`, `src/helpers/`.
