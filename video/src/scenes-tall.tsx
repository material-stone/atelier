import React from "react";
import { interpolate, Sequence, useCurrentFrame } from "remotion";
import { COLOR, Drop, Fade, FONT, Hand, Mat, Paper, Polaroid, Sfx, Stroke, TIER, u } from "./kit";
import { ActionCard, benchOf, cue, FlowBox, Kicker, lineEnd, Tag, TierChip, type SceneProps } from "./scenes";
import type { AccessLevel, Game, Spot } from "./types";

/*
 * Instagram Reels layouts (1080x1920 = 56.25u x 100u).
 * Instagram draws its own UI over the top ~11u, the bottom ~22u and the right ~6u,
 * so everything that matters sits in x 3..50u, y 12..67u, and the subtitle sits in 68..77u just above the bottom UI.
 */

/* ---------- 1. Hook ---------- */
export const HookTall: React.FC<SceneProps> = ({ scene, games, config }) => {
  const shelf = games.filter((g) => g.id !== config.benchGameId);
  const bench = benchOf(games, config);
  const pics = [shelf[0], bench ?? shelf[1]].filter(Boolean) as Game[];
  return (
    <Mat>
      <Drop at={4} rotate={-1.5} boil style={{ left: u(4), top: u(14), width: u(48) }}>
        <Paper style={{ padding: `${u(2.6)}px ${u(2.6)}px ${u(2.4)}px` }}>
          <Kicker>ATELIER · MATERIAL STONE GAMES</Kicker>
          <div style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(4.2), lineHeight: 1.22, marginTop: u(1) }}>
            지금 만드는 게임,
            <br />
            <span style={{ background: `linear-gradient(transparent 58%, rgba(255,113,68,.45) 58%)` }}>먼저 플레이하세요.</span>
          </div>
        </Paper>
      </Drop>
      {pics[0]?.cover ? (
        <Drop at={cue(scene, 1)} rotate={-4} style={{ left: u(3), top: u(33) }}>
          <Polaroid src={pics[0].cover} width={25} caption={pics[0].title} />
        </Drop>
      ) : null}
      {pics[1]?.cover ? (
        <Drop at={cue(scene, 1, 0.45)} rotate={4} style={{ left: u(29), top: u(46) }}>
          <Polaroid src={pics[1].cover} width={24} caption={pics[1].title} />
        </Drop>
      ) : null}
    </Mat>
  );
};

/* ---------- 2. Why ---------- */
const flowTall: React.CSSProperties = { display: "flex", alignItems: "center", gap: u(1), fontFamily: FONT.hand, fontSize: u(3.4), color: COLOR.ink, whiteSpace: "nowrap" };
const labelTall: React.CSSProperties = { fontFamily: FONT.mono, fontSize: u(1.2), letterSpacing: "0.1em", color: COLOR.pencil };

