import { describe, expect, test } from "bun:test"
import { createPlayback, type PlayableTurn, type Timer } from "../src/playback.ts"

type Clock = {
  readonly timer: Timer
  readonly tick: () => void
  readonly starts: () => number
  readonly running: () => boolean
}

const clock = (): Clock => {
  let task: (() => void) | undefined
  let started = 0
  let live = false
  return {
    timer: {
      every(_ms, tick) {
        started += 1
        task = tick
        live = true
        return () => {
          live = false
          task = undefined
        }
      },
    },
    tick() {
      if (!live) return
      task?.()
    },
    starts: () => started,
    running: () => live,
  }
}

const turn = (answer: string): PlayableTurn => ({ answer })

describe("playing an answer", () => {
  test("the first chunk lands as soon as the answer is read", () => {
    const c = clock()
    const item = turn("x".repeat(900))
    const playback = createPlayback(() => [item], c.timer)
    expect(playback.text(0)).toBe("x".repeat(10))
    expect(playback.revealing()).toBe(true)
  })

  test("each tick reveals another chunk until the answer is whole", () => {
    const c = clock()
    const item = turn("x".repeat(900))
    const playback = createPlayback(() => [item], c.timer)
    playback.text(0)
    c.tick()
    expect(playback.text(0)).toBe("x".repeat(20))
    for (let i = 0; i < 88; i += 1) c.tick()
    expect(playback.text(0)).toBe("x".repeat(900))
    expect(playback.revealing()).toBe(false)
    expect(c.running()).toBe(false)
  })

  test("a short answer is revealed one character at a time", () => {
    const c = clock()
    const item = turn("hello")
    const playback = createPlayback(() => [item], c.timer)
    expect(playback.text(0)).toBe("h")
    c.tick()
    expect(playback.text(0)).toBe("he")
  })

  test("an empty answer shows nothing and never plays", () => {
    const c = clock()
    const item = turn("")
    const playback = createPlayback(() => [item], c.timer)
    expect(playback.text(0)).toBe("")
    expect(playback.revealing()).toBe(false)
    expect(c.starts()).toBe(0)
  })
})

describe("one answer, played once", () => {
  test("two reads a couple of milliseconds apart start one play", () => {
    const c = clock()
    const item = turn("x".repeat(1200))
    const playback = createPlayback(() => [item], c.timer)
    playback.text(0)
    playback.text(0)
    expect(c.starts()).toBe(1)
    c.tick()
    expect(playback.text(0)).toBe("x".repeat(28))
  })

  test("a window opened over a played answer draws it whole", () => {
    const item = turn("x".repeat(1200))
    const earlier = clock()
    const first = createPlayback(() => [item], earlier.timer)
    first.text(0)
    expect(earlier.starts()).toBe(1)
    first.stop()

    const later = clock()
    const reopened = createPlayback(() => [item], later.timer)
    expect(reopened.text(0)).toBe("x".repeat(1200))
    expect(later.starts()).toBe(0)
    expect(reopened.revealing()).toBe(false)
  })

  test("an answer that landed behind a closed window plays when it opens", () => {
    const item = turn("x".repeat(1200))
    const c = clock()
    const opened = createPlayback(() => [item], c.timer)
    expect(opened.text(0)).toBe("x".repeat(14))
    expect(c.starts()).toBe(1)
    expect(opened.revealing()).toBe(true)
  })

  test("a turn marked played by a caller is drawn whole without a play", () => {
    const item = turn("x".repeat(1200))
    const c = clock()
    const playback = createPlayback(() => [item], c.timer)
    playback.markPlayed(item)
    expect(playback.text(0)).toBe("x".repeat(1200))
    expect(c.starts()).toBe(0)
  })
})

describe("the answer under the reader", () => {
  test("only the newest turn is revealed; older turns are whole", () => {
    const c = clock()
    const older = turn("older answer")
    const newest = turn("x".repeat(900))
    const playback = createPlayback(() => [older, newest], c.timer)
    expect(playback.text(0)).toBe("older answer")
    expect(playback.text(1)).toBe("x".repeat(10))
  })

  test("a new answer stops the play of the one before it", () => {
    const c = clock()
    const old = turn("x".repeat(900))
    let items = [old]
    const playback = createPlayback(() => items, c.timer)
    playback.text(0)
    items = [old, turn("y".repeat(900))]
    expect(playback.text(1)).toBe("y".repeat(10))
    expect(c.starts()).toBe(2)
  })

  test("stopping the window cancels the play in progress", () => {
    const c = clock()
    const item = turn("x".repeat(900))
    const playback = createPlayback(() => [item], c.timer)
    playback.text(0)
    expect(c.running()).toBe(true)
    playback.stop()
    expect(c.running()).toBe(false)
    c.tick()
    expect(playback.text(0)).toBe("x".repeat(10))
  })

  test("a cut at whitespace leaves no trailing empty block", () => {
    const c = clock()
    const item = turn("one two three")
    const playback = createPlayback(() => [item], c.timer)
    playback.text(0)
    for (let i = 0; i < 7; i += 1) c.tick()
    expect(playback.text(0)).toBe("one two")
  })
})
