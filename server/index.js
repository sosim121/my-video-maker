import express from "express";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  applyUploadedNarrationTiming,
  createProjectFromScript,
  recalculateSceneStarts,
  roundDuration,
} from "./lib/project.js";
import { decodeMulterFilename, getAssetType, getMediaDuration, sanitizeFilename } from "./lib/media.js";
import {
  ensureStorage,
  ProjectNotFoundError,
  projectPath,
  readProject,
  saveProject,
  UPLOADS_DIR,
  RENDERS_DIR,
} from "./lib/storage.js";
import { listWindowsVoices, synthesizeWindowsTts } from "./lib/tts.js";
import { renderJobs, renderProjectToMp4 } from "./lib/render.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const isProduction = process.argv.includes("--production") || process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 5173);

await ensureStorage();

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use("/media", express.static(UPLOADS_DIR));

const VALID_ID = /^[0-9a-zA-Z._\-]{1,128}$/;

function isValidId(id) {
  return typeof id === "string" && VALID_ID.test(id);
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
  }
}

const projectLocks = new Map();

function withProjectLock(projectId, fn) {
  const previous = projectLocks.get(projectId) ?? Promise.resolve();
  const current = previous.then(() => fn(), () => fn());
  projectLocks.set(projectId, current.then(() => {}, () => {}));
  return current;
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, _file, callback) {
      const projectId = req.params.id;
      if (!isValidId(projectId)) {
        callback(new Error("INVALID_PROJECT_ID"));
        return;
      }
      if (!fsSync.existsSync(projectPath(projectId))) {
        callback(new ProjectNotFoundError(projectId));
        return;
      }
      const dir = path.join(UPLOADS_DIR, projectId);
      fsSync.mkdirSync(dir, { recursive: true });
      callback(null, dir);
    },
    filename(req, file, callback) {
      const assetId = randomUUID();
      req.assetId = assetId;
      const decodedName = decodeMulterFilename(file.originalname);
      file.originalname = decodedName;
      callback(null, `${assetId}-${sanitizeFilename(decodedName)}`);
    },
  }),
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/voices", async (_req, res, next) => {
  try {
    const voices = await listWindowsVoices();
    res.json({ voices });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", async (req, res, next) => {
  try {
    const body = req.body;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({ error: "요청 본문이 올바르지 않습니다." });
      return;
    }
    const { script, aspectRatio } = body;
    if (aspectRatio !== undefined && !["portrait", "landscape"].includes(aspectRatio)) {
      res.status(400).json({ error: "aspectRatio는 portrait 또는 landscape 여야 합니다." });
      return;
    }
    const project = createProjectFromScript({ script, aspectRatio });
    if (project.scenes.length === 0) {
      res.status(400).json({ error: "스크립트를 입력해 주세요." });
      return;
    }
    const saved = await saveProject(project);
    res.status(201).json({ project: saved });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:id", async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      res.status(400).json({ error: "잘못된 프로젝트 ID 형식입니다." });
      return;
    }
    res.json({ project: await readProject(req.params.id) });
  } catch (error) {
    next(error);
  }
});

const MAX_SCENE_DURATION = 600;

function normalizeSceneDuration(input, fallback) {
  const num = Number(input);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(MAX_SCENE_DURATION, Math.max(0.5, num));
}

