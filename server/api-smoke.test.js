import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("API smoke flow creates TTS, uploads narration, and attaches scene media", { timeout: 90000 }, async () => {
  const server = spawn(process.execPath, ["server/index.js", "--production"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  server.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  try {
    await waitForServer(logs);

    const created = await postJson("/api/projects", {
      script: "첫 장면입니다. 둘째 장면입니다.",
      aspectRatio: "landscape",
    });
    assert.equal(created.project.aspectRatio, "landscape");
    assert.equal(created.project.scenes.length, 2);

    const tts = await postJson(`/api/projects/${created.project.id}/tts`, {
      voiceName: "Microsoft Heami Desktop",
    });
    assert.equal(tts.project.voiceTrack.mode, "windows-tts");
    assert.ok(tts.project.scenes[0].ttsAssetId);

    const firstAudio = Object.values(tts.project.assets).find((asset) => asset.type === "audio");
    const audioBytes = await fs.readFile(firstAudio.path);
    const narrationForm = new FormData();
    narrationForm.append("file", new Blob([audioBytes], { type: "audio/wav" }), "narration.wav");
    const narration = await postForm(`/api/projects/${created.project.id}/narration`, narrationForm);
    assert.equal(narration.project.voiceTrack.mode, "uploaded");

    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/luznWQAAAABJRU5ErkJggg==",
      "base64",
    );
    const mediaForm = new FormData();
    mediaForm.append("file", new Blob([pngBytes], { type: "image/png" }), "scene.png");
    const sceneId = narration.project.scenes[0].id;
    const media = await postForm(
      `/api/projects/${created.project.id}/scenes/${sceneId}/media`,
      mediaForm,
    );
    assert.ok(media.project.scenes[0].mediaAssetId);
  } finally {
    server.kill();
  }
});

async function waitForServer(getLogs) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();
      if (data.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  throw new Error(`Server did not become ready. Logs: ${getLogs}`);
}

async function postJson(url, body) {
  const response = await fetch(`${BASE_URL}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readResponse(response);
}

async function postForm(url, body) {
  const response = await fetch(`${BASE_URL}${url}`, {
    method: "POST",
    body,
  });
  return readResponse(response);
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
}
