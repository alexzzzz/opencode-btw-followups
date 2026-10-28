import { describe, expect, test } from "bun:test"
import {
  CLOSE_LABEL,
  HEADER_GAP,
  HEADER_PAD,
  HEADER_TITLE,
  headerRow,
  type HeaderRow,
} from "../src/header.ts"

const rowWidth = (row: HeaderRow) =>
  2 * HEADER_PAD +
  HEADER_TITLE.length +
  row.cells.length * HEADER_GAP +
  row.cells.reduce((width, cell) => {
    if (cell === "count") return width + row.count.length
    if (cell === "marker") return width + row.marker.length
    if (cell === "above") return width + row.above.length
    if (cell === "close") return width + CLOSE_LABEL.length
    return width
  }, 0)

const shown = (row: HeaderRow) => row.cells.filter((cell) => cell !== "spacer")

describe("headerRow", () => {
  test("a wide panel names the count, the prompts, what is above and the escape", () => {
    const row = headerRow(88, "1 answered", 3, 6, false)
    expect(shown(row)).toEqual(["count", "marker", "above", "close"])
    expect(row.marker).toBe("▸ 6 quick prompts")
    expect(row.above).toBe("↑ 3 above")
  })

  test("a phone-width panel drops the count rather than wrap it", () => {
    const row = headerRow(44, "1 answered", 0, 6, false)
    expect(shown(row)).toEqual(["marker", "close"])
    expect(row.count).toBe("1 answered")
  })

  test("nothing said yet leaves no empty count cell behind", () => {
    expect(shown(headerRow(88, "", 0, 6, false))).toEqual(["marker", "close"])
  })

  test("nothing above is no notice, whatever the width", () => {
    expect(headerRow(88, "1 answered", 0, 6, false).above).toBe("")
    expect(shown(headerRow(88, "1 answered", 0, 6, false))).not.toContain("above")
  })

  test("the marker the list opens from turns over with it", () => {
    expect(headerRow(88, "", 0, 6, true).marker).toBe("▾ 6 quick prompts")
  })

  test("a narrower panel shortens the marker before it drops the escape", () => {
    const row = headerRow(30, "1 answered", 0, 6, false)
    expect(shown(row)).toEqual(["marker"])
    expect(row.marker).toBe("▸ 6 prompts")
  })

  test("an even narrower panel keeps the number alone", () => {
    expect(headerRow(19, "1 answered", 0, 6, false).marker).toBe("▸ 6")
  })

  test("a panel with no room for anything keeps the title alone", () => {
    expect(headerRow(11, "1 answered", 2, 6, false).cells).toEqual([])
  })

  test("the row a panel gets never needs more cells than the panel has", () => {
    for (let width = 11; width <= 140; width += 1) {
      for (const count of ["", "1 answered", "3 answered, 2 waiting"]) {
        for (const aboveRows of [0, 3, 120]) {
          const row = headerRow(width, count, aboveRows, 6, false)
          expect(rowWidth(row)).toBeLessThanOrEqual(width)
        }
      }
    }
  })
})
