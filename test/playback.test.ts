import { describe, expect, test } from "bun:test"
import {
  createAnswerPlayback,
  releasePlayback,
  type PlayableTurn,
  type Timer,
} from "../src/playback.ts"

const a = "ses_a"
const b = "ses_b"

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
    const playback = createAnswerPlayback(a, () => [item], c.timer)
    expect(playback.text(0)).toBe("x".repeat(10))
    expect(playback.revealing()).toBe(true)
  })

  test("each tick reveals another chunk until the answer is whole", () => {
    const c = clock()
    const item = turn("x".repeat(900))
    const playback = createAnswerPlayback(a, () => [item], c.timer)
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
    const playback = createAnswerPlayback(a, () => [item], c.timer)
    expect(playback.text(0)).toBe("h")
    c.tick()
    expect(playback.text(0)).toBe("he")
  })

  test("an empty answer shows nothing and never plays", () => {
    const c = clock()
    const item = turn("")
    const playback = createAnswerPlayback(a, () => [item], c.timer)
    expect(playback.text(0)).toBe("")
    expect(playback.revealing()).toBe(false)
    expect(c.starts()).toBe(0)
  })

  test("emoji, combining characters and CJK text advance as whole graphemes", () => {
    const c = clock()
    const item = turn("e\u0301👨‍👩‍👧‍👦漢👍🏽")
    const playback = createAnswerPlayback(a, () => [item], c.timer)
    expect(playback.text(0)).toBe("e\u0301")
    c.tick()
    expect(playback.text(0)).toBe("e\u0301👨‍👩‍👧‍👦")
    c.tick()
    expect(playback.text(0)).toBe("e\u0301👨‍👩‍👧‍👦漢")
    c.tick()
    expect(playback.text(0)).toBe("e\u0301👨‍👩‍👧‍👦漢👍🏽")
    expect(playback.revealing()).toBe(false)
  })

  test("tick boundaries count graphemes rather than UTF-16 code units", () => {
    const c = clock()
    const item = turn("e\u0301".repeat(100))
    const playback = createAnswerPlayback(a, () => [item], c.timer)
    expect(playback.text(0)).toBe("e\u0301e\u0301")
    c.tick()
    expect(playback.text(0)).toBe("e\u0301".repeat(4))
  })

  test("the code-point fallback never splits a surrogate pair", () => {
    const segmenter = Intl.Segmenter
    Object.defineProperty(Intl, "Segmenter", { value: undefined, configurable: true })
    try {
      const c = clock()
      const item = turn("A😀B")
      const playback = createAnswerPlayback(a, () => [item], c.timer)
      expect(playback.text(0)).toBe("A")
      c.tick()
      expect(playback.text(0)).toBe("A😀")
      c.tick()
      expect(playback.text(0)).toBe("A😀B")
    } finally {
      Object.defineProperty(Intl, "Segmenter", { value: segmenter, configurable: true })
    }
  })
})

describe("one answer, played once", () => {
  test("two reads a couple of milliseconds apart start one play", () => {
    const c = clock()
    const item = turn("x".repeat(1200))
    const playback = createAnswerPlayback(a, () => [item], c.timer)
    playback.text(0)
    playback.text(0)
    expect(c.starts()).toBe(1)
    c.tick()
    expect(playback.text(0)).toBe("x".repeat(28))
  })

  test("a window opened over a played answer draws it whole", () => {
    const item = turn("x".repeat(1200))
    const earlier = clock()
    const first = createAnswerPlayback(a, () => [item], earlier.timer)
    first.text(0)
    expect(earlier.starts()).toBe(1)
    first.stop()

    const later = clock()
    const reopened = createAnswerPlayback(a, () => [item], later.timer)
    expect(reopened.text(0)).toBe("x".repeat(1200))
    expect(later.starts()).toBe(0)
    expect(reopened.revealing()).toBe(false)
  })

  test("an answer that landed behind a closed window plays when it opens", () => {
    const item = turn("x".repeat(1200))
    const c = clock()
    const opened = createAnswerPlayback(a, () => [item], c.timer)
    expect(opened.text(0)).toBe("x".repeat(14))
    expect(c.starts()).toBe(1)
    expect(opened.revealing()).toBe(true)
  })

  test("a turn marked played by a caller is drawn whole without a play", () => {
    const item = turn("x".repeat(1200))
    const c = clock()
    const playback = createAnswerPlayback(a, () => [item], c.timer)
    playback.markPlayed(item)
    expect(playback.text(0)).toBe("x".repeat(1200))
    expect(c.starts()).toBe(0)
  })

  test("an answer played in one session plays again in another", () => {
    const item = turn("x".repeat(1200))
    const first = clock()
    createAnswerPlayback(a, () => [item], first.timer).text(0)
    expect(first.starts()).toBe(1)

    const second = clock()
    const other = createAnswerPlayback(b, () => [item], second.timer)
    expect(other.text(0)).toBe("x".repeat(14))
    expect(second.starts()).toBe(1)
  })
})

describe("playback memory", () => {
  test("releasing a session forgets its played answers and leaves other sessions alone", () => {
    releasePlayback(a)
    releasePlayback(b)
    const item = turn("x".repeat(1200))
    const first = clock()
    createAnswerPlayback(a, () => [item], first.timer).text(0)
    const other = clock()
    createAnswerPlayback(b, () => [item], other.timer).text(0)
    expect(first.starts()).toBe(1)
    expect(other.starts()).toBe(1)

    releasePlayback(a)

    const reopened = clock()
    createAnswerPlayback(a, () => [item], reopened.timer).text(0)
    expect(reopened.starts()).toBe(1)
    const untouched = clock()
    createAnswerPlayback(b, () => [item], untouched.timer).text(0)
    expect(untouched.starts()).toBe(0)
  })
})

describe("the answer under the reader", () => {
  test("only the newest turn is revealed; older turns are whole", () => {
    const c = clock()
    const older = turn("older answer")
    const newest = turn("x".repeat(900))
    const playback = createAnswerPlayback(a, () => [older, newest], c.timer)
    expect(playback.text(0)).toBe("older answer")
    expect(playback.text(1)).toBe("x".repeat(10))
  })

  test("a new answer stops the play of the one before it", () => {
    const c = clock()
    const old = turn("x".repeat(900))
    let items = [old]
    const playback = createAnswerPlayback(a, () => items, c.timer)
    playback.text(0)
    items = [old, turn("y".repeat(900))]
    expect(playback.text(1)).toBe("y".repeat(10))
    expect(c.starts()).toBe(2)
  })

  test("stopping the window cancels the play in progress", () => {
    const c = clock()
    const item = turn("x".repeat(900))
    const playback = createAnswerPlayback(a, () => [item], c.timer)
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
    const playback = createAnswerPlayback(a, () => [item], c.timer)
    playback.text(0)
    for (let i = 0; i < 7; i += 1) c.tick()
    expect(playback.text(0)).toBe("one two")
  })
})
