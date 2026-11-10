/**
 * A message built by hand whose repetitions, components or subcomponents array
 * has a hole or a `null` in it. The parser never leaves either, but a
 * JavaScript caller can, and the serializer and the readers stopped on one with
 * an untyped `TypeError`. A hole or a `null` now reads as an empty value, the
 * same as an absent one, everywhere: the serializer, `get`, `toJSON`, every
 * `Field` read, every clinical helper, both validators, `buildAck`, the
 * composite parsers and the composite encoders.
 *
 * The sweep puts a hole, then a `null`, at every position of every field of
 * the canonical fixtures and asserts each reader returns exactly what it
 * returns for the explicit empty value at that position. All values are
 * synthetic.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENCODING_CHARACTERS,
  Hl7Message,
  buildAck,
  buildAdt,
  defineConformanceProfile,
  encodeCompositeReps,
  interpretAck,
  parseCwe,
  parseCx,
  parseHL7,
  parsePl,
  parseXcn,
  parseXpn,
  resolvePath,
  validateAgainstProfile,
  validateMessageStructure,
  type CX,
  type RawComponent,
  type RawField,
  type RawRepetition,
  type RawSegment,
  type XPN,
} from "../src/index.js";

import { adtInit } from "./_helpers/supported-pairs.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

/** What goes in the gap: nothing at all, a `null`, or the explicit empty value. */
type Gap = "hole" | "null" | "empty";

/** `items` with the entry at `index` replaced by a hole, a `null` or `empty`. */
function withGap<T>(items: readonly T[], index: number, gap: Gap, empty: T): T[] {
  const out: T[] = [];
  out.length = items.length;
  items.forEach((item, i) => {
    if (i !== index) out[i] = item;
  });
  if (gap === "null") out[index] = null as T;
  if (gap === "empty") out[index] = empty;
  return out;
}

const EMPTY_REPETITION: RawRepetition = { components: [] };
const EMPTY_COMPONENT: RawComponent = { subcomponents: [] };

/** Where in a field the gap goes: a repetition, a component or a subcomponent. */
type At = readonly [number] | readonly [number, number] | readonly [number, number, number];

/** `field` with a gap at `at`. */
function gapField(field: RawField, at: At, gap: Gap): RawField {
  const [r, c, s] = at;
  const reps = field.repetitions;
  if (c === undefined) {
    return { ...field, repetitions: withGap(reps, r, gap, EMPTY_REPETITION) };
  }
  const rep = reps[r] as RawRepetition;
  const comp = rep.components[c] as RawComponent;
  const newComp: RawComponent =
    s === undefined ? comp : { subcomponents: withGap(comp.subcomponents, s, gap, "") };
  const components =
    s === undefined
      ? withGap(rep.components, c, gap, EMPTY_COMPONENT)
      : rep.components.map((x, i) => (i === c ? newComp : x));
  return { ...field, repetitions: reps.map((x, i) => (i === r ? { components } : x)) };
}

/** A copy of `msg` built by hand, with a gap at `at` in field `f` of segment `s`. */
function gapped(msg: Hl7Message, s: number, f: number, at: At, gap: Gap): Hl7Message {
  const segments = msg.rawSegments.map((seg, i): RawSegment => {
    if (i !== s) return seg;
    return { ...seg, fields: seg.fields.map((x, j) => (j === f ? gapField(x, at, gap) : x)) };
  });
  return new Hl7Message({
    segments,
    encodingCharacters: msg.encodingCharacters,
    version: msg.version,
    warnings: [],
  });
}

/** Every position in a field a gap can take, outermost first. */
function positions(field: RawField): At[] {
  const out: At[] = [];
  field.repetitions.forEach((rep, r) => {
    out.push([r]);
    rep.components.forEach((comp, c) => {
      out.push([r, c]);
      comp.subcomponents.forEach((_, s) => out.push([r, c, s]));
    });
  });
  return out;
}

const PROFILE = defineConformanceProfile(
  JSON.parse(readFileSync(path.join(FIXTURES, "conformance", "profile-adt-min.json"), "utf8")),
);

/** Run `read`, turning a throw into a value the comparison reports. */
function attempt(read: () => unknown): unknown {
  try {
    return read();
  } catch (error) {
    return `threw ${(error as Error).name}: ${(error as Error).message}`;
  }
}

