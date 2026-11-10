import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Reads the token from an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

/**
 * Upload API keys are 32 random bytes, so a plain SHA-256 is enough to store them:
 * there is nothing to brute-force, and the hash doubles as the document id for a direct lookup.
 */
export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** A new upload API key. The `atl_` prefix makes a leaked key recognizable in logs and scanners. */
export function newApiKey(): string {
  return `atl_${randomBytes(32).toString("base64url")}`;
}

/** The part of a key that is safe to show in a list, enough to tell keys apart. */
export function keyPreview(key: string): string {
  return key.slice(0, 8);
}

/** A one-time token the CLI keeps to itself while waiting for approval. */
export function newPollToken(): string {
  return randomBytes(32).toString("base64url");
}

// No vowels or look-alike characters (0/O, 1/I/L), so codes are easy to read aloud and never spell words.
const CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXZ23456789";

/** The short code shown in the terminal and on the approval page, e.g. `BX4K-9TQM`. */
export function newUserCode(): string {
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** Normalizes what a person types (lowercase, no dash, spaces) into the stored form, or null. */
export function normalizeUserCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 8 || [...compact].some((char) => !CODE_ALPHABET.includes(char))) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

/** Constant-time comparison of two hex digests. */
export function sameDigest(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
