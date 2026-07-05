/**
 * HL7 v2 **Table 0211 (Alternate Character Sets)** resolution for the parser's
 * `Buffer`-decode stage (Phase O). Mirrors the frozen read-only registries
 * `KNOWN_SEGMENTS` / `KNOWN_CODING_SYSTEMS`: a single source of truth mapping an
 * MSH-18 character-set code to how the parser treats it — **decode** (single-byte
 * ISO-8859 family + Unicode UTF-8) or **preserve-verbatim** (the multibyte /
 * ISO-2022-switched East-Asian sets and UTF-16/32, which HL7 renders through
 * stateful `\Mxxyyzz\` escapes this phase deliberately does not fully decode).
 *
 * Spec traceability: HL7 v2 Chapter 2, **MSH-18** (item 00692) + **Table 0211**
 * (OID 2.16.840.1.113883.18.116). MSH-18 is **repeating** — the first occurrence
 * is the message's default encoding, later occurrences are alternates activated
 * mid-message by the §2.7.4 charset-switch escapes (`\Cxxyy\` single-byte,
 * `\Mxxyyzz\` multi-byte). A **blank** MSH-18 means 7-bit ASCII (the default).
 *
 * Fail-safe design: a set we do not decode is NEVER silently guessed as another
 * encoding. The caller preserves the raw bytes as a 1:1 `latin1` reading (every
 * byte 0x00..0xFF → U+0000..U+00FF) and emits a warning. For a **single-byte**
 * undecoded charset (an unrecognized label, or a recognized single-byte set) this
 * is byte-recoverable: the HL7 structural bytes (segment terminator CR, and the
 * `|^~\&` delimiters) are unambiguous, so a field's content bytes survive and can
 * be re-decoded downstream via `Buffer.from(value, "latin1")`. For a **multibyte**
 * set (UTF-16/32, the East-Asian DBCS/ISO-2022 sets) a content byte can coincide
 * with a structural byte, so tokenization runs on raw bytes and framing is
 * best-effort, not byte-recoverable — which is exactly why decoding those sets is
 * deferred (see the parser's known-limitations). Because a recognized-but-undecoded
 * set and an unrecognized label both preserve bytes, the exact Table-0211 spelling
 * of the multibyte codes is not load-bearing for safety — only for which warning
 * (`UNSUPPORTED_CHARSET` vs `UNKNOWN_CHARSET`) fires.
 */

/**
 * How the parser treats a resolved MSH-18 character set.
 *
 * - `decode` — decode the byte stream to text with {@link CharsetResolution.decoder}.
 * - `verbatim` — read the raw bytes as a 1:1 `latin1` mapping; do not decode
 *   (byte-recoverable for single-byte content — see the module header).
 */
export type CharsetTreatment = "decode" | "verbatim";

/**
 * The outcome of resolving an MSH-18 label (or `options.charset` override)
 * against Table 0211.
 */
export interface CharsetResolution {
  /**
   * The canonical Table-0211 code the label resolved to (e.g. `"UTF-8"`,
   * `"8859/1"`, `"ISO IR87"`). For an unrecognized label this is the input
   * trimmed + upper-cased, so it is still a stable key for comparison.
   */
  readonly canonical: string;
  /** Whether the parser decodes this set or preserves its bytes verbatim. */
  readonly treatment: CharsetTreatment;
  /**
   * The WHATWG `TextDecoder` label to decode with when `treatment === "decode"`.
   * Empty when `treatment === "verbatim"`.
   */
  readonly decoder: string;
  /**
   * `true` when the label is a recognized HL7 Table-0211 code (whether or not
   * the parser decodes it); `false` when the label is not in Table 0211.
   * Drives the warning code on the verbatim path: recognized-but-`verbatim`
   * → `UNSUPPORTED_CHARSET`, unrecognized → `UNKNOWN_CHARSET`.
   */
  readonly recognized: boolean;
}

/** A frozen Table-0211 registry entry. */
interface CharsetEntry {
  readonly canonical: string;
  readonly treatment: CharsetTreatment;
  readonly decoder: string;
}

