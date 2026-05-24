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
import { getAssetType, getMediaDuration, sanitizeFilename } from "./lib/media.js";
import {
  ensureStorage,
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

const upload = multer({
  storage: multer.diskStorage({
    destination(req, _file, callback) {
      const projectId = req.params.id;
      const dir = path.join(UPLOADS_DIR, projectId);
      fsSync.mkdirSync(dir, { recursive: true });
      callback(null, dir);
    },
    filename(req, file, callback) {
      const assetId = randomUUID();
      req.assetId = assetId;
      callback(null, `${assetId}-${sanitizeFilename(file.originalname)}`);
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
    const { script, aspectRatio } = req.body ?? {};
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
    res.json({ project: await readProject(req.params.id) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/projects/:id", async (req, res, next) => {
  try {
    const current = await readProject(req.params.id);
    const body = req.body ?? {};
    let nextProject = { ...current };

    if (body.aspectRatio) {
      nextProject.aspectRatio = body.aspectRatio;
    }

    if (body.captionStyle) {
      nextProject.captionStyle = {
        ...nextProject.captionStyle,
        ...body.captionStyle,
      };
    }

    if (Array.isArray(body.scenes)) {
      const incoming = new Map(body.scenes.map((scene) => [scene.id, scene]));
      nextProject.scenes = recalculateSceneStarts(
        nextProject.scenes.map((scene) => {
          const patch = incoming.get(scene.id);
          if (!patch) {
            return scene;
          }
          return {
            ...scene,
            text: String(patch.text ?? scene.text),
            duration: roundDuration(Math.max(0.5, Number(patch.duration) || scene.duration)),
            fitMode: ["cover", "contain"].includes(patch.fitMode) ? patch.fitMode : scene.fitMode,
          };
        }),
      );
    }

    const saved = await saveProject(nextProject);
    res.json({ project: saved });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:id/tts", async (req, res, next) => {
  try {
    let project = await readProject(req.params.id);
    const voiceName = req.body?.voiceName || project.voiceTrack?.voiceName || "Google Translate Korean";
    const projectUploadDir = path.join(UPLOADS_DIR, project.id);
    await fs.mkdir(projectUploadDir, { recursive: true });

    for (const scene of project.scenes) {
      const assetId = randomUUID();
      const isGoogle = voiceName?.startsWith("Google Translate") || process.platform !== "win32";
      const filename = `${assetId}-tts.${isGoogle ? "mp3" : "wav"}`;
      const outPath = path.join(projectUploadDir, filename);
      const { duration } = await synthesizeWindowsTts({
        text: scene.text,
        outPath,
        voiceName,
      });

      const scaledDuration = duration ? (duration / 1.25) : 0;

      project.assets[assetId] = {
        id: assetId,
        type: "audio",
        path: outPath,
        url: `/media/${project.id}/${filename}`,
        duration: roundDuration(scaledDuration),
        mimeType: isGoogle ? "audio/mpeg" : "audio/wav",
        originalName: isGoogle ? "tts.mp3" : "tts.wav",
      };
      scene.ttsAssetId = assetId;
      scene.duration = roundDuration(Math.max(0.6, scaledDuration || scene.duration) + 0.12);
    }

    project.voiceTrack = {
      mode: "windows-tts",
      voiceName,
      assetId: null,
    };
    project.scenes = recalculateSceneStarts(project.scenes);
    project.output = null;

    const saved = await saveProject(project);
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

    let project = await readProject(req.params.id);
    const assetId = req.assetId;
    const duration = await getMediaDuration(req.file.path);

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

    const saved = await saveProject(project);
    res.json({ project: saved });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:id/scenes/:sceneId/media", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "이미지 또는 동영상 파일을 선택해 주세요." });
      return;
    }

    const assetType = getAssetType(req.file.mimetype);
    if (!["image", "video"].includes(assetType)) {
      res.status(400).json({ error: "이미지 또는 동영상 파일만 사용할 수 있어요." });
      return;
    }

    const project = await readProject(req.params.id);
    const scene = project.scenes.find((item) => item.id === req.params.sceneId);
    if (!scene) {
      res.status(404).json({ error: "장면을 찾을 수 없어요." });
      return;
    }

    const assetId = req.assetId;
    project.assets[assetId] = {
      id: assetId,
      type: assetType,
      path: req.file.path,
      url: `/media/${project.id}/${req.file.filename}`,
      duration: assetType === "video" ? await getMediaDuration(req.file.path) : null,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    };
    scene.mediaAssetId = assetId;
    project.output = null;

    const saved = await saveProject(project);
    res.json({ project: saved });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:id/render", async (req, res, next) => {
  try {
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
    res.status(202).json({ render: job });

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
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/renders/:renderId", (req, res) => {
  const job = renderJobs.get(req.params.renderId);
  if (!job) {
    res.status(404).json({ error: "렌더 작업을 찾을 수 없어요." });
    return;
  }
  res.json({ render: job });
});

app.get("/api/projects/:id/export", async (req, res, next) => {
  try {
    const project = await readProject(req.params.id);
    const outputPath = project.output?.path;
    if (!outputPath || !outputPath.startsWith(RENDERS_DIR)) {
      res.status(404).json({ error: "완성된 mp4가 아직 없어요." });
      return;
    }
    await fs.access(outputPath);
    res.download(outputPath, `${sanitizeFilename(project.title)}.mp4`);
  } catch (error) {
    next(error);
  }
});

if (isProduction) {
  app.use(express.static(path.join(root, "dist")));
  app.use((_req, res) => {
    res.sendFile(path.join(root, "dist", "index.html"));
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
  res.status(500).json({ error: error.message || "처리 중 문제가 생겼어요." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Local video maker is running at http://0.0.0.0:${port}`);
});
