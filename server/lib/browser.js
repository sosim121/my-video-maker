import fs from "node:fs";
import os from "node:os";

const WINDOWS_CHROMIUM_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const MACOS_CHROMIUM_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

const LINUX_CHROMIUM_CANDIDATES = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
  "/usr/bin/microsoft-edge",
];

function getPlatformCandidates() {
  const platform = os.platform();
  if (platform === "darwin") return MACOS_CHROMIUM_CANDIDATES;
  if (platform === "win32") return WINDOWS_CHROMIUM_CANDIDATES;
  return LINUX_CHROMIUM_CANDIDATES;
}

export function findBrowserExecutable() {
  const candidates = [
    process.env.REMOTION_BROWSER_EXECUTABLE,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    ...getPlatformCandidates(),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}
