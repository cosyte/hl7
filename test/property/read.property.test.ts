/**
 * Property tests for `readMessages()` over the generators at `@cosyte/hl7/arbitraries`: a
 * streamed parse agrees with the whole-buffer parse on every generated batch, split at every chunk
 * boundary. `read-segments.property.test.ts` does the same for `readSegments()`.
 *
 * - `readMessages()` finds the messages `splitBatch` finds, in order, none dropped or merged, and
 *   each item is what `parseHL7` gives for the bytes at its byte position, warnings and errors
 *   included; strict mode yields the same items up to its first failure and stops there.
 * - The same input cut at any one position, or into one-character chunks, gives the
 *   same items as the whole input. Bytes are cut too, inside multi-byte characters included.
 */

import { Buffer } from "node:buffer";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { hostileInput, message, messageText } from "../../src/arbitraries/index.js";
import { parseHL7, readMessages, splitBatch } from "../../src/index.js";
import type { Hl7Message, Hl7ReadSource, ParseOptions, ReadMessageItem } from "../../src/index.js";
import { checkAsyncProperty } from "../_helpers/property.js";

import {
  BUDGET,
  MAX_MESSAGE,
  READ_ENV,
  RUN_CONFIG,
  cutBytes,
  cutText,
  drain,
  errorView,
  everyCut,
} from "./_read.js";

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

function messageView(message: Hl7Message): unknown {
  return [message.toString(), message.warnings, message.rawSegments, message.version];
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
      READ_ENV,
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
        READ_ENV,
      );
    },
  );
});
