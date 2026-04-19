/**
 * `Hl7Message` — the immutable parsed-message model produced by `parseHL7`.
 * Phase 2 shipped the read-only shell; Phase 3 extends the same class with
 * the read-path traversal methods (`get`, `getAll`, `segments`,
 * `allSegments`) on top of lazy, referentially stable Segment/Field caches
 * (D-11/D-12). The constructor surface is unchanged (Phase 2 D-05 lock) —
 * `init.segments` is still the parser-side key, but the public raw-tree
 * field is now exposed as `rawSegments` to free up the name `segments` for
 * the typed `segments(type)` method.
 */

import { resolvePath } from "./dot-path.js";
import { Segment } from "./segment.js";
import type { EncodingCharacters, RawSegment } from "../parser/types.js";
import type { Hl7ParseWarning } from "../parser/warnings.js";

/**
 * Constructor init shape for `Hl7Message`. Exposed for advanced use (e.g.
 * constructing synthetic messages in tests or higher-level builders) but
 * most consumers should rely on `parseHL7` to produce `Hl7Message`
 * instances.
 *
 * @remarks
 * With `exactOptionalPropertyTypes: true`, callers cannot pass
 * `{ profile: undefined }` — either omit the key or pass a real profile
 * descriptor. This matches the `Hl7Message.profile` public field shape
 * (`... | undefined`).
 *
 * The init key is still named `segments` (not `rawSegments`) so Phase 2
 * parser code that constructs `Hl7Message` does not need to change. Inside
 * the class body the raw tree is stored on `this.rawSegments`.
 *
 * @internal
 */
export interface Hl7MessageInit {
  readonly segments: readonly RawSegment[];
  readonly encodingCharacters: EncodingCharacters;
  readonly version: string;
  readonly warnings: readonly Hl7ParseWarning[];
  readonly profile?: { readonly name: string; readonly lineage: readonly string[] };
}

/**
 * Parsed HL7 v2 message. Produced by `parseHL7`. Exposes the raw positional
 * tree (`rawSegments`), delimiter metadata, warnings, and a typed traversal
 * surface — `get(path)` for dot-paths, `getAll(type)` / `segments(type)` /
 * `allSegments()` for wrapper-level iteration.
 *
 * @remarks
 * The `warnings` array is frozen at the model boundary so downstream
 * traversal and helper phases cannot mutate parser output. The `profile`
 * field is populated by Phase 6 when a profile is passed; Phase 2 leaves
 * it `undefined` by default. Segment/Field wrappers are cached per-message
 * and invalidated wholesale by Plan 04 mutation methods.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * console.log(msg.get("PID.5.1"));         // "Smith"
 * for (const obx of msg.segments("OBX")) {
 *   console.log(obx.field(5).value);
 * }
 * for (const w of msg.warnings) console.warn(w.code);
 * ```
 */
export class Hl7Message {
  /**
   * Raw positional tree produced by the parser. 1-indexed per HL7 convention
   * (`fields[0]` is the segment-name / MSH separator placeholder slot). Use
   * `segments(type)` / `allSegments()` for typed wrapper access — this field
   * is exposed for advanced callers that need the raw tree directly (e.g.
   * future serialization phase 5).
   */
  public readonly rawSegments: readonly RawSegment[];

  public readonly encodingCharacters: EncodingCharacters;
  public readonly version: string;
  public readonly warnings: readonly Hl7ParseWarning[];
  public readonly profile: { readonly name: string; readonly lineage: readonly string[] } | undefined;

  /**
   * Lazily built cache of Segment wrappers keyed by segment type. Built on
   * first `segments(type)` call and filtered from `_allSegments` so
   * individual Segment instances are identical across both caches (D-11).
   * Plan 04 mutation methods drop this cache wholesale.
   * @internal
   */
  private _segmentsByType: Map<string, readonly Segment[]> | undefined;

  /**
   * Lazily built cache of every Segment wrapper in document order. Built on
   * first `segments(type)` / `allSegments()` call. Plan 04 mutation methods
   * drop this cache wholesale.
   * @internal
   */
  private _allSegments: readonly Segment[] | undefined;

