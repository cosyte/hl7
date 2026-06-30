/**
 * Coding-system provenance (HL7 Table 0396, READ-ONLY) — roadmap Phase F.
 *
 * Answers one question about a coded element: **"what coding system does this
 * code CLAIM?"** It surfaces the sender's CWE.3 / CE.3 "Name of Coding System"
 * value, normalizes well-known aliases to the registered Table 0396 acronym,
 * and reports a canonical human-readable name. It is provenance only:
 *
 *   - **No validation.** It does not check that the code exists in the claimed
 *     system, nor that the system is current. A wrong-but-registered code
 *     (e.g. a deleted LOINC) still reports `known: true` for LOINC.
 *   - **No lookup, no network, no bundled codeset.** Zero runtime deps; this is
 *     a frozen acronym→name map, nothing more.
 *   - **Fail-safe.** An unregistered / local / mistyped system id is surfaced
 *     **verbatim** with `known: false` — never dropped, never guessed.
 *
 * Because provenance is the *sender's claim*, not a verified fact, a consumer
 * MUST still treat the code per its own trust policy. The value of this module
 * is letting that consumer ask "which system?" before interpreting a code — a
 * "PCN" allergen or an "I10" diagnosis is only safe to read once you know the
 * system it belongs to.
 *
 * Spec traceability: HL7 Table 0396 (Coding System) — the registry of
 * coding-system acronyms carried in the CWE.3 / CE.3 component. v2.7+ expects
 * the registered acronym. See `docs-content/spec-notes-coding-system.md` for
 * the per-entry source and the `I10` (ICD-10 vs ICD-10-CM) nuance.
 *
 * Zero runtime deps — pure data + pure functions.
 */

/**
 * One recognized HL7 Table 0396 coding system: its registered acronym (the
 * value expected in CWE.3 / CE.3), a canonical human-readable name, and the
 * widely-used aliases tolerated for it. Aliases are matched case-insensitively.
 */
export interface KnownCodingSystem {
  /** Registered Table 0396 acronym, e.g. `"LN"`. */
  readonly id: string;
  /** Canonical human-readable name, e.g. `"LOINC"`. */
  readonly name: string;
  /**
   * Widely-used alternative spellings that claim the same system (matched
   * case-insensitively), e.g. `"LOINC"` for `LN`. The registered `id` itself
   * is always recognized and need not be repeated here.
   */
  readonly aliases: readonly string[];
}

/**
 * The safety-relevant subset of HL7 Table 0396 this library recognizes for
 * provenance. Deliberately small and frozen — it is NOT the full Table 0396
 * registry. Each entry's source is recorded in
 * `docs-content/spec-notes-coding-system.md`.
 *
 * Note on `I10`: Table 0396 registers `I10` as **ICD-10** (the WHO base
 * classification). US v2 feeds frequently send `I10` when they mean
 * ICD-10-**CM**, but that clinical-modification specificity is the sender's
 * convention, not what the acronym registers — so this map reports the
 * registered claim (`"ICD-10"`) and does not silently upgrade it to CM.
 *
 * @example
 * ```ts
 * import { KNOWN_CODING_SYSTEMS } from "@cosyte/hl7";
 * console.log(KNOWN_CODING_SYSTEMS.find((s) => s.id === "LN")?.name); // "LOINC"
 * ```
 */
export const KNOWN_CODING_SYSTEMS: readonly KnownCodingSystem[] = Object.freeze([
  Object.freeze({ id: "LN", name: "LOINC", aliases: Object.freeze(["LOINC"]) }),
  Object.freeze({
    id: "SCT",
    name: "SNOMED CT",
    aliases: Object.freeze(["SNM", "SNOMED", "SNOMEDCT"]),
  }),
  Object.freeze({ id: "I10", name: "ICD-10", aliases: Object.freeze(["ICD-10", "ICD10"]) }),
  Object.freeze({
    id: "I10P",
    name: "ICD-10-PCS",
    aliases: Object.freeze(["ICD-10-PCS", "ICD10PCS"]),
  }),
  Object.freeze({ id: "RXN", name: "RxNorm", aliases: Object.freeze(["RXNORM"]) }),
  Object.freeze({ id: "NDC", name: "National Drug Codes", aliases: Object.freeze([]) }),
  Object.freeze({ id: "CVX", name: "CDC Vaccine Codes", aliases: Object.freeze([]) }),
  Object.freeze({
    id: "MVX",
    name: "CDC Vaccine Manufacturer Codes",
    aliases: Object.freeze([]),
  }),
  Object.freeze({
    id: "UCUM",
    name: "Unified Code for Units of Measure",
    aliases: Object.freeze([]),
  }),
] as const);

