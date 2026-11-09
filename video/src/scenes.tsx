import React from "react";
import { interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR, Drop, Fade, FONT, Hand, Mat, Paper, Polaroid, Ruler, Sfx, Stroke, TIER, u } from "./kit";
import type { AccessLevel, Config, Game, Scene, Spot } from "./types";

export type SceneProps = { scene: Scene; games: Game[]; config: Config };

/** Frame (relative to the scene) where narration line i starts; `at` is a fraction into that line. */
export const cue = (scene: Scene, i: number, at = 0) => {
  const line = scene.lines[Math.min(i, scene.lines.length - 1)];
  return line.from - scene.from + Math.round(line.frames * at);
};
export const lineEnd = (scene: Scene, i: number) => cue(scene, i) + scene.lines[i].frames;

export const benchOf = (games: Game[], config: Config) => games.find((g) => g.id === config.benchGameId);
export const shelfOf = (games: Game[], config: Config) => games.filter((g) => g.id !== config.benchGameId);

export const Kicker: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = COLOR.pencil }) => (
  <div style={{ fontFamily: FONT.mono, fontSize: u(1.2), letterSpacing: "0.14em", color }}>{children}</div>
);

/* ---------- 1. Hook ---------- */
export const Hook: React.FC<SceneProps> = ({ scene, games, config }) => {
  const shelf = shelfOf(games, config);
  const bench = benchOf(games, config);
  const pics = [shelf[0], bench ?? shelf[1]].filter(Boolean) as Game[];
  return (
    <Mat>
      <Ruler />
      <Drop at={4} rotate={-1.2} boil style={{ left: u(8), top: u(12), width: u(52) }}>
        <Paper style={{ padding: `${u(3)}px ${u(3.2)}px ${u(2.6)}px` }}>
          <Kicker>ATELIER · MATERIAL STONE GAMES</Kicker>
          <div style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(4.4), lineHeight: 1.22, marginTop: u(1) }}>
            지금 만들고 있는 게임,
            <br />
            <span style={{ background: `linear-gradient(transparent 58%, rgba(255,113,68,.45) 58%)` }}>먼저 플레이하세요.</span>
          </div>
        </Paper>
      </Drop>
      {pics[0]?.cover ? (
        <Drop at={cue(scene, 1)} rotate={-4} style={{ left: u(64), top: u(4) }}>
          <Polaroid src={pics[0].cover} width={22} caption={pics[0].title} />
        </Drop>
      ) : null}
      {pics[1]?.cover ? (
        <Drop at={cue(scene, 1, 0.45)} rotate={4} style={{ left: u(73), top: u(25.5) }}>
          <Polaroid src={pics[1].cover} width={22} caption={pics[1].title} />
        </Drop>
      ) : null}
    </Mat>
  );
};

/* ---------- 2. Why ---------- */
export const FlowBox: React.FC<{ children: React.ReactNode; hot?: boolean }> = ({ children, hot }) => (
  <span style={{ border: `${u(0.2)}px solid ${hot ? COLOR.marker : COLOR.ink}`, color: hot ? COLOR.markerDark : COLOR.ink, borderRadius: u(0.6), padding: `0 ${u(1.2)}px` }}>{children}</span>
);
export const Arrow = () => <span style={{ color: COLOR.pencil }}>→</span>;
export const flowRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: u(1.4), fontFamily: FONT.hand, fontSize: u(3.8), color: COLOR.ink, whiteSpace: "nowrap" };
export const flowLabel: React.CSSProperties = { fontFamily: FONT.mono, fontSize: u(1.2), letterSpacing: "0.1em", color: COLOR.pencil, width: u(11) };

