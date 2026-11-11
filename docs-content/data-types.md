---
id: data-types
title: Data types by name
sidebar_label: Data types by name
description: "Every HL7 v2 composite the package reads by name: its components in order, their names from v2.5 to v2.9, and the functions that read and write it."
---

# Data types by name

Each composite below has an interface, a parser (`parseXxx(rep, enc)`), an accessor on `Field`
(`field.asXxx()`) and an encoder (`encodeXxx(value)`, also reachable as
`encodeComposite("XXX", value)`). Every interface is also a type in the `HL7` namespace
(`HL7.EI`). [Read data types by name](./read-data-types-by-name.md) shows them in use.

Three rules hold for every type on this page:

- A component that is absent or empty is left out of the object, never set to `undefined`. An empty
  field reads as `{}`.
- A component past the named ones is kept, in order, on `extraComponents`, never dropped. An absent
  interior component there is `""`, so an index maps back to its HL7 component number.
- Values are the text the sender wrote, decoded once. Amounts, quantities and datetimes stay
  strings: a price is never rounded into a float, and a datetime keeps its precision until you read
  it with `parseDtm`.

A nested composite (an EI inside EIP, an MO inside CP, a coded element inside CQ) is read from the
subcomponents of its component. When the nested value is empty, its key is left out rather than set
to `{}`.

## EI, EIP, CNE, DR, MO, CP, CQ, VID, MSG, PT and FC

The component names are the same from v2.5 to v2.9 for every type here. Where a component's own
type changed between versions, the third column says how it is read.

### EI: Entity Identifier

| #   | Property           | Notes                                      |
| --- | ------------------ | ------------------------------------------ |
| 1   | `entityIdentifier` | the identifier itself                      |
| 2   | `namespaceId`      | assigning authority, local name            |
| 3   | `universalId`      | assigning authority, an OID or a UUID      |
| 4   | `universalIdType`  | the kind of `universalId` (ISO, UUID, DNS) |

Used by MSH-21, OBR-2, OBR-3, ORC-2 and ORC-3, among others. `parseEi`, `asEi`, `encodeEi`.

### EIP: Entity Identifier Pair

| #   | Property                   | Notes     |
| --- | -------------------------- | --------- |
| 1   | `placerAssignedIdentifier` | nested EI |
| 2   | `fillerAssignedIdentifier` | nested EI |

Used by ORC-8, OBR-29 and SPM-2. `parseEip`, `asEip`, `encodeEip`.

### CNE: Coded with No Exceptions

The 22 components of CWE under the same names (see CWE below). CNE differs in the standard's rule,
not its shape: the code must come from the named table. The parser reads what was sent and does not
enforce the rule. `extraComponents` starts at component 23. `parseCne`, `asCne`, `encodeCne`.

### DR: Date/Time Range

| #   | Property             | Notes                                       |
| --- | -------------------- | ------------------------------------------- |
| 1   | `rangeStartDateTime` | raw datetime text: a TS at v2.5, a DTM from v2.6 |
| 2   | `rangeEndDateTime`   | raw datetime text                           |

At v2.5 each endpoint is a TS whose second part, the deprecated degree of precision, is a
subcomponent; it is not read. `parseDr`, `asDr`, `encodeDr`.

### MO: Money

| #   | Property       | Notes                                   |
| --- | -------------- | --------------------------------------- |
| 1   | `quantity`     | the amount as written, never a `number` |
| 2   | `denomination` | ISO 4217 currency code                  |

`parseMo`, `asMo`, `encodeMo`.

### CP: Composite Price

| #   | Property     | Notes                                                       |
| --- | ------------ | ----------------------------------------------------------- |
| 1   | `price`      | nested MO                                                   |
| 2   | `priceType`  | HL7 Table 0205                                              |
| 3   | `fromValue`  | as written                                                  |
| 4   | `toValue`    | as written                                                  |
| 5   | `rangeUnits` | nested coded element: a CE at v2.5, a CWE from v2.6, read as a CWE |
| 6   | `rangeType`  | HL7 Table 0298                                              |

Used by FT1-11, FT1-12 and PRC-5. `parseCp`, `asCp`, `encodeCp`.