app.patch("/api/projects/:id", async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      res.status(400).json({ error: "잘못된 프로젝트 ID 형식입니다." });
      return;
    }
    const body = req.body;
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({ error: "요청 본문이 올바르지 않습니다." });
      return;
    }

    const saved = await withProjectLock(req.params.id, async () => {
      const current = await readProject(req.params.id);
      let nextProject = { ...current };

      if (body.aspectRatio !== undefined) {
        if (!["portrait", "landscape"].includes(body.aspectRatio)) {
          const err = new Error("aspectRatio는 portrait 또는 landscape 여야 합니다.");
          err.statusCode = 400;
          throw err;
        }
        nextProject.aspectRatio = body.aspectRatio;
      }

      if (body.captionStyle !== undefined) {
        if (body.captionStyle === null || typeof body.captionStyle !== "object") {
          const err = new Error("captionStyle은 객체여야 합니다.");
          err.statusCode = 400;
          throw err;
        }
        nextProject.captionStyle = {
          ...nextProject.captionStyle,
          ...body.captionStyle,
        };
      }

      if (body.scenes !== undefined) {
        if (!Array.isArray(body.scenes)) {
          const err = new Error("scenes는 배열이어야 합니다.");
          err.statusCode = 400;
          throw err;
        }
        const incoming = new Map(body.scenes.map((scene) => [scene?.id, scene]));
        nextProject.scenes = recalculateSceneStarts(
          nextProject.scenes.map((scene) => {
            const patch = incoming.get(scene.id);
            if (!patch) return scene;
            return {
              ...scene,
              text: String(patch.text ?? scene.text),
              duration: roundDuration(normalizeSceneDuration(patch.duration, scene.duration)),
              fitMode: ["cover", "contain"].includes(patch.fitMode) ? patch.fitMode : scene.fitMode,
            };
          }),
        );
      }

      return saveProject(nextProject);
    });

    res.json({ project: saved });
  } catch (error) {
    if (error?.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.post("/api/projects/:id/tts", async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      res.status(400).json({ error: "잘못된 프로젝트 ID 형식입니다." });
      return;
    }

    const initialProject = await readProject(req.params.id);
    const voiceName = req.body?.voiceName || initialProject.voiceTrack?.voiceName || "Google Translate Korean";
    const projectUploadDir = path.join(UPLOADS_DIR, initialProject.id);
    await fs.mkdir(projectUploadDir, { recursive: true });

    const ttsResults = await Promise.all(
      initialProject.scenes.map(async (scene) => {
        const assetId = randomUUID();
        const filename = `${assetId}-tts.mp3`;
        const outPath = path.join(projectUploadDir, filename);
        const { duration } = await synthesizeWindowsTts({
          text: scene.text,
          outPath,
          voiceName,
        });
        return { sceneId: scene.id, assetId, filename, outPath, duration };
      })
    );

    const saved = await withProjectLock(req.params.id, async () => {
      const project = await readProject(req.params.id);
      for (const result of ttsResults) {
        const scene = project.scenes.find((s) => s.id === result.sceneId);
        if (!scene) {
          await safeUnlink(result.outPath);
          continue;
        }
        const scaledDuration = result.duration ? (result.duration / 1.25) : 0;

        project.assets[result.assetId] = {
          id: result.assetId,
          type: "audio",
          path: result.outPath,
          url: `/media/${project.id}/${result.filename}`,
          duration: roundDuration(result.duration ?? 0),
          mimeType: "audio/mpeg",
          originalName: "tts.mp3",
        };
        scene.ttsAssetId = result.assetId;
        scene.duration = roundDuration(Math.max(0.6, scaledDuration || scene.duration) + 0.12);
      }

      project.voiceTrack = {
        mode: "windows-tts",
        voiceName,
        assetId: null,
      };
      project.scenes = recalculateSceneStarts(project.scenes);
      project.output = null;

      return saveProject(project);
    });

    res.json({ project: saved });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:id/narration", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "음성 파일을 선택해 주세요." });
      return;
    }

    const assetType = getAssetType(req.file.mimetype, req.file.originalname);
    if (assetType !== "audio") {
      await safeUnlink(req.file.path);
      res.status(400).json({ error: "음성 파일만 업로드할 수 있어요." });
      return;
    }

    const duration = await getMediaDuration(req.file.path);
    if (duration == null || duration <= 0) {
      await safeUnlink(req.file.path);
      res.status(400).json({ error: "음성 파일의 길이를 읽을 수 없어요." });
      return;
    }

    const assetId = req.assetId;
    const saved = await withProjectLock(req.params.id, async () => {
      let project = await readProject(req.params.id);
      project.assets[assetId] = {
        id: assetId,
        type: "audio",
        path: req.file.path,
        url: `/media/${project.id}/${req.file.filename}`,
        duration,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
      };
      project.voiceTrack = {
        mode: "uploaded",
        voiceName: "업로드한 음성",
        assetId,
      };
      project = applyUploadedNarrationTiming(project, duration);
      project.output = null;
      return saveProject(project);
    });

    res.json({ project: saved });
  } catch (error) {
    if (req.file?.path) await safeUnlink(req.file.path);
    next(error);
  }
});

app.post("/api/projects/:id/scenes/:sceneId/media", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "이미지 또는 동영상 파일을 선택해 주세요." });
      return;
    }

    const assetType = getAssetType(req.file.mimetype, req.file.originalname);
    if (!["image", "video"].includes(assetType)) {
      await safeUnlink(req.file.path);
      res.status(400).json({ error: "이미지 또는 동영상 파일만 사용할 수 있어요." });
      return;
    }

    const videoDuration = assetType === "video" ? await getMediaDuration(req.file.path) : null;

    const assetId = req.assetId;
    const saved = await withProjectLock(req.params.id, async () => {
      const project = await readProject(req.params.id);
      const scene = project.scenes.find((item) => item.id === req.params.sceneId);
      if (!scene) {
        const err = new Error("장면을 찾을 수 없어요.");
        err.statusCode = 404;
        throw err;
      }

      const previousAssetId = scene.mediaAssetId;
      const previousAsset = previousAssetId ? project.assets[previousAssetId] : null;

      project.assets[assetId] = {
        id: assetId,
        type: assetType,
        path: req.file.path,
        url: `/media/${project.id}/${req.file.filename}`,
        duration: videoDuration,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
      };
      scene.mediaAssetId = assetId;
      project.output = null;

      if (previousAsset && previousAssetId !== assetId) {
        delete project.assets[previousAssetId];
        await safeUnlink(previousAsset.path);
      }

      return saveProject(project);
    });

    res.json({ project: saved });
  } catch (error) {
    if (error?.statusCode === 404) {
      if (req.file?.path) await safeUnlink(req.file.path);
      res.status(404).json({ error: error.message });
      return;
    }
    if (req.file?.path) await safeUnlink(req.file.path);
    next(error);
  }
});

