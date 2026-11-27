import { describe, expect, test } from "bun:test"
import { listTranscriptRoom, panelHeights } from "../src/layout.ts"

const CHROME = 8

describe("listTranscriptRoom", () => {
  test("the list gets only the rows left after the chrome and the real composer", () => {
    expect(listTranscriptRoom(17, 6)).toBe(3)
    expect(listTranscriptRoom(17, 1)).toBe(8)
    expect(listTranscriptRoom(100, 6)).toBe(60)
    expect(listTranscriptRoom(13, 6)).toBe(0)
  })
})

describe("panelHeights", () => {
  test("a closed list asks for the transcript's share and no minimum", () => {
    expect(panelHeights({ rows: 100, listed: false, composerRows: 6, needed: 8 })).toEqual({
      maxHeight: 60,
      minHeight: 0,
    })
    expect(panelHeights({ rows: 50, listed: false, composerRows: 1, needed: 8 })).toEqual({
      maxHeight: 30,
      minHeight: 0,
    })
  })

  test("a terminal too short for the panel gets no rows", () => {
    expect(panelHeights({ rows: 13, listed: false, composerRows: 6, needed: 8 })).toEqual({
      maxHeight: 0,
      minHeight: 0,
    })
    expect(panelHeights({ rows: 14, listed: true, composerRows: 6, needed: 8 })).toEqual({
      maxHeight: 0,
      minHeight: 0,
    })
  })

  test("an open list takes only the leftover rows it needs", () => {
    expect(panelHeights({ rows: 17, listed: true, composerRows: 1, needed: 10 })).toEqual({
      maxHeight: 8,
      minHeight: 8,
    })
    expect(panelHeights({ rows: 17, listed: true, composerRows: 1, needed: 4 })).toEqual({
      maxHeight: 4,
      minHeight: 4,
    })
    expect(panelHeights({ rows: 100, listed: true, composerRows: 1, needed: 10 })).toEqual({
      maxHeight: 60,
      minHeight: 10,
    })
  })

  test("a composer at its cap leaves the list no blank row", () => {
    expect(panelHeights({ rows: 20, listed: true, composerRows: 6, needed: 10 })).toEqual({
      maxHeight: 6,
      minHeight: 6,
    })
    expect(panelHeights({ rows: 17, listed: true, composerRows: 6, needed: 10 })).toEqual({
      maxHeight: 3,
      minHeight: 3,
    })
  })

  test("the panel never exceeds the terminal it is given", () => {
    for (let rows = 14; rows <= 200; rows += 1) {
      for (const composerRows of [1, 3, 6]) {
        for (const listed of [false, true]) {
          const { maxHeight, minHeight } = panelHeights({ rows, listed, composerRows, needed: 10 })
          expect(maxHeight + CHROME + composerRows).toBeLessThanOrEqual(rows)
          expect(minHeight).toBeLessThanOrEqual(maxHeight)
        }
      }
    }
  })
})
