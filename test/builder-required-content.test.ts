/**
 * Refusal suite for the typed builders.
 *
 * Acceptance exercised here:
 *   - **content the pair requires, absent or empty, is a typed error naming the
 *     message type and the missing content**, for EVERY pair in the published
 *     support set: driven off `SUPPORTED_BUILDER_MESSAGES` rather than a
 *     hand-listed set, so a pair added later cannot escape the rule.
 *   - **a segment no init member supplies is never missing**: the structural
 *     fail-safes (EVN, PV1, OBR, MSA) are always emitted.
 *   - **an init that is not an object is refused before it is dereferenced**,
 *     naming the builder.
 *
 * All values are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  SUPPORTED_BUILDER_MESSAGES,
  buildAck,
  buildAdt,
  buildDft,
  buildMdm,
  buildOrm,
  buildOru,
  buildSiu,
  buildVxu,
  parseHL7,
  type SupportedBuilderMessage,
} from "../src/index.js";

import {
  DFT_INIT,
  ENVELOPE,
  MDM_CONTENT_EVENTS,
  MDM_INIT,
  MERGE_EVENTS,
  ORM_INIT,
  PATIENT,
  SIU_INIT,
  VXU_INIT,
  adtInit,
  buildSupportedPair,
} from "./_helpers/supported-pairs.js";

/** One way to deprive a pair of content its registry entry requires. */
interface Omission {
  /** The init member withheld. */
  readonly member: string;
  /** The segment that member supplies. */
  readonly segment: string;
  /** How the content was withheld: absent, or supplied as an empty collection. */
  readonly how: "absent" | "empty";
  /** Build the deficient message. Must throw. */
  readonly run: () => unknown;
}

/** Strip one member from an object without tripping the exact-optional rules. */
function without<T extends object>(source: T, member: keyof T): T {
  const copy = { ...source };
  delete copy[member];
  return copy;
}

/** Every registry-required omission for one published pair. */
function omissionsFor(m: SupportedBuilderMessage): readonly Omission[] {
  const ev = m.triggerEvent;
  switch (m.messageCode) {
    case "ADT": {
      const init = adtInit(ev);
      const out: Omission[] = [
        {
          member: "patient",
          segment: "PID",
          how: "absent",
          run: () => buildAdt(ev, without(init, "patient")),
        },
      ];
      if (MERGE_EVENTS.includes(ev)) {
        out.push(
          {
            member: "priorIdentity",
            segment: "MRG",
            how: "absent",
            run: () => buildAdt(ev, without(init, "priorIdentity")),
          },
          {
            member: "priorIdentity",
            segment: "MRG",
            how: "empty",
            run: () => buildAdt(ev, { ...init, priorIdentity: { identifiers: [] } }),
          },
        );
      }
      return out;
    }
    case "DFT":
      return [
        {
          member: "patient",
          segment: "PID",
          how: "absent",
          run: () => buildDft(ev, without(DFT_INIT, "patient")),
        },
        {
          member: "charges",
          segment: "FT1",
          how: "absent",
          run: () => buildDft(ev, without(DFT_INIT, "charges")),
        },
        {
          member: "charges",
          segment: "FT1",
          how: "empty",
          run: () => buildDft(ev, { ...DFT_INIT, charges: [] }),
        },
      ];
    case "MDM": {
      const out: Omission[] = [
        {
          member: "patient",
          segment: "PID",
          how: "absent",
          run: () => buildMdm(ev, without(MDM_INIT, "patient")),
        },
        {
          member: "document",
          segment: "TXA",
          how: "absent",
          run: () => buildMdm(ev, without(MDM_INIT, "document")),
        },
      ];
      if (MDM_CONTENT_EVENTS.includes(ev)) {
        out.push(
          {
            member: "document.body",
            segment: "OBX",
            how: "absent",
            run: () => buildMdm(ev, { ...MDM_INIT, document: without(MDM_INIT.document, "body") }),
          },
          {
            member: "document.body",
            segment: "OBX",
            how: "empty",
            run: () => buildMdm(ev, { ...MDM_INIT, document: { ...MDM_INIT.document, body: [] } }),
          },
        );
      }
      return out;
    }
    case "ORM":
      return [
        {
          member: "patient",
          segment: "PID",
          how: "absent",
          run: () => buildOrm(without(ORM_INIT, "patient")),
        },
        {
          member: "orders",
          segment: "ORC",
          how: "absent",
          run: () => buildOrm(without(ORM_INIT, "orders")),
        },
        {
          member: "orders",
          segment: "ORC",
          how: "empty",
          run: () => buildOrm({ ...ORM_INIT, orders: [] }),
        },
      ];
    case "ORU":
      return [
        {
          member: "patient",
          segment: "PID",
          how: "absent",
          run: () =>
            buildOru(
              without(
                {
                  ...ENVELOPE,
                  patient: PATIENT,
                  observations: [{ setId: "1", valueType: "ST", value: "x" }],
                },
                "patient",
              ),
            ),
        },
        {
          member: "observations",
          segment: "OBX",
          how: "empty",
          run: () => buildOru({ ...ENVELOPE, patient: PATIENT, observations: [] }),
        },
      ];
    case "SIU":
      return [
        {
          member: "appointment",
          segment: "SCH",
          how: "absent",
          run: () => buildSiu(ev, without(SIU_INIT, "appointment")),
        },
        {
          member: "resourceGroups",
          segment: "RGS",
          how: "absent",
          run: () => buildSiu(ev, without(SIU_INIT, "resourceGroups")),
        },
        {
          member: "resourceGroups",
          segment: "RGS",
          how: "empty",
          run: () => buildSiu(ev, { ...SIU_INIT, resourceGroups: [] }),
        },
      ];
    case "VXU":
      return [
        {
          member: "patient",
          segment: "PID",
          how: "absent",
          run: () => buildVxu(without(VXU_INIT, "patient")),
        },
        {
          member: "immunizations",
          segment: "RXA",
          how: "absent",
          run: () => buildVxu(without(VXU_INIT, "immunizations")),
        },
        {
          member: "immunizations",
          segment: "RXA",
          how: "empty",
          run: () => buildVxu({ ...VXU_INIT, immunizations: [] }),
        },
      ];
    case "ACK":
      // Every segment ACK's structure requires is synthesised from the inbound
      // message, so no init member can withhold one. Its own required content
      // is the disposition code, which is refused the same way.
      return [];
    default:
      throw new Error(`omissionsFor: unhandled message code ${m.messageCode}`);
  }
}

