import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  decryptToken,
  encryptToken,
  isEncrypted,
  secretsEqual,
  tokenEncryptionReady,
} from "./secrets";

const KEY = randomBytes(32).toString("base64");
const original = process.env.CHANNEL_TOKEN_KEY;

beforeEach(() => {
  process.env.CHANNEL_TOKEN_KEY = KEY;
});

afterEach(() => {
  if (original === undefined) delete process.env.CHANNEL_TOKEN_KEY;
  else process.env.CHANNEL_TOKEN_KEY = original;
});

describe("token encryption", () => {
  it("round-trips a token", () => {
    const token = "ya29.a0AfH6SMBx-refresh-token-example";
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it("round-trips awkward values", () => {
    for (const value of ["", "a", "é🔒", "x".repeat(4096), '{"json":"token"}']) {
      expect(decryptToken(encryptToken(value))).toBe(value);
    }
  });

  it("produces a different ciphertext every time", () => {
    // A deterministic ciphertext tells anyone with the database which sellers
    // share a token, and reveals when one has been rotated.
    const a = encryptToken("same-token");
    const b = encryptToken("same-token");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(decryptToken(b));
  });

  it("never stores the plaintext in the output", () => {
    const token = "super-secret-refresh-token";
    expect(encryptToken(token)).not.toContain(token);
  });

  it("refuses a tampered ciphertext rather than returning garbage", () => {
    // The reason for GCM over CBC: without the tag, flipping bits in the
    // ciphertext yields a plausible-looking token instead of an error.
    const stored = encryptToken("token");
    const [scheme, iv, tag, body] = stored.split(".");
    const flipped = Buffer.from(body, "base64");
    flipped[0] ^= 0xff;
    const tampered = [scheme, iv, tag, flipped.toString("base64")].join(".");

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("refuses a value encrypted under a different key", () => {
    const stored = encryptToken("token");
    process.env.CHANNEL_TOKEN_KEY = randomBytes(32).toString("base64");
    expect(() => decryptToken(stored)).toThrow();
  });

  it("refuses a legacy plaintext value instead of returning it", () => {
    // The dangerous failure would be silently passing a plaintext token
    // through as though it had been decrypted.
    expect(() => decryptToken("plain-old-token")).toThrow(/format/);
    expect(isEncrypted("plain-old-token")).toBe(false);
    expect(isEncrypted(encryptToken("x"))).toBe(true);
  });

  it("says what to do when the key is missing", () => {
    delete process.env.CHANNEL_TOKEN_KEY;
    expect(tokenEncryptionReady()).toBe(false);
    expect(() => encryptToken("x")).toThrow(/CHANNEL_TOKEN_KEY/);
  });

  it("rejects a key that isn't 32 bytes", () => {
    // A passphrase pasted in instead of base64 random bytes is the likely
    // mistake, and it must fail loudly rather than silently weakening AES.
    process.env.CHANNEL_TOKEN_KEY = Buffer.from("hunter2").toString("base64");
    expect(tokenEncryptionReady()).toBe(false);
    expect(() => encryptToken("x")).toThrow(/32 bytes/);
  });
});

describe("secretsEqual", () => {
  it("matches identical secrets and rejects everything else", () => {
    expect(secretsEqual("abc123", "abc123")).toBe(true);
    expect(secretsEqual("abc123", "abc124")).toBe(false);
    expect(secretsEqual("abc123", "abc1234")).toBe(false);
    expect(secretsEqual("", "")).toBe(true);
    expect(secretsEqual("", "x")).toBe(false);
  });
});
