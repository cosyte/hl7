/**
 * Property tests for `readMessages()` and `readSegments()` over the generators at
 * `@cosyte/hl7/arbitraries`: a streamed parse agrees with the whole-buffer parse on every
 * generated batch and message, split at every chunk boundary.
 *
 * - `readMessages()` finds the messages `splitBatch` finds, in order, none dropped or merged, and
 *   each item is what `parseHL7` gives for the bytes at its byte position, warnings and errors
 *   included; strict mode yields the same items up to its first failure and stops there.
 * - `readSegments()` yields every segment `parseHL7` builds for the whole message, with the
 *   warnings it reports, and throws the error it throws.
 * - Either way, the same input cut at any one position, or into one-character chunks, gives the
 *   same items as the whole input. Bytes are cut too, inside multi-byte characters included.
 */

import { Buffer } from "node:buffer";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { hostileInput, message, messageText } from "../../src/arbitraries/index.js";
import {
  Hl7ParseError,
  parseHL7,
  readMessages,
  readSegments,
  splitBatch,
} from "../../src/index.js";
import type {
  Hl7Message,
  Hl7ReadSource,
  ParseOptions,
  ReadMessageItem,
  ReadSegmentItem,
} from "../../src/index.js";
import { fieldArrivedAltered } from "../../src/parser/wire-fidelity.js";
import { checkAsyncProperty, propertyTimeout } from "../_helpers/property.js";

/**
 * Each case reads its input once for every position it can be cut at, so a pull request runs fewer
 * cases than elsewhere and inputs are kept short. The nightly run's `COSYTE_PROPERTY_RUNS` sets the
 * depth here as it does everywhere.
 */
// property-depth: 25 cases on a pull request, since each case reads its input once per cut point.
const RUN_CONFIG = { numRuns: 25 } as const;

/** The longest generated message a case uses: every position of it is cut at. */
const MAX_MESSAGE = 600;

/**
 * Every case reads each input once per cut point, so it needs more than the 10 s default; a deeper
 * run scales the budget with its depth.
 */
const BUDGET = { timeout: propertyTimeout(120_000, process.env, RUN_CONFIG.numRuns) } as const;

/** One message's text, from any of the generators; MLLP bytes are tested on their own. */
const messageOfAnyKind: fc.Arbitrary<string> = fc
  .oneof(
    message().map((m) => m.toString()),
    message({ escapes: true }).map((m) => m.toString()),
    messageText(),
    hostileInput().map((h) => (typeof h === "string" ? h : h.toString("latin1"))),
  )
  .map((text) => text.replace(/[\u000b\u001c]/gu, ""))
  .filter((text) => text.length <= MAX_MESSAGE);

/** What separates two messages in a batch. */
const separator = fc.constantFrom("", "\r", "\n", "\r\n", "\r\r", "\n\n");

/** A batch: messages, separated, optionally inside batch and file envelopes. */
const batch: fc.Arbitrary<string> = fc
  .record({
    messages: fc.array(fc.tuple(messageOfAnyKind, separator), { minLength: 1, maxLength: 4 }),
    envelope: fc.constantFrom("none", "batch", "file"),
    ending: fc.constantFrom("", "\r", "\r\n", "\n"),
  })
  .map(({ messages, envelope, ending }) => {
    const body = messages.map(([text, sep]) => `${text}${text.endsWith("\r") ? "" : "\r"}${sep}`);
    const inner = body.join("");
    if (envelope === "none") return `${inner.replace(/[\r\n]+$/u, "")}${ending}`;
    const batched = `BHS|^~\\&|SEND\r${inner}BTS|${String(messages.length)}`;
    if (envelope === "batch") return `${batched}${ending}`;
    return `FHS|^~\\&|SEND\r${batched}\rFTS|1${ending}`;
  });

/** Every item a reader yields. */
async function drain<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

function messageView(message: Hl7Message): unknown {
  return [message.toString(), message.warnings, message.rawSegments, message.version];
}

function errorView(error: unknown): unknown {
  expect(error).toBeInstanceOf(Hl7ParseError);
  const e = error as Hl7ParseError;
  return [e.code, e.message, e.position, e.snippet];
}

