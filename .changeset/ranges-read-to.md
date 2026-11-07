---
"@cosyte/hl7": patch
---

The MSH-2 encoding-characters error message and the published documentation comments now write a range with "to" instead of an en dash, so the message reads "must be 4 (v2.1 to v2.6) or 5 (v2.7+ adds truncation) characters".

Code that matches that error message by its text should match the new wording. The error's class and fatal code are unchanged.
