import fs from "node:fs/promises";
import path from "node:path";
import { parseFile } from "music-metadata";

const EXTENSION_TYPES = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".webp": "image",
  ".bmp": "image",
  ".mp4": "video",
  ".mov": "video",
  ".webm": "video",
  ".mkv": "video",
  ".avi": "video",
  ".m4v": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".m4a": "audio",
  ".aac": "audio",
  ".ogg": "audio",
  ".flac": "audio",
};

export function getAssetType(mimeType, filename) {
  if (mimeType?.startsWith("image/")) {
    return "image";
  }
  if (mimeType?.startsWith("video/")) {
    return "video";
  }
  if (mimeType?.startsWith("audio/")) {
    return "audio";
  }
  if (filename) {
    const ext = path.extname(String(filename)).toLowerCase();
    if (EXTENSION_TYPES[ext]) {
      return EXTENSION_TYPES[ext];
    }
  }
  return "file";
}

export function decodeMulterFilename(name) {
  if (typeof name !== "string") return "asset";
  try {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    if (decoded.includes("�")) return name;
    return decoded;
  } catch {
    return name;
  }
}

export async function getMediaDuration(filePath) {
  try {
    const metadata = await parseFile(filePath);
    return metadata.format.duration ?? null;
  } catch {
    return null;
  }
}

export async function getWavDuration(filePath) {
  const buffer = await fs.readFile(filePath);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }

  let offset = 12;
  let byteRate = null;
  let dataSize = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      byteRate = buffer.readUInt32LE(chunkStart + 8);
    }

    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!byteRate || !dataSize) {
    return null;
  }

  return dataSize / byteRate;
}

export function sanitizeFilename(name) {
  const base = path.basename(String(name ?? "asset"));
  const cleaned = base
    .replace(/\.\.+/g, ".")
    .replace(/[^\p{L}\p{N}.\-_]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return cleaned || "asset";
}
