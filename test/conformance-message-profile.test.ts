/**
 * `findMessageProfiles`: find the profile or profiles MSH-21 names in a list the caller supplies.
 *
 * MSH-21 repeats, one EI per profile. An EI names a thing by its entity identifier (EI.1) and the
 * authority that assigned it (EI.2 to EI.4, the same three parts as an HD). The HD data type
 * identifies an authority either by its local namespace ID or by its universal ID with that id's
 * type, and when both are valued they name the same authority. So two identifiers match when their
 * entity identifiers are equal and their authorities agree: on the universal ID (and its type, when
 * both carry one) when both carry a universal ID, else on the namespace ID when both carry one, else
 * only when neither names an authority at all.
 *
 * Every identifier and OID below is invented: the OIDs sit under HL7's example root.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENCODING_CHARACTERS,
  Hl7Message,
  conformance,
  findMessageProfiles,
  parseHL7,
  type ConformanceProfile,
  type MessageProfileEntry,
} from "../src/index.js";

const OID_A = "2.16.840.1.113883.19.900.1";
const OID_B = "2.16.840.1.113883.19.900.2";

/** A synthetic VXU whose MSH-21 is `msh21`, verbatim (empty for none). */
function message(msh21: string): ReturnType<typeof parseHL7> {
  return parseHL7(
    "MSH|^~\\&|EXAPP|EXFAC|EXREG|EXSTATE|20260102080000||VXU^V04^VXU_V04|EX90001|P|2.5.1|||ER|AL|||||" +
      msh21 +
      "\rPID|1||EX0001^^^EXHOSP^MR||Doe^Jane",
  );
}

/**
 * The same VXU under a delimiter set of its own: `#` fields, `$` components, `%` repetitions, `*`
 * escapes and `@` subcomponents. `msh21` is written in those delimiters.
 */
function customMessage(msh21: string): ReturnType<typeof parseHL7> {
  return parseHL7(
    "MSH#$%*@#EXAPP#EXFAC#EXREG#EXSTATE#20260102080000##VXU$V04$VXU_V04#EX90001#P#2.5.1###ER#AL#####" +
      msh21 +
      "\rPID#1##EX0001$$$EXHOSP$MR##Doe$Jane",
  );
}

const intake: ConformanceProfile = { name: "example-intake", segments: [] };
const registry: ConformanceProfile = { name: "example-registry", segments: [] };
const local: ConformanceProfile = { name: "example-local", segments: [] };

const INTAKE: MessageProfileEntry = {
  identifier: { entityIdentifier: "EXPROF-1", namespaceId: "EXAMPLEORG" },
  profile: intake,
};
const REGISTRY: MessageProfileEntry = {
  identifier: {
    entityIdentifier: "EXPROF-2",
    namespaceId: "EXAMPLEORG",
    universalId: OID_A,
    universalIdType: "ISO",
  },
  profile: registry,
};

describe("findMessageProfiles: one match", () => {
  it("matches on entity identifier and namespace ID", () => {
    const result = findMessageProfiles(message("EXPROF-1^EXAMPLEORG"), [INTAKE, REGISTRY]);
    expect(result.outcome).toBe("one");
    expect(result.profiles).toEqual([intake]);
    expect(result.matches).toEqual([
      {
        repetition: 0,
        identifier: { entityIdentifier: "EXPROF-1", namespaceId: "EXAMPLEORG" },
        entry: INTAKE,
      },
    ]);
    expect(result.unmatched).toEqual([]);
  });

  it("matches on the universal ID when both carry one, whatever the namespace IDs say", () => {
    // The namespace ID is a local name; two systems may call one authority by two local names.
    const result = findMessageProfiles(message(`EXPROF-2^OTHERNAME^${OID_A}^ISO`), [REGISTRY]);
    expect(result.outcome).toBe("one");
    expect(result.profiles).toEqual([registry]);
  });

  it("matches on the universal ID when the message carries no namespace ID", () => {
    const result = findMessageProfiles(message(`EXPROF-2^^${OID_A}^ISO`), [REGISTRY]);
    expect(result.outcome).toBe("one");
  });

  it("matches on the namespace ID when only the entry carries a universal ID", () => {
    const result = findMessageProfiles(message("EXPROF-2^EXAMPLEORG"), [REGISTRY]);
    expect(result.outcome).toBe("one");
  });

  it("matches on the universal ID when one side omits its type", () => {
    const result = findMessageProfiles(message(`EXPROF-2^^${OID_A}`), [REGISTRY]);
    expect(result.outcome).toBe("one");
  });

  it("matches an identifier with no authority only to an entry with none", () => {
    const bare: MessageProfileEntry = {
      identifier: { entityIdentifier: "EXLOCAL" },
      profile: local,
    };
    expect(findMessageProfiles(message("EXLOCAL"), [bare]).outcome).toBe("one");
  });

  it("compares the decoded value, after the escape sequences are read", () => {
    const amp: MessageProfileEntry = {
      identifier: { entityIdentifier: "EX&1", namespaceId: "EXAMPLEORG" },
      profile: local,
    };
    expect(findMessageProfiles(message("EX\\T\\1^EXAMPLEORG"), [amp]).outcome).toBe("one");
  });
});

