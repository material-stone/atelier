import type { AccessLevel, AuthState, Game } from "../types";

// Keep in sync with functions/src/access.ts so the hub and the server agree on the rotation.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 1970-01-01 was a Thursday; shifting by 3 days makes weeks start on Monday (KST).
const MONDAY_SHIFT_MS = 3 * 24 * 60 * 60 * 1000;
const ROTATION_MIN = 3;
const ROTATION_MAX = 5;

export function isAccessLevel(value: unknown): value is AccessLevel {
  return value === "public" || value === "login" || value === "subscriber" || value === "member" || value === "private";
}

/** Levels anyone may list; private games are visible only to the emails on their allowlist. */
export const LISTED_ACCESS_LEVELS: AccessLevel[] = ["public", "login", "subscriber", "member"];

const EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

/** Splits a comma/newline separated list into unique lowercase emails, and reports anything malformed. */
export function parseEmailList(value: string): { emails: string[]; invalid: string[] } {
  const items = value.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(items)];
  return { emails: unique.filter((item) => EMAIL_PATTERN.test(item)), invalid: unique.filter((item) => !EMAIL_PATTERN.test(item)) };
}

export function weekIndex(date = new Date()): number {
  return Math.floor((date.getTime() + KST_OFFSET_MS + MONDAY_SHIFT_MS) / WEEK_MS);
}

function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 0x100000000;
  };
}

/** Subscriber games that everyone may play this week (3–5, stable for the whole KST week). */
export function weeklyRotationIds(subscriberGameIds: string[], date = new Date()): Set<string> {
  const random = seededRandom(weekIndex(date));
  const count = ROTATION_MIN + Math.floor(random() * (ROTATION_MAX - ROTATION_MIN + 1));
  const shuffled = [...subscriberGameIds].sort();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return new Set(shuffled.slice(0, count));
}

export function rotationForGames(games: Game[], date = new Date()): Set<string> {
  return weeklyRotationIds(games.filter((game) => game.accessLevel === "subscriber").map((game) => game.id), date);
}

export type Permission = { allowed: boolean; reason?: "login" | "subscriber" | "member" };

export function accessPermission(game: Pick<Game, "id" | "accessLevel">, auth: AuthState, rotation: Set<string>): Permission {
  const level = game.accessLevel;
  if (level === "public") return { allowed: true };
  if (level === "subscriber" && rotation.has(game.id)) return { allowed: true };
  if (!auth.user) return { allowed: false, reason: "login" };
  // A private game only reaches the client when the rules let this account read it; the server re-checks on play.
  if (auth.isAdmin || level === "login" || level === "private") return { allowed: true };
  if (level === "member") return auth.isMember ? { allowed: true } : { allowed: false, reason: "member" };
  if (auth.isSubscriber || auth.isMember) return { allowed: true };
  return { allowed: false, reason: "subscriber" };
}

/** Short Korean badge for lists and tags; accessLabel keeps the long form for the admin room. */
export function accessShortLabel(level: AccessLevel): string {
  if (level === "public") return "공개";
  if (level === "login") return "로그인";
  if (level === "subscriber") return "구독자";
  if (level === "private") return "초대";
  return "멤버";
}

export function accessLabel(level: AccessLevel): string {
  if (level === "public") return "PUBLIC";
  if (level === "login") return "DEMO / LOGIN";
  if (level === "subscriber") return "PROTOTYPE / SUBSCRIBER";
  if (level === "private") return "PRIVATE / INVITE ONLY";
  return "EARLY ACCESS / MEMBER";
}