/**
 * Case-insensitive lookup index: every registered id and every alias
 * (uppercased) → its `KnownCodingSystem`. Built once at module load.
 * @internal
 */
const LOOKUP: ReadonlyMap<string, KnownCodingSystem> = (() => {
  const m = new Map<string, KnownCodingSystem>();
  for (const sys of KNOWN_CODING_SYSTEMS) {
    m.set(sys.id.toUpperCase(), sys);
    for (const alias of sys.aliases) m.set(alias.toUpperCase(), sys);
  }
  return m;
})();

/**
 * A coding-system provenance answer — the system a code CLAIMS, never
 * validated. `claimed` is always present and verbatim (never dropped); the
 * resolved `id` / `name` are present only when the claim maps to a registered
 * Table 0396 entry.
 */
export interface CodingSystemInfo {
  /**
   * The coding-system id exactly as it appeared in CWE.3 / CE.3 — preserved
   * verbatim (original case and spelling), never altered, never dropped.
   */
  readonly claimed: string;
  /** `true` when `claimed` resolved (directly or via alias) to a registered Table 0396 entry. */
  readonly known: boolean;
  /** Registered Table 0396 acronym (alias-normalized). Present only when `known`. */
  readonly id?: string;
  /** Canonical human-readable name. Present only when `known`. */
  readonly name?: string;
}

/**
 * Resolve a raw coding-system id (a CWE.3 / CE.3 "Name of Coding System"
 * value) to its provenance. Returns `undefined` when there is no claim to
 * resolve — `id` is `undefined`, empty, or whitespace-only.
 *
 * Matching is case-insensitive and tolerant of surrounding whitespace, and
 * normalizes the well-known aliases in {@link KNOWN_CODING_SYSTEMS} (e.g.
 * `"LOINC"` → `LN`, `"SNOMED"` → `SCT`, `"RxNorm"` → `RXN`). An unrecognized
 * id is returned verbatim with `known: false` — never guessed.
 *
 * @example
 * ```ts
 * import { codingSystem } from "@cosyte/hl7";
 * codingSystem("LN");      // { claimed: "LN", known: true, id: "LN", name: "LOINC" }
 * codingSystem("loinc");   // { claimed: "loinc", known: true, id: "LN", name: "LOINC" }
 * codingSystem("99zL");    // { claimed: "99zL", known: false }
 * codingSystem(undefined); // undefined
 * ```
 */
export function codingSystem(id: string | undefined): CodingSystemInfo | undefined {
  if (id === undefined) return undefined;
  const key = id.trim().toUpperCase();
  if (key === "") return undefined;

  const entry = LOOKUP.get(key);
  if (entry === undefined) {
    return Object.freeze({ claimed: id, known: false });
  }
  return Object.freeze({ claimed: id, known: true, id: entry.id, name: entry.name });
}

/**
 * Structural shape of any coded element that carries a primary + alternate
 * coding system — both {@link CWE} and {@link CE} satisfy it. Kept structural
 * (not a union) so callers can pass a `dg.code` / `obs.code` directly.
 */
export interface CodedSystemFields {
  readonly nameOfCodingSystem?: string;
  readonly nameOfAlternateCodingSystem?: string;
}

/**
 * Provenance of a coded element's **primary** coding system (CWE.3 / CE.3).
 * Returns `undefined` when the element claims no primary system.
 *
 * @example
 * ```ts
 * import { parseHL7, codingSystemOf } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * for (const dg of msg.diagnoses()) {
 *   const sys = dg.code && codingSystemOf(dg.code);
 *   console.log(dg.code?.identifier, sys?.name ?? sys?.claimed ?? "(no system)");
 * }
 * ```
 */
export function codingSystemOf(coded: CodedSystemFields): CodingSystemInfo | undefined {
  return codingSystem(coded.nameOfCodingSystem);
}

/**
 * Provenance of a coded element's **alternate** coding system (CWE.6 / CE.6).
 * Returns `undefined` when the element claims no alternate system. Useful for
 * dual-coded fields (e.g. a problem carrying both SNOMED CT and ICD-10), where
 * assuming a single coding system would be unsafe.
 *
 * @example
 * ```ts
 * import { alternateCodingSystemOf } from "@cosyte/hl7";
 * const alt = alternateCodingSystemOf(dg.code);
 * if (alt) console.log("also coded in", alt.name ?? alt.claimed);
 * ```
 */
export function alternateCodingSystemOf(coded: CodedSystemFields): CodingSystemInfo | undefined {
  return codingSystem(coded.nameOfAlternateCodingSystem);
}