### CQ: Composite Quantity with Units

| #   | Property   | Notes                                                              |
| --- | ---------- | ------------------------------------------------------------------ |
| 1   | `quantity` | as written                                                         |
| 2   | `units`    | nested coded element: a CE at v2.5, a CWE from v2.6, read as a CWE |

Used by TQ1-2. `parseCq`, `asCq`, `encodeCq`.

### VID: Version Identifier

| #   | Property                   | Notes                                       |
| --- | -------------------------- | ------------------------------------------- |
| 1   | `versionId`                | HL7 Table 0104                              |
| 2   | `internationalizationCode` | nested coded element (CE at v2.5, then CWE) |
| 3   | `internationalVersionId`   | nested coded element (CE at v2.5, then CWE) |

Used by MSH-12. `msg.meta.version` still reads MSH-12.1 alone. `parseVid`, `asVid`, `encodeVid`.

### MSG: Message Type

| #   | Property           | Notes          |
| --- | ------------------ | -------------- |
| 1   | `messageCode`      | HL7 Table 0076 |
| 2   | `triggerEvent`     | HL7 Table 0003 |
| 3   | `messageStructure` | HL7 Table 0354 |

Used by MSH-9. `parseMsg`, `asMsg`, `encodeMsg`.

### PT: Processing Type

| #   | Property         | Notes          |
| --- | ---------------- | -------------- |
| 1   | `processingId`   | HL7 Table 0103 |
| 2   | `processingMode` | HL7 Table 0207 |

Used by MSH-11. `msg.meta.processingId` still reads MSH-11.1 alone. `parsePt`, `asPt`, `encodePt`.

### FC: Financial Class

| #   | Property             | Notes                                                                 |
| --- | -------------------- | --------------------------------------------------------------------- |
| 1   | `financialClassCode` | an IS up to v2.6, a CWE from v2.7; read as a nested coded element either way |
| 2   | `effectiveDate`      | raw datetime text                                                     |

A v2.5 code arrives as `financialClassCode.identifier`; a v2.7 one keeps its text and coding system
too. Used by PV1-20. `parseFc`, `asFc`, `encodeFc`.

## CWE components 10 to 22

v2.7 added thirteen components to CWE, and v2.8 and v2.9 keep them. They are now read by name:

| #   | Property                               |
| --- | -------------------------------------- |
| 10  | `secondAlternateIdentifier`            |
| 11  | `secondAlternateText`                  |
| 12  | `nameOfSecondAlternateCodingSystem`    |
| 13  | `secondAlternateCodingSystemVersionId` |
| 14  | `codingSystemOid`                      |
| 15  | `valueSetOid`                          |
| 16  | `valueSetVersionId`                    |
| 17  | `alternateCodingSystemOid`             |
| 18  | `alternateValueSetOid`                 |
| 19  | `alternateValueSetVersionId`           |
| 20  | `secondAlternateCodingSystemOid`       |
| 21  | `secondAlternateValueSetOid`           |
| 22  | `secondAlternateValueSetVersionId`     |

`CWE.extraComponents` still starts at component 10, as it did before these had names, so code that
reads it by position keeps working. When you encode a CWE, a named field wins over the
`extraComponents` entry at the same position.

## The typed views that read EI

| View                                 | Field  | Flat string beside it            |
| ------------------------------------ | ------ | -------------------------------- |
| `msg.meta.messageProfileIdentifiers` | MSH-21 | none                             |
| `order.placerOrderId`                | OBR-2  | `placerOrderNumber` (EI.1 alone) |
| `order.fillerOrderId`                | OBR-3  | `fillerOrderNumber` (EI.1 alone) |
| `order.orcPlacerOrderId`             | ORC-2  | none                             |
| `order.orcFillerOrderId`             | ORC-3  | none                             |

Two placers can issue the same order number, so match orders on the whole EI, not on the flat
number alone.

ORC-2 and ORC-3 come from the ORC that precedes the order's OBR, as sent. They are never copied from
OBR-2 or OBR-3.

## The other named types

XPN, XAD, CX, CWE (components 1 to 9), CE, XTN, PL, TS, NM, SN, HD and XCN. Their component lists
are in the [API reference](./api/README.md).
