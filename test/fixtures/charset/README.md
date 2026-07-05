# charset fixtures (Phase O)

Synthetic HL7 v2 fixtures for MSH-18 / Table-0211 character-set decoding.

- `utf8-name.hl7` — a UTF-8-encoded message declaring `MSH-18 = UNICODE UTF-8`
  with accented Latin (`Zörb^Renée`) and CJK (`山田^太郎`) name components. Read
  it as a **`Buffer`** (not a UTF-8 string) so the parser exercises the
  byte-decode path. All data is synthetic — no PHI.

The single-byte **Latin-1** and **multibyte / switch-escape** cases are
constructed as raw `Buffer`s directly in `test/parser-charset.test.ts`: a
Latin-1 or ISO-2022 byte stream cannot be stored losslessly in a UTF-8 text
fixture, so the bytes are built in-test where their exact values are visible and
reviewable.
