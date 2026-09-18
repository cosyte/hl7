---
"@cosyte/hl7": patch
---

Internal: the brand's em-dash check now runs from the shared `@cosyte/script-utils` package instead of a copy kept in this repository.

Nothing about the published package changed. The check is a development and CI gate over this repository's own tracked files and pull request text; it is a `devDependency`, it is not in `dependencies`, it is not in the published `files` list, and it runs no code at install time. A consumer installing this package receives exactly what it received before, with no new dependency of any kind.

The copy that was removed had drifted from the shared implementation in four ways, each of which let the check report success over input it never opened: a tracked symlink to a directory was skipped in silence, a tracked file named `-` was read as standard input rather than opened, a hit in a single-file batch was reported without its filename, and an empty standard input was reported as clean. The shared implementation closes all four. What this repository leaves out of its own scan, the verbatim bytes of the vendored HL7 publication under `vendor/hl7-v2ig/message-structure/` and `vendor/hl7-v2ig/control-manifests/`, is now declared in a tracked file, `scripts/check-no-emdash.exclude`, rather than hardcoded in a script, so it can be read without reading code. Those bytes stay covered by the sha256 snapshot the structure provenance test recomputes on every run.
