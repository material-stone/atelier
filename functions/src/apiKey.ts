import { createHash, timingSafeEqual } from "node:crypto";

/** Reads the token from an `Authorization: Bearer <token>` header. */
export function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

/**
 * Compares the presented key with the configured one in constant time.
 * Hashing first gives both sides the same length, so the comparison leaks neither content nor length.
 * An empty configured key never matches, so a missing secret cannot open the API.
 */
export function apiKeyMatches(presented: string | null, configured: string): boolean {
  if (!presented || !configured) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(configured));
}
