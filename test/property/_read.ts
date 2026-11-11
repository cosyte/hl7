/**
 * What the streaming property files (`read.property.test.ts`, `read-segments.property.test.ts`)
 * share: their depth and budget, and the readers that cut an input at every position. The two
 * readers' properties sit in two files so a deep run takes them in parallel.
 */

import { PROPERTY_ENV, resolvePropertyRun } from "@cosyte/test-utils";
import { expect } from "vitest";

import { Hl7ParseError } from "../../src/index.js";
import { propertyTimeout } from "../_helpers/property.js";

/**
 * Each case reads its input once for every position it can be cut at, so a pull request runs fewer
 * cases than elsewhere and inputs are kept short.
 */
// property-depth: 25 cases on a pull request, since each case reads its input once per cut point.
export const RUN_CONFIG = { numRuns: 25 } as const;

/**
 * The environment these properties run in: `COSYTE_PROPERTY_RUNS` sets their depth as it does
 * everywhere, but a deeper run takes them at a quarter of it, never below their own 25 (2,500
 * cases at the nightly 10,000, a hundred times a pull request's). A case here reads its input
 * once for every position it can be cut at, as text and as bytes: up to 1,200 streamed reads of a
 * 600-character message. At the full depth these four would take longer than every other property
 * together and could run past the nightly job's one-hour limit, which ends the run with no seed
 * printed. A printed seed and path replay as they do everywhere.
 */
// property-depth: a quarter of the shared depth, for the reason above.
export const READ_ENV: Readonly<Record<string, string | undefined>> = quarterDepth(process.env);

/**
 * `env` with `COSYTE_PROPERTY_RUNS` set to a quarter of the depth it resolves to, never below 25.
 *
 * @param env The environment.
 * @returns The environment these properties run in.
 */
export function quarterDepth(
  env: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  const depth = resolvePropertyRun(RUN_CONFIG, env).numRuns;
  if (depth <= RUN_CONFIG.numRuns) return env;
  const quarter = Math.max(RUN_CONFIG.numRuns, Math.ceil(depth / 4));
  return { ...env, [PROPERTY_ENV.runs]: String(quarter) };
}

/** The longest generated message a case uses: every position of it is cut at. */
export const MAX_MESSAGE = 600;

/**
 * Every case reads each input once per cut point, so it needs more than the 10 s default; a deeper
 * run scales the budget with its depth.
 */
export const BUDGET = {
  timeout: propertyTimeout(120_000, process.env, RUN_CONFIG.numRuns),
} as const;

/** Every item a reader yields. */
export async function drain<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

/** An error's code, message, position and snippet: what an item's or a throw's error shows. */
export function errorView(error: unknown): unknown {
  expect(error).toBeInstanceOf(Hl7ParseError);
  const e = error as Hl7ParseError;
  return [e.code, e.message, e.position, e.snippet];
}

/** `text` cut in two at `at`. */
export function cutText(text: string, at: number): string[] {
  return [text.slice(0, at), text.slice(at)];
}

/** `bytes` cut in two at `at`. */
export function cutBytes(bytes: Uint8Array, at: number): Uint8Array[] {
  return [bytes.subarray(0, at), bytes.subarray(at)];
}

/** The items of every cut of `whole`, each checked to equal the items of the uncut input. */
export async function everyCut<T extends string | Uint8Array>(
  whole: T,
  length: number,
  cut: (whole: T, at: number) => T[],
  each: (chunks: T[]) => Promise<unknown>,
): Promise<void> {
  const expected = await each([whole]);
  for (let at = 0; at <= length; at++) {
    expect(await each(cut(whole, at))).toEqual(expected);
  }
}
