const RECENT_KEY = "atelier:recent-games";
export const MAX_RECENT = 3;

/** Moves the game to the front, drops duplicates and keeps at most `max` ids. */
export function pushRecent(ids: string[], gameId: string, max = MAX_RECENT): string[] {
  return [gameId, ...ids.filter((id) => id !== gameId)].slice(0, max);
}

// Storage can be missing or blocked (private mode, embedded views); recent plays are only a convenience.
export function loadRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function saveRecent(ids: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    // Ignore: the list just won't survive a reload.
  }
}
