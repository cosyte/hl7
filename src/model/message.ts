/**
 * `Hl7Message` — the immutable parsed-message model produced by `parseHL7`.
 * In Phase 2 this class is a read-only shell exposing the raw positional
 * tree, delimiter metadata, message version, and accumulated warnings.
 * Richer traversal (`get()`, `getAll()`, typed composites) lands in Phase 3
 * without reshaping this constructor surface.
 */

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
 * Parsed HL7 v2 message. Produced by `parseHL7`. In Phase 2 this class is
 * a read-only shell exposing the raw positional tree, delimiter metadata,
 * and accumulated warnings. Richer traversal lands in Phase 3 without
 * reshaping this constructor surface.
 *
 * @remarks
 * The `warnings` array is frozen at the model boundary so downstream
 * traversal and helper phases cannot mutate parser output. The `profile`
 * field is populated by Phase 6 when a profile is passed; Phase 2 leaves
 * it `undefined` by default.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7-parser";
 * const msg = parseHL7(raw);
 * console.log(msg.version, msg.encodingCharacters.field);
 * for (const w of msg.warnings) console.warn(w.code);
 * ```
 */
export class Hl7Message {
  public readonly segments: readonly RawSegment[];
  public readonly encodingCharacters: EncodingCharacters;
  public readonly version: string;
  public readonly warnings: readonly Hl7ParseWarning[];
  public readonly profile: { readonly name: string; readonly lineage: readonly string[] } | undefined;

  /**
   * Construct a new `Hl7Message`. The constructor takes a plain init
   * object and freezes the warnings array so callers cannot mutate parser
   * output after handoff.
   *
   * @internal
   */
  public constructor(init: Hl7MessageInit) {
    this.segments = init.segments;
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
}