/**
 * Normalize an MSH-18 label to a lookup key: trim, upper-case, and collapse
 * internal runs of whitespace to a single space so `"unicode   utf-8"` and
 * `"UNICODE UTF-8"` resolve alike. HL7 codes are ASCII, so an ASCII-safe
 * upper-case is sufficient and locale-independent.
 *
 * @internal
 */
function normalizeLabel(raw: string): string {
  return raw.trim().replace(/\s+/gu, " ").toUpperCase();
}

/** Build a decode entry. @internal */
function decodeEntry(canonical: string, decoder: string): CharsetEntry {
  return { canonical, treatment: "decode", decoder };
}

/** Build a verbatim (recognized-but-not-decoded) entry. @internal */
function verbatimEntry(canonical: string): CharsetEntry {
  return { canonical, treatment: "verbatim", decoder: "" };
}

/**
 * Assemble the frozen alias → entry table. Multiple aliases (HL7 spellings +
 * common `ISO-8859-N` synonyms) point at one canonical entry.
 *
 * @internal
 */
function buildTable(): ReadonlyMap<string, CharsetEntry> {
  const table = new Map<string, CharsetEntry>();
  const add = (aliases: readonly string[], entry: CharsetEntry): void => {
    for (const alias of aliases) table.set(normalizeLabel(alias), entry);
  };

  // 7-bit ASCII (ISO IR6) — the Table-0211 default. Decoded as UTF-8: for
  // conformant 7-bit content the result is byte-identical, and it tolerates the
  // ubiquitous undeclared-UTF-8 feed without corruption (ASCII ⊂ UTF-8).
  add(["ASCII", "US-ASCII", "ISO IR6"], decodeEntry("ASCII", "utf-8"));

  // Unicode UTF-8 and its HL7 spellings. `UNICODE` (bare) is the deprecated
  // pre-UTF-8 code that real feeds use to mean UTF-8.
  add(["UTF-8", "UTF8", "UNICODE UTF-8", "UNICODE"], decodeEntry("UTF-8", "utf-8"));

  // ISO-8859-1 (Latin-1) — decoded via Node's `latin1`, which is the TRUE
  // ISO-8859-1 (every byte 0x00–0xFF maps 1:1, byte-exact, never fails). Node's
  // WHATWG `TextDecoder("iso-8859-1")` is actually windows-1252 — it remaps the
  // C1 range (0x80 → €), so it is deliberately NOT used here.
  add(["8859/1", "ISO-8859-1", "ISO 8859-1", "ISO8859-1"], decodeEntry("8859/1", "latin1"));

  // The rest of the single-byte ISO 8859 family that Node's ICU decodes
  // FAITHFULLY — i.e. the C1 range 0x80–0x9F maps to U+0080–U+009F (controls),
  // matching the true ISO-8859-N code page (audited empirically). Decoded
  // strictly (see normalizeBuffer): a byte genuinely undefined in the set fails
  // the decode and preserves verbatim rather than emitting a silent U+FFFD.
  //
  // 8859/9 and 8859/11 are DELIBERATELY EXCLUDED: Node/ICU aliases their labels
  // to windows-1254 / windows-874, which *define* the C1 range as typographic
  // characters (byte 0x80 → €), diverging from true ISO-8859-9/11. A strict
  // decode would NOT throw on those bytes — it would silently emit a wrong,
  // non-recoverable character — so they are preserved verbatim below instead of
  // mis-decoded. (8859/1 is handled byte-exactly above via `latin1`.)
  for (const n of [2, 3, 4, 5, 6, 7, 8, 10, 13, 14, 15, 16]) {
    add(
      [`8859/${n}`, `ISO-8859-${n}`, `ISO 8859-${n}`, `ISO8859-${n}`],
      decodeEntry(`8859/${n}`, `iso-8859-${n}`),
    );
  }
  // Recognized but NOT decoded — Node's ICU has no faithful decoder (windows
  // codepage alias remaps the C1 range); preserved verbatim (byte-recoverable)
  // rather than silently mis-decoded. See the note above.
  add(["8859/9", "ISO-8859-9", "ISO 8859-9", "ISO8859-9"], verbatimEntry("8859/9"));
  add(["8859/11", "ISO-8859-11", "ISO 8859-11", "ISO8859-11"], verbatimEntry("8859/11"));

  // Recognized Table-0211 multibyte / ISO-2022-switched East-Asian sets and
  // the wide Unicode transforms: recognized, but preserved verbatim this phase
  // (full stateful decoding is deferred — see the module header).
  add(["ISO IR14", "JIS X 0201"], verbatimEntry("ISO IR14"));
  add(["ISO IR87", "JIS X 0208"], verbatimEntry("ISO IR87"));
  add(["ISO IR159", "JIS X 0212"], verbatimEntry("ISO IR159"));
  add(["GB 18030-2000", "GB18030", "GB 18030"], verbatimEntry("GB 18030-2000"));
  add(["KS X 1001", "KSX1001", "KS C 5601"], verbatimEntry("KS X 1001"));
  add(["CNS 11643-1992", "CNS 11643"], verbatimEntry("CNS 11643-1992"));
  add(["BIG-5", "BIG5"], verbatimEntry("BIG-5"));
  add(["UNICODE UTF-16", "UTF-16"], verbatimEntry("UNICODE UTF-16"));
  add(["UNICODE UTF-32", "UTF-32"], verbatimEntry("UNICODE UTF-32"));

  return table;
}

