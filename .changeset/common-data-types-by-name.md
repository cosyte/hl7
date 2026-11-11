---
"@cosyte/hl7": patch
---

Read eleven more HL7 data types by name: EI, EIP, CNE, DR, MO, CP, CQ, VID, MSG, PT and FC, each with a parser, a `Field` accessor and an encoder, and CWE components 10 to 22 by name.

- New exports: the `EI`, `EIP`, `CNE`, `DR`, `MO`, `CP`, `CQ`, `VID`, `MSG`, `PT` and `FC` types (also in the `HL7` namespace), `parseEi` through `parseFc`, `encodeEi` through `encodeFc`, and `field.asEi()` through `field.asFc()`. `encodeComposite` and `setComposite` accept the eleven new kinds.
- `CWE` gains `secondAlternateIdentifier` through `secondAlternateValueSetVersionId` (components 10 to 22, added at v2.7). `extraComponents` still starts at component 10, so code that reads it by position keeps working. A deep-equality check on a `parseCwe` result from a v2.7 sender now sees the named fields too.
- `msg.meta.messageProfileIdentifiers` reads MSH-21 as a list of `EI`.
- Each order gains `placerOrderId` and `fillerOrderId` (OBR-2 and OBR-3) and `orcPlacerOrderId` and `orcFillerOrderId` (the preceding ORC-2 and ORC-3), each a whole `EI`. `placerOrderNumber` and `fillerOrderNumber` are unchanged.
- A caller with an exhaustive `switch` over `CompositeKind` needs a case for each new kind.
