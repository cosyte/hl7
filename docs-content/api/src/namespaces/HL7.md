# HL7

The composite data type interfaces as one type-only namespace (`HL7.XPN`, `HL7.CX`, `HL7.TS`
and the rest), for code that prefers `HL7.XPN` to a named `XPN` import. It holds types only:
the parsers (`parseXpn` and the rest) are named exports of the package.

## Example

```ts
import type { HL7 } from "@cosyte/hl7";

const name: HL7.XPN = { familyName: "Doe", givenName: "Jane" };
```

## References

### CE

Re-exports [CE](../README.md#ce)

***

### CNE

Re-exports [CNE](../README.md#cne)

***

### CP

Re-exports [CP](../README.md#cp-1)

***

### CQ

Re-exports [CQ](../README.md#cq-1)

***

### CWE

Re-exports [CWE](../README.md#cwe-1)

***

### CX

Re-exports [CX](../README.md#cx-1)

***

### DR

Re-exports [DR](../README.md#dr-1)

***

### EI

Re-exports [EI](../README.md#ei-1)

***

### EIP

Re-exports [EIP](../README.md#eip-1)

***

### FC

Re-exports [FC](../README.md#fc-1)

***

### HD

Re-exports [HD](../README.md#hd-1)

***

### MO

Re-exports [MO](../README.md#mo-1)

***

### MSG

Re-exports [MSG](../README.md#msg-1)

***

### NM

Re-exports [NM](../README.md#nm-1)

***

### PL

Re-exports [PL](../README.md#pl-1)

***

### PT

Re-exports [PT](../README.md#pt-1)

***

### SN

Re-exports [SN](../README.md#sn)

***

### TS

Re-exports [TS](../README.md#ts-1)

***

### VID

Re-exports [VID](../README.md#vid-1)

***

### XAD

Re-exports [XAD](../README.md#xad-1)

***

### XCN

Re-exports [XCN](../README.md#xcn-1)

***

### XPN

Re-exports [XPN](../README.md#xpn-1)

***

### XTN

Re-exports [XTN](../README.md#xtn-1)
