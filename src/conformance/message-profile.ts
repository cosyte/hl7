/**
 * `findMessageProfiles`: find the profile or profiles a message names in MSH-21, in a list the
 * caller supplies. No XML, no network call, no bundled profile: the caller writes every entry.
 *
 * Zero runtime deps: reads MSH-21 through the public segment surface and `parseEi`.
 */

import type { Hl7Message } from "../model/message.js";
import { parseEi, type EI } from "../model/types/ei.js";
import type { RawRepetition } from "../parser/types.js";

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

/**
 * One MSH-21 repetition that names something and matched no entry, with why, as `reason`:
 *
 * - `unlisted`: the repetition is a well-formed `EI` and no entry in the list has its identifier;
 * - `malformed`: the repetition is not the shape of an `EI`, so it never matches. An `EI` has at
 *   most four components and none of them holds a subcomponent: a repetition with a non-empty
 *   subcomponent after the first in any component, or a non-empty component past the fourth, is
 *   a different or broken identifier. Its `identifier` then holds only the first subcomponent of
 *   each of the first four components, so it is not the whole of what MSH-21 carries.
 */
export interface MessageProfileMiss extends MessageProfileClaim {
  /** Why the repetition matched nothing. */
  readonly reason: "unlisted" | "malformed";
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
 * every repetition that names something and matched no entry, with its `reason`, so a caller can
 * refuse a message that claims a profile it does not know, or claims one in a shape no `EI` has,
 * even when another claim matched.
 *
 * Unlike conformance findings, which withhold message values, `matches` and `unmatched` hand the
 * MSH-21 identifiers back to the caller by design: they are what the caller asked about.
 */
export interface MessageProfileLookup<P = ConformanceProfile> {
  readonly outcome: "undeclared" | "none" | "one" | "several";
  readonly profiles: readonly P[];
  readonly matches: readonly MessageProfileMatch<P>[];
  readonly unmatched: readonly MessageProfileMiss[];
}

/** The number of components an `EI` has. @internal */
const EI_COMPONENTS = 4;

/**
 * Whether a raw repetition carries more than an `EI` can hold: a non-empty subcomponent after the
 * first in any component, or a non-empty component past the fourth. The raw tree was split under
 * the message's own delimiters, so this holds for any delimiter set.
 *
 * @internal
 */
function malformed(rep: RawRepetition): boolean {
  return rep.components.some((component, index) => {
    // `?.` and `??` read a `null` that a repetition built by hand carries as absent.
    const subcomponents = component?.subcomponents ?? [];
    const from = index < EI_COMPONENTS ? 1 : 0;
    return subcomponents.slice(from).some((sub) => (sub ?? "") !== "");
  });
}

/** A component's value, or `undefined` when it is absent or empty. @internal */
function present(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
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
  const entity = present(a.entityIdentifier);
  if (entity === undefined || entity !== b.entityIdentifier) return false;
  const aUniversal = present(a.universalId);
  const bUniversal = present(b.universalId);
  const aNamespace = present(a.namespaceId);
  if (aUniversal !== undefined && bUniversal !== undefined) {
    const aType = present(a.universalIdType);
    const bType = present(b.universalIdType);
    return (
      aUniversal === bUniversal && (aType === undefined || bType === undefined || aType === bType)
    );
  }
  // At most one side carries a universal ID. When neither does, the namespace IDs decide, and two
  // absent ones are two identifiers with no authority. When one side does, the namespace IDs decide
  // only if both carry one.
  if (aUniversal === bUniversal) return aNamespace === present(b.namespaceId);
  return aNamespace !== undefined && aNamespace === present(b.namespaceId);
}

/**
 * Find the profile or profiles a message names in MSH-21, in a list of entries the caller
 * supplies. Each MSH-21 repetition is read as an `EI` and matched to every entry with the same
 * entity identifier under the same assigning authority: the universal ID decides when both carry
 * one (with its type, when both carry a type), else the namespace ID, and an identifier that names
 * no authority matches only an entry that names none. Values compare exactly as decoded.
 *
 * A repetition that is not the shape of an `EI` (a non-empty subcomponent after the first in any
 * component, or a non-empty component past the fourth) never matches: it is listed in `unmatched`
 * with `reason: "malformed"` and counts as declared, so a wrong profile is never picked from a
 * partial read.
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
  const unmatched: MessageProfileMiss[] = [];
  let declared = false;

  // A message built by hand can have no MSH; it names no profile.
  const repetitions = msg.segments("MSH")[0]?.field(21).repetitions ?? [];
  for (const [repetition, rep] of repetitions.entries()) {
    const identifier = Object.freeze(parseEi(rep, msg.encodingCharacters));
    if (malformed(rep)) {
      declared = true;
      unmatched.push(Object.freeze({ repetition, identifier, reason: "malformed" }));
      continue;
    }
    if (Object.keys(identifier).length === 0) continue;
    declared = true;
    let matched = false;
    for (const entry of entries) {
      if (!sameIdentifier(entry.identifier, identifier)) continue;
      matched = true;
      matches.push(Object.freeze({ repetition, identifier, entry }));
      if (!profiles.includes(entry.profile)) profiles.push(entry.profile);
    }
    if (!matched) unmatched.push(Object.freeze({ repetition, identifier, reason: "unlisted" }));
  }

  const outcome = !declared
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
