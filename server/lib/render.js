import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { FPS, getProjectDimensions, getProjectDuration } from "./project.js";
import { RENDERS_DIR, ROOT_DIR } from "./storage.js";
import { findBrowserExecutable } from "./browser.js";

export const renderJobs = new Map();

export function makeRenderableProject(project, baseUrl) {
  const next = structuredClone(project);
  next.assets = Object.fromEntries(
    Object.entries(next.assets ?? {}).map(([id, asset]) => [
      id,
      {
        ...asset,
        url: new URL(asset.url, baseUrl).href,
      },
    ]),
  );
  return next;
}

export async function renderProjectToMp4({ project, baseUrl, renderId }) {
  const job = renderJobs.get(renderId);
  const dimensions = getProjectDimensions(project.aspectRatio);
  const durationInFrames = Math.max(1, Math.ceil(getProjectDuration(project) * FPS));
  const outputLocation = path.join(RENDERS_DIR, `${project.id}-${renderId}.mp4`);
  const inputProps = {
    project: makeRenderableProject(project, baseUrl),
  };
  const browserExecutable = findBrowserExecutable();

  job.status = "bundling";
  job.progress = 0.02;

  const serveUrl = await bundle({
    entryPoint: path.join(ROOT_DIR, "src", "remotion", "entry.jsx"),
    webpackOverride: (config) => config,
  });

  job.status = "rendering";
  job.progress = 0.08;

  const composition = await selectComposition({
    serveUrl,
    id: "ScriptVideo",
    inputProps,
    browserExecutable,
  });

  await renderMedia({
    composition: {
      ...composition,
      width: dimensions.width,
      height: dimensions.height,
      fps: FPS,
      durationInFrames,
    },
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps,
    browserExecutable,
    concurrency: 1, // Limit memory footprint on free hosting instances to prevent OOM SIGKILL
    onProgress: ({ progress }) => {
      job.progress = Math.max(job.progress, Math.min(0.99, progress));
    },
  });

  job.status = "completed";
  job.progress = 1;
  job.outputLocation = outputLocation;
  return outputLocation;
}
