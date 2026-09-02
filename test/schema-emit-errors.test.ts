/**
 * The unsupported-target path: a typed refusal that names what was asked for
 * and what is on offer, and hands back nothing at all.
 *
 * "Nothing at all" is the half that needs a test. A dispatcher that returned an
 * empty string, or a document with a `$schema` and no members, would satisfy a
 * caller's `typeof result === "string"` and put a useless artifact into a build
 * that then commits it. So every case below asserts the call THREW, not merely
 * that its result looked wrong.
 */

import { describe, expect, it } from "vitest";

import {
  SCHEMA_EMIT_TARGETS,
  SchemaTargetError,
  emitMessageSchema,
  isSchemaEmitTarget,
} from "../src/index.js";

describe("AC9: an unsupported target throws a typed error and returns nothing", () => {
  const unsupported = [
    // An unrecognised FORMAT.
    "openapi-3.1",
    "typebox",
    "yup",
    // An unrecognised DIALECT of a format that is supported at another one.
    "json-schema-draft-07",
    "json-schema-2019-09",
    // The bare format name, which names no dialect at all.
    "json-schema",
    // Shapes a caller stumbles into.
    "",
    "ZOD",
    " zod",
    "zod ",
  ];

  it("throws for every unsupported target", () => {
    for (const target of unsupported) {
      expect(() => emitMessageSchema(target), target).toThrow(SchemaTargetError);
    }
  });

  it("names the requested target and the supported set in the message", () => {
    for (const target of unsupported) {
      let caught: unknown;
      try {
        emitMessageSchema(target);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SchemaTargetError);
      const message = caught instanceof Error ? caught.message : "";
      expect(message, target).toContain(JSON.stringify(target));
      for (const supported of SCHEMA_EMIT_TARGETS) {
        expect(message, `${target} / ${supported}`).toContain(supported);
      }
    }
  });

  it("carries the request and the supported set as data, not only as prose", () => {
    let caught: unknown;
    try {
      emitMessageSchema("openapi-3.1");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SchemaTargetError);
    if (!(caught instanceof SchemaTargetError)) throw new Error("unreachable");
    expect(caught.name).toBe("SchemaTargetError");
    expect(caught.requestedTarget).toBe("openapi-3.1");
    expect(caught.supportedTargets).toEqual(["json-schema-2020-12", "zod"]);
    expect(caught).toBeInstanceOf(Error);
  });

  it("returns no artifact, partial or empty, on the refusing path", () => {
    for (const target of unsupported) {
      let returned: string | undefined;
      try {
        returned = emitMessageSchema(target);
      } catch {
        returned = undefined;
      }
      expect(returned, target).toBeUndefined();
    }
  });

  it("emits for every supported target and refuses everything else", () => {
    for (const target of SCHEMA_EMIT_TARGETS) {
      expect(isSchemaEmitTarget(target)).toBe(true);
      expect(emitMessageSchema(target).length).toBeGreaterThan(100);
    }
    for (const target of unsupported) expect(isSchemaEmitTarget(target), target).toBe(false);
  });
});
