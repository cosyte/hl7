/**
 * Example-based tests for `splitBatch()` (roadmap Phase L — batch / file
 * envelope splitting). Drives the five canonical batch fixtures plus targeted
 * edge cases:
 *
 *   - single-batch          FHS/BHS/2 msgs/BTS(2)/FTS(1) — counts agree
 *   - multi-batch-file      two BHS/BTS batches under one FHS/FTS
 *   - count-mismatch        BTS declares 3, two present  → BATCH_COUNT_MISMATCH
 *   - malformed-mid-batch   a too-short MSH is isolated  → siblings still yield
 *   - bare-message          no envelope                  → passthrough
 *
 * The invariants under test are the Phase-L acceptance criteria: individual
 * messages + envelope metadata are yielded; count reconciliation warns on
 * mismatch (never dropping the tail); a malformed message mid-batch is isolated;
 * a bare message passes through; and every batch-level warning carries counts /
 * positions only (never PHI).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { WARNING_CODES, parseHL7, splitBatch } from "../src/index.js";
import type { BatchMessageEntry, Hl7Message } from "../src/index.js";

const BATCH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "batch");

/** Read a batch fixture verbatim (CR-terminated, as shipped). */
function fixture(name: string): string {
  return readFileSync(path.join(BATCH_DIR, `${name}.hl7`), "utf8");
}

/** Narrowing helper: assert an entry exists + parsed, and return its message. */
function okMessage(entry: BatchMessageEntry | undefined): Hl7Message {
  if (entry === undefined) throw new Error("expected an entry, got undefined");
  if (!entry.ok) throw new Error(`expected ok entry, got failure: ${entry.error.code}`);
  return entry.message;
}

describe("splitBatch: single-batch fixture", () => {
  const result = splitBatch(fixture("single-batch"));

  it("yields both messages, flattened in order", () => {
    expect(result.messages).toHaveLength(2);
    expect(result.messages.every((e) => e.ok)).toBe(true);
    expect(okMessage(result.messages[0]).get("MSH.10")).toBe("MSGA0001");
    expect(okMessage(result.messages[1]).get("MSH.10")).toBe("MSGA0002");
  });

  it("surfaces the file + batch envelope metadata", () => {
    expect(result.hadEnvelope).toBe(true);
    expect(result.fileHeader?.name).toBe("FHS");
    expect(result.fileTrailer?.name).toBe("FTS");
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]?.header?.name).toBe("BHS");
    expect(result.batches[0]?.trailer?.name).toBe("BTS");
  });

  it("reconciles matching counts with no warning", () => {
    expect(result.batches[0]?.declaredMessageCount).toBe(2);
    expect(result.batches[0]?.actualMessageCount).toBe(2);
    expect(result.declaredBatchCount).toBe(1);
    expect(result.actualBatchCount).toBe(1);
    expect(result.warnings).toHaveLength(0);
  });

  it("each split message re-parses standalone (raw is MSH-led + round-trippable)", () => {
    for (const entry of result.messages) {
      expect(entry.raw.startsWith("MSH")).toBe(true);
      // The raw slice is exactly what parseHL7 accepts — the message's own
      // toString re-serializes without the envelope.
      expect(okMessage(entry).toString().startsWith("MSH")).toBe(true);
    }
  });
});

describe("splitBatch: multi-batch-file fixture", () => {
  const result = splitBatch(fixture("multi-batch-file"));

  it("splits two batches under one file envelope", () => {
    expect(result.batches).toHaveLength(2);
    expect(result.actualBatchCount).toBe(2);
    expect(result.declaredBatchCount).toBe(2);
    expect(result.batches[0]?.actualMessageCount).toBe(2);
    expect(result.batches[1]?.actualMessageCount).toBe(1);
  });

  it("flattens all three messages in stream order", () => {
    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((e) => okMessage(e).get("MSH.10"))).toEqual([
      "MSGB0001",
      "MSGB0002",
      "MSGB0003",
    ]);
  });

  it("no warnings — every declared count agrees", () => {
    expect(result.warnings).toHaveLength(0);
  });
});

describe("splitBatch: count-mismatch fixture", () => {
  const result = splitBatch(fixture("count-mismatch"));

  it("still returns every message — the tail is never dropped", () => {
    expect(result.messages).toHaveLength(2);
    expect(result.messages.every((e) => e.ok)).toBe(true);
  });

  it("emits exactly one BATCH_COUNT_MISMATCH carrying declared-vs-actual numbers", () => {
    const mismatch = result.warnings.filter((w) => w.code === WARNING_CODES.BATCH_COUNT_MISMATCH);
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]?.message).toContain("3");
    expect(mismatch[0]?.message).toContain("2");
  });

  it("declared vs actual are both surfaced on the batch", () => {
    expect(result.batches[0]?.declaredMessageCount).toBe(3);
    expect(result.batches[0]?.actualMessageCount).toBe(2);
  });

  it("the warning message carries NO PHI (no patient id / name / facility)", () => {
    for (const w of result.warnings) {
      expect(w.message).not.toContain("FAKE");
      expect(w.message).not.toContain("Test");
      expect(w.message).not.toContain("SENDFAC");
      expect(w.message).not.toContain("MSGC");
    }
  });
});

