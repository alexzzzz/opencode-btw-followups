import { describe, expect, test } from "bun:test"
import {
  CLOSE_LABEL,
  HEADER_GAP,
  HEADER_PAD,
  HEADER_TITLE,
  headerRow,
  type HeaderRow,
} from "../src/header.ts"
import type { ReasoningState } from "../src/reasoning.ts"

const rowWidth = (row: HeaderRow) =>
  2 * HEADER_PAD +
  HEADER_TITLE.length +
  row.cells.length * HEADER_GAP +
  row.cells.reduce((width, cell) => {
    if (cell === "count") return width + row.count.length
    if (cell === "marker") return width + row.marker.length
    if (cell === "above") return width + row.above.length
    if (cell === "reasoning") return width + row.reasoning.length
    if (cell === "close") return width + CLOSE_LABEL.length
    return width
  }, 0)

const shown = (row: HeaderRow) => row.cells.filter((cell) => cell !== "spacer")

describe("headerRow", () => {
  test("a wide panel names the count, the prompts, what is above and the escape", () => {
    const row = headerRow(88, "1 answered", 3, 6, false)
    expect(shown(row)).toEqual(["count", "reasoning", "marker", "above", "close"])
    expect(row.marker).toBe("▸ 6 quick prompts")
    expect(row.above).toBe("↑ 3 above")
  })

  test("the reasoning state reads in words on a wide panel", () => {
    expect(headerRow(88, "1 answered", 3, 6, false, "on").reasoning).toBe("reasoning as is")
    expect(headerRow(88, "1 answered", 3, 6, false, "off").reasoning).toBe("reasoning off")
    expect(headerRow(88, "1 answered", 3, 6, false, { level: "low" }).reasoning).toBe("reasoning low")
    expect(headerRow(88, "1 answered", 3, 6, false, "unsupported").reasoning).toBe("reasoning n/a")
  })

  test("a reduced level shortens through the same three tiers", () => {
    expect(headerRow(68, "1 answered", 3, 6, false, { level: "low" }).reasoning).toBe("reason low")
    expect(headerRow(60, "1 answered", 3, 6, false, { level: "low" }).reasoning).toBe("low")
    expect(headerRow(71, "1 answered", 3, 6, false, { level: "minimal" }).reasoning).toBe(
      "reason minimal",
    )
    expect(headerRow(64, "1 answered", 3, 6, false, { level: "minimal" }).reasoning).toBe("minimal")
  })

  test("a narrow panel shortens the reasoning cell before it drops it", () => {
    const row = headerRow(68, "1 answered", 3, 6, false, "off")
    expect(shown(row)).toEqual(["reasoning", "marker", "above", "close"])
    expect(row.reasoning).toBe("reason off")
  })

  test("an even narrower panel keeps the shortest reasoning label", () => {
    expect(headerRow(63, "1 answered", 3, 6, false, "on").reasoning).toBe("as is")
    expect(headerRow(61, "1 answered", 3, 6, false, "unsupported").reasoning).toBe("n/a")
  })

  test("the reasoning cell drops before the escape, the notice or the marker", () => {
    const row = headerRow(54, "1 answered", 3, 6, false, "on")
    expect(shown(row)).toEqual(["marker", "above", "close"])
    expect(row.marker).toBe("▸ 6 quick prompts")
  })

  test("the reasoning cell is gone before the marker shortens", () => {
    const row = headerRow(43, "1 answered", 3, 6, false, "on")
    expect(shown(row)).toEqual(["marker", "close"])
    expect(row.marker).toBe("▸ 6 quick prompts")
  })

  test("a phone-width panel drops the count rather than wrap it", () => {
    const row = headerRow(44, "1 answered", 0, 6, false)
    expect(shown(row)).toEqual(["marker", "close"])
    expect(row.count).toBe("1 answered")
  })

  test("nothing said yet leaves no empty count cell behind", () => {
    expect(shown(headerRow(88, "", 0, 6, false))).toEqual(["reasoning", "marker", "close"])
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
    const states: readonly ReasoningState[] = [
      "on",
      "off",
      "unsupported",
      { level: "low" },
      { level: "minimal" },
      { level: "medium" },
    ]
    for (let width = 11; width <= 140; width += 1) {
      for (const count of ["", "1 answered", "3 answered, 2 waiting"]) {
        for (const aboveRows of [0, 3, 120]) {
          for (const reasoning of states) {
            const row = headerRow(width, count, aboveRows, 6, false, reasoning)
            expect(rowWidth(row)).toBeLessThanOrEqual(width)
          }
        }
      }
    }
  })
})
