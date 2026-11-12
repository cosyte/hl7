/**
 * `findMessageProfiles`: find the profile or profiles a message names in MSH-21, in a list the
 * caller supplies. No XML, no network call, no bundled profile: the caller writes every entry.
 *
 * Zero runtime deps: reads MSH-21 through the public segment surface and `parseEi`.
 */

import type { Hl7Message } from "../model/message.js";
import { parseEi, type EI } from "../model/types/ei.js";

import type { ConformanceProfile } from "./types.js";

/**
 * One profile the caller can name in MSH-21: the identifier the profile is published under, as an
 * `EI`, and the profile itself. `profile` is a {@link ConformanceProfile} by default, and can be
 * any value the caller wants back (a name, a handler, a profile of their own shape).
 *
 * @example
 * ```ts
 * import type { MessageProfileEntry } from "@cosyte/hl7";
 * const entry: MessageProfileEntry = {
 *   identifier: { entityIdentifier: "EXPROF-1", namespaceId: "EXAMPLEORG" },
 *   profile: { name: "example-intake", segments: [{ segment: "PID", usage: "R" }] },
 * };
 * ```
 */
export interface MessageProfileEntry<P = ConformanceProfile> {
  /**
   * The profile's identifier, matched against each MSH-21 repetition. `entityIdentifier` is
   * required; an entry whose `entityIdentifier` is empty never matches.
   */
  readonly identifier: EI & { readonly entityIdentifier: string };
  /** The value returned when MSH-21 names this entry. */
  readonly profile: P;
}

/** One MSH-21 repetition that names something: its 0-indexed position and its `EI`. */
export interface MessageProfileClaim {
  /** 0-indexed MSH-21 repetition, counting empty repetitions, as `FindingLocus.repetition` does. */
  readonly repetition: number;
  /** The repetition read as an `EI`, decoded, with absent components omitted. */
  readonly identifier: EI;
}

/** One MSH-21 repetition paired with one entry it matched. */
export interface MessageProfileMatch<P = ConformanceProfile> extends MessageProfileClaim {
  /** The caller's entry the repetition matched. */
  readonly entry: MessageProfileEntry<P>;
}

/**
 * What MSH-21 named, against the caller's list, as `outcome`:
 *
 * - `undeclared`: MSH-21 is empty, so the message names no profile;
 * - `none`: MSH-21 names one or more profiles and no entry matches any of them;
 * - `one`: every match is to one profile (compared by identity, so two entries holding the same
 *   profile object count once);
 * - `several`: matches reach two or more profiles.
 *
 * `profiles` holds each distinct profile matched, in MSH-21 order, then list order. `matches`
 * holds every pair of a repetition and an entry it matched, in the same order. `unmatched` holds
 * every repetition that names something and matched no entry, so a caller can refuse a message
 * that claims a profile it does not know, even when another claim matched.
 */
export interface MessageProfileLookup<P = ConformanceProfile> {
  readonly outcome: "undeclared" | "none" | "one" | "several";
  readonly profiles: readonly P[];
  readonly matches: readonly MessageProfileMatch<P>[];
  readonly unmatched: readonly MessageProfileClaim[];
}

/** A component that carries a value. @internal */
function valued(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/**
 * Whether two `EI` values name the same thing. The entity identifiers must be equal and valued.
 * The assigning authority is an `HD`: identified by its universal ID and that id's type, or by its
 * local namespace ID, and when both are valued they name the same authority. So when both sides
 * carry a universal ID, it decides (with the type, when both carry one) and the namespace IDs are
 * not compared; otherwise, when both carry a namespace ID, it decides; otherwise the authorities
 * match only when neither side names one. Values compare exactly: no case folding, no trimming.
 *
 * @internal
 */
function sameIdentifier(a: EI, b: EI): boolean {
  if (!valued(a.entityIdentifier) || a.entityIdentifier !== b.entityIdentifier) return false;
  if (valued(a.universalId) && valued(b.universalId)) {
    if (a.universalId !== b.universalId) return false;
    return !(
      valued(a.universalIdType) &&
      valued(b.universalIdType) &&
      a.universalIdType !== b.universalIdType
    );
  }
  if (valued(a.namespaceId) && valued(b.namespaceId)) return a.namespaceId === b.namespaceId;
  const aNamed = valued(a.namespaceId) || valued(a.universalId);
  const bNamed = valued(b.namespaceId) || valued(b.universalId);
  return !aNamed && !bNamed;
}

/**
 * Find the profile or profiles a message names in MSH-21, in a list of entries the caller
 * supplies. Each MSH-21 repetition is read as an `EI` and matched to every entry with the same
 * entity identifier under the same assigning authority: the universal ID decides when both carry
 * one (with its type, when both carry a type), else the namespace ID, and an identifier that names
 * no authority matches only an entry that names none. Values compare exactly as decoded.
 *
 * The result says which case it is (`undeclared`, `none`, `one`, `several`), so no match is never
 * a silent pass, and it lists the repetitions no entry matched. Reads the message and changes
 * nothing, whatever MSH-21 carries; makes no network call. The caller writes every profile.
 *
 * @example
 * ```ts
 * import { findMessageProfiles, parseHL7, validateAgainstProfile } from "@cosyte/hl7";
 *
 * const msg = parseHL7(raw);
 * const lookup = findMessageProfiles(msg, [
 *   { identifier: { entityIdentifier: "EXPROF-1", namespaceId: "EXAMPLEORG" }, profile: intake },
 * ]);
 * const [profile] = lookup.profiles;
 * if (lookup.outcome === "one" && profile !== undefined) validateAgainstProfile(msg, profile);
 * ```
 */
export function findMessageProfiles<P = ConformanceProfile>(
  msg: Hl7Message,
  entries: readonly MessageProfileEntry<P>[],
): MessageProfileLookup<P> {
  const profiles: P[] = [];
  const matches: MessageProfileMatch<P>[] = [];
  const unmatched: MessageProfileClaim[] = [];
  let claims = 0;

  const repetitions = msg.segments("MSH")[0]?.field(21).repetitions ?? [];
  for (let repetition = 0; repetition < repetitions.length; repetition++) {
    const rep = repetitions[repetition];
    if (rep === undefined) continue;
    const identifier = Object.freeze(parseEi(rep, msg.encodingCharacters));
    if (Object.keys(identifier).length === 0) continue;
    claims++;
    let matched = false;
    for (const entry of entries) {
      if (!sameIdentifier(entry.identifier, identifier)) continue;
      matched = true;
      matches.push(Object.freeze({ repetition, identifier, entry }));
      if (!profiles.includes(entry.profile)) profiles.push(entry.profile);
    }
    if (!matched) unmatched.push(Object.freeze({ repetition, identifier }));
  }

  const outcome =
    claims === 0
      ? "undeclared"
      : profiles.length === 0
        ? "none"
        : profiles.length === 1
          ? "one"
          : "several";
  return Object.freeze({
    outcome,
    profiles: Object.freeze(profiles),
    matches: Object.freeze(matches),
    unmatched: Object.freeze(unmatched),
  });
}
