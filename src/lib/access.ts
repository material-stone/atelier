import type { AccessLevel, AuthState, Game, GameStage } from "../types";

// Keep in sync with functions/src/access.ts so the hub and the server agree on access and the rotation.
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

/** Levels anyone may list; private games are visible only to the emails on their allowlist. */
export const LISTED_ACCESS_LEVELS: AccessLevel[] = ["public", "member"];
/** What the game list asks Firestore for: also the retired "login" and "subscriber" levels, until every game is migrated. */
export const LISTED_STORED_LEVELS: string[] = [...LISTED_ACCESS_LEVELS, "login", "subscriber"];

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

export function rotationForGames(games: Game[], date = new Date()): Set<string> {
  return weeklyRotationIds(games.filter((game) => game.accessLevel === "member").map((game) => game.id), date);
}

export type Permission = { allowed: boolean; reason?: "login" | "subscriber" | "member" };

export function accessPermission(game: Pick<Game, "id" | "accessLevel">, auth: AuthState, rotation: Set<string>): Permission {
  const level = game.accessLevel;
  if (level === "public") return { allowed: true };
  if (!auth.user) return { allowed: false, reason: "login" };
  // A private game only reaches the client when the rules let this account read it; the server re-checks on play.
  if (auth.isAdmin || level === "private" || auth.isMember) return { allowed: true };
  if (!rotation.has(game.id)) return { allowed: false, reason: "member" };
  // Subscribers play this week's rotation of member games.
  return auth.isSubscriber ? { allowed: true } : { allowed: false, reason: "subscriber" };
}

/** Short Korean badge for who may play; "누구나" games usually show no badge at all. */
export function accessShortLabel(level: AccessLevel): string {
  if (level === "public") return "누구나";
  if (level === "private") return "초대";
  return "멤버";
}

export function stageLabel(stage: GameStage): string {
  if (stage === "demo") return "데모";
  if (stage === "prototype") return "프로토타입";
  return "공개";
}
