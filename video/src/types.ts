export type AccessLevel = "public" | "login" | "subscriber" | "member";

export type Game = {
  id: string;
  title: string;
  accessLevel: AccessLevel;
  genres: string[];
  description: string;
  createdAt: string;
  cover?: string;
};

export type Line = { sub: string; src: string; from: number; frames: number };

export type Spot = { gameId: string; from: number; frames: number; line: Line };

export type Scene = {
  id: "hook" | "why" | "can" | "games" | "bench" | "tiers" | "outro";
  from: number;
  frames: number;
  lines: Line[];
  spots?: Spot[];
  blurAt?: number;
  rollAt?: number;
  rollFrames?: number;
};

export type Timeline = { fps: number; totalFrames: number; fetchedAt: string; scenes: Scene[] };

export type Config = {
  tts: { engine: "edge" | "supertonic"; voice: string };
  siteUrl: string;
  benchGameId: string;
  wipGameIds: string[];
  gameNotes: Record<string, string>;
  bench: { kicker: string; headline: string; points: string[] };
  music: { src: string; credit: string } | null;
  credits: { head: string; body: string[] }[];
};

export type VideoProps = { timeline: Timeline | null; games: Game[]; layout?: "wide" | "tall" };