export const Why: React.FC<SceneProps> = ({ scene }) => {
  const frame = useCurrentFrame();
  const strikeAt = lineEnd(scene, 1) - 10;
  const strike = interpolate(frame - strikeAt, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Mat>
      <Drop at={2} rotate={0.6} style={{ left: u(8), top: u(5), width: u(84) }}>
        <Paper style={{ height: u(39), padding: `${u(2.6)}px ${u(4)}px`, background: `${COLOR.paper} repeating-linear-gradient(transparent 0 ${u(3.9)}px, rgba(95,139,255,.18) ${u(3.9)}px ${u(4)}px)` }}>
          <Kicker>WHY ATELIER</Kicker>
          <Hand size={3.4} color={COLOR.ink} style={{ marginTop: u(0.6) }}>작업실 문을 열어둔 이유</Hand>
          <Fade at={cue(scene, 1)} style={{ left: u(4), top: u(13) }}>
            <div style={{ ...flowRow, position: "relative" }}>
              <span style={flowLabel}>보통</span>
              <span>만들기</span><Arrow /><span>…</span><Arrow /><span>완성</span><Arrow /><FlowBox>공개</FlowBox>
              <i style={{ position: "absolute", left: u(12), right: -u(2), top: "52%", height: u(0.35), background: COLOR.marker, transform: `rotate(-2deg) scaleX(${strike})`, transformOrigin: "left" }} />
            </div>
          </Fade>
          <Fade at={cue(scene, 2)} style={{ left: u(4), top: u(22) }}>
            <div style={flowRow}>
              <span style={flowLabel}>ATELIER</span>
              <span>만들기</span><Arrow /><FlowBox hot>공개</FlowBox><Arrow /><FlowBox hot>의견</FlowBox><Arrow /><FlowBox hot>다듬기</FlowBox>
            </div>
          </Fade>
          <Stroke at={cue(scene, 2, 0.55)} viewBox="0 0 120 60" d="M110 8 C 120 40, 70 58, 30 50 C 10 46, 4 30, 8 14 M8 14 l-5 10 M8 14 l9 6" width={2.6} style={{ left: u(52), top: u(28), width: u(22) }} />
          <Fade at={cue(scene, 2, 0.7)} style={{ left: u(43), top: u(31.5) }}>
            <Hand size={3}>계속 반복!</Hand>
          </Fade>
        </Paper>
      </Drop>
      <Sfx at={strikeAt} name="marker" volume={0.35} />
    </Mat>
  );
};

/* ---------- 3. What you can do ---------- */
export const ActionCard: React.FC<{ icon: string; iconColor?: string; title: string; text: string }> = ({ icon, iconColor = COLOR.ink, title, text }) => (
  <Paper style={{ width: u(23), padding: `${u(2.4)}px ${u(2)}px ${u(2)}px` }}>
    <div style={{ fontFamily: FONT.mono, fontSize: u(4), lineHeight: 1, color: iconColor }}>{icon}</div>
    <div style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(2.9), marginTop: u(1.2) }}>{title}</div>
    <div style={{ fontFamily: FONT.body, fontSize: u(1.5), color: COLOR.inkSoft, marginTop: u(0.6), lineHeight: 1.45 }}>{text}</div>
  </Paper>
);

export const Can: React.FC<SceneProps> = ({ scene }) => (
  <Mat>
    <Ruler />
    <Fade at={4} style={{ left: u(7), top: u(4) }}>
      <Hand size={3.2} color="#f2eee4">여기서 할 수 있는 것</Hand>
    </Fade>
    <Drop at={cue(scene, 0)} rotate={-2} boil style={{ left: u(7), top: u(10) }}>
      <ActionCard icon="▶" title="플레이" text="설치 없이 브라우저에서 바로" />
    </Drop>
    <Drop at={cue(scene, 1)} rotate={1} boil style={{ left: u(38.5), top: u(12) }}>
      <ActionCard icon="♡" iconColor={COLOR.marker} title="좋아요" text="마음에 든 빌드에 하나" />
    </Drop>
    <Drop at={cue(scene, 1, 0.45)} rotate={-1} boil style={{ left: u(70), top: u(10) }}>
      <ActionCard icon="✎" title="댓글" text="플레이테스트 노트로 남는 의견" />
    </Drop>
    <Drop at={cue(scene, 2)} rotate={-0.8} style={{ left: u(15), top: u(34), width: u(70) }}>
      <Paper color={COLOR.sticky} tape={false} style={{ padding: `${u(1.4)}px ${u(2)}px`, display: "flex", gap: u(2), alignItems: "baseline" }}>
        <span style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(2), whiteSpace: "nowrap" }}>커뮤니티</span>
        <span style={{ fontFamily: FONT.hand, fontSize: u(2.7), lineHeight: 1.1 }}>짧은 글 + 사진 한 장 · 한 달 뒤 정리 · 그달 좋아요 1위만 남아요</span>
      </Paper>
    </Drop>
  </Mat>
);

/* ---------- 4. Games on the shelf ---------- */
export const TierChip: React.FC<{ level: AccessLevel }> = ({ level }) => (
  <span style={{ fontFamily: FONT.mono, fontSize: u(1.15), color: "#fff", background: TIER[level].ink === "#1d2124" ? COLOR.ink : TIER[level].ink, padding: `${u(0.15)}px ${u(0.8)}px`, borderRadius: u(0.3) }}>{TIER[level].label}</span>
);
export const Tag: React.FC<{ children: React.ReactNode; hot?: boolean }> = ({ children, hot }) => (
  <span style={{ fontFamily: FONT.body, fontSize: u(1.25), padding: `${u(0.1)}px ${u(0.7)}px`, borderRadius: u(0.3), border: hot ? "none" : "1px solid rgba(29,33,36,.3)", background: hot ? COLOR.marker : "transparent", color: hot ? "#fff" : COLOR.ink }}>{children}</span>
);

