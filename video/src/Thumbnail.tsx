import React from "react";
import config from "../config.json";
import { COLOR, FONT, Hand, Mat, Paper, Polaroid, Ruler, u } from "./kit";
import type { Config, Game } from "./types";

// YouTube thumbnail in the same workbench world: one big line of copy, and the games on the bench.
// Covers stay whole and uncovered, like in the video.
export const Thumbnail: React.FC<{ games: Game[] }> = ({ games }) => {
  const cfg = config as Config;
  const bench = games.find((g) => g.id === cfg.benchGameId);
  const wip = games.filter((g) => cfg.wipGameIds.includes(g.id));
  const [top, bottom] = [wip[0], bench].filter(Boolean) as Game[];

  return (
    <Mat>
      <Ruler />
      <div style={{ position: "absolute", left: u(4), top: u(10), width: u(52), transform: "rotate(-2deg)" }}>
        <Paper style={{ padding: `${u(2.6)}px ${u(3)}px ${u(3)}px` }}>
          <div style={{ fontFamily: FONT.mono, fontSize: u(1.9), letterSpacing: "0.16em", color: COLOR.pencil }}>ATELIER</div>
          <div style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(6.4), lineHeight: 1.12, marginTop: u(0.8), letterSpacing: "-0.02em" }}>
            만드는 중인 게임,
            <br />
            <span style={{ background: "linear-gradient(transparent 55%, rgba(255,113,68,.55) 55%)" }}>먼저 해보세요</span>
          </div>
        </Paper>
      </div>
      <Hand size={4.6} style={{ position: "absolute", left: u(7), top: u(40), transform: "rotate(-3deg)" }}>설치 없이 브라우저에서 바로</Hand>
      {top?.cover ? (
        <div style={{ position: "absolute", left: u(62), top: u(4), transform: "rotate(4deg)" }}>
          <Polaroid src={top.cover} width={32} caption={`${top.title} · 다듬는 중`} captionSize={3} />
        </div>
      ) : null}
      {bottom?.cover ? (
        <div style={{ position: "absolute", left: u(60), top: u(28), transform: "rotate(-3deg)" }}>
          <Polaroid src={bottom.cover} width={32} caption={`${bottom.title} · 프로토타입`} captionSize={3} />
        </div>
      ) : null}
    </Mat>
  );
};

// Instagram Reels cover (9:16). The profile grid crops it to the middle 3:4, so everything sits in y 12.5..87.5u.
export const ReelCover: React.FC<{ games: Game[] }> = ({ games }) => {
  const cfg = config as Config;
  const bench = games.find((g) => g.id === cfg.benchGameId);
  const wip = games.filter((g) => cfg.wipGameIds.includes(g.id));
  const [top, bottom] = [wip[0], bench].filter(Boolean) as Game[];
  return (
    <Mat>
      <div style={{ position: "absolute", left: u(4), top: u(15), width: u(48), transform: "rotate(-2deg)" }}>
        <Paper style={{ padding: `${u(2.4)}px ${u(2.6)}px ${u(2.8)}px` }}>
          <div style={{ fontFamily: FONT.mono, fontSize: u(1.8), letterSpacing: "0.16em", color: COLOR.pencil }}>ATELIER</div>
          <div style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(5.6), lineHeight: 1.12, marginTop: u(0.8), letterSpacing: "-0.02em" }}>
            만드는 중인 게임,
            <br />
            <span style={{ background: "linear-gradient(transparent 55%, rgba(255,113,68,.55) 55%)" }}>먼저 해보세요</span>
          </div>
        </Paper>
      </div>
      {top?.cover ? (
        <div style={{ position: "absolute", left: u(5), top: u(38), transform: "rotate(-3deg)" }}>
          <Polaroid src={top.cover} width={30} caption={`${top.title} · 다듬는 중`} captionSize={2.4} />
        </div>
      ) : null}
      {bottom?.cover ? (
        <div style={{ position: "absolute", left: u(21), top: u(60), transform: "rotate(3deg)" }}>
          <Polaroid src={bottom.cover} width={30} caption={`${bottom.title} · 프로토타입`} captionSize={2.4} />
        </div>
      ) : null}
    </Mat>
  );
};