describe("splitBatch: malformed-mid-batch fixture", () => {
  const result = splitBatch(fixture("malformed-mid-batch"));

  it("isolates the malformed message but still returns its siblings", () => {
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]?.ok).toBe(true);
    expect(result.messages[1]?.ok).toBe(false);
    expect(result.messages[2]?.ok).toBe(true);
  });

  it("the failure entry carries a typed Hl7ParseError + the preserved raw", () => {
    const failed = result.messages[1];
    expect(failed?.ok).toBe(false);
    if (failed !== undefined && !failed.ok) {
      expect(failed.error.code).toBe("MSH_TOO_SHORT");
      expect(failed.raw).toBe("MSH|^~");
    }
  });

  it("a mid-stream failure never suppresses the later good messages", () => {
    expect(okMessage(result.messages[0]).get("MSH.10")).toBe("MSGD0001");
    expect(okMessage(result.messages[2]).get("MSH.10")).toBe("MSGD0003");
  });
});

describe("splitBatch: bare-message passthrough", () => {
  const result = splitBatch(fixture("bare-message"));

  it("passes a single un-enveloped message straight through", () => {
    expect(result.hadEnvelope).toBe(false);
    expect(result.messages).toHaveLength(1);
    expect(okMessage(result.messages[0]).get("MSH.10")).toBe("MSGE0001");
  });

  it("does not synthesize a batch for an un-enveloped message (batches stay empty)", () => {
    // A bare message belongs to no BHS/BTS batch — it lives in `messages` only,
    // so it never inflates a batch count. `batches` is reserved for explicit
    // envelope-delimited batches.
    expect(result.batches).toHaveLength(0);
    expect(result.actualBatchCount).toBe(0);
    expect(result.fileHeader).toBeUndefined();
    expect(result.fileTrailer).toBeUndefined();
    expect(result.warnings).toHaveLength(0);
  });
});

