# Trademarks

`@cosyte/hl7` is an independent open-source project. cosyte is **not affiliated with, endorsed by,
or sponsored by** any company named in this repository or its documentation.

## Why these names appear

Real-world HL7 v2 traffic deviates from the specification in vendor-specific ways. A parser cannot
tolerate those deviations — or tell you which one it tolerated — without naming the system they
come from.

Every reference is **descriptive**: it identifies whose real-world message quirks a profile accommodates, and nothing more. Naming a system is the only way to say
whether a library works with it.

## Where the profiles come from

The built-in profiles are authored through this package's own public `defineProfile()` API, from
publicly available specifications and published companion guides. They embed no privileged,
confidential, or reverse-engineered material, and they are not derived from any vendor's
proprietary documentation.

## Names referenced

| Name                       | Where it appears                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Epic                       | `profiles.epic` — a built-in profile name                                                                                                                                                          |
| Cerner                     | `profiles.cerner` — a built-in profile name                                                                                                                                                        |
| MEDITECH                   | `profiles.meditech` — a built-in profile name                                                                                                                                                      |
| athenahealth               | `profiles.athena` — a built-in profile name                                                                                                                                                        |
| LabCorp, Quest Diagnostics | Named in the README only, to characterise `profiles.genericLab`. Neither is used as an export name.                                                                                                |
| Visage, Visage Imaging     | `profiles.visage` — a built-in profile name; the ZDS quirk it accommodates is grounded in the publicly published Visage 7 HL7 Interface Specification.                                             |
| Philips, Vue PACS          | `profiles.philips` — a built-in profile name; the Z-segment quirks it accommodates are grounded in the publicly published Philips Vue PACS 12.2.8 HL7 Interface Specifications (doc HA1669 Rev A). |

All product names, logos, and brands are the property of their respective owners. Use of a name here
does not imply any affiliation with, or endorsement by, its owner. If you own one of these marks and
would like a reference changed, please open an issue.