function label(m: SupportedBuilderMessage): string {
  return m.triggerEvent === "" ? m.messageCode : `${m.messageCode}^${m.triggerEvent}`;
}

describe("required content is refused, never emitted incomplete", () => {
  it("every published pair has its refusals exercised", () => {
    // Guards the table above: a pair added to the support set with no entry
    // here throws out of `omissionsFor` rather than passing silently.
    for (const m of SUPPORTED_BUILDER_MESSAGES) expect(() => omissionsFor(m)).not.toThrow();
  });

  it.each(
    SUPPORTED_BUILDER_MESSAGES.flatMap((m) =>
      omissionsFor(m).map((o) => [`${label(m)} without ${o.member} (${o.how})`, m, o] as const),
    ),
  )("%s throws, naming the message type and the missing content", (_label, m, omission) => {
    let thrown: unknown;
    try {
      omission.run();
    } catch (error) {
      thrown = error;
    }
    expect(thrown, "expected a throw, got a message").toBeInstanceOf(TypeError);
    const message = String((thrown as Error).message);
    expect(message).toContain(m.messageCode);
    if (m.triggerEvent !== "") expect(message).toContain(m.triggerEvent);
    expect(message).toContain(omission.segment);
    expect(message).toContain(omission.member.split(".")[0] ?? omission.member);
  });

  it("refuses an acknowledgment with no disposition code", () => {
    const inbound = parseHL7(buildAdt("A01", adtInit("A01")).toString());
    // @ts-expect-error: `code` is required
    expect(() => buildAck(inbound, {})).toThrow(TypeError);
    // @ts-expect-error: `code` must be a known Table 0008 code
    expect(() => buildAck(inbound, { code: "ZZ" })).toThrow(TypeError);
  });

  it("a segment no init member supplies is emitted regardless", () => {
    // The structural fail-safes: nothing a caller does can make these absent.
    for (const m of SUPPORTED_BUILDER_MESSAGES) {
      const present = new Set(
        parseHL7(buildSupportedPair(m).toString())
          .allSegments()
          .map((s) => s.type),
      );
      for (const seg of m.requiredSegments) {
        expect(present.has(seg), `${label(m)} omitted ${seg}`).toBe(true);
      }
    }
  });

  it("an empty prior identity that carries only a name is refused for a merge", () => {
    expect(() =>
      buildAdt("A40", {
        ...ENVELOPE,
        patient: PATIENT,
        priorIdentity: { name: { familyName: "X" } },
      }),
    ).toThrow(/MRG/);
  });
});

describe("an init that is not an object is refused before it is read", () => {
  const NEW_BUILDERS: readonly (readonly [string, (init: unknown) => unknown])[] = [
    ["buildVxu", (init) => buildVxu(init as never)],
    ["buildOrm", (init) => buildOrm(init as never)],
    ["buildDft", (init) => buildDft("P03", init as never)],
    ["buildMdm", (init) => buildMdm("T02", init as never)],
    ["buildSiu", (init) => buildSiu("S12", init as never)],
  ];

  it.each(NEW_BUILDERS)("%s refuses null, undefined and a non-object", (name, call) => {
    for (const bad of [null, undefined, "PID|1", 42, true, Symbol("x"), [] as unknown[]]) {
      let thrown: unknown;
      try {
        call(bad);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `${name} accepted ${String(bad?.toString?.() ?? bad)}`).toBeInstanceOf(
        TypeError,
      );
      expect(String((thrown as Error).message)).toContain(name);
    }
  });

  it.each([
    ["buildDft", (event: unknown) => buildDft(event as string, DFT_INIT)],
    ["buildMdm", (event: unknown) => buildMdm(event as string, MDM_INIT)],
    ["buildSiu", (event: unknown) => buildSiu(event as string, SIU_INIT)],
  ])("%s refuses an empty or non-string trigger event", (name, call) => {
    for (const bad of ["", "   ", null, undefined, 7]) {
      let thrown: unknown;
      try {
        call(bad);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `${name} accepted ${JSON.stringify(bad)}`).toBeInstanceOf(TypeError);
      expect(String((thrown as Error).message)).toContain(name);
    }
  });
});
