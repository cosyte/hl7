// The built package with a regression planted in each streaming reader, for the stream-memory
// workflow to show that the gate fails a reader holding a single message more than it does.
// bench/stream-memory.mjs reads this file as its target in place of dist/index.mjs, and the
// workflow fails unless that reading exits 1 with all three readers over their limits.
//
// Each reader is the build's own, fed its source through `keepingCopies`, which keeps a copy of the
// last 4 MiB of the source alive beside what the reader holds itself: one of the 4 MiB items each
// reader reads (a message for `readMessages` and `parseStream`, a segment for `readSegments`), to
// within one 64 KiB chunk. Nothing else changes, so each reading is the reader's own plus one item.

import { Buffer } from "node:buffer";

import * as built from "../dist/index.mjs";

const MIB = 1024 * 1024;

/** The largest item each reader reads in bench/stream-memory.mjs: a 4 MiB message or segment. */
const ONE_MESSAGE = 4 * MIB;

/**
 * `source` as it arrives, keeping a copy of at least the last `bytes` bytes of it alive meanwhile,
 * and less than one chunk more.
 */
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

/** `readMessages` holding a copy of the last 4 MiB of its source, one message more. */
export function readMessages(source, options) {
  return built.readMessages(keepingCopies(source, ONE_MESSAGE), options);
}

/** `parseStream` holding a copy of the last 4 MiB of its source, one message more. */
export function parseStream(source, options) {
  return built.parseStream(keepingCopies(source, ONE_MESSAGE), options);
}

/** `readSegments` holding a copy of the last 4 MiB of its source, one segment more. */
export function readSegments(source, options) {
  return built.readSegments(keepingCopies(source, ONE_MESSAGE), options);
}