/**
 * The frozen HL7 v2 Table-0211 registry, keyed by normalized label. Read-only —
 * built once at module load, never mutated.
 */
const CHARSET_TABLE: ReadonlyMap<string, CharsetEntry> = buildTable();

/**
 * The default resolution for a blank / absent MSH-18: **7-bit ASCII** per
 * Table 0211, decoded as its UTF-8 superset. Recognized, no warning.
 *
 * @internal
 */
const DEFAULT_RESOLUTION: CharsetResolution = Object.freeze({
  canonical: "ASCII",
  treatment: "decode",
  decoder: "utf-8",
  recognized: true,
});

/**
 * Resolve an MSH-18 label (or an `options.charset` override) to a
 * {@link CharsetResolution}. A blank / `undefined` label resolves to the ASCII
 * default. A recognized Table-0211 code returns its registry entry. An
 * unrecognized label resolves to a `verbatim`, `recognized: false` outcome so
 * the caller preserves bytes and emits `UNKNOWN_CHARSET`.
 *
 * @example
 * ```ts
 * import { resolveCharset } from "@cosyte/hl7";
 * resolveCharset("UNICODE UTF-8"); // { canonical: "UTF-8", treatment: "decode", ... }
 * resolveCharset("ISO IR87");      // { canonical: "ISO IR87", treatment: "verbatim", recognized: true }
 * resolveCharset("WINDOWS-1252");  // { canonical: "WINDOWS-1252", treatment: "verbatim", recognized: false }
 * ```
 */
export function resolveCharset(raw: string | undefined): CharsetResolution {
  if (raw === undefined) return DEFAULT_RESOLUTION;
  const key = normalizeLabel(raw);
  if (key === "") return DEFAULT_RESOLUTION;
  const entry = CHARSET_TABLE.get(key);
  if (entry !== undefined) {
    return {
      canonical: entry.canonical,
      treatment: entry.treatment,
      decoder: entry.decoder,
      recognized: true,
    };
  }
  return { canonical: key, treatment: "verbatim", decoder: "", recognized: false };
}

/**
 * The canonical Table-0211 code for a label, for equality comparison (e.g. the
 * MSH-18-vs-`options.charset` `ENCODING_MISMATCH` check). Synonyms collapse to
 * one canonical string (`"UNICODE UTF-8"` and `"UTF-8"` → `"UTF-8"`), so a
 * synonym pair does not raise a false mismatch; an unrecognized label returns
 * its normalized form so two genuinely different labels still differ.
 *
 * @example
 * ```ts
 * import { canonicalCharset } from "@cosyte/hl7";
 * canonicalCharset("unicode utf-8") === canonicalCharset("UTF-8"); // true
 * ```
 */
export function canonicalCharset(raw: string): string {
  return resolveCharset(raw).canonical;
}