const SpotCard: React.FC<{ game: Game; index: number; total: number; config: Config }> = ({ game, index, total, config }) => {
  const note = config.gameNotes[game.id] ?? game.description.split(/(?<=[.!?。])\s/)[0];
  const tilt = index % 2 === 0 ? -1.5 : 1.2;
  return (
    <>
      {game.cover ? (
        <Drop at={0} rotate={tilt} style={{ left: u(6), top: u(4.5) }}>
          <Polaroid src={game.cover} width={44} caption={game.title} captionSize={2.6} />
        </Drop>
      ) : null}
      <Drop at={5} rotate={-tilt * 0.7} sound={false} style={{ left: u(55), top: u(8), width: u(37) }}>
        <Paper style={{ padding: `${u(2.6)}px ${u(2.6)}px ${u(2.4)}px` }}>
          <Kicker>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</Kicker>
          <div style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(3.6), marginTop: u(0.6), lineHeight: 1.2 }}>{game.title}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: u(0.6), marginTop: u(1) }}>
            <TierChip level={game.accessLevel} />
            {config.wipGameIds.includes(game.id) ? <Tag hot>계속 다듬는 중</Tag> : null}
            {game.genres.map((genre) => <Tag key={genre}>{genre}</Tag>)}
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: u(1.6), lineHeight: 1.55, color: "#3d4245", marginTop: u(1.2) }}>{note}</div>
        </Paper>
      </Drop>
    </>
  );
};

