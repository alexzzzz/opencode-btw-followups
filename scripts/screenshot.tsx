// Renders the /btw dialog with its real code and writes the captured frame out.
//
// The dialog is mounted through the same Solid setup the host uses
// (@opentui/solid testRender + PluginContextProvider), inside a simulated
// session view, so the picture carries the colors a reader sees while every
// pixel of the layout comes from the dialog's own components. The frame goes
// to temp/btw-window.html, which a browser turns into docs/btw-window.png.
//
// Compiled with the settings build.mjs explains; run via scripts/screenshot.mjs.

import { testRender } from "@opentui/solid"
import { createSyntaxStyle } from "../src/syntax.ts"
import { transcriptRows } from "../src/layout.ts"
import { PluginContextProvider } from "@opencode/plugin/tui"
import { ThreadDialog } from "../src/window.tsx"
import { readFileSync } from "node:fs"

const writeOut = (path: string, body: string) => Bun.write(path, body)

const ROWS = 39
const COLS = 110
const PANEL_W = 88
const PANEL_LEFT = (COLS - PANEL_W) / 2
const PANEL_TOP = 5

const THEME = {
  background: { base: "#000000" },
  hue: { interactive: { 200: "#fab283" } },
  text: {
    base: "#eeeeee",
    muted: "#808080",
    faint: "#636363",
    feedback: { error: { base: "#e5484d" } },
  },
  surface: () => ({
    background: { base: "#141414", raised: { high: "#1e1e1e" } },
  }),
  markdown: {
    text: "#eeeeee",
    heading: "#eeeeee",
    strong: "#f5a742",
    emphasis: "#a8a8a8",
    listItem: "#808080",
    blockQuote: "#a8a8a8",
    code: "#7fd88f",
    link: "#fab283",
    linkText: "#eeeeee",
  },
  syntax: {
    comment: "#5f5f5f",
    string: "#fab283",
    number: "#d4d4d4",
    keyword: "#f5a742",
    type: "#f5a742",
    function: "#fab283",
    operator: "#808080",
    variable: "#eeeeee",
    punctuation: "#808080",
  },
}

const ANSWER_ONE = [
  "**Short answer: the tests share a directory, and the first one empties it.**",
  "",
  "The suite writes its fixtures into `build/tmp` and never cleans up. The",
  "second test removes that directory, so it wipes what the first one left.",
  "",
  "### What to change",
  "",
  "1. Give every test a directory of its own",
  "2. Remove the shared one in `afterEach`, and keep the fixtures in the repo",
].join("\n")

const ANSWER_TWO = [
  "No. The cache key is the hash of the file's content, not its path, so a",
  "test that reads `fixtures/session.json` gets the same key either way.",
  "",
  "What changes is the time to the first run. The copy is one `cp` per test,",
  "and the suite goes from 40 seconds to 43.",
].join("\n")

const SESSION = [
  "> the ci is failing on the second test again",
  "",
  "`bun test` is green now. The first run empties the shared fixture directory",
  "and the second starts from it, which reads like a broken checkout rather",
  "than a flaky test.",
]

const syntax = createSyntaxStyle(THEME)

const context = {
  theme: THEME,
  data: {
    session: { get: () => undefined },
    location: { model: { list: () => undefined } },
  },
  renderer: {
    on: () => {},
    off: () => {},
    getSelection: () => null,
  },
  keymap: { layer: () => {} },
}

const STATE = {
  turns: [
    {
      turn: { question: "why does the ci fail on the second test?", answer: ANSWER_ONE },
      spokenAt: 10,
    },
    {
      turn: { question: "does that break the cache?", answer: ANSWER_TWO },
      spokenAt: 12,
    },
  ],
  asked: [],
  pending: ["what is cheapest to try first?"],
  active: undefined,
  failure: undefined,
  draft: "",
  place: undefined,
}

const state = () => STATE

const SessionView = () => (
  <box width={COLS} height={ROWS} backgroundColor={THEME.background.base}>
    <text fg="#8f8f8f">{SESSION[0]}</text>
    <text fg="#4a4a4a">{SESSION[2]}</text>
    <text fg="#4a4a4a">{SESSION[3]}</text>
    <text fg="#4a4a4a">{SESSION[4]}</text>
  </box>
)

const setup = await testRender(
  () => (
    <PluginContextProvider value={context as never}>
      <SessionView />
      <box
        position="absolute"
        left={PANEL_LEFT}
        top={PANEL_TOP}
        width={PANEL_W}
        height="auto"
        backgroundColor={THEME.surface("dialog").background.base}
      >
        <ThreadDialog
          sessionID="ses_harness"
          state={state}
          syntax={syntax}
          limit={() => transcriptRows(ROWS)}
          rows={() => ROWS}
          sessionMoved={() => false}
          played={() => true}
          markPlayed={() => {}}
          remember={() => {}}
          ask={() => {}}
          clear={() => {}}
          close={() => {}}
          copy={() => {}}
          copyBlock={() => {}}
        />
      </box>
    </PluginContextProvider>
  ),
  { width: COLS, height: ROWS, consoleMode: "disabled" },
)

await setup.renderOnce()
await setup.flush()
setup.resize(COLS, ROWS)
await setup.renderOnce()
await setup.flush()

const frame = setup.captureSpans()
console.log(
  frame.lines
    .map((line) => line.spans.map((span) => span.text).join(""))
    .join("\n"),
)

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const rgb = (c: { r: number; g: number; b: number; a: number }) =>
  c.a === 0
    ? "transparent"
    : `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`

const rowHtml = (spans: readonly { text: string; fg: never; bg: never; attributes: number }[]) =>
  spans
    .map((span) => {
      const bold = (span.attributes & 1) !== 0 ? "font-weight:700" : ""
      return `<span style="color:${rgb(span.fg)};background:${rgb(span.bg)};${bold}">${esc(span.text)}</span>`
    })
    .join("")

const font = readFileSync("C:/Windows/Fonts/CascadiaCode.ttf").toString("base64")

const html = [
  "<!doctype html><meta charset='utf-8'>",
  "<body style='margin:0;background:#000'>",
  `<style>@font-face{font-family:'CascadiaEmbed';src:url(data:font/ttf;base64,${font}) format('truetype');}</style>`,
  "<div id='term' style='font-family:CascadiaEmbed,monospace;font-variant-ligatures:none;font-feature-settings:\"liga\" 0,\"calt\" 0;font-size:20px;line-height:13px;white-space:pre;padding:16px'>",
  ...frame.lines.map((line) => `<div>${rowHtml(line.spans)}</div>`),
  "</div>",
].join("\n")

await writeOut("temp/btw-window.html", html)
process.exit(0)
