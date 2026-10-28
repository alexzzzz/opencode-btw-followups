import { describe, expect, test } from "bun:test"
import {
  belowLabel,
  clearLabel,
  copyLabel,
  countLabel,
  FOOTER_GAP,
  FOOTER_PAD,
  keyHints,
} from "../src/footer.ts"

const PANEL_WIDTH = 88

describe("countLabel", () => {
  test("a session with nothing asked and nothing queued says nothing", () => {
    expect(countLabel(0, 0)).toBe("")
  })

  test("a queue with no answer yet says how many wait", () => {
    expect(countLabel(0, 2)).toBe("2 waiting")
  })

  test("answers alone say how many", () => {
    expect(countLabel(3, 0)).toBe("3 answered")
  })

  test("answers and a queue are named together", () => {
    expect(countLabel(3, 2)).toBe("3 answered, 2 waiting")
  })
})

describe("copyLabel", () => {
  test("an empty thread has nothing to copy", () => {
    expect(copyLabel(0)).toBe("nothing to copy")
  })

  test("a thread with a turn offers the copy", () => {
    expect(copyLabel(1)).toBe("copy thread")
  })
})

describe("belowLabel", () => {
  test("nothing new and nothing below says nothing", () => {
    expect(belowLabel(0, 0)).toBe("")
  })

  test("one new answer offers the way down", () => {
    expect(belowLabel(1, 4)).toBe("↓ 1 new answer, click to read")
  })

  test("several new answers are plural", () => {
    expect(belowLabel(3, 4)).toBe("↓ 3 new answers, click to read")
  })

  test("rows below with nothing new count rows", () => {
    expect(belowLabel(0, 4)).toBe("↓ 4 below")
  })
})

describe("clearLabel", () => {
  test("a wide panel names the count and the escape", () => {
    expect(clearLabel(1, PANEL_WIDTH)).toBe("delete again to clear 1 question · esc keeps them")
  })

  test("more than one question is plural", () => {
    expect(clearLabel(2, PANEL_WIDTH)).toBe("delete again to clear 2 questions · esc keeps them")
  })

  test("a narrow panel drops the reassurance rather than cut it", () => {
    expect(clearLabel(2, 20)).toBe("delete again to clear 2")
  })
})

describe("keyHints", () => {
  test("the hints a panel gets fit the room the row has left", () => {
    for (const width of [20, 40, 51, 60, 88, 140]) {
      for (const right of ["", "↓ 4 below", "↓ 2 new answers, click to read"]) {
        const copy = "copy thread"
        const children = right ? 4 : 3
        const room = Math.max(
          0,
          width - (2 * FOOTER_PAD + copy.length + right.length + FOOTER_GAP * (children - 1)),
        )
        const used = keyHints(width, copy, right).reduce(
          (sum, [key, rest]) => sum + key.length + rest.length,
          0,
        )
        expect(used).toBeLessThanOrEqual(room)
      }
    }
  })

  test("a narrower panel keeps fewer hints", () => {
    expect(keyHints(PANEL_WIDTH, "copy thread", "").length).toBeGreaterThan(
      keyHints(60, "copy thread", "").length,
    )
  })

  test("a phone-width panel keeps only the key that clears the thread", () => {
    expect(keyHints(51, "nothing to copy", "").map(([key]) => key)).toEqual(["delete"])
  })

  test("a panel with no room for even that hint draws none", () => {
    expect(keyHints(40, "nothing to copy", "")).toEqual([])
    expect(keyHints(0, "copy thread", "")).toEqual([])
  })
})
