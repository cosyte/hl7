/**
 * Setup for `pnpm test:eager`: the whole suite again, with `parseHL7` building every segment during
 * the parse unless a test asks otherwise. A lazy parse is the default, so `pnpm test` covers it;
 * this run is the proof that the eager build behaves the same under every existing test.
 *
 * Every caller in the source tree (the batch and stream readers included) imports `parseHL7`, or
 * `parseBytesRead` (its body, for `parseStream` reading bytes), from the parser module, so replacing
 * both there reaches them all. The option is added the way the
 * parser reads its second argument: nothing becomes `{ lazy: false }`, a bare profile becomes
 * `{ profile, lazy: false }`, and an options object gains `lazy: false` unless it names `lazy`.
 */

import { vi } from "vitest";

import type * as Parser from "../../src/parser/index.js";
import type { ParseOptions, Profile } from "../../src/parser/types.js";

/** The keys that make a second argument with a string `name` options rather than a profile. */
const OPTIONS_ONLY_KEYS = [
  "strict",
  "stripMllpFraming",
  "trimFields",
  "profile",
  "charset",
  "lazy",
];

function eager(arg: ParseOptions | Profile | undefined): ParseOptions {
  if (arg === undefined) return { lazy: false };
  const isProfile =
    typeof (arg as { name?: unknown }).name === "string" &&
    !OPTIONS_ONLY_KEYS.some((k) => Object.prototype.hasOwnProperty.call(arg, k));
  if (isProfile) return { profile: arg as Profile, lazy: false };
  if (Object.prototype.hasOwnProperty.call(arg, "lazy")) return arg;
  return { ...(arg as ParseOptions), lazy: false };
}

vi.mock("../../src/parser/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof Parser>();
  const parseHL7 = (raw: Parameters<typeof actual.parseHL7>[0], arg?: ParseOptions | Profile) =>
    actual.parseHL7(raw, eager(arg));
  // `parseStream` parses a message read from bytes through `parseBytesRead`, `parseHL7`'s body
  // given the bytes' latin1 text too, so it is made eager the same way.
  const parseBytesRead = (
    bytes: Parameters<typeof actual.parseBytesRead>[0],
    latin1: string,
    arg: ParseOptions | Profile | undefined,
  ) => actual.parseBytesRead(bytes, latin1, eager(arg));
  return { ...actual, parseHL7, parseBytesRead };
});