export const WhyTall: React.FC<SceneProps> = ({ scene }) => {
  const frame = useCurrentFrame();
  const strikeAt = lineEnd(scene, 1) - 10;
  const strike = interpolate(frame - strikeAt, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const step = (i: number) => cue(scene, 2, i * 0.22);
  return (
    <Mat>
      <Drop at={2} rotate={0.6} style={{ left: u(3.5), top: u(13), width: u(49) }}>
        <Paper style={{ height: u(50), padding: `${u(2.6)}px ${u(3)}px`, background: `${COLOR.paper} repeating-linear-gradient(transparent 0 ${u(3.9)}px, rgba(95,139,255,.18) ${u(3.9)}px ${u(4)}px)` }}>
          <Kicker>WHY ATELIER</Kicker>
          <Hand size={3.4} color={COLOR.ink} style={{ marginTop: u(0.6) }}>작업실 문을 열어둔 이유</Hand>
          <Fade at={cue(scene, 1)} style={{ left: u(3), top: u(12) }}>
            <div style={labelTall}>보통</div>
            <div style={{ ...flowTall, position: "relative", marginTop: u(0.6) }}>
              <span>만들기</span><span style={{ color: COLOR.pencil }}>→</span><span>완성</span><span style={{ color: COLOR.pencil }}>→</span><FlowBox>공개</FlowBox>
              <i style={{ position: "absolute", left: -u(1), right: -u(1), top: "52%", height: u(0.35), background: COLOR.marker, transform: `rotate(-3deg) scaleX(${strike})`, transformOrigin: "left" }} />
            </div>
          </Fade>
          <Fade at={cue(scene, 2)} style={{ left: u(3), top: u(22.5) }}>
            <div style={labelTall}>ATELIER</div>
          </Fade>
          {["만들기", "공개", "의견", "다듬기"].map((word, i) => (
            <Fade key={word} at={step(i)} frames={6} style={{ left: u(5), top: u(25.5 + i * 6) }}>
              <div style={flowTall}>
                {i > 0 ? <span style={{ color: COLOR.pencil, marginLeft: -u(3) }}>↓</span> : null}
                {i === 0 ? <span>{word}</span> : <FlowBox hot>{word}</FlowBox>}
              </div>
            </Fade>
          ))}
          <Stroke at={step(3) + 6} viewBox="0 0 60 120" d="M10 112 C 50 100, 56 40, 30 10 M30 10 l-2 12 M30 10 l10 7" width={2.6} style={{ left: u(25), top: u(26), width: u(10) }} />
          <Fade at={step(3) + 12} style={{ left: u(30), top: u(36) }}>
            <Hand size={3}>계속 반복!</Hand>
          </Fade>
        </Paper>
      </Drop>
      <Sfx at={strikeAt} name="marker" volume={0.35} />
    </Mat>
  );
};

/* ---------- 3. What you can do ---------- */
export const CanTall: React.FC<SceneProps> = ({ scene }) => (
  <Mat>
    <Fade at={4} style={{ left: u(4), top: u(12.5) }}>
      <Hand size={3.4} color="#f2eee4">여기서 할 수 있는 것</Hand>
    </Fade>
    <Drop at={cue(scene, 0)} rotate={-2} boil style={{ left: u(4), top: u(18) }}>
      <ActionCard icon="▶" title="플레이" text="설치 없이 브라우저에서 바로" />
    </Drop>
    <Drop at={cue(scene, 1)} rotate={1.5} boil style={{ left: u(28), top: u(24) }}>
      <ActionCard icon="♡" iconColor={COLOR.marker} title="좋아요" text="마음에 든 빌드에 하나" />
    </Drop>
    <Drop at={cue(scene, 1, 0.45)} rotate={-1} boil style={{ left: u(6), top: u(36) }}>
      <ActionCard icon="✎" title="댓글" text="플레이테스트 노트로 남는 의견" />
    </Drop>
    <Drop at={cue(scene, 2)} rotate={-1} style={{ left: u(4), top: u(53), width: u(47) }}>
      <Paper color={COLOR.sticky} tape={false} style={{ padding: `${u(1.4)}px ${u(2)}px` }}>
        <div style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(2.2) }}>커뮤니티</div>
        <div style={{ fontFamily: FONT.hand, fontSize: u(2.7), lineHeight: 1.15, marginTop: u(0.4) }}>짧은 글 + 사진 한 장 · 한 달 뒤 정리 · 그달 좋아요 1위만 남아요</div>
      </Paper>
    </Drop>
  </Mat>
);

/* ---------- 4. Games ---------- */
const SpotTall: React.FC<{ game: Game; index: number; total: number; wip: boolean; note: string }> = ({ game, index, total, wip, note }) => {
  const tilt = index % 2 === 0 ? -1.5 : 1.2;
  return (
    <>
      {game.cover ? (
        <Drop at={0} rotate={tilt} style={{ left: u(7), top: u(12.5) }}>
          <Polaroid src={game.cover} width={42} caption={game.title} captionSize={2.6} />
        </Drop>
      ) : null}
      <Drop at={5} rotate={-tilt * 0.6} sound={false} style={{ left: u(5), top: u(51), width: u(46) }}>
        <Paper style={{ padding: `${u(2.2)}px ${u(2.4)}px ${u(2)}px` }}>
          <Kicker>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</Kicker>
          <div style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(3.4), marginTop: u(0.4), lineHeight: 1.2 }}>{game.title}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: u(0.6), marginTop: u(0.8) }}>
            <TierChip level={game.accessLevel} />
            {wip ? <Tag hot>계속 다듬는 중</Tag> : null}
            {game.genres.map((genre) => <Tag key={genre}>{genre}</Tag>)}
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: u(1.6), lineHeight: 1.5, color: "#3d4245", marginTop: u(1) }}>{note}</div>
        </Paper>
      </Drop>
    </>
  );
};

