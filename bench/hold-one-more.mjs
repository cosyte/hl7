// The regression bench/planted-regression.mjs plants in each streaming reader: a copy of the last
// 4 MiB of the reader's source, held beside what the reader holds itself until the reader has
// yielded its last item. It imports nothing from the build, so a test can check it on its own.

import { Buffer } from "node:buffer";

const MIB = 1024 * 1024;

/** The largest item each reader reads in bench/stream-memory.mjs: a 4 MiB message or segment. */
export const ONE_MESSAGE = 4 * MIB;

/**
 * `source` as it arrives, keeping in `kept` a copy of at least the last `bytes` bytes of it, and
 * less than one chunk more. The copies stay in `kept` once the source ends.
 */
export async function* keepingCopies(source, bytes, kept) {
  for await (const chunk of source) {
    const copy = Buffer.from(chunk);
    kept.copies.push(copy);
    kept.bytes += copy.length;
    while (kept.bytes - (kept.copies[0]?.length ?? 0) >= bytes) {
      kept.bytes -= kept.copies.shift().length;
    }
    yield chunk;
  }
}

/**
 * `read` over `source`, holding a copy of the last ONE_MESSAGE bytes of the source in `kept` until
 * `read` has yielded its last item: the benchmark's sources end on a 4 MiB item, and a reader's
 * peak can come as it yields that item, after its source has ended.
 */
export async function* holdingOneMore(read, source, options, kept = { copies: [], bytes: 0 }) {
  yield* read(keepingCopies(source, ONE_MESSAGE, kept), options);
  // Read after the last item, so the copies are alive until then.
  if (kept.bytes < 0) throw new Error("a negative count of kept bytes");
}