const RENDER_JOB_TTL_MS = 60 * 60 * 1000;

function scheduleRenderJobCleanup(renderId) {
  setTimeout(() => {
    renderJobs.delete(renderId);
  }, RENDER_JOB_TTL_MS).unref?.();
}

app.post("/api/projects/:id/render", async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      res.status(400).json({ error: "잘못된 프로젝트 ID 형식입니다." });
      return;
    }
    const project = await readProject(req.params.id);
    const renderId = randomUUID();
    const job = {
      id: renderId,
      projectId: project.id,
      status: "queued",
      progress: 0,
      error: null,
      outputLocation: null,
      createdAt: new Date().toISOString(),
    };
    renderJobs.set(renderId, job);
    res.status(202).json({ render: publicRenderJob(job) });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    setImmediate(async () => {
      try {
        const outputLocation = await renderProjectToMp4({ project, baseUrl, renderId });
        const nextProject = await readProject(project.id);
        nextProject.output = {
          renderId,
          path: outputLocation,
          url: `/api/projects/${project.id}/export`,
          createdAt: new Date().toISOString(),
        };
        await saveProject(nextProject);
      } catch (error) {
        const failed = renderJobs.get(renderId);
        if (failed) {
          failed.status = "failed";
          failed.error = error.message;
        }
      } finally {
        scheduleRenderJobCleanup(renderId);
      }
    });
  } catch (error) {
    next(error);
  }
});

function publicRenderJob(job) {
  return {
    id: job.id,
    projectId: job.projectId,
    status: job.status,
    progress: job.progress,
    error: job.error,
    createdAt: job.createdAt,
  };
}

app.get("/api/renders/:renderId", (req, res) => {
  if (!isValidId(req.params.renderId)) {
    res.status(400).json({ error: "잘못된 렌더 ID 형식입니다." });
    return;
  }
  const job = renderJobs.get(req.params.renderId);
  if (!job) {
    res.status(404).json({ error: "렌더 작업을 찾을 수 없어요." });
    return;
  }
  res.json({ render: publicRenderJob(job) });
});

app.get("/api/projects/:id/export", async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      res.status(400).json({ error: "잘못된 프로젝트 ID 형식입니다." });
      return;
    }
    const project = await readProject(req.params.id);
    const outputPath = project.output?.path;
    if (!outputPath) {
      res.status(404).json({ error: "완성된 mp4가 아직 없어요." });
      return;
    }
    const resolvedOutput = path.resolve(outputPath);
    const resolvedRenders = path.resolve(RENDERS_DIR);
    if (!resolvedOutput.startsWith(resolvedRenders + path.sep)) {
      res.status(404).json({ error: "완성된 mp4가 아직 없어요." });
      return;
    }
    try {
      await fs.access(resolvedOutput);
    } catch {
      res.status(404).json({ error: "완성된 mp4가 아직 없어요." });
      return;
    }
    res.download(resolvedOutput, `${sanitizeFilename(project.title)}.mp4`);
  } catch (error) {
    next(error);
  }
});

if (isProduction) {
  const distDir = path.join(root, "dist");
  if (!fsSync.existsSync(path.join(distDir, "index.html"))) {
    console.error("\n[오류] dist/index.html이 없습니다.");
    console.error("프로덕션 모드 실행 전에 `npm run build`를 먼저 실행하세요.\n");
    process.exit(1);
  }
  app.use(express.static(distDir));
  app.use((_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
  });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    try {
      const url = req.originalUrl;
      const template = await fs.readFile(path.join(root, "index.html"), "utf8");
      const html = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
}

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof ProjectNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error?.message === "INVALID_PROJECT_ID") {
    res.status(400).json({ error: "잘못된 프로젝트 ID 형식입니다." });
    return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: `파일 업로드 오류: ${error.code}` });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({ error: "요청 본문이 올바른 JSON 형식이 아닙니다." });
    return;
  }
  if (error?.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "처리 중 문제가 생겼어요." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Local video maker is running at http://0.0.0.0:${port}`);
});
