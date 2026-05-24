import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { getMediaDuration } from "./media.js";

function isEnglishText(text) {
  const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
  const koreanCount = (text.match(/[\uac00-\ud7a3]/g) || []).length;
  return englishCount > koreanCount;
}

export async function synthesizeGoogleTts({ text, outPath, lang = "ko" }) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(`Google TTS request failed: ${response.statusText}`);
  }
  const fileStream = fsSync.createWriteStream(outPath);
  await finished(Readable.fromWeb(response.body).pipe(fileStream));
  return {
    duration: await getMediaDuration(outPath),
  };
}

export async function synthesizeWindowsTts({ text, outPath, voiceName }) {
  // Always use Google Translate TTS for cross-platform compatibility
  const lang = voiceName?.includes("English") || isEnglishText(text) ? "en" : "ko";
  return synthesizeGoogleTts({ text, outPath, lang });
}

export async function listWindowsVoices() {
  return [
    { name: "Google Translate Korean", culture: "ko-KR", gender: "Female" },
    { name: "Google Translate English", culture: "en-US", gender: "Female" },
  ];
}
