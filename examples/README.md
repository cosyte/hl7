# Examples

Three runnable TypeScript scripts that demonstrate the one-line-extraction
value prop of `@cosyte/hl7`. Each example reads a synthetic HL7
fixture from `examples/data/`, calls the library, and prints labeled
human-readable output via `console.log`. Run them from the repo root with
`pnpm tsx examples/<file>.ts`, or run all three at once with
`pnpm examples`, which runs `scripts/run-examples.ts` and fails if an
example exits non-zero or stops printing its expected output.

All three fixtures use synthetic patient identifiers only, no PHI.

## Files

| Example                   | Demonstrates                                                            | Run                                         |
| ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| `extract-patient-info.ts` | Named-helper access: `msg.patient` + `msg.meta` one-liners.             | `pnpm tsx examples/extract-patient-info.ts` |
| `read-lab-results.ts`     | Collection iteration: `msg.observations()` over an ORU^R01 with 3 OBXs. | `pnpm tsx examples/read-lab-results.ts`     |
| `modify-and-resend.ts`    | Mutation + round-trip: `msg.setField(...)` then `msg.toString()`.       | `pnpm tsx examples/modify-and-resend.ts`    |

## Fixtures (`examples/data/`)

| File                    | Message type | Notes                                                       |
| ----------------------- | ------------ | ----------------------------------------------------------- |
| `adt-a01.hl7`           | ADT^A01      | Patient admission with PID + PV1.                           |
| `oru-r01-lab.hl7`       | ORU^R01      | Lab result with OBR + 3 OBX observations (WBC / HGB / HCT). |
| `adt-mutate-source.hl7` | ADT^A01      | Separate ADT fixture that `modify-and-resend.ts` edits.     |

The root [README.md](../README.md) has a short usage tour, and the
[documentation](https://docs.cosyte.com/hl7) has the guides and the API reference.
