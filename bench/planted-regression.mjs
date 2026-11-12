// The built package with a regression planted in each streaming reader, for the stream-memory
// workflow to show that the gate fails a reader holding a single message more than it does.
// bench/stream-memory.mjs reads this file as its target in place of dist/index.mjs, and the
// workflow fails unless that reading exits 1 with all three readers over their limits.
//
// Each reader is the build's own, fed its source through bench/hold-one-more.mjs, which keeps a
// copy of the last 4 MiB of the source alive beside what the reader holds itself until the reader
// has yielded its last item: one of the 4 MiB items each reader reads (a message for
// `readMessages` and `parseStream`, a segment for `readSegments`), to within one 64 KiB chunk.
// Nothing else changes, so at every sample from the first 4 MiB on, each reading is the reader's
// own plus one item.

import * as built from "../dist/index.mjs";
import { holdingOneMore } from "./hold-one-more.mjs";

/** `readMessages` holding a copy of the last 4 MiB of its source, one message more. */
export function readMessages(source, options) {
  return holdingOneMore(built.readMessages, source, options);
}

/** `parseStream` holding a copy of the last 4 MiB of its source, one message more. */
export function parseStream(source, options) {
  return holdingOneMore(built.parseStream, source, options);
}

/** `readSegments` holding a copy of the last 4 MiB of its source, one segment more. */
export function readSegments(source, options) {
  return holdingOneMore(built.readSegments, source, options);
}
