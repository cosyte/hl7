---
id: read-data-types-by-name
title: Read data types by name
sidebar_label: Read data types by name
description: "Read an entity identifier, a price, a quantity or a coded element by its component names, and write one back without hand-building delimiters."
---

# Read data types by name

A field such as OBR-2 is an EI: an order number plus the authority that assigned it, in four
components. Reading it as `field.value` gives you the first component only. Each composite on
[Data types by name](./data-types.md) has an accessor on `Field` that reads every component onto its
HL7 name.

## Read an order's identifiers

`msg.orders()` reads OBR-2, OBR-3 and the preceding ORC-2 and ORC-3 as whole EIs. Two placers can
issue the same number, so compare the whole identifier when you match an order.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|CLINIC|MAIN|LAB|REF|20260102080000||ORM^O01|EX00041|P|2.5.1\r" +
  "PID|1||MRN0001^^^HOSP^MR||Doe^Jane\r" +
  "ORC|NW|PL-1001^CLINIC^2.16.840.1.113883.19.5^ISO|FL-2002^LAB\r" +
  "OBR|1|PL-1001^CLINIC^2.16.840.1.113883.19.5^ISO|FL-2002^LAB|GLU^Glucose^LN";

const [order] = parseHL7(raw).orders();

order?.placerOrderNumber; // => "PL-1001"
order?.placerOrderId?.namespaceId; // => "CLINIC"
order?.placerOrderId?.universalId; // => "2.16.840.1.113883.19.5"
order?.fillerOrderId; // => { entityIdentifier: "FL-2002", namespaceId: "LAB" }
order?.orcFillerOrderId?.entityIdentifier; // => "FL-2002"
```

`placerOrderNumber` and `fillerOrderNumber` still hold the first component alone, as before.

## Read the message profile a sender claims

MSH-21 repeats, one EI per conformance profile. `msg.meta.messageProfileIdentifiers` lists them in
order and is absent when MSH-21 is empty.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|CLINIC|MAIN|REG|STATE|20260102080000||VXU^V04^VXU_V04|EX00042|P|2.5.1|||ER|AL|||||" +
  "Z22^CDCPHINVS\r" +
  "PID|1||MRN0001^^^HOSP^MR||Doe^Jane";

const profiles = parseHL7(raw).meta.messageProfileIdentifiers;

profiles?.length; // => 1
profiles?.[0]; // => { entityIdentifier: "Z22", namespaceId: "CDCPHINVS" }
```

To pick the matching profile from a list you keep, see
[Supply your own codes and profiles](./supply-your-own-codes-and-profiles.md#pick-the-profile-a-message-names).

## Read any field as a named composite

Pick the accessor for the field's data type. A nested composite, such as the price inside a CP or
the unit inside a CQ, comes back as an object of its own.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|CLINIC|MAIN|BILL|REF|20260102080000||DFT^P03|EX00043|P^T|2.5.1\r" +
  "PID|1||MRN0001^^^HOSP^MR||Doe^Jane\r" +
  "PV1|1|O||||||||||||||||||SP^20260101\r" +
  "FT1|1||||20260102|CG|CODE1||||1|150.00&USD^UP\r" +
  "TQ1|1|2^TAB&tablet";

const msg = parseHL7(raw);
const field = (segment: string, n: number) => msg.segments(segment)[0]?.field(n);

field("FT1", 12)?.asCp().price; // => { quantity: "150.00", denomination: "USD" }
field("TQ1", 2)?.asCq(); // => { quantity: "2", units: { identifier: "TAB", text: "tablet" } }
field("PV1", 20)?.asFc().financialClassCode?.identifier; // => "SP"
field("MSH", 9)?.asMsg(); // => { messageCode: "DFT", triggerEvent: "P03" }
field("MSH", 11)?.asPt(); // => { processingId: "P", processingMode: "T" }
```

Amounts stay the text the sender wrote: `"150.00"`, not `150`. Convert one yourself, with a decimal
type, if you need arithmetic.

## Read a v2.7 coded element's second alternate

CWE components 10 to 22 arrived at v2.7. They are read by name, and `extraComponents` still holds
component 10 onward for code written before they had names.

```ts runnable
import { parseHL7 } from "@cosyte/hl7";

const raw =
  "MSH|^~\\&|LAB|MAIN|EHR|REF|20260102080000||ORU^R01|EX00044|P|2.7\r" +
  "PID|1||MRN0001^^^HOSP^MR||Doe^Jane\r" +
  "OBR|1||FL-3003^LAB|GLU^Glucose^LN\r" +
  "OBX|1|NM|99GLU^Glucose local^99LAB^^^^^^^GLU2^Glucose alt^99ALT||5.4|mmol/L";

const code = parseHL7(raw).segments("OBX")[0]?.field(3).asCwe();

code?.secondAlternateIdentifier; // => "GLU2"
code?.nameOfSecondAlternateCodingSystem; // => "99ALT"
code?.extraComponents; // => ["GLU2", "Glucose alt", "99ALT"]
```

## Write one back

Each type has an encoder. It escapes any delimiter inside a value, so an `&` or a `^` in your data
can never become a new component on the wire.

```ts runnable
import { buildMessage, encodeComposite, parseHL7 } from "@cosyte/hl7";

const out = buildMessage({ type: "ORM^O01" })
  .addSegment("OBR", [
    "1",
    encodeComposite("EI", { entityIdentifier: "PL-1001", namespaceId: "CLINIC" }),
  ])
  .toString();

out.split("\r")[1]; // => "OBR|1|PL-1001^CLINIC"
parseHL7(out).orders()[0]?.placerOrderId; // => { entityIdentifier: "PL-1001", namespaceId: "CLINIC" }
```
