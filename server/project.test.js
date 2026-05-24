import test from "node:test";
import assert from "node:assert/strict";
import {
  applyUploadedNarrationTiming,
  createProjectFromScript,
  splitScript,
} from "./lib/project.js";

test("splitScript handles Korean and English punctuation", () => {
  assert.deepEqual(splitScript("안녕하세요. 오늘은 테스트입니다! Is this working? Yes."), [
    "안녕하세요.",
    "오늘은 테스트입니다!",
    "Is this working?",
    "Yes.",
  ]);
});

test("splitScript ignores empty lines and trims text", () => {
  assert.deepEqual(splitScript("  첫 문장입니다.\n\n  둘째 문장입니다.  "), [
    "첫 문장입니다.",
    "둘째 문장입니다.",
  ]);
});

test("createProjectFromScript computes scene starts", () => {
  const project = createProjectFromScript({
    script: "하나입니다. 둘입니다.",
    aspectRatio: "landscape",
  });

  assert.equal(project.aspectRatio, "landscape");
  assert.equal(project.scenes.length, 2);
  assert.equal(project.scenes[0].start, 0);
  assert.equal(project.scenes[1].start, project.scenes[0].duration);
});

test("applyUploadedNarrationTiming distributes duration by text length", () => {
  const project = createProjectFromScript({
    script: "짧다. 이것은 훨씬 더 긴 문장입니다.",
    aspectRatio: "portrait",
  });
  const timed = applyUploadedNarrationTiming(project, 10);

  assert.equal(Math.round(timed.scenes[0].duration + timed.scenes[1].duration), 10);
  assert.ok(timed.scenes[1].duration > timed.scenes[0].duration);
});

test("splitScript splits very long sentences without punctuation dynamically at space boundaries", () => {
  const longSentence = "이것은 종결부호가 아예 없는 아주 긴 문장이며 자동으로 적절한 글자 수 범위의 공백에서 쪼개져야 합니다";
  // Length is 57, which is > 40.
  // It should split into two chunks.
  const chunks = splitScript(longSentence);
  assert.ok(chunks.length >= 2);
  chunks.forEach(chunk => {
    assert.ok(chunk.length <= 40);
  });
});

test("splitScript splits very long sentences at comma when available", () => {
  const longSentenceWithComma = "이것은 아주 긴 문장이며 쉼표가 있을 때, 그 쉼표의 위치를 기준으로 우선하여 분할하는 테스트 문장입니다";
  // Length is 58, which is > 40.
  const chunks = splitScript(longSentenceWithComma);
  assert.ok(chunks.length >= 2);
  chunks.forEach(chunk => {
    assert.ok(chunk.length <= 40);
  });
  // Should split near the comma
  assert.ok(chunks[0].includes("쉼표가 있을 때,"));
});

test("synthesizeGoogleTts downloads audio successfully and returns duration", async () => {
  const { synthesizeGoogleTts } = await import("./lib/tts.js");
  const { TEMP_DIR } = await import("./lib/storage.js");
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const tempOut = path.join(TEMP_DIR, "test-google-tts.mp3");
  try {
    const result = await synthesizeGoogleTts({
      text: "Hello world",
      outPath: tempOut,
      lang: "en"
    });
    assert.ok(result.duration > 0);
    const exists = await fs.stat(tempOut).then(() => true).catch(() => false);
    assert.ok(exists);
  } finally {
    await fs.rm(tempOut, { force: true });
  }
});

