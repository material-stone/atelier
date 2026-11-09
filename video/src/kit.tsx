import React from "react";
import { Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { loadFont as loadNoto } from "@remotion/google-fonts/NotoSansKR";
import { loadFont as loadPlex } from "@remotion/google-fonts/IBMPlexSansKR";
import { loadFont as loadPen } from "@remotion/google-fonts/NanumPenScript";
import { loadFont as loadMono } from "@remotion/google-fonts/DMMono";
import type { AccessLevel } from "./types";

const fontOptions = { ignoreTooManyRequestsWarning: true };
export const FONT = {
  heavy: `${loadNoto("normal", { weights: ["700", "900"], ...fontOptions }).fontFamily}, sans-serif`,
  body: `${loadPlex("normal", { weights: ["500", "600"], ...fontOptions }).fontFamily}, sans-serif`,
  hand: `${loadPen("normal", fontOptions).fontFamily}, cursive`,
  mono: `${loadMono("normal", { weights: ["400", "500"] }).fontFamily}, monospace`,
};

/** Layout unit: 1u = 1% of the frame width (the mockup's cqw). */
export const u = (n: number) => n * 19.2;

export const COLOR = {
  mat: "#26342e",
  paper: "#f2eee4",
  polaroid: "#f6f3ec",
  ink: "#1d2124",
  inkSoft: "#4a4f52",
  pencil: "#6b6f6c",
  marker: "#ff7144",
  markerDark: "#c2410c",
  sticky: "#ffe68a",
  tape: "rgba(236,222,176,.82)",
};

export const TIER: Record<AccessLevel, { label: string; name: string; who: string; ink: string; fill: string }> = {
  public: { label: "PUBLIC", name: "누구나", who: "로그인 없이 바로", ink: "#4f7a2a", fill: "#a6cd7c" },
  login: { label: "LOGIN", name: "로그인", who: "Google 로그인 사용자", ink: "#1d2124", fill: "#c9c7bd" },
  subscriber: { label: "SUBSCRIBER", name: "구독자", who: "YouTube 구독 확인", ink: "#2350e0", fill: "#5f8bff" },
  member: { label: "MEMBER", name: "멤버", who: "채널 멤버십 회원", ink: "#6a4bd0", fill: "#b79bff" },
};

export const Mat: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundColor: COLOR.mat,
      backgroundImage: [
        "linear-gradient(rgba(255,255,255,.09) 2px, transparent 2px)",
        "linear-gradient(90deg, rgba(255,255,255,.09) 2px, transparent 2px)",
        "linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px)",
        "linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)",
      ].join(","),
      backgroundSize: `${u(12.5)}px ${u(12.5)}px, ${u(12.5)}px ${u(12.5)}px, ${u(2.5)}px ${u(2.5)}px, ${u(2.5)}px ${u(2.5)}px`,
      overflow: "hidden",
      // Korean wraps between words, not mid-word.
      wordBreak: "keep-all",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Ruler: React.FC = () => (
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: u(2.4), display: "flex", fontFamily: FONT.mono, fontSize: u(0.9), color: "rgba(255,255,255,.45)" }}>
    {Array.from({ length: 10 }, (_, i) => (
      <span key={i} style={{ flex: 1, borderLeft: "2px solid rgba(255,255,255,.3)", paddingLeft: u(0.3) }}>{i * 10}</span>
    ))}
  </div>
);

export const Sfx: React.FC<{ at: number; name: "paper" | "marker"; volume?: number }> = ({ at, name, volume = 0.5 }) => (
  <Sequence from={Math.max(0, Math.round(at))} durationInFrames={30} layout="none">
    <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
  </Sequence>
);

/** Two-frame "boil" like stop-motion paper: the whole piece shifts a hair every half second. */
export function useBoil(): React.CSSProperties {
  const frame = useCurrentFrame();
  const odd = Math.floor(frame / 15) % 2 === 1;
  return { translate: odd ? `${u(0.06)}px ${-u(0.05)}px` : "0 0" };
}

