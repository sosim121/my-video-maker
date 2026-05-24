import fs from "node:fs";

const WINDOWS_CHROMIUM_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

export function findBrowserExecutable() {
  const candidates = [process.env.REMOTION_BROWSER_EXECUTABLE, ...WINDOWS_CHROMIUM_CANDIDATES].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}
