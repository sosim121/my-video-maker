export const FPS = 30;

export const ASPECTS = {
  portrait: { label: "세로 9:16", width: 1080, height: 1920 },
  landscape: { label: "가로 16:9", width: 1920, height: 1080 },
};

export function getProjectDimensions(aspectRatio) {
  return ASPECTS[aspectRatio] ?? ASPECTS.portrait;
}

export function getProjectDuration(project) {
  return (project?.scenes ?? []).reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0);
}

export function getProjectFrames(project) {
  return Math.max(1, Math.ceil(getProjectDuration(project) * FPS));
}

export const demoProject = {
  id: "demo",
  title: "새 영상",
  aspectRatio: "portrait",
  scenes: [
    {
      id: "demo-scene",
      order: 0,
      text: "스크립트를 넣으면 장면, 자막, 음성이 자동으로 준비됩니다.",
      start: 0,
      duration: 4,
      ttsAssetId: null,
      mediaAssetId: null,
      fitMode: "cover",
    },
  ],
  assets: {},
  voiceTrack: {
    mode: "windows-tts",
    voiceName: "Microsoft Heami Desktop",
    assetId: null,
  },
  captionStyle: {
    position: "bottom",
    size: "medium",
    background: true,
  },
};
