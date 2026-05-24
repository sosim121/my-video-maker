import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const STORAGE_DIR = path.join(ROOT_DIR, "storage");
export const PROJECTS_DIR = path.join(STORAGE_DIR, "projects");
export const UPLOADS_DIR = path.join(STORAGE_DIR, "uploads");
export const RENDERS_DIR = path.join(STORAGE_DIR, "renders");
export const TEMP_DIR = path.join(STORAGE_DIR, "tmp");

export async function ensureStorage() {
  await Promise.all([
    fs.mkdir(PROJECTS_DIR, { recursive: true }),
    fs.mkdir(UPLOADS_DIR, { recursive: true }),
    fs.mkdir(RENDERS_DIR, { recursive: true }),
    fs.mkdir(TEMP_DIR, { recursive: true }),
  ]);
}

export function projectPath(projectId) {
  return path.join(PROJECTS_DIR, `${projectId}.json`);
}

export async function readProject(projectId) {
  const raw = await fs.readFile(projectPath(projectId), "utf8");
  return JSON.parse(raw);
}

export async function saveProject(project) {
  const next = {
    ...project,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(projectPath(project.id), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
