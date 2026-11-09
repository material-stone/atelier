import type { Game } from "../types";

/**
 * Home search. Every word must match: a plain word matches the title or a genre tag,
 * a word starting with # matches genre tags only. Matching ignores case and is a substring match.
 */
export function filterGames(games: Game[], query: string, tag: string | null = null): Game[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return games.filter((game) => {
    const genres = game.genres.map((genre) => genre.toLowerCase());
    if (tag && !genres.includes(tag.toLowerCase())) return false;
    return words.every((word) => {
      const bare = word.replace(/^#+/, "");
      if (!bare) return true;
      const inGenres = genres.some((genre) => genre.includes(bare));
      if (word.startsWith("#")) return inGenres;
      return inGenres || game.title.toLowerCase().includes(bare);
    });
  });
}

/** Genre tags ordered by how many games carry them, then alphabetically. */
export function popularGenres(games: Game[]): string[] {
  const counts = new Map<string, number>();
  for (const game of games) for (const genre of game.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([genre]) => genre);
}
