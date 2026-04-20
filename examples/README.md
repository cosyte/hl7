# Examples

Three runnable TypeScript scripts that demonstrate the one-line-extraction
value prop of `@cosyte/hl7-parser`. Each example reads a synthetic HL7
fixture from `examples/data/`, calls the library, and prints labeled
human-readable output via `console.log`. Run them from the repo root with
`pnpm tsx examples/<file>.ts`, or run all three at once via
`pnpm examples` (wired by Plan 08-05; invokes `scripts/run-examples.ts`).

All three fixtures use synthetic patient identifiers only — no PHI.

## Files

| Example                           | Demonstrates                                                              | Run                                           |
| --------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| `extract-patient-info.ts` (EX-01) | Named-helper access — `msg.patient` + `msg.meta` one-liners.              | `pnpm tsx examples/extract-patient-info.ts`   |
| `read-lab-results.ts` (EX-02)     | Collection iteration — `msg.observations()` over an ORU^R01 with 3 OBXs.  | `pnpm tsx examples/read-lab-results.ts`       |
| `modify-and-resend.ts` (EX-03)    | Mutation + round-trip — `msg.setField(...)` then `msg.toString()`.        | `pnpm tsx examples/modify-and-resend.ts`      |

## Fixtures (`examples/data/`)

| File                    | Message type | Notes                                                       |
| ----------------------- | ------------ | ----------------------------------------------------------- |
| `adt-a01.hl7`           | ADT^A01      | Patient admission with PID + PV1.                           |
| `oru-r01-lab.hl7`       | ORU^R01      | Lab result with OBR + 3 OBX observations (WBC / HGB / HCT). |
| `adt-mutate-source.hl7` | ADT^A01      | Separate ADT fixture used as the mutation source for EX-03. |

See the root [README.md](../README.md) for the full cookbook and API tour.
