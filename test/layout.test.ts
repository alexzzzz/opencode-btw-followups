import { describe, expect, test } from "bun:test"
import {
  COMPOSER_ROWS,
  MIN_PANEL,
  PANEL_CHROME,
  listTranscriptRows,
  transcriptRows,
} from "../src/layout.ts"

describe("transcriptRows", () => {
  test("the panel fits the terminal at every height that can hold it", () => {
    for (let rows = MIN_PANEL; rows <= 200; rows += 1) {
      expect(transcriptRows(rows) + PANEL_CHROME + COMPOSER_ROWS).toBeLessThanOrEqual(rows)
    }
  })

  test("a tall terminal leaves the panel clear of both edges", () => {
    expect(transcriptRows(100)).toBe(60)
    expect(transcriptRows(50)).toBe(30)
  })

  test("a short terminal gives the transcript the room that is left", () => {
    expect(transcriptRows(20)).toBe(6)
  })

  test("a terminal too short to hold the panel is refused rather than overflowed", () => {
    expect(transcriptRows(MIN_PANEL - 1)).toBe(0)
    expect(transcriptRows(4)).toBe(0)
  })

  test("the shortest terminal that opens is the one above MIN_PANEL", () => {
    expect(transcriptRows(MIN_PANEL)).toBe(0)
    expect(transcriptRows(MIN_PANEL + 1)).toBe(1)
  })
})

describe("listTranscriptRows", () => {
  test("the list grows the transcript into the room a short composer leaves", () => {
    expect(listTranscriptRows(17, 1, 10)).toBe(8)
  })

  test("a tall terminal keeps the share the transcript already had", () => {
    expect(listTranscriptRows(100, 1, 10)).toBe(transcriptRows(100))
  })

  test("a composer at its tallest leaves nothing to grow into", () => {
    expect(listTranscriptRows(20, COMPOSER_ROWS, 10)).toBe(transcriptRows(20))
  })

  test("the growth never takes the panel off the terminal", () => {
    for (let rows = MIN_PANEL; rows <= 60; rows += 1) {
      expect(listTranscriptRows(rows, 1, 10) + PANEL_CHROME + 1).toBeLessThanOrEqual(rows)
    }
  })
})
