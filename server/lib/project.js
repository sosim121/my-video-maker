import { randomUUID } from "node:crypto";

export const FPS = 30;

export const ASPECTS = {
  portrait: { label: "세로 9:16", width: 1080, height: 1920 },
  landscape: { label: "가로 16:9", width: 1920, height: 1080 },
};

const MAX_SCENE_CHARS = 40;

export function splitScript(script) {
  const normalized = String(script ?? "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  if (!normalized) {
    return [];
  }

  const sentenceMatches =
    normalized.match(/[^.!?。！？…]+[.!?。！？…]+["'”’)]*|[^.!?。！？…]+$/g) ?? [];

  return sentenceMatches.flatMap((sentence) => splitLongSentence(sentence.trim())).filter(Boolean);
}

function splitLongSentence(sentence) {
  if (sentence.length <= MAX_SCENE_CHARS) {
    return [sentence];
  }

  const parts = sentence
    .split(/([,，;；:：])\s*/)
    .reduce((acc, part, index, arr) => {
      if (index % 2 === 0) {
        const punctuation = arr[index + 1] ?? "";
        acc.push(`${part}${punctuation}`.trim());
      }
      return acc;
    }, [])
    .filter(Boolean);

  if (parts.length <= 1) {
    return chunkByLength(sentence, MAX_SCENE_CHARS);
  }

  const chunks = [];
  let current = "";
  for (const part of parts) {
    const next = current ? `${current} ${part}` : part;
    if (next.length > MAX_SCENE_CHARS && current) {
      chunks.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.flatMap((chunk) =>
    chunk.length > MAX_SCENE_CHARS ? chunkByLength(chunk, MAX_SCENE_CHARS) : [chunk],
  );
}

function chunkByLength(text, size) {
  const chunks = [];
  let remaining = text.trim();
  while (remaining.length > size) {
    const slice = remaining.slice(0, size);
    const breakAt = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("　"));
    const minBreak = Math.floor(size * 0.6);
    const index = breakAt > minBreak ? breakAt : size;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
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
