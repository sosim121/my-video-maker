import fs from "node:fs/promises";
import { parseFile } from "music-metadata";

export function getAssetType(mimeType) {
  if (mimeType?.startsWith("image/")) {
    return "image";
  }
  if (mimeType?.startsWith("video/")) {
    return "video";
  }
  if (mimeType?.startsWith("audio/")) {
    return "audio";
  }
  return "file";
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
  const cleaned = String(name ?? "asset")
    .normalize("NFKD")
    .replace(/[^\w.\-가-힣]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "asset";
}
