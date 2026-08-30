---
"@cosyte/hl7": patch
---

Vendor date formats gain month names, AM/PM, 12-hour clocks and single-digit tolerance, and `dateFormats` validation is now strict: a format that previously constructed and then never matched will now throw where you wrote it.

The vocabulary a `dateFormats` entry may use was seven tokens wide (`YYYY MM DD HH mm ss SSSS`), so a feed writing `05-JUL-1988` or `7/5/1988 2:30 PM` could not be described at all. It is now fifteen: `M`, `D` and `H` accept one digit or two, `MMM` and `MMMM` read the abbreviated and full English month names case-insensitively, `hh`/`h` read a 12-hour clock and `A` reads the meridiem, and a literal letter or digit is written inside square brackets (`YYYY-MM-DD[T]HH:mm:ss`). A month name resolves to the spec-native month number 1 to 12; a 12-hour reading plus a meridiem yields the 24-hour hour, with `12 AM` hour 0, `12 PM` hour 12 and `2 PM` hour 14, and the meridiem never appears in the parsed value.

`SSSS` was published and accepted by the validator while the matcher could only see it as four literal `S` characters, so a format carrying it constructed and matched nothing forever. It is honoured now, which is the divergence between the published token list and the matcher closed: every token the package publishes is a token the matcher reads.

BEHAVIOUR CHANGE, and the reason this entry is long. `defineProfile()` used to accept any `dateFormats` entry containing at least one recognised token, which let a typo through as literal text: `"MM/DD/YYYY hrs"` and `"YYY/MM"` both constructed a profile and then matched nothing, in silence, for as long as the profile lived. Validation is now "every character is a token or a permitted literal", plus four rules, and each refusal names the offending format and says what to do:

- an unescaped ASCII letter or digit that forms no token is refused, naming the character (escape it as `[x]` if it was meant literally);
- `h`/`hh` and `A` require each other, because a 12-hour reading is not a clock hour until AM or PM is applied and a meridiem beside a 24-hour clock has nothing to convert;
- `SSSS` requires `ss`, matching the rule the strict parser already applies: a fraction is only meaningful at full second precision;
- two numeric tokens may not sit adjacent when either is variable width (`MDYYYY` cannot decide whether `1231988` starts with month 1 or month 12). Two fixed-width tokens still may, so `YYYYMMDDHHmmss` is unaffected.

So a profile that constructs today may throw at import after this release. That is the intended trade: the failure was previously silent and permanent, and it is now loud and immediate. Two shapes to expect. A format carrying a bare letter separator needs the escape, `"YYYY-MM-DDTHH:mm:ss"` becoming `"YYYY-MM-DD[T]HH:mm:ss"`, which is the change made to the built-in `cerner` profile here and which matches exactly the same inputs. And a format carrying `SSSS` with no `ss` never matched anything, so it can be deleted or completed.

**There is no two-digit-year token and there will not be one.** Resolving `YY` needs a century window, a window is a guess, and a wrong guess moves a date of birth by a hundred years while producing a date that looks entirely plausible and that nothing downstream can detect. A format containing `YY` is refused with a message that says so. Widen two-digit years to four at the ingest boundary, where the century is a decision somebody made deliberately. There is no timezone token either: the stance that a value with no offset is flagged rather than resolved to UTC is unchanged.

Nothing changes for a format that was valid under the previous vocabulary. `BUILTIN_DATE_FALLBACKS` keeps its membership and its order, the `ISO-8601` sentinel is untouched, and formats supplied through the parse options are matched exactly as before, including any character the vocabulary does not recognise.

The grammar is now written down once, as a published `Date token grammar` page carrying the token table, the tokenisation and escaping rules, the pairing and adjacency rules, the meridiem conversion, the precision mapping and both exclusions with their reasons. A machine-readable corpus of cases ships beside it as plain JSON with no syntax belonging to any one parser, so a sibling parser can adopt the same grammar and prove it agrees rather than re-deriving it.
