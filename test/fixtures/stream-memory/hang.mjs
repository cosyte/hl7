// A stand-in for the built package whose `readMessages` never finishes: it waits forever with a
// timer keeping the process alive, as a reader stuck in a loop on its source would. The streaming
// memory gate's own test runs the gate on it to show that a hung reading ends, as a reading that
// cannot be judged, rather than holding the job until the job's own timeout.

export { parseStream, readSegments } from "./target.mjs";

/** Never yield, and never let the process exit. */
export async function* readMessages(source) {
  void source;
  await new Promise(() => {
    setInterval(() => undefined, 1000);
  });
}