/** Everything a consumer can read from `msg` that touches field `f` of segment `s`. */
function readAll(msg: Hl7Message, s: number, f: number): Record<string, unknown> {
  const seg = msg.allSegments()[s];
  const n = seg?.type === "MSH" ? f + 1 : f;
  const field = seg?.field(n);
  const path = `${seg?.type ?? ""}.${String(n)}`;
  return {
    toString: attempt(() => msg.toString()),
    toJSON: attempt(() => msg.toJSON().segments),
    prettyPrint: attempt(() => msg.prettyPrint()),
    get: attempt(() =>
      [path, `${path}.1`, `${path}.2`, `${path}.1.1`, `${path}.1.2`, `${path}[1]`].map((p) =>
        msg.get(p),
      ),
    ),
    resolvePath: attempt(() => resolvePath(`${path}.4.2`, msg.rawSegments, msg.encodingCharacters)),
    value: attempt(() => field?.value),
    text: attempt(() => field?.text),
    composites: attempt(() => [
      field?.asXpn(),
      field?.asXad(),
      field?.asCx(),
      field?.asCwe(),
      field?.asCe(),
      field?.asXtn(),
      field?.asPl(),
      field?.asTs(),
      field?.asNm(),
      field?.asSn(),
      field?.asHd(),
      field?.asXcn(),
    ]),
    meta: attempt(() => msg.meta),
    structure: attempt(() => msg.structure),
    patient: attempt(() => msg.patient),
    visit: attempt(() => msg.visit),
    observations: attempt(() => msg.observations()),
    orders: attempt(() => msg.orders()),
    notes: attempt(() => msg.notes()),
    identityEvents: attempt(() => msg.identityEvents()),
    medications: attempt(() => msg.medications()),
    immunizations: attempt(() => msg.immunizations()),
    nextOfKin: attempt(() => msg.nextOfKin()),
    allergies: attempt(() => msg.allergies()),
    diagnoses: attempt(() => msg.diagnoses()),
    insurance: attempt(() => msg.insurance()),
    appointments: attempt(() => msg.appointments()),
    documents: attempt(() => msg.documents()),
    charges: attempt(() => msg.charges()),
    conformance: attempt(() => validateAgainstProfile(msg, PROFILE)),
    messageStructure: attempt(() => validateMessageStructure(msg)),
    interpretAck: attempt(() => interpretAck(msg)),
    // The ACK's own MSH carries a fresh control id and timestamp: compare the rest.
    ack: attempt(() =>
      buildAck(msg, { code: "AE", error: { conditionCode: "207" } })
        .toString()
        .split("\r")
        .slice(1),
    ),
  };
}

const canonical = readdirSync(path.join(FIXTURES, "canonical")).filter((f) => f.endsWith(".hl7"));

describe("a hole or a null anywhere in a field reads as the empty value", () => {
  it.each(canonical)("in %s, through every reader", (file) => {
    const parsed = parseHL7(readFileSync(path.join(FIXTURES, "canonical", file), "utf8"));
    parsed.rawSegments.forEach((seg, s) => {
      seg.fields.forEach((field, f) => {
        if (f === 0) return;
        for (const at of positions(field)) {
          const expected = readAll(gapped(parsed, s, f, at, "empty"), s, f);
          for (const gap of ["hole", "null"] as const) {
            const where = `${seg.name} fields[${String(f)}] at [${at.join(",")}], ${gap}`;
            expect(readAll(gapped(parsed, s, f, at, gap), s, f), where).toEqual(expected);
          }
        }
      });
    });
  });
});

describe("the message from the report", () => {
  const MSH_RAW = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5")
    .rawSegments[0] as RawSegment;
  const absent: RawField = { repetitions: [], isNull: false };

  const report = (gap: "hole" | "null"): Hl7Message => {
    const components = withGap(
      [EMPTY_COMPONENT, { subcomponents: ["c"] }],
      0,
      gap,
      EMPTY_COMPONENT,
    );
    return new Hl7Message({
      segments: [
        MSH_RAW,
        { name: "PID", fields: [absent, { repetitions: [{ components }], isNull: false }] },
      ],
      encodingCharacters: DEFAULT_ENCODING_CHARACTERS,
      version: "2.5",
      warnings: [],
    });
  };

  it.each(["hole", "null"] as const)("serializes a %s in the components as empty", (gap) => {
    expect(report(gap).toString().split("\r")[1]).toBe("PID|^c");
  });

  it.each(["hole", "null"] as const)("reads a %s in the components as empty", (gap) => {
    const msg = report(gap);
    expect(msg.get("PID.1.1")).toBeUndefined();
    expect(msg.get("PID.1.2")).toBe("c");
    expect(msg.segments("PID")[0]?.field(1).value).toBe("");
    expect(msg.toJSON().segments[1]?.fields[1]?.repetitions[0]?.components).toEqual([
      { subcomponents: [] },
      { subcomponents: ["c"] },
    ]);
  });
});