describe("splitBatch: edge cases", () => {
  it("empty input yields an empty result and never throws", () => {
    const result = splitBatch("");
    expect(result.messages).toHaveLength(0);
    expect(result.batches).toHaveLength(0);
    expect(result.actualBatchCount).toBe(0);
    expect(result.hadEnvelope).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it("whitespace-only input yields an empty result", () => {
    const result = splitBatch("   \r\n  \r");
    expect(result.messages).toHaveLength(0);
    expect(result.hadEnvelope).toBe(false);
  });

  it("an absent BTS-1 ([0..1]) disables reconciliation rather than warning", () => {
    const result = splitBatch("BHS|^~\\&|A\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rBTS\r");
    expect(result.messages).toHaveLength(1);
    expect(result.batches[0]?.declaredMessageCount).toBeUndefined();
    // No BTS-1 count -> no mismatch warning; the (present) BTS still closes it.
    expect(result.warnings.some((w) => w.code === WARNING_CODES.BATCH_COUNT_MISMATCH)).toBe(false);
  });

  it("a non-numeric BTS-1 tolerantly disables reconciliation", () => {
    const result = splitBatch(
      "BHS|^~\\&|A\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rBTS|lots\r",
    );
    expect(result.batches[0]?.declaredMessageCount).toBeUndefined();
    expect(result.warnings).toHaveLength(0);
  });

  it("a BHS with no BTS warns BATCH_MISSING_TRAILER (but does not throw)", () => {
    const result = splitBatch("BHS|^~\\&|A\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r");
    expect(result.messages).toHaveLength(1);
    const missing = result.warnings.filter((w) => w.code === WARNING_CODES.BATCH_MISSING_TRAILER);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.message).toContain("BHS");
    expect(missing[0]?.message).toContain("BTS");
  });

  it("an FHS with no FTS warns BATCH_MISSING_TRAILER", () => {
    const result = splitBatch("FHS|^~\\&|A\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r");
    const missing = result.warnings.filter((w) => w.code === WARNING_CODES.BATCH_MISSING_TRAILER);
    expect(missing.some((w) => w.message.includes("FHS") && w.message.includes("FTS"))).toBe(true);
  });

  it("two concatenated bare messages (no envelope) split into two entries", () => {
    const two =
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r" +
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rPID|||2\r";
    const result = splitBatch(two);
    expect(result.messages).toHaveLength(2);
    expect(result.hadEnvelope).toBe(false);
  });

  it("stray content before the first MSH is preserved as a failure entry, never dropped", () => {
    const result = splitBatch("GARBAGE|x\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r");
    expect(result.messages).toHaveLength(2);
    const stray = result.messages[0];
    expect(stray?.ok).toBe(false);
    if (stray !== undefined && !stray.ok) {
      expect(stray.error.code).toBe("NO_MSH_SEGMENT");
      expect(stray.raw).toBe("GARBAGE|x");
    }
    expect(result.messages[1]?.ok).toBe(true);
  });

  it("forwards the second argument to parseHL7 per message (strict isolates a warner)", () => {
    // An unknown Z-segment warns in lenient mode; under strict it throws and is
    // caught as an isolated failure entry — the batch still yields it.
    const raw = "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rZZZ|custom\r";
    const lenient = splitBatch(raw);
    expect(lenient.messages[0]?.ok).toBe(true);
    const strict = splitBatch(raw, { strict: true });
    expect(strict.messages).toHaveLength(1);
    expect(strict.messages[0]?.ok).toBe(false);
  });

  it("accepts a Buffer stream and preserves each message's bytes (latin1 fidelity)", () => {
    const raw = "BHS|^~\\&|A\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\rBTS|1\r";
    const fromString = splitBatch(raw);
    const fromBuffer = splitBatch(Buffer.from(raw, "latin1"));
    expect(fromBuffer.messages).toHaveLength(1);
    expect(fromBuffer.messages[0]?.raw).toBe(fromString.messages[0]?.raw);
  });

  it("reconciles FTS-1 file batch count and warns on a file-level mismatch", () => {
    // One batch present, but FTS-1 declares two → a "batch"-unit mismatch.
    const stream =
      "FHS|^~\\&|A\r" +
      "BHS|^~\\&|A\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rBTS|1\r" +
      "FTS|2\r";
    const result = splitBatch(stream);
    expect(result.actualBatchCount).toBe(1);
    expect(result.declaredBatchCount).toBe(2);
    const mismatch = result.warnings.filter((w) => w.code === WARNING_CODES.BATCH_COUNT_MISMATCH);
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]?.message).toContain("batch");
    expect(mismatch[0]?.message).toContain("2");
    expect(mismatch[0]?.message).toContain("1");
  });

  it("strips a leading UTF-8 BOM so the first envelope segment is still detected", () => {
    const withBom =
      "﻿FHS|^~\\&|A\rBHS|^~\\&|A\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rBTS|1\rFTS|1\r";
    const result = splitBatch(withBom);
    expect(result.fileHeader?.name).toBe("FHS");
    expect(result.messages).toHaveLength(1);
    expect(okMessage(result.messages[0]).get("MSH.10")).toBe("1");
    expect(result.warnings).toHaveLength(0);
  });

  it("strips a leading UTF-8 BOM carried as raw bytes in a Buffer stream", () => {
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r", "latin1"),
    ]);
    const result = splitBatch(bytes);
    expect(result.messages).toHaveLength(1);
    expect(okMessage(result.messages[0]).get("MSH.10")).toBe("1");
  });

  it("preserves a middle empty segment inside a message (raw re-parses identically)", () => {
    // A blank segment INSIDE a message is meaningful — HL7 keeps middle empties
    // for positional stability. splitBatch must not drop it, or the message's
    // segment indices shift vs a standalone parseHL7.
    const body = "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rPID|||1\r\rOBX|1||x\r";
    const stream = `BHS|^~\\&|A\r${body}BTS|1\r`;
    const result = splitBatch(stream);
    expect(result.messages).toHaveLength(1);
    const msg = okMessage(result.messages[0]);
    const standalone = parseHL7(body);
    expect(msg.rawSegments.length).toBe(standalone.rawSegments.length);
    expect(msg.rawSegments.map((s) => s.name)).toEqual(standalone.rawSegments.map((s) => s.name));
    // The empty segment survives: MSH, PID, "", OBX (4 segments).
    expect(msg.rawSegments).toHaveLength(4);
  });

  it("two concatenated conformant files do not emit a false batch-count mismatch", () => {
    // Regression: per-file FTS-1 scoping. Each file declares FTS|1 with one
    // batch; a stream-wide count would see 2 batches and falsely warn.
    const file =
      "FHS|^~\\&|A\rBHS|^~\\&|A\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rBTS|1\rFTS|1\r";
    const result = splitBatch(file + file);
    expect(result.messages).toHaveLength(2);
    expect(result.batches).toHaveLength(2);
    expect(
      result.warnings.filter((w) => w.code === WARNING_CODES.BATCH_COUNT_MISMATCH),
    ).toHaveLength(0);
  });

  it("a headerless message before the first BHS is not counted as a batch", () => {
    // Regression: FTS-1 reconciliation counts explicit (BHS) batches only, so a
    // stray pre-BHS message does not inflate the denominator.
    const stream =
      "FHS|^~\\&|A\r" +
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r" + // headerless
      "BHS|^~\\&|A\rMSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rBTS|1\r" +
      "FTS|1\r";
    const result = splitBatch(stream);
    expect(result.messages).toHaveLength(2); // both messages surfaced
    expect(result.batches).toHaveLength(1); // only the BHS-delimited batch
    expect(result.actualBatchCount).toBe(1);
    expect(result.declaredBatchCount).toBe(1);
    expect(
      result.warnings.filter((w) => w.code === WARNING_CODES.BATCH_COUNT_MISMATCH),
    ).toHaveLength(0);
  });

  it("a reserved-name (FHS/BHS/BTS/FTS) body segment severs the tail as a NO_MSH failure, never silently", () => {
    // Documented hard limitation: envelope names are reserved, so a message body
    // that literally contains one is mis-detected as a boundary. The severed
    // tail is surfaced as a typed failure entry — never dropped.
    const stream = "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rFTS|x\rPID|||9\r";
    const result = splitBatch(stream);
    // The MSH message, then FTS closes the (implicit) file, then PID|||9 becomes
    // an MSH-less failure entry — present in `messages`, not discarded.
    const failures = result.messages.filter((e) => !e.ok);
    expect(failures).toHaveLength(1);
    expect(failures.every((e) => !e.ok && e.error.code === "NO_MSH_SEGMENT")).toBe(true);
    expect(result.messages.some((e) => e.ok)).toBe(true);
  });

  it("a lowercase body segment named like an envelope is NOT mistaken for a boundary", () => {
    // Case-sensitive boundary matching: a lenient lowercase `bts` in a body must
    // stay part of the message, not split it.
    const stream = "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rbts|not a trailer\r";
    const result = splitBatch(stream);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.ok).toBe(true);
    expect(result.hadEnvelope).toBe(false);
  });

  it("treats a BHS-omitted batch (messages closed by BTS) as one batch, no false mismatch", () => {
    // §2.10.3: BHS is optional — a BTS closes the preceding message run into a
    // batch even with no BHS. Its BTS-1 must reconcile against those messages,
    // not against an empty synthetic batch.
    const stream =
      "FHS|^~\\&|A\r" +
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\r" +
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\r" +
      "BTS|2\rFTS|1\r";
    const result = splitBatch(stream);
    expect(result.messages).toHaveLength(2);
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]?.header).toBeUndefined(); // headerless batch
    expect(result.batches[0]?.actualMessageCount).toBe(2);
    expect(result.batches[0]?.declaredMessageCount).toBe(2);
    expect(result.warnings).toHaveLength(0); // BTS|2==2 and FTS|1==1
  });

  it("a trailing blank line is inter-message whitespace — the message re-parses identically", () => {
    // A blank segment immediately before a boundary is not part of the message;
    // splitBatch's per-message raw must re-parse to the same segments it reports.
    const stream =
      "BHS|^~\\&|A\r" +
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|1|P|2.5\rOBX|1||x\r\r" + // trailing blank
      "MSH|^~\\&|A|F|B|G|20260101||ADT^A01|2|P|2.5\rBTS|2\r";
    const result = splitBatch(stream);
    expect(result.messages).toHaveLength(2);
    const first = okMessage(result.messages[0]);
    // MSH + OBX only — the trailing blank is dropped like parseHL7 drops a
    // trailing CR, and the reported message equals a standalone parse of its raw.
    expect(first.rawSegments.map((s) => s.name)).toEqual(["MSH", "OBX"]);
    expect(parseHL7(result.messages[0]?.raw ?? "").rawSegments.length).toBe(
      first.rawSegments.length,
    );
    expect(result.warnings).toHaveLength(0);
  });

  it("a lone BTS closing nothing (no messages, no BHS) is ignored, not a phantom batch", () => {
    const result = splitBatch("BTS|2\r");
    expect(result.messages).toHaveLength(0);
    expect(result.batches).toHaveLength(0);
    expect(result.actualBatchCount).toBe(0);
    // No phantom empty batch, so no fabricated "declares 2 but 0 found" mismatch.
    expect(result.warnings).toHaveLength(0);
  });

  it("freezes the result, its batches, messages, and warnings (immutability)", () => {
    const result = splitBatch(fixture("count-mismatch"));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.messages)).toBe(true);
    expect(Object.isFrozen(result.batches)).toBe(true);
    expect(Object.isFrozen(result.batches[0])).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
  });
});
