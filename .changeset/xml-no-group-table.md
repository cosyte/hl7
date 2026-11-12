---
"@cosyte/hl7": patch
---

Narrowing: `toHl7Xml` no longer ships a group table for ORU_R01 in v2.5, so it takes every message structure's groups from you in `groups`.

The table was taken from an HL7 XML schema whose licence is unsettled, so we removed it until that is settled. `XML_GROUP_TABLES` stays exported and is now empty. A v2.5 ORU_R01 written without `groups` is refused with `GROUPS_UNKNOWN`, as every other structure already was, and the refusal now reads ``No group table ships for ORU_R01; pass `groups`.`` with no version in it. `parseHL7Xml` is unchanged: it reads group elements of any name without a table.

What to do: if you write ORU_R01 as v2 XML without `groups`, build the structure from your partner's schema and pass it, for example `toHl7Xml(msg, { dataTypes, groups: { structure: "ORU_R01", items: ["MSH", { group: "REPORT+", items: [...] }] } })`, or pass `groups: "none"` to write every segment directly under the root. If you read `XML_GROUP_TABLES["2.5"].ORU_R01`, keep your own copy of the structure instead. The how-to page "Read and write the v2 XML encoding" shows a full example.

The package now also ships `THIRD-PARTY-NOTICES.md`, which records where the HL7 v2+ structure files behind the structure registry came from: the repository, the commit, the date taken, the `CC0-1.0` its definition file declares, that the repository has no licence file and calls itself a draft, and that the structures describe the v2+ draft meant to represent v2.9.1.