function itemView(item: ReadMessageItem): unknown {
  return item.ok
    ? [true, messageView(item.message), item.byteOffset, item.byteLength, item.position]
    : [false, errorView(item.error), item.byteOffset, item.byteLength, item.position];
}

/** What parseHL7 gives for `input`, as an item's message or error would show it. */
function parsedView(input: string | Buffer, options: ParseOptions): unknown {
  try {
    return [true, messageView(parseHL7(input, options))];
  } catch (error) {
    return [false, errorView(error)];
  }
}

/** `text` cut in two at `at`. */
function cutText(text: string, at: number): string[] {
  return [text.slice(0, at), text.slice(at)];
}

/** `bytes` cut in two at `at`. */
function cutBytes(bytes: Uint8Array, at: number): Uint8Array[] {
  return [bytes.subarray(0, at), bytes.subarray(at)];
}

/** The items of every cut of `whole`, each checked to equal the items of the uncut input. */
async function everyCut<T extends string | Uint8Array>(
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

/** Check the batch read as text, and as its UTF-8 bytes, against the whole-buffer parse. */
async function checkMessages(text: string, options: ParseOptions): Promise<void> {
  const items = await drain(readMessages(text, options));

  // The messages splitBatch finds, in order: none dropped, merged or reordered.
  const reference = splitBatch(text, options).messages;
  expect(items.map((item) => item.position)).toEqual(reference.map((entry) => entry.position));
  expect(items.map((item) => (item.ok ? messageView(item.message) : item.error.code))).toEqual(
    reference.map((entry) => (entry.ok ? messageView(entry.message) : entry.error.code)),
  );

  // Each item is what parseHL7 gives for the bytes at its position. A lone surrogate has no UTF-8
  // form (it is written as U+FFFD), so text holding one is not its bytes, and is not checked so.
  const bytes = Buffer.from(text, "utf8");
  const wellFormed = !/\p{Cs}/u.test(text);
  for (const item of wellFormed ? items : []) {
    const slice = bytes.subarray(item.byteOffset, item.byteOffset + item.byteLength);
    const view = item.ok ? [true, messageView(item.message)] : [false, errorView(item.error)];
    expect(view).toEqual(parsedView(slice.toString("utf8"), options));
  }

  const viewOf = async (source: Hl7ReadSource): Promise<unknown> =>
    (await drain(readMessages(source, options))).map(itemView);
  await everyCut(text, text.length, cutText, viewOf);
  expect(await viewOf(text.split(""))).toEqual(await viewOf(text));

  const fromBytes = await drain(readMessages(bytes, options));
  for (const item of fromBytes) {
    const slice = bytes.subarray(item.byteOffset, item.byteOffset + item.byteLength);
    const view = item.ok ? [true, messageView(item.message)] : [false, errorView(item.error)];
    expect(view).toEqual(parsedView(Buffer.from(slice), options));
  }
  expect(fromBytes.map((item) => item.byteOffset)).toEqual(items.map((item) => item.byteOffset));
  await everyCut(new Uint8Array(bytes), bytes.length, cutBytes, viewOf);
}

describe("property: readMessages agrees with splitBatch and parseHL7", () => {
  it("on every generated batch, cut at every position", BUDGET, async () => {
    await checkAsyncProperty(
      fc.asyncProperty(batch, (text) => checkMessages(text, {})),
      RUN_CONFIG,
    );
  });

  it(
    "in strict mode: the same items up to the first failure, and none after it",
    BUDGET,
    async () => {
      await checkAsyncProperty(
        fc.asyncProperty(batch, async (text) => {
          const lenient = await drain(readMessages(text, { strict: true, lazy: false }));
          const reference = splitBatch(text, { strict: true }).messages;
          const firstFailure = reference.findIndex((entry) => !entry.ok);
          const expected = firstFailure === -1 ? reference : reference.slice(0, firstFailure + 1);
          expect(lenient.map((item) => [item.ok, item.position])).toEqual(
            expected.map((entry) => [entry.ok, entry.position]),
          );
          await everyCut(text, text.length, cutText, async (chunks) =>
            (await drain(readMessages(chunks, { strict: true }))).map(itemView),
          );
        }),
        // property-depth: 30 cases on a pull request, as this test ran before the shared runner.
        { numRuns: 30 },
      );
    },
  );
});

/** What a segment item shows. */
function segmentView(item: ReadSegmentItem): unknown {
  return [
    item.index,
    item.segment.type,
    item.segment.raw,
    item.segment.fields.map(fieldArrivedAltered),
  ];
}

/** What `readSegments` gives for `source`: its items, or the error it throws. */
async function readView(source: Hl7ReadSource, options: ParseOptions): Promise<unknown> {
  try {
    const items = await drain(readSegments(source, options));
    return [
      true,
      items.map(segmentView),
      items
        .flatMap((item) => item.warnings)
        .map((w) => JSON.stringify(w))
        .sort(),
    ];
  } catch (error) {
    return [false, errorView(error)];
  }
}

/** What `parseHL7` gives for the whole message, shown as `readView` shows a reader's items. */
function wholeView(input: string | Buffer, options: ParseOptions): unknown {
  try {
    const parsed = parseHL7(input, options);
    return [
      true,
      parsed
        .allSegments()
        .map((segment, i) => [
          i,
          segment.type,
          segment.raw,
          segment.fields.map(fieldArrivedAltered),
        ]),
      parsed.warnings.map((w) => JSON.stringify(w)).sort(),
    ];
  } catch (error) {
    return [false, errorView(error)];
  }
}

/** One message's text, MLLP framing bytes included. */
const oneMessage: fc.Arbitrary<string | Buffer> = fc
  .oneof(
    message({ escapes: true }).map((m): string | Buffer => m.toString()),
    messageText(),
    hostileInput(),
    // An MLLP frame, ended as senders end it: FS CR, or with a line feed after or instead of the
    // CR, after a message that may or may not end with its own CR. Weighted, so the few cases a
    // default run draws include each ending.
    {
      weight: 4,
      arbitrary: fc
        .tuple(
          messageText(),
          fc.constantFrom("", "\r"),
          fc.constantFrom("\u001c\r", "\u001c\r\n", "\u001c\n"),
        )
        .map(([text, last, end]) => `\u000b${text.replace(/\r+$/u, "")}${last}${end}`),
    },
  )
  .filter((input) => input.length <= MAX_MESSAGE);

describe("property: readSegments agrees with parseHL7", () => {
  it("on every generated message, as text and bytes, cut at every position", BUDGET, async () => {
    await checkAsyncProperty(
      fc.asyncProperty(oneMessage, async (input) => {
        const text = typeof input === "string" ? input : input.toString("latin1");
        const bytes = typeof input === "string" ? Buffer.from(input, "utf8") : input;
        const lenient = {};
        // A byte that is not valid in the charset the message declares is the one case a stream
        // cannot read as parseHL7 does; it throws UNSUPPORTED_CHARSET instead, checked below.
        expect(await readView(text, lenient)).toEqual(wholeView(text, lenient));
        await everyCut(text, text.length, cutText, async (chunks) => readView(chunks, lenient));
        const streamed = await readView(bytes, lenient);
        const whole = wholeView(bytes, lenient);
        const fellBack =
          Array.isArray(streamed) &&
          streamed[0] === false &&
          (streamed[1] as unknown[])[0] === "UNSUPPORTED_CHARSET";
        if (!fellBack) expect(streamed).toEqual(whole);
        await everyCut(new Uint8Array(bytes), bytes.length, cutBytes, async (chunks) =>
          readView(chunks, lenient),
        );
      }),
      RUN_CONFIG,
    );
  });

  it("in strict mode, on messages with at most one problem", BUDGET, async () => {
    await checkAsyncProperty(
      fc.asyncProperty(message({ escapes: true }), async (msg) => {
        const text = msg.toString();
        // With two problems, parseHL7 reports the one its whole-message order meets first, and
        // a stream the one its reading order meets first: documented, so not compared here.
        fc.pre(parseHL7(text).warnings.length <= 1);
        const strict = { strict: true };
        expect(await readView(text, strict)).toEqual(wholeView(text, strict));
      }),
      RUN_CONFIG,
    );
  });
});
