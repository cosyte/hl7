---
"@cosyte/hl7": patch
---

Add the cosyte brand banner to the top of the README, so the npm package page and the repo page both open with the mark, the package name, and one line of what the parser does.

ASSETS-P8, the consuming half. The banner is a plain markdown image pointing at the absolute HTTPS URL published for `hl7` in the `assets` repo's `published-urls.json` contract (`https://cosyte.com/social/cosyte-banner-hl7-1200x300.png`, `status: live` on `website#59 01f988b`), re-verified as `200 image/png` before this change was pushed.

Three shape decisions, recorded because `hl7` is the reference the other parsers copy and thirteen more READMEs follow this one:

- **Plain markdown image, not `<img>` and not `<picture>`.** Whether npm's markdown sanitizer preserves a `<picture>` element is unverified, which is exactly why the banner artwork is self-grounded (opaque ground, correct in light or dark mode) and does not depend on one. A markdown image with an absolute HTTPS URL is the construct we are willing to assert renders on both npm and GitHub. No width or height attributes.
- **PNG only.** A deliberate bounded policy (self-grounded PNG is the format asserted to render on every README surface), not a demonstrated impossibility for other formats.
- **The alt text is content, not decoration.** It carries the package name and its one-line purpose, because it is what every screen reader on the npm page reads out.

No runtime, API or packaging change: README text only.
