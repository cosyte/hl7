/**
 * `buildStructure` — compose the read-side `MessageStructure` summary exposed
 * by `Hl7Message.structure` (roadmap Phase G). It mirrors, on the public
 * message surface, the same conservative expected-group analysis the parser
 * runs at parse time to emit `MISSING_EXPECTED_GROUP` warnings — so a consumer
 * can ask "did this message carry its expected core groups?" without scanning
 * `msg.warnings`.
 *
 * Composes on the Phase 3 public surface (`msg.get`, `msg.allSegments()`) —
 * never walks `rawSegments` directly. D-01 freeze at boundary (the underlying
 * `analyzeMessageStructure` already freezes deeply). D-02 memoization is the
 * caller's job (`Hl7Message.structure` getter). D-22 never throws.
 */

import type { Hl7Message } from "../model/message.js";
import { analyzeMessageStructure, type MessageStructure } from "../parser/message-structure.js";

/**
 * Build the immutable `MessageStructure` summary for a parsed message. Reads
 * the message type from MSH-9.1 / MSH-9.2 and the present segment names from
 * `msg.allSegments()`, then defers to the pure `analyzeMessageStructure`. The
 * result is deeply frozen and consumed through the memoized
 * `Hl7Message.structure` getter.
 *
 * @example
 * ```ts
 * import { parseHL7 } from "@cosyte/hl7";
 * const msg = parseHL7(raw);
 * console.log(msg.structure.recognized);    // true for known types
 * console.log(msg.structure.missingGroups); // e.g. ["result"]
 * ```
 *
 * @internal
 */
export function buildStructure(msg: Hl7Message): MessageStructure {
  const messageCode = msg.get("MSH.9.1") ?? "";
  const triggerEvent = msg.get("MSH.9.2") ?? "";
  const presentSegmentNames = new Set<string>();
  for (const seg of msg.allSegments()) presentSegmentNames.add(seg.type);
  return analyzeMessageStructure(messageCode, triggerEvent, presentSegmentNames);
}
