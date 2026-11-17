import { describe, expect, test } from "bun:test"
import { createReading, transcriptCap } from "../src/reading.ts"
import type { Scrollbox } from "../src/reading.ts"
import { listTranscriptRows } from "../src/layout.ts"
import type { Reading } from "../src/state.ts"

type Probe = {
  readonly box: Scrollbox
  readonly scrolled: number[]
}

const probe = (start: Partial<Scrollbox> = {}): Probe => {
  const scrolled: number[] = []
  const box: Scrollbox = {
    scrollTop: 0,
    height: 10,
    scrollHeight: 100,
    screenY: 40,
    viewport: { screenY: 0 },
    stickyScroll: true,
    scrollTo(top: number) {
      scrolled.push(top)
      this.scrollTop = top
    },
    ...start,
  }
  return { box, scrolled }
}

const atBottom = () => probe({ scrollTop: 90 })

describe("holding the newest question", () => {
  test("a reader at the bottom stops following when the question reaches the top", () => {
    const { box, scrolled } = atBottom()
    const reading = createReading(undefined, 1)
    reading.entered(box)
    reading.onFrame(box, true, true)
    expect(scrolled).toEqual([90])
    expect(box.stickyScroll).toBe(false)
    expect(reading.view().hold).toBe(true)

    box.scrollHeight = 140
    reading.onFrame(box, true, true)
    expect(scrolled).toEqual([90, 130])
  })

  test("a reader parked above is not moved", () => {
    const { box, scrolled } = probe({ scrollTop: 0 })
    const reading = createReading(undefined, 1)
    reading.entered(box)
    reading.onFrame(box, true, true)
    expect(scrolled).toEqual([])
    expect(box.stickyScroll).toBe(true)
    expect(reading.view().hold).toBe(false)
  })

  test("no anchor leaves the transcript following its sticky bottom", () => {
    const { box, scrolled } = atBottom()
    const reading = createReading(undefined, 1)
    reading.entered(box)
    reading.onFrame(box, true, false)
    expect(scrolled).toEqual([])
    expect(box.stickyScroll).toBe(true)
  })

  test("a hand scroll cancels the hold for the rest of that answer", () => {
    const { box, scrolled } = atBottom()
    const reading = createReading(undefined, 1)
    reading.entered(box)
    reading.onFrame(box, true, true)
    expect(scrolled).toEqual([90])

    reading.onScroll(box, 1)
    box.scrollHeight = 140
    reading.onFrame(box, true, true)
    expect(scrolled).toEqual([90])
    expect(box.stickyScroll).toBe(true)
  })

  test("a window opened over a playing answer still holds it", () => {
    const { box, scrolled } = atBottom()
    const reading = createReading(undefined, 1)
    reading.entered(box)
    reading.onFrame(box, true, true)
    expect(scrolled).toEqual([90])
  })
})

describe("the below and above notice", () => {
  test("an answer that lands above the reader is counted", () => {
    const { box } = probe({ scrollTop: 0 })
    const reading = createReading(undefined, 1)
    reading.entered(box)
    reading.onAnswer(3, box)
    expect(reading.view().newAnswers).toBe(2)
  })

  test("reaching the bottom clears the notice", () => {
    const { box } = probe({ scrollTop: 0 })
    const reading = createReading(undefined, 1)
    reading.entered(box)
    reading.onAnswer(3, box)
    expect(reading.view().newAnswers).toBe(2)

    box.scrollTo(90)
    reading.onScroll(box, 3)
    expect(reading.view().newAnswers).toBe(0)
  })

  test("the counts describe the whole transcript", () => {
    const { box } = probe({ scrollTop: 30 })
    const reading = createReading(undefined, 1)
    reading.entered(box)
    expect(reading.view().above).toBe(30)
    expect(reading.view().below).toBe(60)
  })

  test("clearing the thread drops the notice and the saved place", () => {
    const { box } = probe({ scrollTop: 0 })
    const reading = createReading({ top: 4, height: 10, scrollHeight: 100 }, 3)
    reading.onAnswer(0, box)
    expect(reading.view().newAnswers).toBe(0)
    expect(reading.view().place).toBeUndefined()
  })
})

describe("restoring the reading position", () => {
  const saved: Reading = { top: 20, height: 10, scrollHeight: 100 }

  test("a shorter transcript leaves the position for a later frame", () => {
    const { box, scrolled } = probe({ scrollHeight: 80 })
    const reading = createReading(saved, 1)
    reading.entered(box)
    expect(scrolled).toEqual([])
    expect(reading.view().place).toEqual(saved)
  })

  test("a transcript as tall as the one left behind restores the place", () => {
    const { box, scrolled } = probe()
    const reading = createReading(saved, 1)
    reading.entered(box)
    expect(scrolled).toEqual([20])
    expect(reading.view().place).toBeUndefined()
  })

  test("a position at the bottom restores to the bottom", () => {
    const { box, scrolled } = probe()
    const reading = createReading({ top: 90, height: 10, scrollHeight: 100 }, 1)
    reading.entered(box)
    expect(scrolled).toEqual([100])
  })
})

describe("transcriptCap", () => {
  test("the closed list takes the limit and asks for no minimum", () => {
    expect(transcriptCap({ listed: false, rows: 40, composerRows: 1, needed: 8, limit: 24 })).toEqual({
      max: 24,
      min: 0,
    })
  })

  test("the open list grows the transcript into the room it leaves", () => {
    const max = listTranscriptRows(17, 1, 10)
    expect(transcriptCap({ listed: true, rows: 17, composerRows: 1, needed: 10, limit: 6 })).toEqual({
      max,
      min: Math.min(10, max),
    })
  })
})