export const GamesTall: React.FC<SceneProps> = ({ scene, games, config }) => {
  const spots = scene.spots ?? [];
  const firstSpot = spots.length ? spots[0].from - scene.from : scene.frames;
  const byId = new Map(games.map((g) => [g.id, g]));
  return (
    <Mat>
      <Sequence durationInFrames={firstSpot} layout="none">
        {games.map((game, i) => (
          <Drop key={game.id} at={2 + i * 3} sound={i % 2 === 0} rotate={((i * 37) % 7) - 3} style={{ left: u(3.5 + (i % 3) * 16.5), top: u(18 + Math.floor(i / 3) * 17.5) }}>
            {game.cover ? <Polaroid src={game.cover} width={15.5} caption={game.title} tape={false} captionSize={1.9} /> : null}
          </Drop>
        ))}
      </Sequence>
      {spots.map((spot: Spot, i) => {
        const game = byId.get(spot.gameId);
        if (!game) return null;
        const note = config.gameNotes[game.id] ?? game.description.split(/(?<=[.!?。])\s/)[0];
        return (
          <Sequence key={spot.gameId} from={spot.from - scene.from} durationInFrames={spot.frames + (i === spots.length - 1 ? 12 : 0)} layout="none">
            <SpotTall game={game} index={games.indexOf(game)} total={games.length} wip={config.wipGameIds.includes(game.id)} note={note} />
          </Sequence>
        );
      })}
      <Sequence durationInFrames={firstSpot} layout="none">
        <div style={{ position: "absolute", left: u(4), top: u(12) }}>
          <Hand size={3.4}>{`지금 ${games.length}개`}</Hand>
        </div>
      </Sequence>
    </Mat>
  );
};

