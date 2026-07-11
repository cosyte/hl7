/**
 * Phase P — NTE narrative grouping (positional attach to parent).
 *
 * Covers the positional-attachment contract for `msg.notes()` +
 * `patient.notes` / `order.notes` / `observation.notes`:
 *   - NTE after PID → patient; after OBR / ORC → order; after OBX → that result.
 *   - Consecutive NTEs chain to the same parent; multi-repetition NTE-3 → one
 *     note line per non-empty repetition; document order preserved.
 *   - An NTE with no recognized preceding parent (after MSH, after an
 *     unsupported segment like PV1) → message-level `msg.notes()`, never
 *     mis-attached and never dropped.
 *   - Notes seen via `msg.observations()` match those under `order.observations`.
 *   - Fixture round-trip (structural equivalence) + boundary immutability.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseHL7 } from "../src/index.js";

import { assertStructuralRoundTrip } from "./_helpers/structural-equivalence.js";

const NTE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "nte");
const loadNte = (name: string): string => readFileSync(path.join(NTE_DIR, `${name}.hl7`), "utf8");

const MSH = "MSH|^~\\&|APP|FAC|||20250102||ORU^R01|1|T|2.5\r";
const PID = "PID|1||MRN-TEST-1^^^HOSP^MR||DOE^JOHN\r";

describe("helpers/notes: positional NTE grouping (Phase P)", () => {
  describe("result-level (NTE after OBX)", () => {
    const raw =
      MSH +
      PID +
      "OBR|1|PLC1|FLR1|GLU^Glucose^LN\r" +
      "OBX|1|NM|GLU^Glucose^LN||120|mg/dL\r" +
      "NTE|1||first result note\r" +
      "NTE|2||second result note\r" +
      "OBX|2|NM|K^Potassium^LN||4.2|mmol/L";

    it("attaches consecutive NTEs to the immediately-preceding OBX, in order", () => {
      const obs = parseHL7(raw).observations();
      expect(obs[0]?.notes).toEqual(["first result note", "second result note"]);
    });

    it("omits notes on an OBX with no following NTE", () => {
      const obs = parseHL7(raw).observations();
      expect(obs[1]?.notes).toBeUndefined();
    });

    it("surfaces the same result notes under order.observations", () => {
      const order = parseHL7(raw).orders()[0];
      expect(order?.observations[0]?.notes).toEqual(["first result note", "second result note"]);
      expect(order?.observations[1]?.notes).toBeUndefined();
    });

    it("does NOT bubble result-level notes up to the order", () => {
      const order = parseHL7(raw).orders()[0];
      expect(order?.notes).toBeUndefined();
    });
  });

  describe("order-level (NTE after OBR and after ORC)", () => {
    const raw =
      MSH +
      PID +
      "ORC|NW|ORD1|FLR1\r" +
      "NTE|1||order note from ORC\r" +
      "OBR|1|ORD1|FLR1|LIPID^Lipid Panel^LN\r" +
      "NTE|1||order note from OBR\r" +
      "OBX|1|NM|CHOL^Cholesterol^LN||190|mg/dL";

    it("attaches ORC-notes then OBR-notes to the order, in document order", () => {
      const order = parseHL7(raw).orders()[0];
      expect(order?.notes).toEqual(["order note from ORC", "order note from OBR"]);
    });

    it("does not leak order notes onto the order's observations", () => {
      const order = parseHL7(raw).orders()[0];
      expect(order?.observations[0]?.notes).toBeUndefined();
    });

    it("collects notes from SEVERAL ORCs before one OBR onto the order (never dropped)", () => {
      const multi =
        MSH +
        PID +
        "ORC|NW|ORD1\r" +
        "NTE|1||note from first ORC\r" +
        "ORC|NW|ORD2\r" +
        "NTE|1||note from second ORC\r" +
        "OBR|1|ORD2|FLR2|X^Y^LN\r" +
        "NTE|1||note from OBR\r" +
        "OBX|1|NM|X^Y^LN||1|u";
      const order = parseHL7(multi).orders()[0];
      // orders() keeps only the last ORC's orderControl, but NO note is dropped.
      expect(order?.notes).toEqual([
        "note from first ORC",
        "note from second ORC",
        "note from OBR",
      ]);
      expect(parseHL7(multi).notes()).toEqual([]);
    });

    it("routes a trailing/dangling ORC's note (no following OBR) to message level, never dropped", () => {
      const trailing =
        MSH +
        PID +
        "OBR|1|P|F|X^Y^LN\r" +
        "OBX|1|NM|X^Y^LN||1|u\r" +
        "ORC|NW|ORD9\r" +
        "NTE|1||note on a dangling ORC";
      const msg = parseHL7(trailing);
      expect(msg.orders()).toHaveLength(1);
      expect(msg.orders()[0]?.notes).toBeUndefined();
      expect(msg.notes()).toEqual(["note on a dangling ORC"]);
    });
  });

  describe("patient-level (NTE after PID)", () => {
    const raw = MSH + PID + "NTE|1||patient-level note\r" + "PV1|1|I";

    it("attaches an NTE after PID to the patient", () => {
      expect(parseHL7(raw).patient?.notes).toEqual(["patient-level note"]);
    });

    it("routes a LATER PID's note to message level (patient view is the first PID), never dropped", () => {
      const multiPid =
        MSH +
        "PID|1||MRN-1^^^H^MR||DOE^JOHN\r" +
        "NTE|1||note for patient one\r" +
        "PID|2||MRN-2^^^H^MR||ROE^JANE\r" +
        "NTE|1||note for patient two";
      const msg = parseHL7(multiPid);
      expect(msg.patient?.notes).toEqual(["note for patient one"]); // first PID only
      expect(msg.notes()).toEqual(["note for patient two"]); // never dropped
    });
  });

  describe("fail-safe: no recognized preceding parent → message-level", () => {
    it("an NTE immediately after MSH is message-level (never dropped)", () => {
      const raw = MSH + "NTE|1||orphan note before any parent\r" + PID;
      const msg = parseHL7(raw);
      expect(msg.notes()).toEqual(["orphan note before any parent"]);
      expect(msg.patient?.notes).toBeUndefined();
    });

    it("an NTE after an unsupported segment (PV1) is NOT mis-attached to the earlier PID", () => {
      const raw = MSH + PID + "PV1|1|I\r" + "NTE|1||note after PV1";
      const msg = parseHL7(raw);
      // PV1 is not a recognized note parent → the note is message-level, not
      // guessed onto the patient.
      expect(msg.notes()).toEqual(["note after PV1"]);
      expect(msg.patient?.notes).toBeUndefined();
    });

    it("returns [] when the message has no orphan notes", () => {
      const raw = MSH + PID + "OBR|1|P|F|X^Y^LN\r" + "OBX|1|NM|X^Y^LN||1|u\r" + "NTE|1||n";
      expect(parseHL7(raw).notes()).toEqual([]);
    });

    it("returns [] when the message has no NTE segments at all", () => {
      expect(parseHL7(MSH + PID).notes()).toEqual([]);
    });
  });

  describe("NTE-3 repetitions + empties", () => {
    it("treats each non-empty NTE-3 repetition as one note line", () => {
      const raw = MSH + PID + "NTE|1||line one~line two~line three";
      expect(parseHL7(raw).patient?.notes).toEqual(["line one", "line two", "line three"]);
    });

    it("skips an NTE that carries no NTE-3 text (contributes nothing)", () => {
      const raw = MSH + PID + "NTE|1\r" + "OBR|1|P|F|X^Y^LN\r" + "OBX|1|NM|X^Y^LN||1|u";
      const msg = parseHL7(raw);
      expect(msg.patient?.notes).toBeUndefined();
      expect(msg.notes()).toEqual([]);
    });

    it("decodes note text once, like every other free-text read", () => {
      const raw = MSH + PID + "NTE|1||a\\T\\b and \\F\\ pipe";
      expect(parseHL7(raw).patient?.notes).toEqual(["a&b and | pipe"]);
    });

    it("does not double-decode a note whose decoded bytes look like an escape (HL7-VALUE-REDECODE)", () => {
      // Wire `a\E\F\E\b` decodes ONCE (tokenizer) to the literal `a\F\b`; the old
      // reader re-unescaped that `\F\` into `|`, corrupting the note to `a|b`.
      const raw = MSH + PID + "NTE|1||a\\E\\F\\E\\b";
      expect(parseHL7(raw).patient?.notes).toEqual(["a\\F\\b"]);
    });

    it("preserves the FULL note when a non-conformant raw caret tokenizes NTE-3 into components", () => {
      // A quirky sender that leaves a literal ^ in the FT narrative unescaped:
      // reading only the first component would silently truncate the note.
      const raw = MSH + PID + "NTE|1||Impression: mass 2^3 cm; see^attached";
      expect(parseHL7(raw).patient?.notes).toEqual(["Impression: mass 2^3 cm; see^attached"]);
    });

    it("preserves a raw subcomponent ampersand in the note text", () => {
      const raw = MSH + PID + "NTE|1||fasting&hydrated";
      expect(parseHL7(raw).patient?.notes).toEqual(["fasting&hydrated"]);
    });

    it("round-trips the conformant escaped-caret form to the same text", () => {
      const raw = MSH + PID + "NTE|1||Impression: mass 2\\S\\3 cm";
      expect(parseHL7(raw).patient?.notes).toEqual(["Impression: mass 2^3 cm"]);
    });
  });

  describe("fixtures", () => {
    it("obx-result-notes: patient + per-result grouping", () => {
      const msg = parseHL7(loadNte("obx-result-notes"));
      expect(msg.patient?.notes).toEqual(["Patient fasted 12 hours prior to draw."]);
      const obs = msg.observations();
      expect(obs[0]?.notes).toEqual([
        "Result verified against prior specimen.",
        "Hemolysis noted; may affect potassium interpretation.",
      ]);
      expect(obs[1]?.notes).toBeUndefined();
      expect(msg.notes()).toEqual([]);
    });

    it("obr-order-notes: ORC+OBR order grouping", () => {
      const msg = parseHL7(loadNte("obr-order-notes"));
      const order = msg.orders()[0];
      expect(order?.notes).toEqual([
        "Order entered by covering physician.",
        "Fasting required; confirm with patient.",
        "Line 2 of the order note.",
      ]);
      expect(order?.observations[0]?.notes).toBeUndefined();
    });

    it("round-trips both fixtures (structural equivalence)", () => {
      assertStructuralRoundTrip(loadNte("obx-result-notes"));
      assertStructuralRoundTrip(loadNte("obr-order-notes"));
    });
  });

  describe("immutability at the boundary", () => {
    it("freezes every notes array and msg.notes()", () => {
      const raw =
        MSH +
        PID +
        "NTE|1||p\r" +
        "OBR|1|P|F|X^Y^LN\r" +
        "NTE|1||o\r" +
        "OBX|1|NM|X^Y^LN||1|u\r" +
        "NTE|1||r\r" +
        "MSA|AA|1\r" + // not a parent — but keep a trailing orphan:
        "NTE|1||orphan";
      const msg = parseHL7(raw);
      expect(Object.isFrozen(msg.patient?.notes)).toBe(true);
      expect(Object.isFrozen(msg.orders()[0]?.notes)).toBe(true);
      expect(Object.isFrozen(msg.orders()[0]?.observations[0]?.notes)).toBe(true);
      expect(Object.isFrozen(msg.notes())).toBe(true);
      expect(msg.notes()).toEqual(["orphan"]);
    });
  });
});
