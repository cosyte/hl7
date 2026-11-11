/**
 * The 22 component names the coded elements CWE and CNE share, in HL7
 * component order: `CODED_ELEMENT_KEYS[i]` names component `i + 1`.
 *
 * Components 1 to 9 are the v2.5 shape (the code, its alternate and the
 * original text). Components 10 to 22 arrived at v2.7: the second-alternate
 * code and the coding-system and value-set object identifiers for each of the
 * three codes. v2.8 and v2.9 keep all 22 under the same names.
 *
 * Not part of the public API: never re-exported from `src/index.ts`.
 *
 * @internal
 */
export const CODED_ELEMENT_KEYS = [
  "identifier",
  "text",
  "nameOfCodingSystem",
  "alternateIdentifier",
  "alternateText",
  "nameOfAlternateCodingSystem",
  "codingSystemVersionId",
  "alternateCodingSystemVersionId",
  "originalText",
  "secondAlternateIdentifier",
  "secondAlternateText",
  "nameOfSecondAlternateCodingSystem",
  "secondAlternateCodingSystemVersionId",
  "codingSystemOid",
  "valueSetOid",
  "valueSetVersionId",
  "alternateCodingSystemOid",
  "alternateValueSetOid",
  "alternateValueSetVersionId",
  "secondAlternateCodingSystemOid",
  "secondAlternateValueSetOid",
  "secondAlternateValueSetVersionId",
] as const;

/** One of the 22 shared coded-element component names. @internal */
export type CodedElementKey = (typeof CODED_ELEMENT_KEYS)[number];