/** Set-down motion: drops a few px, settles with a little bounce. Plays a paper sound when it lands. */
export const Drop: React.FC<{
  at: number;
  rotate?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
  sound?: boolean;
  boil?: boolean;
}> = ({ at, rotate = 0, style, children, sound = true, boil = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - at, fps, config: { damping: 11, stiffness: 170, mass: 0.8 } });
  const opacity = interpolate(frame - at, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const boilStyle = useBoil();
  return (
    <>
      {sound ? <Sfx at={at + 5} name="paper" volume={0.45} /> : null}
      <div
        style={{
          position: "absolute",
          opacity,
          transform: `translateY(${interpolate(p, [0, 1], [-u(3), 0])}px) rotate(${rotate}deg) scale(${interpolate(p, [0, 1], [1.06, 1])})`,
          ...(boil ? boilStyle : null),
          ...style,
        }}
      >
        {children}
      </div>
    </>
  );
};

export const Fade: React.FC<{ at: number; style?: React.CSSProperties; children: React.ReactNode; frames?: number }> = ({ at, style, children, frames = 10 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame - at, [0, frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ position: "absolute", opacity, ...style }}>{children}</div>;
};

export const Tape: React.FC<{ top?: number }> = ({ top = -1.5 }) => (
  <div style={{ position: "absolute", width: u(8), height: u(2.2), background: COLOR.tape, top: u(top), left: "50%", transform: "translateX(-50%) rotate(-3deg)", zIndex: 2 }} />
);

export const Paper: React.FC<{ style?: React.CSSProperties; children: React.ReactNode; color?: string; tape?: boolean }> = ({ style, children, color = COLOR.paper, tape = true }) => (
  <div style={{ position: "relative", background: color, color: COLOR.ink, boxShadow: `0 ${u(0.5)}px ${u(1.2)}px rgba(0,0,0,.35)`, ...style }}>
    {tape ? <Tape top={-1} /> : null}
    {children}
  </div>
);

/** A cover is always shown whole: natural ratio, nothing drawn over it. The caption lives in the paper margin. */
export const Polaroid: React.FC<{ src: string; width: number; caption?: string; tape?: boolean; captionSize?: number }> = ({ src, width, caption, tape = true, captionSize = 2.4 }) => (
  <div style={{ position: "relative", width: u(width), padding: `${u(0.9)}px ${u(0.9)}px 0`, background: COLOR.polaroid, boxShadow: `0 ${u(0.5)}px ${u(1.2)}px rgba(0,0,0,.4)` }}>
    {tape ? <Tape top={-1.5} /> : null}
    <Img src={staticFile(src)} style={{ display: "block", width: "100%", height: "auto" }} />
    <div style={{ fontFamily: FONT.hand, color: COLOR.ink, fontSize: u(captionSize), lineHeight: 1, padding: `${u(0.7)}px ${u(0.2)}px ${u(0.9)}px`, minHeight: u(1.6) }}>{caption}</div>
  </div>
);

/** Marker line that draws itself, with a scratch sound. */
export const Stroke: React.FC<{ at: number; d: string; viewBox: string; style: React.CSSProperties; width?: number; frames?: number }> = ({ at, d, viewBox, style, width = 3, frames = 24 }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - at, [0, frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Sfx at={at} name="marker" volume={0.35} />
      <svg viewBox={viewBox} fill="none" style={{ position: "absolute", overflow: "visible", ...style }}>
        <path d={d} stroke={COLOR.marker} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} />
      </svg>
    </>
  );
};

export const Hand: React.FC<{ size: number; color?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ size, color = COLOR.marker, style, children }) => (
  <div style={{ fontFamily: FONT.hand, fontSize: u(size), color, lineHeight: 1.05, whiteSpace: "pre-line", ...style }}>{children}</div>
);

export const Subtitle: React.FC<{ text: string; bottom?: number; maxWidth?: number; size?: number }> = ({ text, bottom = 2.6, maxWidth = 80, size = 2.1 }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: u(bottom), display: "flex", justifyContent: "center", zIndex: 50 }}>
    <div style={{ maxWidth: u(maxWidth), background: "#121416", color: "#fff", padding: `${u(0.5)}px ${u(1.4)}px`, fontFamily: FONT.body, fontWeight: 600, fontSize: u(size), lineHeight: 1.45, textAlign: "center", wordBreak: "keep-all", boxShadow: `0 ${u(0.3)}px 0 rgba(0,0,0,.25)`, textWrap: "balance" }}>
      {text}
    </div>
  </div>
);
