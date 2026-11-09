import { describe, expect, it } from "vitest";
import type { Game } from "../types";
import { filterGames, popularGenres } from "./search";
import { pushRecent } from "./recent";

function game(id: string, title: string, genres: string[]): Game {
  return { id, title, titleKey: title.toLowerCase(), description: "", genres, accessLevel: "public", buildVersionId: "v", buildStatus: "published", likeCount: 0 };
}

const games = [
  game("serpent", "Stone Serpent", ["Arcade", "Classic"]),
  game("drop", "Stone Drop", ["Puzzle"]),
  game("comet", "Comet Dodge", ["Action", "Arcade"]),
  game("pairs", "Stone Pairs", ["Puzzle", "Casual"]),
];
const ids = (list: Game[]) => list.map((item) => item.id);

describe("filterGames", () => {
  it("shows every game when the query is empty", () => {
    expect(ids(filterGames(games, ""))).toEqual(["serpent", "drop", "comet", "pairs"]);
    expect(ids(filterGames(games, "   "))).toHaveLength(4);
  });

  it("matches titles and genres without caring about case", () => {
    expect(ids(filterGames(games, "stone"))).toEqual(["serpent", "drop", "pairs"]);
    expect(ids(filterGames(games, "PUZZLE"))).toEqual(["drop", "pairs"]);
  });

  it("limits #words to genre tags", () => {
    expect(ids(filterGames(games, "#arc"))).toEqual(["serpent", "comet"]);
    expect(ids(filterGames(games, "#comet"))).toEqual([]);
    expect(ids(filterGames(games, "#"))).toHaveLength(4);
  });

  it("requires every word and the selected tag", () => {
    expect(ids(filterGames(games, "stone #puzzle"))).toEqual(["drop", "pairs"]);
    expect(ids(filterGames(games, "stone", "Arcade"))).toEqual(["serpent"]);
    expect(ids(filterGames(games, "", "casual"))).toEqual(["pairs"]);
  });
});

describe("popularGenres", () => {
  it("orders tags by how many games use them", () => {
    expect(popularGenres(games)).toEqual(["Arcade", "Puzzle", "Action", "Casual", "Classic"]);
  });
});

describe("pushRecent", () => {
  it("moves the game to the front without duplicates and caps the list", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
    expect(pushRecent([], "a")).toEqual(["a"]);
  });
});
