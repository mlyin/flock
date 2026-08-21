import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Envelope encryption for marketplace OAuth tokens.
 *
 * `channel_accounts` holds access and refresh tokens for channels with a real
 * API. A refresh token is not a password but it is worth more than one: it
 * lists, delists, reprices and reads orders on the seller's marketplace
 * account, and unlike a password it does not prompt for a second factor.
 *
 * Storing those in plaintext means a Postgres dump — a backup file, a leaked
 * connection string, a support export — is enough to act as every seller who
 * has connected a channel. Encrypting with a key held OUTSIDE the database
 * makes the dump alone useless, which is the whole point: the two secrets have
 * to be stolen from two different places.
 *
 * AES-256-GCM, so a tampered ciphertext fails to decrypt rather than
 * decrypting to something attacker-chosen.
 */

const SCHEME = "v1";

/**
 * The key, as 32 raw bytes.
 *
 * Read at call time rather than module load: a missing key should fail the one
 * request that needs it, with a message saying what to do, not take the whole
 * app down at import and take every unrelated page with it.
 */
function key(): Buffer {
  const raw = process.env.CHANNEL_TOKEN_KEY;
  if (!raw) {
    throw new Error(
      "CHANNEL_TOKEN_KEY is not set. Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"\n" +
        "and put it in .env.local (and in the Vercel project's environment variables)."
    );
  }

  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) {
    throw new Error(
      `CHANNEL_TOKEN_KEY must decode to 32 bytes for AES-256; got ${bytes.length}. ` +
        "It should be base64 of 32 random bytes, not a passphrase."
    );
  }
  return bytes;
}

/** True when a key is configured and usable. For gating the connect flow. */
export function tokenEncryptionReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a token for storage.
 *
 * The output is self-describing — scheme, iv, tag, ciphertext — so a future
 * key rotation or algorithm change can read old rows and rewrite them rather
 * than guessing at what a bare blob was.
 */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12); // 96 bits, the size GCM is defined for
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [SCHEME, iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(
    "."
  );
}

/**
 * Decrypt a stored token.
 *
 * Throws on a wrong key, a truncated value, or any tampering — never returns a
 * partial or garbled string. A token we cannot decrypt is a token we must not
 * pretend to have.
 */
export function decryptToken(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 4) {
    throw new Error("Stored token is not in the expected format; it may predate encryption.");
  }

  const [scheme, iv, tag, body] = parts;
  if (scheme !== SCHEME) throw new Error(`Unknown token encryption scheme "${scheme}".`);

  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString(
    "utf8"
  );
}

/**
 * Whether a stored value is already encrypted.
 *
 * Lets a migration path tell a legacy plaintext token from a current one
 * without trying to decrypt every row and catching the failures.
 */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(`${SCHEME}.`) && stored.split(".").length === 4;
}

/**
 * Constant-time compare, for anywhere a caller-supplied token is checked
 * against a stored one.
 *
 * `a === b` on secrets leaks their common prefix through timing. It is a
 * narrow attack over a network, but the fix is one function call.
 */
export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length — compare lengths separately and always do the full compare.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