  /**
   * Construct a new `Hl7Message`. The constructor takes a plain init
   * object and freezes the warnings array so callers cannot mutate parser
   * output after handoff.
   *
   * @internal
   */
  public constructor(init: Hl7MessageInit) {
    this.rawSegments = init.segments;
    this.encodingCharacters = init.encodingCharacters;
    this.version = init.version;
    // Freeze the warnings array at the model boundary so downstream phases
    // cannot mutate parser output after handoff. `slice()` first to avoid
    // sharing a reference the parser may still hold internally.
    this.warnings = Object.freeze(init.warnings.slice());
    // exactOptionalPropertyTypes: `init.profile` is `{...} | undefined`
    // (the optional key was omitted or the caller passed the real value).
    // The public field declares `... | undefined`, so direct assignment is
    // sound.
    this.profile = init.profile;
  }

  /**
   * Resolve a dot-path (e.g. `PID.5.1`, `OBX[2].5`, `PID.3[0].1`) to its
   * auto-unescaped leaf string. Returns `undefined` when the path doesn't
   * resolve — never throws on missing path (MODEL-05). Throws `TypeError`
   * on malformed path syntax (e.g. `"pid.5"`, empty string).
   *
   * @example
   * ```ts
   * const msg = parseHL7(raw);
   * msg.get("PID.5.1");  // "Smith"
   * msg.get("OBX[2].5"); // third OBX's 5th field
   * msg.get("NOT.9.9");  // undefined
   * msg.get("MSH.12");   // "2.5" — HL7 version string
   * ```
   */
  public get(path: string): string | undefined {
    return resolvePath(path, this.rawSegments, this.encodingCharacters);
  }

  /**
   * Return every `Segment` of `segmentType` in document order. Returns `[]`
   * (empty array, NEVER `undefined`) when no segment of that type exists
   * (MODEL-02). Alias for `segments(segmentType)` — shares the same cache.
   *
   * @example
   * ```ts
   * for (const obx of msg.getAll("OBX")) {
   *   console.log(obx.field(5).value);
   * }
   * ```
   */
  public getAll(segmentType: string): readonly Segment[] {
    return this.segments(segmentType);
  }

  /**
   * Return the cached array of `Segment` wrappers for `segmentType` in
   * document order. The returned array identity and the individual Segment
   * instances are both stable across calls (D-11). Invalidated wholesale
   * by Plan 04 mutation methods.
   *
   * @example
   * ```ts
   * const pid = msg.segments("PID")[0];
   * if (pid !== undefined) console.log(pid.field(5).value);
   * ```
   */
  public segments(segmentType: string): readonly Segment[] {
    if (this._segmentsByType === undefined) {
      this._segmentsByType = new Map();
    }
    const cached = this._segmentsByType.get(segmentType);
    if (cached !== undefined) return cached;

    // Build from the master `_allSegments` cache so individual Segment
    // wrappers are identical across both caches (D-11 cross-cache
    // stability). `allSegments()` builds the master cache on first call.
    const all = this.allSegments();
    const filtered: readonly Segment[] = all.filter((s) => s.type === segmentType);
    this._segmentsByType.set(segmentType, filtered);
    return filtered;
  }

  /**
   * Iterate every `Segment` in document order (MSH first, then every
   * subsequent segment). Cached per-message; same array reference and same
   * Segment instances on repeat calls (D-11). Invalidated wholesale by
   * Plan 04 mutation methods.
   *
   * @example
   * ```ts
   * for (const seg of msg.allSegments()) {
   *   console.log(seg.type);
   * }
   * ```
   */
  public allSegments(): readonly Segment[] {
    if (this._allSegments !== undefined) return this._allSegments;
    const built: Segment[] = [];
    for (let i = 0; i < this.rawSegments.length; i++) {
      const raw = this.rawSegments[i];
      if (raw === undefined) continue;
      built.push(new Segment(raw, this.encodingCharacters, i));
    }
    this._allSegments = built;
    return built;
  }
}
