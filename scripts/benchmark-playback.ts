import { performance } from "node:perf_hooks"
import { createAnswerPlayback, type PlayableTurn, type Timer } from "../src/playback.ts"

const TURNS = 256
const OLDER_CHARS = 2048
const NEWEST_CHARS = 8192
const TICKS = 90
const legacy = process.argv.includes("--legacy")

let answerReads = 0
let mappings = 0
const source = Array.from({ length: TURNS }, (_, index) => {
  const chars = index === TURNS - 1 ? NEWEST_CHARS : OLDER_CHARS
  const answer = (index === TURNS - 1 ? "n" : "x").repeat(chars)
  return {
    get answer() {
      answerReads += 1
      return answer
    },
  } satisfies PlayableTurn
})
const mapped = source.map((turn) => turn)
const turns = () => {
  if (!legacy) return mapped
  mappings += 1
  return source.map((turn) => turn)
}
let tick: (() => void) | undefined
const timer: Timer = {
  every(_ms, callback) {
    tick = callback
    return () => {
      tick = undefined
    }
  },
}
const playback = createAnswerPlayback("ses_benchmark", turns, timer)
const render = () => {
  if (legacy) {
    for (let index = 0; index < TURNS; index += 1) playback.text(index)
    return
  }
  playback.text(TURNS - 1)
}

const started = performance.now()
render()
for (let index = 1; index < TICKS; index += 1) {
  tick?.()
  render()
}
const elapsedMs = performance.now() - started
const complete = playback.text(TURNS - 1).length === NEWEST_CHARS

console.log(
  JSON.stringify({
    mode: legacy ? "legacy-all-turns" : "visible-newest",
    turns: TURNS,
    olderChars: OLDER_CHARS,
    newestChars: NEWEST_CHARS,
    ticks: TICKS,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    answerReads,
    mappings,
    complete,
  }),
)