describe("findMessageProfiles: each condition of the match", () => {
  it("matches on the universal ID when the entry omits its type and the message carries one", () => {
    const untyped: MessageProfileEntry = {
      identifier: { entityIdentifier: "EXPROF-2", universalId: OID_A },
      profile: local,
    };
    expect(findMessageProfiles(message(`EXPROF-2^^${OID_A}^ISO`), [untyped]).outcome).toBe("one");
  });

  it("reads an empty component on an entry as absent", () => {
    const emptyUniversal: MessageProfileEntry = {
      identifier: {
        entityIdentifier: "EXPROF-1",
        namespaceId: "EXAMPLEORG",
        universalId: "",
        universalIdType: "",
      },
      profile: local,
    };
    const result = findMessageProfiles(message(`EXPROF-1^EXAMPLEORG^${OID_A}^ISO`), [
      emptyUniversal,
    ]);
    expect(result.outcome).toBe("one");
  });

  it("does not match a universal-ID-only entry to an identifier with no authority", () => {
    const byOid: MessageProfileEntry = {
      identifier: { entityIdentifier: "EXPROF-1", universalId: OID_A, universalIdType: "ISO" },
      profile: local,
    };
    expect(findMessageProfiles(message("EXPROF-1"), [byOid]).outcome).toBe("none");
  });

  it("compares the namespace IDs when only one side carries a universal ID", () => {
    expect(findMessageProfiles(message("EXPROF-2^OTHERNAME"), [REGISTRY]).outcome).toBe("none");
  });

  it("never matches an entry that carries no entity identifier at all", () => {
    // Outside the type, as a caller's untyped data can be: an entry with only an authority.
    const noEntity = {
      identifier: { namespaceId: "EXAMPLEORG" },
      profile: local,
    } as unknown as MessageProfileEntry;
    expect(findMessageProfiles(message("^EXAMPLEORG"), [noEntity]).outcome).toBe("none");
  });
});

