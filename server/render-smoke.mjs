import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 5200;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const server = spawn(process.execPath, ["server/index.js"], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: "test",
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

let exitCode = 0;
try {
  await waitForServer();

  const created = await postJson("/api/projects", {
    script: "렌더링 테스트입니다.",
    aspectRatio: "portrait",
  });

  const tts = await postJson(`/api/projects/${created.project.id}/tts`, {
    voiceName: "Microsoft Heami Desktop",
  });

  assert.equal(tts.project.voiceTrack.mode, "windows-tts");

  const renderStart = await postJson(`/api/projects/${created.project.id}/render`, {});
  const render = await waitForRender(renderStart.render.id);
  assert.equal(render.status, "completed");

  const project = await getJson(`/api/projects/${created.project.id}`);
  assert.ok(project.project.output?.path);
  await fs.access(project.project.output.path);

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId: created.project.id,
        renderId: render.id,
        output: project.project.output.path,
      },
      null,
      2,
    ),
  );
} catch (error) {
  exitCode = 1;
  console.error(error);
  console.error("Server logs:");
  console.error(logs || "(no logs)");
} finally {
  server.kill();
  process.exitCode = exitCode;
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const data = await getJson("/api/health");
      if (data.ok) {
        return;
      }
    } catch {
      await delay(350);
    }
  }
  throw new Error(`Server did not become ready. Logs: ${logs}`);
}

async function waitForRender(renderId) {
  const started = Date.now();
  while (Date.now() - started < 180000) {
    const data = await getJson(`/api/renders/${renderId}`);
    if (data.render.status === "completed") {
      return data.render;
    }
    if (data.render.status === "failed") {
      throw new Error(data.render.error || "Render failed");
    }
    await delay(1000);
  }
  throw new Error(`Render timed out. Logs: ${logs}`);
}

async function getJson(url) {
  const response = await fetch(`${BASE_URL}${url}`);
  return readResponse(response);
}

async function postJson(url, body) {
  const response = await fetch(`${BASE_URL}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
