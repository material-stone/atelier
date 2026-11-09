// Builds the narration from the live game data, speaks every line (edge-tts or Supertonic),
// and lays out the whole timeline (scenes, line cues, subtitles) from the real audio lengths.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FPS = 30;
const config = JSON.parse(await readFile(path.join(root, "config.json"), "utf8"));
const { games, fetchedAt } = JSON.parse(await readFile(path.join(root, "public", "data", "games.json"), "utf8"));
const tts = config.tts;

// Native Korean counting for "N개", which TTS reads as Sino-Korean digits otherwise.
function countWord(n) {
  const ones = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"];
  if (n < 10) return ones[n];
  if (n < 20) return "열" + ones[n - 10];
  if (n < 30) return "스물" + ones[n - 20];
  return String(n);
}
const line = (sub, say = sub) => ({ sub, say });

const bench = games.find((game) => game.id === config.benchGameId);
const spotGames = games.filter((game) => game.id !== config.benchGameId);

// Short on purpose: one fact per line, no warm-up sentences.
const scenes = [
  { id: "hook", lines: [line("게임은 보통 다 만들어진 다음에야 나오죠."), line("저는 그 전에 보여드리고 싶었어요.")] },
  {
    id: "why",
    lines: [
      line("Atelier는 Material Stone Games의 작업실이에요.", "아틀리에는 머티리얼 스톤 게임즈의 작업실이에요."),
      line("보통은 다 만든 다음에 공개하지만,"),
      line("여기선 만드는 중에 올리고, 의견을 듣고, 다듬어요."),
    ],
  },
  {
    id: "can",
    lines: [
      line("브라우저에서 바로 플레이하고,"),
      line("좋아요와 댓글로 의견을 남겨요."),
      line("커뮤니티 글은 한 달 뒤 정리되고, 1위 글만 남아요.", "커뮤니티 글은 한 달 뒤 정리되고, 일 위 글만 남아요."),
    ],
  },
  {
    id: "games",
    tail: 0.1,
    lines: [line(`지금 게임은 ${games.length}개예요.`, `지금 게임은 ${countWord(games.length)} 개예요.`)],
    spots: spotGames.map((game) => {
      const custom = config.gameLines[game.id];
      return { gameId: game.id, line: custom ? line(custom.sub, custom.say ?? custom.sub) : line(`${game.title}.`) };
    }),
  },
  ...(bench
    ? [{
        id: "bench",
        lines: [
          line(`지금 만드는 건 ${bench.title}예요.`),
          line("무기 순서를 짜면 알아서 싸우는 게임이에요."),
          line("아직 프로토타입이라 구독자에게 먼저 열었어요."),
        ],
      }]
    : []),
  {
    id: "tiers",
    lines: [
      line("퍼블릭은 누구나, 로그인은 구글 로그인만 하면 돼요."),
      line("구독자 게임은 유튜브 구독자에게 열리고,"),
      line("매주 월요일 3~5개는 누구나 할 수 있어요.", "매주 월요일 세 개에서 다섯 개는 누구나 할 수 있어요."),
      line("멤버는 채널 멤버십 회원용이에요."),
    ],
  },
  { id: "outro", tail: 0, lines: [line("만드는 대로 계속 올릴게요."), line("해보시고, 한마디 남겨주세요.")] },
];

const voiceDir = path.join(root, "public", "voice");
await mkdir(voiceDir, { recursive: true });
const remotionCli = path.join(root, "node_modules", "@remotion", "cli", "remotion-cli.js");

const fileFor = (text) => {
  const key = createHash("sha1").update(`${JSON.stringify(tts)}|${text}`).digest("hex").slice(0, 16);
  return `${key}.${tts.engine === "supertonic" ? "wav" : "mp3"}`;
};

// Speak every line that has no audio yet. Supertonic runs as one batch so the model loads once.
const allLines = scenes.flatMap((scene) => [...scene.lines, ...(scene.spots ?? []).map((spot) => spot.line)]);
const missing = [...new Set(allLines.map((l) => l.say))].filter((text) => !existsSync(path.join(voiceDir, fileFor(text))));
if (missing.length && tts.engine === "supertonic") {
  const jobs = missing.map((text) => ({ text, out: path.join(voiceDir, fileFor(text)) }));
  execFileSync("python", ["-I", path.join(root, "scripts", "supertonic-batch.py"), JSON.stringify({ ...tts, jobs })], { stdio: "inherit" });
} else {
  for (const text of missing) {
    execFileSync("python", ["-m", "edge_tts", "--voice", tts.voice, `--rate=${tts.rate}`, "--text", text, "--write-media", path.join(voiceDir, fileFor(text))], { stdio: "inherit" });
  }
}

function measure(text) {
  const name = fileFor(text);
  const seconds = Number(
    execFileSync(process.execPath, [remotionCli, "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(voiceDir, name)], { encoding: "utf8" }).trim(),
  );
  return { src: `voice/${name}`, frames: Math.ceil(seconds * FPS) };
}

const sec = (s) => Math.round(s * FPS);
const GAP = sec(0.1);
let cursor = 0;
const timeline = [];
const subtitles = [];

function placeLines(lines, start) {
  let t = start;
  return lines.map((l, index) => {
    const audio = measure(l.say);
    const placed = { sub: l.sub, src: audio.src, from: t, frames: audio.frames };
    subtitles.push({ from: t, to: t + audio.frames, text: l.sub });
    t += audio.frames + (index < lines.length - 1 ? GAP : 0);
    return placed;
  });
}

for (const scene of scenes) {
  const from = cursor;
  const lines = placeLines(scene.lines, from + sec(scene.lead ?? 0.2));
  let end = lines.at(-1).from + lines.at(-1).frames + sec(scene.tail ?? 0.3);
  const entry = { id: scene.id, from, lines };
  if (scene.spots) {
    entry.spots = scene.spots.map((spot) => {
      const spotFrom = end;
      const [placed] = placeLines([spot.line], spotFrom + sec(0.08));
      const spotEnd = Math.max(placed.from + placed.frames + sec(0.15), spotFrom + sec(1.5));
      end = spotEnd;
      return { gameId: spot.gameId, from: spotFrom, frames: spotEnd - spotFrom, line: placed };
    });
    end += sec(0.1);
  }
  if (scene.id === "outro") {
    entry.blurAt = end + sec(0.3);
    entry.rollAt = entry.blurAt + sec(0.9);
    entry.rollFrames = sec(12);
    end = entry.rollAt + entry.rollFrames + sec(1.2);
  }
  entry.frames = end - from;
  timeline.push(entry);
  cursor = end;
}

const out = { fps: FPS, totalFrames: cursor, fetchedAt, scenes: timeline };
await writeFile(path.join(root, "public", "data", "timeline.json"), JSON.stringify(out, null, 2));

// SRT for uploading to YouTube alongside the burned-in subtitles.
const stamp = (frame) => {
  const ms = Math.round((frame / FPS) * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};
await mkdir(path.join(root, "out"), { recursive: true });
await writeFile(
  path.join(root, "out", "atelier-intro.srt"),
  subtitles.map((s, i) => `${i + 1}\n${stamp(s.from)} --> ${stamp(s.to)}\n${s.text}\n`).join("\n"),
);
console.log(`총 ${(cursor / FPS).toFixed(1)}초, 장면 ${timeline.length}개, 자막 ${subtitles.length}줄`);