describe("findMessageProfiles: no match", () => {
  it("is none when MSH-21 names profiles the list does not hold, and lists them", () => {
    const result = findMessageProfiles(message("EXPROF-9^EXAMPLEORG~EXPROF-8^EXAMPLEORG"), [
      INTAKE,
      REGISTRY,
    ]);
    expect(result.outcome).toBe("none");
    expect(result.profiles).toEqual([]);
    expect(result.matches).toEqual([]);
    expect(result.unmatched).toEqual([
      {
        repetition: 0,
        identifier: { entityIdentifier: "EXPROF-9", namespaceId: "EXAMPLEORG" },
        reason: "unlisted",
      },
      {
        repetition: 1,
        identifier: { entityIdentifier: "EXPROF-8", namespaceId: "EXAMPLEORG" },
        reason: "unlisted",
      },
    ]);
  });

  it("is none against an empty list", () => {
    expect(findMessageProfiles(message("EXPROF-1^EXAMPLEORG"), []).outcome).toBe("none");
  });

  it("does not match a different entity identifier under the same authority", () => {
    expect(findMessageProfiles(message("EXPROF-3^EXAMPLEORG"), [INTAKE]).outcome).toBe("none");
  });

  it("does not match the same entity identifier under a different namespace ID", () => {
    expect(findMessageProfiles(message("EXPROF-1^OTHERORG"), [INTAKE]).outcome).toBe("none");
  });

  it("does not match a different universal ID, even under the same namespace ID", () => {
    const result = findMessageProfiles(message(`EXPROF-2^EXAMPLEORG^${OID_B}^ISO`), [REGISTRY]);
    expect(result.outcome).toBe("none");
  });

  it("does not match the same universal ID of a different type", () => {
    const result = findMessageProfiles(message(`EXPROF-2^^${OID_A}^DNS`), [REGISTRY]);
    expect(result.outcome).toBe("none");
  });

  it("does not match when only one side names an authority", () => {
    const bare: MessageProfileEntry = {
      identifier: { entityIdentifier: "EXPROF-1" },
      profile: local,
    };
    expect(findMessageProfiles(message("EXPROF-1^EXAMPLEORG"), [bare]).outcome).toBe("none");
    expect(findMessageProfiles(message("EXPROF-1"), [INTAKE]).outcome).toBe("none");
  });

  it("does not match when the authorities cannot be compared (a namespace ID against a universal ID)", () => {
    const byOid: MessageProfileEntry = {
      identifier: { entityIdentifier: "EXPROF-1", universalId: OID_A, universalIdType: "ISO" },
      profile: local,
    };
    expect(findMessageProfiles(message("EXPROF-1^EXAMPLEORG"), [byOid]).outcome).toBe("none");
  });

  it("does not fold case or trim spaces", () => {
    expect(findMessageProfiles(message("exprof-1^EXAMPLEORG"), [INTAKE]).outcome).toBe("none");
    expect(findMessageProfiles(message("EXPROF-1 ^EXAMPLEORG"), [INTAKE]).outcome).toBe("none");
  });

  it("never matches a repetition with no entity identifier, and lists it", () => {
    const result = findMessageProfiles(message("^EXAMPLEORG"), [INTAKE]);
    expect(result.outcome).toBe("none");
    expect(result.unmatched).toEqual([
      { repetition: 0, identifier: { namespaceId: "EXAMPLEORG" }, reason: "unlisted" },
    ]);
  });

  it("never matches an entry with no entity identifier", () => {
    const blank = {
      identifier: { entityIdentifier: "", namespaceId: "EXAMPLEORG" },
      profile: local,
    } satisfies MessageProfileEntry;
    expect(findMessageProfiles(message("^EXAMPLEORG"), [blank]).outcome).toBe("none");
  });
});

