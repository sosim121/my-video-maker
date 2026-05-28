import { randomUUID } from "node:crypto";

export const FPS = 30;

export const ASPECTS = {
  portrait: { label: "세로 9:16", width: 1080, height: 1920 },
  landscape: { label: "가로 16:9", width: 1920, height: 1080 },
};

export function splitScript(script) {
  if (!script) return [];

  return String(script)
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function estimateSceneDuration(text) {
  const compactLength = String(text ?? "").replace(/\s/g, "").length;
  return roundDuration(Math.max(1.6, Math.min(9.6, (compactLength / 6) / 1.25)));
}

export function recalculateSceneStarts(scenes) {
  let start = 0;
  return scenes.map((scene) => {
    const duration = roundDuration(Math.max(0.4, Number(scene.duration) || 2));
    const next = {
      ...scene,
      start: roundDuration(start),
      duration,
    };
    start += duration;
    return next;
  });
}

export function getProjectDimensions(aspectRatio) {
  return ASPECTS[aspectRatio] ?? ASPECTS.portrait;
}

export function getProjectDuration(project) {
  return (project.scenes ?? []).reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0);
}

export function createProjectFromScript({ script, aspectRatio = "portrait" }) {
  const sentences = splitScript(script);
  const scenes = recalculateSceneStarts(
    sentences.map((text, index) => ({
      id: randomUUID(),
      order: index,
      text,
      start: 0,
      duration: estimateSceneDuration(text),
      ttsAssetId: null,
      mediaAssetId: null,
      fitMode: "cover",
    })),
  );

  const title = sentences[0]?.slice(0, 42) || "새 영상";

  return {
    id: randomUUID(),
    title,
    aspectRatio: ASPECTS[aspectRatio] ? aspectRatio : "portrait",
    scenes,
    assets: {},
    voiceTrack: {
      mode: "windows-tts",
      voiceName:
        ((script ?? "").match(/[a-zA-Z]/g) || []).length >
        ((script ?? "").match(/[\uac00-\ud7a3]/g) || []).length
          ? "Google Translate English"
          : "Google Translate Korean",
      assetId: null,
    },
    captionStyle: {
      position: "bottom",
      size: "medium",
      background: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    output: null,
  };
}

export function applyUploadedNarrationTiming(project, duration) {
  const scenes = project.scenes ?? [];
  const totalChars = scenes.reduce(
    (sum, scene) => sum + Math.max(1, String(scene.text ?? "").replace(/\s/g, "").length),
    0,
  );

  if (!duration || !Number.isFinite(duration) || totalChars <= 0) {
    return project;
  }

  const timedScenes = scenes.map((scene) => {
    const chars = Math.max(1, String(scene.text ?? "").replace(/\s/g, "").length);
    return {
      ...scene,
      duration: roundDuration(Math.max(0.5, (duration * chars) / totalChars)),
    };
  });

  return {
    ...project,
    scenes: recalculateSceneStarts(timedScenes),
  };
}

export function roundDuration(value) {
  return Math.round(Number(value) * 100) / 100;
}
