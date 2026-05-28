import test from "node:test";
import assert from "node:assert/strict";
import {
  applyUploadedNarrationTiming,
  createProjectFromScript,
  splitScript,
} from "./lib/project.js";

test("splitScript splits strictly by newlines, keeping punctuation intact on a single line", () => {
  assert.deepEqual(splitScript("안녕하세요. 오늘은 테스트입니다! Is this working? Yes."), [
    "안녕하세요. 오늘은 테스트입니다! Is this working? Yes.",
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
    script: "하나입니다.\n둘입니다.",
    aspectRatio: "landscape",
  });

  assert.equal(project.aspectRatio, "landscape");
  assert.equal(project.scenes.length, 2);
  assert.equal(project.scenes[0].start, 0);
  assert.equal(project.scenes[1].start, project.scenes[0].duration);
});

test("applyUploadedNarrationTiming distributes duration by text length", () => {
  const project = createProjectFromScript({
    script: "짧다.\n이것은 훨씬 더 긴 문장입니다.",
    aspectRatio: "portrait",
  });
  const timed = applyUploadedNarrationTiming(project, 10);

  assert.equal(Math.round(timed.scenes[0].duration + timed.scenes[1].duration), 10);
  assert.ok(timed.scenes[1].duration > timed.scenes[0].duration);
});

test("splitScript does not split long sentences without newlines", () => {
  const longSentence = "이것은 종결부호나 쉼표가 있더라도 줄바꿈이 없으면 절대 쪼개지지 않고 온전히 하나의 자막으로 유지되어야 하는 아주 긴 테스트 문장입니다.";
  const chunks = splitScript(longSentence);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], longSentence);
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