describe("findMessageProfiles: a repetition that is not the shape of an EI", () => {
  // EI components are primitives: none holds a subcomponent, and an EI has four components. A
  // repetition that carries more is a different or broken identifier, so it never matches, even
  // when its first subcomponents read like a listed entry. It counts as declared.

  it("never matches a subcomponent past the first in the entity identifier", () => {
    const result = findMessageProfiles(message("EXPROF-1&X^EXAMPLEORG"), [INTAKE]);
    expect(result.outcome).toBe("none");
    expect(result.profiles).toEqual([]);
    expect(result.matches).toEqual([]);
    expect(result.unmatched).toEqual([
      {
        repetition: 0,
        identifier: { entityIdentifier: "EXPROF-1", namespaceId: "EXAMPLEORG" },
        reason: "malformed",
      },
    ]);
  });

  it("never matches a subcomponent past the first in the namespace ID", () => {
    const result = findMessageProfiles(message("EXPROF-1^EXAMPLEORG&OTHER"), [INTAKE]);
    expect(result.outcome).toBe("none");
    expect(result.unmatched.map((u) => [u.repetition, u.reason])).toEqual([[0, "malformed"]]);
  });

  it("counts a repetition of only a later subcomponent as declared, and malformed", () => {
    const result = findMessageProfiles(message("&X"), [INTAKE]);
    expect(result.outcome).toBe("none");
    expect(result.unmatched).toEqual([{ repetition: 0, identifier: {}, reason: "malformed" }]);
  });

  it("never matches a subcomponent in the universal ID or its type", () => {
    const viaId = findMessageProfiles(message(`EXPROF-2^^${OID_A}&X^ISO`), [REGISTRY]);
    expect(viaId.outcome).toBe("none");
    const viaType = findMessageProfiles(message(`EXPROF-2^^${OID_A}^ISO&X`), [REGISTRY]);
    expect(viaType.outcome).toBe("none");
    expect(viaType.unmatched.map((u) => u.reason)).toEqual(["malformed"]);
  });

  it("never matches a fifth component", () => {
    const result = findMessageProfiles(message("EXPROF-1^EXAMPLEORG^^^EXTRA"), [INTAKE]);
    expect(result.outcome).toBe("none");
    expect(result.matches).toEqual([]);
    expect(result.unmatched.map((u) => [u.repetition, u.reason])).toEqual([[0, "malformed"]]);
  });

  it("never matches a subcomponent in a component past the fourth", () => {
    const result = findMessageProfiles(message("EXPROF-1^EXAMPLEORG^^^&X"), [INTAKE]);
    expect(result.unmatched.map((u) => u.reason)).toEqual(["malformed"]);
  });

  it("still matches when the extra subcomponents or components are empty", () => {
    expect(findMessageProfiles(message("EXPROF-1&^EXAMPLEORG"), [INTAKE]).outcome).toBe("one");
    expect(findMessageProfiles(message("EXPROF-1^EXAMPLEORG^^^"), [INTAKE]).outcome).toBe("one");
    expect(findMessageProfiles(message("EXPROF-1^EXAMPLEORG^^^&"), [INTAKE]).outcome).toBe("one");
  });

  it("keeps a malformed repetition apart from a well-formed one beside it", () => {
    const result = findMessageProfiles(message("EXPROF-1&X^EXAMPLEORG~EXPROF-1^EXAMPLEORG"), [
      INTAKE,
    ]);
    expect(result.outcome).toBe("one");
    expect(result.matches.map((m) => m.repetition)).toEqual([1]);
    expect(result.unmatched.map((u) => [u.repetition, u.reason])).toEqual([[0, "malformed"]]);
  });

  it("reads the message's own delimiters: the reviewer's three inputs and a fifth component", () => {
    const sub = findMessageProfiles(customMessage("EXPROF-1@X$EXAMPLEORG"), [INTAKE]);
    expect(sub.outcome).toBe("none");
    expect(sub.unmatched).toEqual([
      {
        repetition: 0,
        identifier: { entityIdentifier: "EXPROF-1", namespaceId: "EXAMPLEORG" },
        reason: "malformed",
      },
    ]);
    const namespace = findMessageProfiles(customMessage("EXPROF-1$EXAMPLEORG@OTHER"), [INTAKE]);
    expect(namespace.unmatched.map((u) => u.reason)).toEqual(["malformed"]);
    const only = findMessageProfiles(customMessage("@X"), [INTAKE]);
    expect(only.outcome).toBe("none");
    expect(only.unmatched).toEqual([{ repetition: 0, identifier: {}, reason: "malformed" }]);
    const fifth = findMessageProfiles(customMessage("EXPROF-1$EXAMPLEORG$$$EXTRA"), [INTAKE]);
    expect(fifth.outcome).toBe("none");
    expect(fifth.unmatched.map((u) => u.reason)).toEqual(["malformed"]);
  });

  it("matches under the message's own delimiters, where & is an ordinary character", () => {
    expect(findMessageProfiles(customMessage("EXPROF-1$EXAMPLEORG"), [INTAKE]).outcome).toBe("one");
    const amp = findMessageProfiles(customMessage("EXPROF-1&X$EXAMPLEORG"), [INTAKE]);
    expect(amp.outcome).toBe("none");
    expect(amp.unmatched).toEqual([
      {
        repetition: 0,
        identifier: { entityIdentifier: "EXPROF-1&X", namespaceId: "EXAMPLEORG" },
        reason: "unlisted",
      },
    ]);
  });
});

describe("findMessageProfiles: MSH-21 names nothing", () => {
  it("is undeclared when MSH-21 is empty", () => {
    const result = findMessageProfiles(message(""), [INTAKE]);
    expect(result).toEqual({ outcome: "undeclared", profiles: [], matches: [], unmatched: [] });
  });

  it("is undeclared for a message built with no MSH", () => {
    const empty = new Hl7Message({
      segments: [],
      encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
      version: "2.5.1",
      warnings: [],
    });
    expect(findMessageProfiles(empty, [INTAKE]).outcome).toBe("undeclared");
  });

  it("is undeclared when every repetition is empty", () => {
    expect(findMessageProfiles(message("~~"), [INTAKE]).outcome).toBe("undeclared");
  });
});