describe("a hole or a null in a subcomponents array", () => {
  const msg = (gap: "hole" | "null"): Hl7Message => {
    const parsed = parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5\rPID|1||MRN1&X&Y");
    return gapped(parsed, 1, 3, [0, 0, 1], gap);
  };

  it.each(["hole", "null"] as const)("serializes a %s as an empty subcomponent", (gap) => {
    expect(msg(gap).toString().split("\r")[1]).toBe("PID|1||MRN1&&Y");
  });

  it.each(["hole", "null"] as const)("get reads a %s as an empty string", (gap) => {
    expect(msg(gap).get("PID.3.1.2")).toBe("");
    expect(msg(gap).get("PID.3.1.3")).toBe("Y");
    expect(msg(gap).get("PID.3.1.4")).toBeUndefined();
  });
});

describe("the composite parsers, handed a repetition built by hand", () => {
  const rep = (components: readonly (RawComponent | null)[]): RawRepetition => ({
    components: components as readonly RawComponent[],
  });

  it("read a null component as absent", () => {
    expect(parseXpn(rep([null, { subcomponents: ["Jane"] }]), DEFAULT_ENCODING_CHARACTERS)).toEqual(
      { givenName: "Jane" },
    );
    expect(parseCwe(rep([{ subcomponents: ["C1"] }, null]), DEFAULT_ENCODING_CHARACTERS)).toEqual({
      identifier: "C1",
    });
  });

  it("read a null subcomponent as absent", () => {
    const comp = { subcomponents: [null] } as unknown as RawComponent;
    expect(parseXpn(rep([comp, { subcomponents: ["Jane"] }]), DEFAULT_ENCODING_CHARACTERS)).toEqual(
      { givenName: "Jane" },
    );
  });

  it("read a null assigning authority or facility as absent", () => {
    const id = { subcomponents: ["ID1"] };
    expect(parseCx(rep([id, null, null, null]), DEFAULT_ENCODING_CHARACTERS)).toEqual({
      idNumber: "ID1",
    });
    expect(
      parsePl(rep([{ subcomponents: ["ICU"] }, null, null, null]), DEFAULT_ENCODING_CHARACTERS),
    ).toEqual({ pointOfCare: "ICU" });
    const xcn = [id, ...Array<null>(8).fill(null)];
    expect(parseXcn(rep(xcn), DEFAULT_ENCODING_CHARACTERS)).toEqual({ idNumber: "ID1" });
  });

  it("read an assigning authority of null subcomponents as absent", () => {
    const nulls = { subcomponents: [null, null] } as unknown as RawComponent;
    expect(
      parseCx(rep([{ subcomponents: ["ID1"] }, null, null, nulls]), DEFAULT_ENCODING_CHARACTERS),
    ).toEqual({ idNumber: "ID1" });
  });
});

describe("the composite encoders, handed an array with a hole or a null", () => {
  const id: CX = { idNumber: "MRN1" };

  it.each(["hole", "null"] as const)("encodeCompositeReps skips a %s", (gap) => {
    const values = withGap([id, id], 0, gap, id);
    expect(encodeCompositeReps("CX", values)).toEqual({
      repetitions: [{ components: [{ subcomponents: ["MRN1"] }] }],
      isNull: false,
    });
  });

  it.each(["hole", "null"] as const)("buildAdt skips a %s in a repeating member", (gap) => {
    const init = adtInit("A01");
    const name: XPN = { familyName: "Test" };
    const msg = buildAdt("A01", {
      ...init,
      patient: {
        ...init.patient,
        identifiers: withGap([id, id], 0, gap, id),
        name: withGap([name, name], 1, gap, name),
      },
    });
    expect(msg.get("PID.3")).toBe("MRN1");
    expect(msg.get("PID.3[1]")).toBeUndefined();
    expect(msg.get("PID.5")).toBe("Test");
    expect(msg.get("PID.5[1]")).toBeUndefined();
  });
});

describe("mutating a field that carries a null", () => {
  const msg = (): Hl7Message =>
    gapped(
      parseHL7("MSH|^~\\&|A|B|C|D|20260101||ADT^A01|MSG1|P|2.5\rPID|1||MRN1~MRN2|||Doe^Jane"),
      1,
      3,
      [0],
      "null",
    );

  it("setField writes beside it and serializes it as empty", () => {
    expect(msg().setField("PID.3[1].4", "HOSP").toString().split("\r")[1]).toBe(
      "PID|1||~MRN2^^^HOSP|||Doe^Jane",
    );
  });

  it("setComposite writes beside it and serializes it as empty", () => {
    expect(
      msg().setComposite("PID.3[1]", "CX", { idNumber: "MRN3" }).toString().split("\r")[1],
    ).toBe("PID|1||~MRN3|||Doe^Jane");
  });
});
