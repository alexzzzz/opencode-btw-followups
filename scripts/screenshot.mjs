// Builds nothing: the harness runs raw under Bun, whose plugin from
// @opentui/solid/preload compiles the JSX with the renderer's runtime and
// rewrites every solid-js load to it. Then the frame the harness captures
// goes through a headless browser into docs/btw-window.png.

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const entry = process.argv[2] ?? "scripts/screenshot.tsx"

const rendered = spawnSync("bun", ["--preload", "@opentui/solid/preload", entry], {
  stdio: "inherit",
})
if (rendered.status !== 0) process.exit(rendered.status)

if (process.argv[2]) process.exit(0)

const browser = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find(existsSync)

if (!browser) throw new Error("no Edge or Chrome found for the headless shot")

const url = "file:///G:/repos/opencode-btw-followups/temp/btw-window.html"
const shot = spawnSync(
  browser,
  [
    "--headless",
    "--disable-gpu",
    "--force-device-scale-factor=2",
    "--hide-scrollbars",
    "--screenshot=G:/repos/opencode-btw-followups/temp/btw-window-full.png",
    "--window-size=2800,2200",
    url,
  ],
  { stdio: "inherit" },
)
if (shot.status !== 0) process.exit(shot.status)

const cropped = spawnSync(
  "bun",
  ["scripts/crop-png.mjs", "temp/btw-window-full.png", "docs/btw-window.png"],
  { stdio: "inherit" },
)
process.exit(cropped.status ?? 0)