describe("findMessageProfiles: repeats and several matches", () => {
  it("is several when two repetitions name two listed profiles, in MSH-21 order", () => {
    const result = findMessageProfiles(
      message(`EXPROF-2^EXAMPLEORG^${OID_A}^ISO~EXPROF-1^EXAMPLEORG`),
      [INTAKE, REGISTRY],
    );
    expect(result.outcome).toBe("several");
    expect(result.profiles).toEqual([registry, intake]);
    expect(result.matches.map((m) => [m.repetition, m.entry.profile.name])).toEqual([
      [0, "example-registry"],
      [1, "example-intake"],
    ]);
  });

  it("numbers repetitions from 0 as MSH-21 carries them, empty ones included", () => {
    const result = findMessageProfiles(message("~EXPROF-9^EXAMPLEORG~EXPROF-1^EXAMPLEORG"), [
      INTAKE,
    ]);
    expect(result.outcome).toBe("one");
    expect(result.matches.map((m) => m.repetition)).toEqual([2]);
    expect(result.unmatched.map((u) => u.repetition)).toEqual([1]);
  });

  it("is several when one identifier matches two entries, in the list's order", () => {
    const again: MessageProfileEntry = { identifier: INTAKE.identifier, profile: local };
    const result = findMessageProfiles(message("EXPROF-1^EXAMPLEORG"), [again, REGISTRY, INTAKE]);
    expect(result.outcome).toBe("several");
    expect(result.profiles).toEqual([local, intake]);
    expect(result.matches.map((m) => m.repetition)).toEqual([0, 0]);
  });

  it("is one when two repetitions name the same entry, with both matches listed", () => {
    const result = findMessageProfiles(message("EXPROF-1^EXAMPLEORG~EXPROF-1^EXAMPLEORG"), [
      INTAKE,
    ]);
    expect(result.outcome).toBe("one");
    expect(result.profiles).toEqual([intake]);
    expect(result.matches.map((m) => m.repetition)).toEqual([0, 1]);
  });

  it("is one when two entries hold the same profile object", () => {
    const sameProfile: MessageProfileEntry = {
      identifier: { entityIdentifier: "EXPROF-1", universalId: OID_A },
      profile: intake,
    };
    const result = findMessageProfiles(message(`EXPROF-1^EXAMPLEORG~EXPROF-1^^${OID_A}`), [
      INTAKE,
      sameProfile,
    ]);
    expect(result.outcome).toBe("one");
    expect(result.profiles).toEqual([intake]);
    expect(result.matches).toHaveLength(2);
  });

  it("lists matched and unmatched repetitions side by side", () => {
    const result = findMessageProfiles(message("EXPROF-1^EXAMPLEORG~EXPROF-9^EXAMPLEORG"), [
      INTAKE,
    ]);
    expect(result.outcome).toBe("one");
    expect(result.unmatched.map((u) => u.identifier.entityIdentifier)).toEqual(["EXPROF-9"]);
  });
});

describe("findMessageProfiles: the contract", () => {
  it("carries any profile value the caller supplies", () => {
    const entries: readonly MessageProfileEntry<string>[] = [
      {
        identifier: { entityIdentifier: "EXPROF-1", namespaceId: "EXAMPLEORG" },
        profile: "intake",
      },
    ];
    const result = findMessageProfiles(message("EXPROF-1^EXAMPLEORG"), entries);
    const names: readonly string[] = result.profiles;
    expect(names).toEqual(["intake"]);
  });

  it("returns a frozen result and leaves the message as it was", () => {
    const msg = message(`EXPROF-1^EXAMPLEORG~EXPROF-9^EXAMPLEORG`);
    const before = msg.toString();
    const result = findMessageProfiles(msg, [INTAKE]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.profiles)).toBe(true);
    expect(Object.isFrozen(result.matches)).toBe(true);
    expect(Object.isFrozen(result.matches[0])).toBe(true);
    expect(Object.isFrozen(result.unmatched)).toBe(true);
    expect(Object.isFrozen(result.unmatched[0])).toBe(true);
    expect(msg.toString()).toBe(before);
  });

  it("feeds the profile it finds straight into validateAgainstProfile", () => {
    const msg = message("EXPROF-1^EXAMPLEORG");
    const result = findMessageProfiles(msg, [INTAKE]);
    expect(result.outcome).toBe("one");
    const [profile] = result.profiles;
    expect(profile).toBeDefined();
    if (profile !== undefined) {
      expect(conformance.validateAgainstProfile(msg, profile).profileName).toBe("example-intake");
    }
  });

  it("is also on the conformance namespace", () => {
    expect(typeof findMessageProfiles).toBe("function");
    expect(conformance.findMessageProfiles).toBe(findMessageProfiles);
  });
});
