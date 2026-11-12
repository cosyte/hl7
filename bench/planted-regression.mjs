// The built package with two regressions planted in it, for the stream-memory workflow to show that
// the gate still fails a real one. bench/stream-memory.mjs reads this file as its target in place
// of dist/index.mjs, and the workflow fails unless that reading exits 1.
//
// `readMessages` keeps a copy of the last 8 MiB it read, two of the 4 MiB messages, so it holds
// about two messages more than it does: the size of the 3.98 reading `parseStream` gave when it
// held a second copy of each message. `parseStream` reads its whole source before it parses any of
// it, the reader that buffered its source the performance page describes, toward all 100 MiB.
// `readSegments` is the build's own and stays within the limit.

import { Buffer } from "node:buffer";

import {
  parseStream as builtParseStream,
  readMessages as builtReadMessages,
} from "../dist/index.mjs";

export { readSegments } from "../dist/index.mjs";

const MIB = 1024 * 1024;

/** `source` as it arrives, keeping a copy of the last `bytes` bytes of it alive meanwhile. */
async function* keepingCopies(source, bytes) {
  const copies = [];
  let kept = 0;
  for await (const chunk of source) {
    const copy = Buffer.from(chunk);
    copies.push(copy);
    kept += copy.length;
    while (kept - (copies[0]?.length ?? 0) >= bytes) kept -= copies.shift().length;
    yield chunk;
  }
}

/** `readMessages` holding a copy of the last 8 MiB of its source. */
export function readMessages(source, options) {
  return builtReadMessages(keepingCopies(source, 8 * MIB), options);
}

/** `parseStream` over its whole source, read into memory first. */
export async function* parseStream(source, options) {
  const chunks = [];
  for await (const chunk of source) chunks.push(chunk);
  yield* builtParseStream(chunks, options);
}
