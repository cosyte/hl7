/**
 * `generateControlId`: synthesise an HL7 message control ID for outbound
 * messages. Shape: 17-char UTC timestamp `YYYYMMDDHHmmssSSS` + 6 random
 * alphanumeric chars = 23 chars total.
 *
 * Decisions:
 * - Exact shape above; uniqueness via `Date.now()` + cryptographic
 *   random draws (it was `Math.random` originally); alphabet is plain
 *   `[A-Za-z0-9]` (readability doesn't matter: IDs aren't human-typed).
 * - The draws come from the Web Crypto global, `crypto.getRandomValues`,
 *   which Node.js, Bun and Deno all provide without an import. A static
 *   `import "node:crypto"` loaded the whole crypto module on every import of
 *   the package, a few milliseconds a caller paid before building anything;
 *   the global loads it on the first draw instead.
 * - The bytes are drawn a pool at a time (`RANDOM_POOL_BYTES`) and handed
 *   out one at a time, each byte once. One `getRandomValues` call for every
 *   ID made each ACK measurably slower than the cached draws of
 *   `node:crypto.randomInt` it replaced; a pool brings the per-ID cost back
 *   down. `randomInt` keeps such a pool for the same reason.
 * - Zero deps: runtime built-ins only.
 *
 * @internal
 */

/**
 * Alphabet for the random suffix: plain alphanumeric. Readability doesn't
 * matter (IDs aren't human-typed), so no ambiguous-char filtering.
 * @internal
 */
const ALNUM_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Zero-pad a number to N digits (stdlib: avoid regex for perf).
 * @internal
 */
function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * How many random bytes one `crypto.getRandomValues` call draws for control
 * IDs: about 165 IDs' worth, since an ID reads six bytes and skips one in 32.
 * @internal
 */
const RANDOM_POOL_BYTES = 1024;

/**
 * The random bytes behind every generated control ID, made on the first ID.
 * @internal
 */
let randomByte: (() => number) | undefined;

/**
 * Generate an HL7 message control ID. Shape: 17-char UTC timestamp
 * `YYYYMMDDHHmmssSSS` + 6 random alphanumeric chars = 23 chars total.
 *
 * Each of the 6 suffix characters comes from a cryptographically secure
 * random byte (`crypto.getRandomValues`, drawn a pool at a time) that samples
 * the 62-char alnum alphabet uniformly: it rejects bytes of 248 and above
 * rather than reducing every byte modulo 62, which would favor the first 8
 * characters. This avoids
 * the `Math.random` collision risk under heavy concurrent
 * load (many parallel workers generating IDs in the same millisecond): the
 * suffix carries 6 * log2(62), about 35.7 bits, and the 17-char ms
 * timestamp prefix further partitions the ID space.
 *
 * Zero dependencies: uses `Date` + the Web Crypto global only.
 *
 * @internal
 */
export function generateControlId(): string {
  const now = new Date();
  const ts =
    pad(now.getUTCFullYear(), 4) +
    pad(now.getUTCMonth() + 1, 2) +
    pad(now.getUTCDate(), 2) +
    pad(now.getUTCHours(), 2) +
    pad(now.getUTCMinutes(), 2) +
    pad(now.getUTCSeconds(), 2) +
    pad(now.getUTCMilliseconds(), 3);
  randomByte ??= byteSource((bytes) => globalThis.crypto.getRandomValues(bytes), RANDOM_POOL_BYTES);
  return ts + randomSuffix(randomByte);
}

/**
 * Random bytes drawn `size` at a time and handed out one at a time, each
 * once. `fill` writes a whole buffer of `size` bytes; it is first called for
 * the first byte, and again each time every byte drawn has been handed out.
 * `generateControlId` passes the Web Crypto global; a test passes its own.
 *
 * @internal
 */
export function byteSource(fill: (bytes: Uint8Array) => void, size: number): () => number {
  const pool = new Uint8Array(size);
  let next = size;
  return () => {
    if (next === size) {
      fill(pool);
      next = 0;
    }
    return pool[next++] as number;
  };
}

/**
 * The six random characters of a control ID, from the bytes `nextByte`
 * hands out. A byte below 248 maps onto the alphabet modulo 62; a byte of
 * 248 or more is skipped, and the next one read, until six characters are
 * accepted.
 *
 * @internal
 */
export function randomSuffix(nextByte: () => number): string {
  // The largest multiple of the alphabet's length that fits in a byte: 248,
  // four times 62. A byte below it, reduced modulo 62, lands on every character
  // with the same probability; a byte at or above it is skipped.
  const unbiasedLimit = 256 - (256 % ALNUM_ALPHABET.length);
  let suffix = "";
  while (suffix.length < 6) {
    const byte = nextByte();
    if (byte < unbiasedLimit) suffix += ALNUM_ALPHABET.charAt(byte % ALNUM_ALPHABET.length);
  }
  return suffix;
}
