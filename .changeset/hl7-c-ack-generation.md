---
"@cosyte/hl7": patch
---

Conformance Phase C — generate and interpret HL7 v2 acknowledgments (MSA + ERR, original + enhanced).

- **`buildAck(inbound, { code, error?, mode? })`** emits a spec-clean `ACK` (MSH + MSA, plus an
  optional ERR) correlated to an inbound message. MSH-3/4/5/6 are the inbound's sending/receiving
  HDs swapped back to the responder, copied as raw fields so multi-component HDs survive intact;
  MSA-2 echoes the inbound MSH-10. Dispositions are Table 0008 (`AA`/`AE`/`AR`/`CA`/`CE`/`CR`);
  `mode` selects original vs. enhanced (MSH-15/16) acknowledgment. ERR detail carries Table 0357
  condition codes, Table 0516 severity (`I`/`W`/`E`), and an ERL location composite (e.g. `PID^1^5`)
  — **codes and structural locations only, never echoed PHI**. The builder is mechanical: it emits
  the disposition it is told to, with one fail-safe — when the inbound carries no correlatable
  MSH-10 it refuses to fabricate a positive `AA`/`CA`, downgrades to `AE`/`CE` with an empty MSA-2,
  and attaches an `ACK_NO_CORRELATION_ID` warning rather than throwing.
- **`interpretAck(msg)`** is the read-side: a typed `Acknowledgment` view exposing the MSA
  disposition and any ERR entries (condition code, severity, location) without re-walking raw
  segments. **`detectAckMode(msg)`** reports whether a message uses original or enhanced
  acknowledgment. New public surface: `buildAck`, `interpretAck`, `detectAckMode`, the
  `Acknowledgment` / `AckErrorEntry` / `AckErrorDetail` / `BuildAckOptions` types, the
  `AckCode` / `AckCondition` / `AckMode` / `ErrSeverity` unions, and the frozen `ACK_CODES` /
  `ACK_CONDITIONS` / ERR table maps with their `isPositiveAck` / `isErrorAck` / `isRejectAck` /
  `isKnownAckCode` predicates.

Additive patch on the `0.0.x` ladder: no public surface is removed or renamed. A fourteenth Tier-2
warning code (`ACK_NO_CORRELATION_ID`) is added. Golden round-trip fixtures and property tests
(`test/property/ack.property.test.ts`) lock the clean-round-trip and MSA-2-echoes-MSH-10 invariants
over thousands of synthetic inbound messages.
