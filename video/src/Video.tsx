import React from "react";
import { AbsoluteFill, interpolate, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import config from "../config.json";
import { Subtitle } from "./kit";
import { Bench, Can, Games, Hook, Outro, Tiers, Why, type SceneProps } from "./scenes";
import { BenchTall, CanTall, GamesTall, HookTall, TiersTall, WhyTall } from "./scenes-tall";
import type { Config, VideoProps } from "./types";

const SCENES: Record<string, React.FC<SceneProps>> = { hook: Hook, why: Why, can: Can, games: Games, bench: Bench, tiers: Tiers };
const SCENES_TALL: Record<string, React.FC<SceneProps>> = { hook: HookTall, why: WhyTall, can: CanTall, games: GamesTall, bench: BenchTall, tiers: TiersTall };

export const AtelierIntro: React.FC<VideoProps> = ({ timeline, games, layout = "wide" }) => {
  const tall = layout === "tall";
  if (!timeline) return <AbsoluteFill style={{ background: "#26342e" }} />;
  const cfg = config as Config;
  const fetchedDate = new Date(timeline.fetchedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\.\s?$/, "");
  const credits = [
    ...cfg.credits.map((block) => ({
      head: block.head,
      body: block.body.flatMap((text) => {
        if (text === "{games}") {
          const titles = games.map((g) => g.title);
          return [titles.slice(0, 4).join(" · "), titles.slice(4).join(" · ")].filter(Boolean);
        }
        if (text === "{voice}") {
          return [cfg.tts.engine === "supertonic" ? "Supertonic (Supertone) · AI 음성" : "Microsoft Edge TTS · AI 음성", cfg.tts.voice];
        }
        return [text.replace("{fetchedDate}", fetchedDate)];
      }),
    })),
    ...(cfg.music ? [{ head: "음악", body: [cfg.music.credit] }] : []),
  ];
  const lines = timeline.scenes.flatMap((scene) => [...scene.lines, ...(scene.spots ?? []).map((spot) => spot.line)]);
  const outro = timeline.scenes.find((scene) => scene.id === "outro");
  // Music sits low under the voice, lifts a little between lines, and comes up for the credits.
  const musicVolume = (f: number) => {
    const speaking = lines.some((l) => f >= l.from - 4 && f <= l.from + l.frames + 4);
    const base = outro?.blurAt && f >= outro.blurAt ? interpolate(f, [outro.blurAt, outro.blurAt + 30], [0.16, 0.42], { extrapolateRight: "clamp" }) : speaking ? 0.13 : 0.2;
    const fade = interpolate(f, [0, 20, timeline.totalFrames - 75, timeline.totalFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return base * fade;
  };

  return (
    <AbsoluteFill style={{ background: "#26342e" }}>
      {timeline.scenes.map((scene) => {
        const Component = (tall ? SCENES_TALL : SCENES)[scene.id];
        return (
          <Sequence key={scene.id} from={scene.from} durationInFrames={scene.frames} name={scene.id}>
            {scene.id === "outro" ? (
              <Outro scene={scene} games={games} config={cfg} credits={credits} closing="해보시고, 한마디 남겨주세요." siteUrl={cfg.siteUrl} tall={tall} />
            ) : (
              <Component scene={scene} games={games} config={cfg} />
            )}
          </Sequence>
        );
      })}
      {lines.map((line) => (
        <Sequence key={`v${line.from}`} from={line.from} durationInFrames={line.frames} layout="none" name={line.sub}>
          <Audio src={staticFile(line.src)} />
        </Sequence>
      ))}
      {lines.map((line) => (
        <Sequence key={`s${line.from}`} from={line.from} durationInFrames={line.frames + 6} name="subtitle">
          {tall ? <Subtitle text={line.sub} bottom={23} maxWidth={48} size={2.4} /> : <Subtitle text={line.sub} />}
        </Sequence>
      ))}
      {cfg.music ? (
        <Audio
          src={staticFile(cfg.music.src)}
          volume={musicVolume}
        />
      ) : null}
    </AbsoluteFill>
  );
};
