import React from "react";
import { Composition, Still, staticFile, type CalculateMetadataFunction } from "remotion";
import { ReelCover, Thumbnail } from "./Thumbnail";
import { AtelierIntro } from "./Video";
import type { Game, Timeline, VideoProps } from "./types";

// Data comes from `npm run prepare-all` (live hub games + narration timing), read fresh on every render.
const calculateMetadata: CalculateMetadataFunction<VideoProps> = async ({ props }) => {
  const [timeline, data] = await Promise.all([
    fetch(staticFile("data/timeline.json")).then((r) => r.json() as Promise<Timeline>),
    fetch(staticFile("data/games.json")).then((r) => r.json() as Promise<{ games: Game[] }>),
  ]);
  return { durationInFrames: timeline.totalFrames, fps: timeline.fps, props: { ...props, timeline, games: data.games } };
};

const thumbnailMetadata: CalculateMetadataFunction<{ games: Game[] }> = async () => {
  const data = (await fetch(staticFile("data/games.json")).then((r) => r.json())) as { games: Game[] };
  return { props: { games: data.games } };
};

export const Root: React.FC = () => (
  <>
  <Composition
    id="AtelierIntro"
    component={AtelierIntro}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={300}
    defaultProps={{ timeline: null, games: [] } as VideoProps}
    calculateMetadata={calculateMetadata}
  />
  {/* Instagram Reels: same narration and timing, re-laid out for 9:16. */}
  <Composition
    id="AtelierReel"
    component={AtelierIntro}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={300}
    defaultProps={{ timeline: null, games: [], layout: "tall" } as VideoProps}
    calculateMetadata={calculateMetadata}
  />
  <Still id="Thumbnail" component={Thumbnail} width={1920} height={1080} defaultProps={{ games: [] as Game[] }} calculateMetadata={thumbnailMetadata} />
  <Still id="ReelCover" component={ReelCover} width={1080} height={1920} defaultProps={{ games: [] as Game[] }} calculateMetadata={thumbnailMetadata} />
  </>
);