export const Games: React.FC<SceneProps> = ({ scene, games, config }) => {
  const spots = scene.spots ?? [];
  const firstSpot = spots.length ? spots[0].from - scene.from : scene.frames;
  const byId = new Map(games.map((g) => [g.id, g]));
  return (
    <Mat>
      <Sequence durationInFrames={firstSpot} layout="none">
        <Ruler />
        {games.map((game, i) => (
          <Drop key={game.id} at={2 + i * 3} sound={i % 2 === 0} rotate={((i * 37) % 7) - 3} style={{ left: u(5 + (i % 4) * 23), top: u(7 + Math.floor(i / 4) * 20.5) }}>
            {game.cover ? <Polaroid src={game.cover} width={20} caption={game.title} tape={false} captionSize={2.1} /> : null}
          </Drop>
        ))}
      </Sequence>
      {spots.map((spot: Spot, i) => {
        const game = byId.get(spot.gameId);
        if (!game) return null;
        return (
          <Sequence key={spot.gameId} from={spot.from - scene.from} durationInFrames={spot.frames + (i === spots.length - 1 ? 12 : 0)} layout="none">
            <Ruler />
            <SpotCard game={game} index={games.indexOf(game)} total={games.length} config={config} />
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", right: u(4), top: u(3.2) }}>
        <Hand size={3}>{`지금 ${games.length}개`}</Hand>
      </div>
    </Mat>
  );
};

/* ---------- 5. On the bench ---------- */
export const Bench: React.FC<SceneProps> = ({ scene, games, config }) => {
  const frame = useCurrentFrame();
  const game = benchOf(games, config);
  if (!game) return <Mat />;
  return (
    <Mat>
      <Fade at={10} frames={6} style={{ left: u(4.5), top: u(1.4), zIndex: 5 }}>
        <span style={{ display: "inline-block", fontFamily: FONT.mono, fontSize: u(1.3), letterSpacing: "0.1em", background: COLOR.marker, color: "#fff", padding: `${u(0.4)}px ${u(1)}px`, transform: "rotate(-6deg)" }}>NOW ON THE BENCH · 프로토타입</span>
      </Fade>
      {game.cover ? (
        <Drop at={2} rotate={-1} style={{ left: u(7), top: u(6) }}>
          <Polaroid src={game.cover} width={46} caption={`${game.title} · ${String(games.indexOf(game) + 1).padStart(2, "0")} / ${String(games.length).padStart(2, "0")}`} captionSize={2.6} />
        </Drop>
      ) : null}
      <Drop at={cue(scene, 1)} rotate={2} style={{ left: u(58), top: u(9), width: u(33) }}>
        <Paper color={COLOR.sticky} tape={false} style={{ padding: u(2.4) }}>
          <Kicker color="#6b5a12">{config.bench.kicker}</Kicker>
          <Hand size={3.4} color={COLOR.ink} style={{ marginTop: u(1) }}>{config.bench.headline}</Hand>
          <ul style={{ margin: `${u(1)}px 0 0`, paddingLeft: u(2.4), fontFamily: FONT.hand, fontSize: u(2.8), color: COLOR.ink, lineHeight: 1.3 }}>
            {config.bench.points.map((point, i) => (
              <li key={point} style={{ opacity: interpolate(frame - cue(scene, 1, 0.15 + i * 0.25), [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{point}</li>
            ))}
          </ul>
        </Paper>
      </Drop>
    </Mat>
  );
};

/* ---------- 6. Access tiers: steps that rise to the right ---------- */
export const Tiers: React.FC<SceneProps> = ({ scene, games }) => {
  const frame = useCurrentFrame();
  const levels: AccessLevel[] = ["public", "login", "subscriber", "member"];
  const lineFor: Record<AccessLevel, [number, number]> = { public: [0, 0], login: [0, 0.5], subscriber: [1, 0], member: [3, 0] };
  const now = (level: AccessLevel) => {
    const list = games.filter((g) => g.accessLevel === level).map((g) => g.title);
    if (list.length === 0) return ["지금: 아직 없음"];
    if (list.length > 2) return [`지금: ${list[0]} 외 ${list.length - 1}개`];
    return [`지금: ${list[0]}`, ...list.slice(1)];
  };
  return (
    <Mat>
      <Fade at={4} style={{ left: u(6), top: u(3.4) }}>
        <Hand size={3.2} color="#f2eee4">게임마다 문이 하나씩</Hand>
      </Fade>
      <div style={{ position: "absolute", left: u(6), right: u(6), top: u(9), height: u(36), display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: u(2), alignItems: "end" }}>
        {levels.map((level, i) => {
          const at = cue(scene, ...lineFor[level]);
          const grow = interpolate(frame - at, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const t = TIER[level];
          return (
            <div key={level} style={{ position: "relative", height: "100%" }}>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: u(2 + i * 3.4), background: t.fill, opacity: 0.9, borderRadius: `${u(0.3)}px ${u(0.3)}px 0 0`, transform: `scaleY(${grow})`, transformOrigin: "bottom" }} />
              <Drop at={at} boil style={{ left: 0, right: 0, bottom: u(2 + i * 3.4 + 1.2) }}>
                <div style={{ position: "relative", background: COLOR.paper, color: COLOR.ink, padding: `${u(3.2)}px ${u(1.6)}px ${u(2)}px`, borderRadius: `${u(0.6)}px ${u(0.6)}px ${u(1.4)}px ${u(1.4)}px`, boxShadow: `0 ${u(0.5)}px ${u(1)}px rgba(0,0,0,.35)` }}>
                  <div style={{ position: "absolute", top: u(1), left: "50%", width: u(1.4), height: u(1.4), borderRadius: "50%", transform: "translateX(-50%)", background: COLOR.mat }} />
                  <div style={{ fontFamily: FONT.mono, fontSize: u(1.2), letterSpacing: "0.1em", fontWeight: 500, color: t.ink }}>{t.label}</div>
                  <div style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(2.7), marginTop: u(0.5) }}>{t.name}</div>
                  <div style={{ fontFamily: FONT.body, fontSize: u(1.4), color: COLOR.inkSoft, marginTop: u(0.4) }}>{t.who}</div>
                  <div style={{ marginTop: u(1), paddingTop: u(0.8), borderTop: "2px dashed rgba(29,33,36,.25)", fontFamily: FONT.hand, fontSize: u(2.5), lineHeight: 1.1 }}>{now(level).map((text, k) => <div key={k} style={{ paddingLeft: k ? u(2.6) : 0 }}>{text}</div>)}</div>
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: u(0.8), background: t.fill, borderRadius: `0 0 ${u(1.4)}px ${u(1.4)}px` }} />
                </div>
              </Drop>
            </div>
          );
        })}
      </div>
      <Fade at={cue(scene, 2)} style={{ left: u(30), top: u(3.4) }}>
        <Hand size={3}>매주 월요일, 구독자 게임 3~5개는 누구나!</Hand>
      </Fade>
      <Stroke at={cue(scene, 2, 0.2)} viewBox="0 0 100 60" d="M8 6 C 20 30, 40 44, 62 50 M62 50 l-12 -6 M62 50 l-8 9" style={{ left: u(48), top: u(8), width: u(9) }} />
    </Mat>
  );
};

/* ---------- 7. Outro, then the same shot blurs and the credits roll ---------- */
export const Outro: React.FC<SceneProps & { credits: { head: string; body: string[] }[]; closing: string; siteUrl: string; tall?: boolean }> = ({ scene, games, config, credits, closing, siteUrl, tall = false }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const blurAt = (scene.blurAt ?? scene.frames) - scene.from;
  const rollAt = (scene.rollAt ?? scene.frames) - scene.from;
  const rollFrames = scene.rollFrames ?? 1;
  const blur = interpolate(frame - blurAt, [0, 42], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const corners = shelfOf(games, config).slice(1, 5);
  // Wide frame is 100u x 56.25u; the tall (Reels) frame is 56.25u x 100u.
  const spots = tall
    ? [
        { left: 3, top: 12.5, rotate: -6 },
        { left: 30, top: 13.5, rotate: 5 },
        { left: 4, top: 52, rotate: 4 },
        { left: 29, top: 51, rotate: -4 },
      ]
    : [
        { left: 3, top: 4, rotate: -6 },
        { left: 79, top: 6, rotate: 5 },
        { left: 6, top: 32, rotate: 4 },
        { left: 77, top: 31, rotate: -4 },
      ];
  const label = tall ? { left: 5, top: 31.5, width: 46 } : { left: 25, top: 15, width: 50 };
  const bodySize = tall ? 1.7 : 1.9;

  // Credits are laid out with fixed rows so the roll can stop exactly on the closing line.
  const HEAD = u(2.4), ROW = u(3.1), GAP = u(3.4);
  let y = 0;
  const rows: { y: number; kind: "head" | "body" | "title"; text: string }[] = [{ y, kind: "title", text: "Atelier" }];
  y += u(5.5);
  for (const block of credits) {
    rows.push({ y, kind: "head", text: block.head });
    y += HEAD;
    for (const text of block.body) { rows.push({ y, kind: "body", text }); y += ROW; }
    y += GAP;
  }
  const closingY = y + u(2);
  const roll = interpolate(frame - rollAt, [0, rollFrames], [height + u(2), height / 2 - closingY - u(3)], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <>
      <div style={{ position: "absolute", inset: 0, filter: `blur(${blur * 26}px) brightness(${1 - blur * 0.64}) saturate(${1 - blur * 0.15})`, transform: `scale(${1 + blur * 0.04})` }}>
        <Mat>
          <Ruler />
          {corners.map((game, i) => game.cover ? (
            <Drop key={game.id} at={2 + i * 3} sound={i === 0} rotate={spots[i].rotate} style={{ left: u(spots[i].left), top: u(spots[i].top) }}>
              <Polaroid src={game.cover} width={tall ? 22 : 18} caption={game.title} tape={false} captionSize={2} />
            </Drop>
          ) : null)}
          <Drop at={8} rotate={-0.8} style={{ left: u(label.left), top: u(label.top), width: u(label.width) }}>
            <Paper style={{ padding: u(3), textAlign: "center" }}>
              <div style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(4), lineHeight: 1.25 }}>만드는 대로<br />계속 올릴게요.</div>
              <Hand size={3} color={COLOR.markerDark} style={{ marginTop: u(1) }}>해보시고, 한마디 남겨주세요!</Hand>
            </Paper>
          </Drop>
        </Mat>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, transform: `translateY(${roll}px)`, color: "#f2f1ea", textAlign: "center", textShadow: "0 2px 10px rgba(0,0,0,.65)", opacity: frame >= rollAt ? 1 : 0 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ position: "absolute", left: 0, right: 0, top: row.y, fontFamily: row.kind === "head" ? FONT.mono : row.kind === "title" ? FONT.heavy : FONT.body, fontSize: row.kind === "head" ? u(1.3) : row.kind === "title" ? u(3.6) : u(bodySize), fontWeight: row.kind === "title" ? 900 : 500, letterSpacing: row.kind === "head" ? "0.2em" : undefined, opacity: row.kind === "head" ? 0.7 : 1 }}>{row.text}</div>
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, top: closingY }}>
          <div style={{ fontFamily: FONT.heavy, fontWeight: 900, fontSize: u(3.4) }}>{closing}</div>
          <div style={{ fontFamily: FONT.mono, fontSize: u(1.5), marginTop: u(1.4), opacity: 0.8 }}>{siteUrl}</div>
        </div>
      </div>
    </>
  );
};
