import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  Series,
  Video,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FPS, demoProject } from "../lib/video.js";

export const ScriptVideo = ({ project = demoProject }) => {
  const voiceTrack = project.voiceTrack ?? demoProject.voiceTrack;
  const assets = project.assets ?? {};

  return (
    <AbsoluteFill style={styles.stage}>
      {voiceTrack.mode === "uploaded" && voiceTrack.assetId && assets[voiceTrack.assetId]?.url ? (
        <Audio src={assets[voiceTrack.assetId].url} />
      ) : null}

      <Series>
        {(project.scenes ?? []).map((scene, index) => {
          const durationInFrames = Math.max(1, Math.round((Number(scene.duration) || 2) * FPS));
          return (
            <Series.Sequence key={scene.id} durationInFrames={durationInFrames}>
              <SceneFrame
                scene={scene}
                index={index}
                asset={assets[scene.mediaAssetId]}
                ttsAsset={assets[scene.ttsAssetId]}
                playSceneTts={voiceTrack.mode === "windows-tts"}
              />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};

const SceneFrame = ({ scene, index, asset, ttsAsset, playSceneTts }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = interpolate(frame, [0, fps * 0.7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={styles.scene}>
      <MediaLayer asset={asset} fitMode={scene.fitMode} index={index} progress={progress} />
      <div style={styles.scrim} />
      <div style={styles.captionWrap}>
        <div style={styles.caption}>{scene.text}</div>
      </div>
      {playSceneTts && ttsAsset?.url ? (
        <Sequence from={0} premountFor={Math.round(0.25 * fps)} layout="none">
          <Audio src={ttsAsset.url} playbackRate={1.25} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

const MediaLayer = React.memo(({ asset, fitMode = "cover", index, progress }) => {
  const fit = fitMode === "contain" ? "contain" : "cover";

  // Static video style depends only on `fit` (no per-frame animation).
  const videoStyle = useMemo(() => ({ ...styles.media, objectFit: fit }), [fit]);

  // Gradient + placeholder styles depend only on `index`, not on the frame.
  const placeholder = useMemo(() => {
    const hue = (index * 43) % 360;
    return {
      containerStyle: {
        ...styles.placeholder,
        background: `linear-gradient(135deg, hsl(${hue} 32% 16%), hsl(${(hue + 95) % 360} 38% 26%))`,
      },
      lineStyle2: { ...styles.placeholderLine, width: "42%", opacity: 0.42 },
      lineStyle3: { ...styles.placeholderLine, width: "58%", opacity: 0.3 },
    };
  }, [index]);

  // Ken-Burns transform legitimately changes per frame (driven by `progress`).
  const transform = `scale(${1.03 - progress * 0.03})`;

  if (asset?.type === "image") {
    return (
      <Img
        src={asset.url}
        style={{
          ...styles.media,
          objectFit: fit,
          transform,
        }}
      />
    );
  }

  if (asset?.type === "video") {
    return (
      <Video
        src={asset.url}
        muted
        loop
        style={videoStyle}
      />
    );
  }

  return (
    <AbsoluteFill style={placeholder.containerStyle}>
      <div style={styles.placeholderLine} />
      <div style={placeholder.lineStyle2} />
      <div style={placeholder.lineStyle3} />
    </AbsoluteFill>
  );
});

const styles = {
  stage: {
    backgroundColor: "#111214",
    color: "white",
    fontFamily:
      'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  scene: {
    overflow: "hidden",
    backgroundColor: "#111214",
  },
  media: {
    width: "100%",
    height: "100%",
    position: "absolute",
    inset: 0,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  placeholderLine: {
    width: "64%",
    height: 18,
    borderRadius: 999,
    background: "rgba(255,255,255,0.32)",
  },
  scrim: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.08) 48%, rgba(0,0,0,0.55) 100%)",
  },
  captionWrap: {
    position: "absolute",
    left: "6%",
    right: "6%",
    bottom: "7%",
    display: "flex",
    justifyContent: "center",
  },
  caption: {
    maxWidth: "100%",
    padding: "16px 22px",
    borderRadius: 8,
    background: "rgba(0, 0, 0, 0.62)",
    color: "#ffffff",
    fontSize: 58,
    lineHeight: 1.22,
    fontWeight: 800,
    textAlign: "center",
    textShadow: "0 3px 14px rgba(0,0,0,0.55)",
    overflowWrap: "anywhere",
  },
};
