/**
 * Property tests for `readSegments()` over the generators at `@cosyte/hl7/arbitraries`: it yields
 * every segment `parseHL7` builds for the whole message, with the warnings it reports, and throws
 * the error it throws. The same message cut at any one position gives the same items as the whole
 * message, as text and as bytes, inside multi-byte characters included. `read.property.test.ts`
 * does the same for `readMessages()`.
 */

import { Buffer } from "node:buffer";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { hostileInput, message, messageText } from "../../src/arbitraries/index.js";
import { parseHL7, readSegments } from "../../src/index.js";
import type { Hl7ReadSource, ParseOptions, ReadSegmentItem } from "../../src/index.js";
import { fieldArrivedAltered } from "../../src/parser/wire-fidelity.js";
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
      READ_ENV,
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
      READ_ENV,
    );
  });
});
