// A stand-in for the built package, for the streaming memory gate's own test: the three readers the
// gate measures, each reading its source to the end and yielding one item a chunk, holding nothing.
// It lets the test run the gate's processes in a second without a build. Its ratios mean nothing.

/** Yield one successful message entry a chunk, as `readMessages` and `parseStream` yield them. */
async function* messages(source) {
  for await (const chunk of source) {
    void chunk;
    yield { ok: true, message: { get: () => undefined } };
  }
}

export const readMessages = messages;
export const parseStream = messages;

/** Yield one segment entry a chunk, as `readSegments` yields them. */
export async function* readSegments(source) {
  for await (const chunk of source) {
    void chunk;
    yield { segment: { type: "OBX" } };
  }
}
