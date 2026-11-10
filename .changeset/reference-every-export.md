---
"@cosyte/hl7": patch
---

Doc comments, which your editor shows on hover, now say each rule in plain words instead of citing internal design-note numbers. The `text`, `HL7` and `conformance` namespaces carry a summary and an example in the source, which the generated API reference prints, and the `conformance` summary says that `collectProfileDefects` and `ProfileDefect` are exported only through that namespace. `parseHL7`, `splitBatch` and `parseStream` are no longer tagged internal. The `athena` and `meditech` profile comments now describe the date formats those profiles use. The one runtime change is the wording of an internal serializer error that the public API never throws.