/* ---------- 5. On the bench ---------- */
export const BenchTall: React.FC<SceneProps> = ({ scene, games, config }) => {
  const frame = useCurrentFrame();
  const game = benchOf(games, config);
  if (!game) return <Mat />;
  return (
    <Mat>
      <Fade at={10} frames={6} style={{ left: u(4), top: u(12), zIndex: 5 }}>
        <span style={{ display: "inline-block", fontFamily: FONT.mono, fontSize: u(1.4), letterSpacing: "0.1em", background: COLOR.marker, color: "#fff", padding: `${u(0.4)}px ${u(1)}px`, transform: "rotate(-5deg)" }}>NOW ON THE BENCH · 프로토타입</span>
      </Fade>
      {game.cover ? (
        <Drop at={2} rotate={-1} style={{ left: u(8), top: u(16.5) }}>
          <Polaroid src={game.cover} width={40} caption={`${game.title} · ${String(games.indexOf(game) + 1).padStart(2, "0")} / ${String(games.length).padStart(2, "0")}`} captionSize={2.8} />
        </Drop>
      ) : null}
      <Drop at={cue(scene, 1)} rotate={1.5} style={{ left: u(7), top: u(47), width: u(42) }}>
        <Paper color={COLOR.sticky} tape={false} style={{ padding: u(2.2) }}>
          <Kicker color="#6b5a12">{config.bench.kicker}</Kicker>
          <Hand size={3.4} color={COLOR.ink} style={{ marginTop: u(0.8) }}>{config.bench.headline}</Hand>
          <ul style={{ margin: `${u(0.8)}px 0 0`, paddingLeft: u(2.4), fontFamily: FONT.hand, fontSize: u(2.4), color: COLOR.ink, lineHeight: 1.25 }}>
            {config.bench.points.map((point, i) => (
              <li key={point} style={{ opacity: interpolate(frame - cue(scene, 1, 0.15 + i * 0.25), [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{point}</li>
            ))}
          </ul>
        </Paper>
      </Drop>
    </Mat>
  );
};

/* ---------- 6. Access tiers: a staircase, higher rows are harder to reach ---------- */
export const TiersTall: React.FC<SceneProps> = ({ scene, games }) => {
  const frame = useCurrentFrame();
  const levels: AccessLevel[] = ["member", "subscriber", "login", "public"];
  const lineFor: Record<AccessLevel, [number, number]> = { public: [0, 0], login: [0, 0.5], subscriber: [1, 0], member: [3, 0] };
  const now = (level: AccessLevel) => {
    const list = games.filter((g) => g.accessLevel === level).map((g) => g.title);
    if (list.length === 0) return "지금: 아직 없음";
    if (list.length > 2) return `지금: ${list[0]} 외 ${list.length - 1}개`;
    return `지금: ${list.join(", ")}`;
  };
  return (
    <Mat>
      <Fade at={4} style={{ left: u(4), top: u(12.5) }}>
        <Hand size={3.4} color="#f2eee4">게임마다 문이 하나씩</Hand>
      </Fade>
      {levels.map((level, row) => {
        const rank = 3 - row; // public = 0 … member = 3
        const at = cue(scene, ...lineFor[level]);
        const grow = interpolate(frame - at, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const t = TIER[level];
        const top = 17 + row * 11.8;
        const left = 4 + rank * 3.2;
        return (
          <React.Fragment key={level}>
            <div style={{ position: "absolute", left: u(3), top: u(top + 1), width: u(left - 3 + 1.2), height: u(8.4), background: t.fill, opacity: 0.9, borderRadius: `0 ${u(0.3)}px ${u(0.3)}px 0`, transform: `scaleX(${grow})`, transformOrigin: "left" }} />
            <Drop at={at} boil style={{ left: u(left), top: u(top), width: u(48 - rank * 3.2) }}>
              <div style={{ position: "relative", background: COLOR.paper, color: COLOR.ink, padding: `${u(1)}px ${u(2)}px ${u(1)}px ${u(4)}px`, borderRadius: `${u(0.6)}px ${u(1.4)}px ${u(1.4)}px ${u(0.6)}px`, boxShadow: `0 ${u(0.5)}px ${u(1)}px rgba(0,0,0,.35)` }}>
                <div style={{ position: "absolute", left: u(1.3), top: "50%", width: u(1.4), height: u(1.4), borderRadius: "50%", transform: "translateY(-50%)", background: COLOR.mat }} />
                <div style={{ display: "flex", alignItems: "baseline", gap: u(1.2) }}>
                  <span style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(2.8) }}>{t.name}</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: u(1.15), letterSpacing: "0.1em", fontWeight: 500, color: t.ink }}>{t.label}</span>
                </div>
                <div style={{ fontFamily: FONT.body, fontSize: u(1.4), color: COLOR.inkSoft }}>{t.who}</div>
                <div style={{ fontFamily: FONT.hand, fontSize: u(2.4), lineHeight: 1.1, marginTop: u(0.5) }}>{now(level)}</div>
                <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: u(0.8), background: t.fill, borderRadius: `0 ${u(1.4)}px ${u(1.4)}px 0` }} />
              </div>
            </Drop>
          </React.Fragment>
        );
      })}
      <Fade at={cue(scene, 2)} style={{ left: u(4), top: u(64) }}>
        <Hand size={2.9}>매주 월요일, 구독자 게임 3~5개는 누구나!</Hand>
      </Fade>
      <Stroke at={cue(scene, 2, 0.2)} viewBox="0 0 60 200" d="M30 196 C 56 150, 56 70, 40 8 M40 8 l-9 9 M40 8 l3 12" style={{ left: u(45), top: u(40), width: u(7) }} />
    </Mat>
  );
};
