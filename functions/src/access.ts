// Keep in sync with src/lib/access.ts so the hub and the server agree on access and the rotation.
export type AccessLevel = "public" | "member" | "private";
export type GameStage = "release" | "demo" | "prototype";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 1970-01-01 was a Thursday; shifting by 3 days makes weeks start on Monday (KST).
const MONDAY_SHIFT_MS = 3 * 24 * 60 * 60 * 1000;
const ROTATION_SHARE = 0.3;

export function isAccessLevel(value: unknown): value is AccessLevel {
  return value === "public" || value === "member" || value === "private";
}

export function isGameStage(value: unknown): value is GameStage {
  return value === "release" || value === "demo" || value === "prototype";
}

/**
 * The access level a stored value means today. Retired levels: "login" (demos) is open to everyone,
 * "subscriber" (prototypes) became member-only, with subscribers getting the weekly rotation.
 */
export function normalizeAccessLevel(value: unknown): AccessLevel | null {
  if (value === "login") return "public";
  if (value === "subscriber") return "member";
  return isAccessLevel(value) ? value : null;
}

/** Stage for games saved before stages existed, read off the old access level they were given. */
export function defaultStage(storedLevel: unknown): GameStage {
  if (storedLevel === "login") return "demo";
  if (storedLevel === "subscriber" || storedLevel === "member" || storedLevel === "private") return "prototype";
  return "release";
}

const EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
export const MAX_ALLOWED_EMAILS = 100;

/** Unique lowercase emails, or null when the input is not a list of valid addresses. */
export function normalizeEmailList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const emails = [...new Set(value.map((item) => (typeof item === "string" ? item.trim().toLowerCase() : "")))];
  if (emails.length > MAX_ALLOWED_EMAILS || emails.some((email) => email.length > 254 || !EMAIL_PATTERN.test(email))) return null;
  return emails;
}

export function weekIndex(date = new Date()): number {
  return Math.floor((date.getTime() + KST_OFFSET_MS + MONDAY_SHIFT_MS) / WEEK_MS);
}

// The first week of the 30% no-repeat rotation. Each week is derived from the one before, starting here.
const ROTATION_EPOCH_WEEK = weekIndex(new Date("2026-11-09T00:00:00+09:00"));

function seededRandom(seed: number): () => number {
  let state = Math.imul(seed, 0x9e3779b1) | 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 0x100000000;
  };
}

function shuffled(ids: string[], random: () => number): string[] {
  const list = [...ids];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [list[index], list[swap]] = [list[swap] as string, list[index] as string];
  }
  return list;
}

/** 30% of the pool, at least one game. */
export function rotationCount(poolSize: number): number {
  return poolSize ? Math.max(1, Math.round(poolSize * ROTATION_SHARE)) : 0;
}

/** Games picked last week go last, so they come back only when the rest of the pool cannot fill the week. */
function pickWeek(pool: string[], week: number, previous: Set<string>): Set<string> {
  const random = seededRandom(week);
  const fresh = shuffled(pool.filter((id) => !previous.has(id)), random);
  const repeats = shuffled(pool.filter((id) => previous.has(id)), random);
  return new Set([...fresh, ...repeats].slice(0, rotationCount(pool.length)));
}

/** Member games that subscribers may play this week: 30% of them, stable for the whole KST week, none repeated from last week when avoidable. */
export function weeklyRotationIds(memberGameIds: string[], date = new Date()): Set<string> {
  const pool = [...new Set(memberGameIds)].sort();
  const target = weekIndex(date);
  let picked = new Set<string>();
  for (let week = Math.min(ROTATION_EPOCH_WEEK, target); week <= target; week += 1) picked = pickWeek(pool, week, picked);
  return picked;
}
