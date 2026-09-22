# Access patterns

Three ways to reach into a parsed message, each with a worked example.

### Named helpers

Typed views over the common-case data. Zero HL7 literacy required.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

console.log(msg.patient?.mrn); // "MRN12345"
console.log(msg.patient?.fullName); // "Jane Q. Smith"
console.log(msg.patient?.dateOfBirth?.precision); // "day": a birth date is not a full instant
console.log(msg.meta.type); // "ADT^A01"
console.log(msg.meta.timestamp?.raw); // "20250102153045" (MSH-7: fidelity TS)
console.log(msg.visit?.location); // PL composite: pointOfCare/room/bed
```

Use these for the 90% case. Helpers return `undefined` (not throws) when the underlying segment is absent, so optional-chaining stays idiomatic.

### Dot-paths

String paths following HL7's own `SEG.field.component.subcomponent` convention. Indices are 1-based to match the spec.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

console.log(msg.get("PID.5.1")); // family name  -> "Smith"
console.log(msg.get("PID.5.2")); // given name   -> "Jane"
console.log(msg.get("OBX[2].5")); // 2nd OBX, value field
console.log(msg.getAll("NK1")); // every next-of-kin segment
```

Reach for dot-paths when you want a specific field the helpers don't surface, or when you're scripting quick extractions without introducing typed imports.

### Structural traversal

Walk the segment/field/component/subcomponent tree directly. For advanced extractors, round-trip edits, and anything the other two patterns don't cover.

```ts
import { parseHL7 } from "@cosyte/hl7";

const msg = parseHL7(raw);

for (const obx of msg.segments("OBX")) {
  const id = obx.field(3).component(1).value; // observation identifier
  const val = obx.field(5).value; // observed value
  console.log(`${id} = ${val}`);
}

console.log(msg.allSegments().length); // total segments in the message
```

Every level (segment / field / repetition / component / subcomponent) is addressable and immutable: mutation happens through explicit methods (see the cookbook).
