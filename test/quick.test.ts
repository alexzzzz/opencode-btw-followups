import { describe, expect, test } from "bun:test"
import {
  QUICK_PROMPTS,
  nextChoice,
  quickCardDress,
  quickCardRows,
  quickCardWidth,
  quickMarker,
} from "../src/quick.ts"

const PANEL_WIDTH = 88

describe("quickMarker", () => {
  test("the marker says how many prompts are behind it", () => {
    expect(quickMarker(6, false)).toBe("▸ 6 quick prompts")
  })

  test("a narrow header shortens the marker to the number alone", () => {
    expect(quickMarker(6, false, "short")).toBe("▸ 6 prompts")
    expect(quickMarker(6, false, "number")).toBe("▸ 6")
  })

  test("the marker turns over when the list is open", () => {
    expect(quickMarker(6, true)).toBe("▾ 6 quick prompts")
  })
})

describe("quickCardWidth", () => {
  test("the card is the longest prompt plus its number and padding", () => {
    expect(quickCardWidth(QUICK_PROMPTS)).toBe(42)
  })

  test("the card fits a panel a phone gives the dialog", () => {
    expect(quickCardWidth(QUICK_PROMPTS)).toBeLessThanOrEqual(44)
  })
})

describe("quickCardRows", () => {
  test("the card is its prompts and the air above and below them", () => {
    expect(quickCardRows(6)).toBe(8)
  })
})

describe("quickCardDress", () => {
  test("a window with room for the air gets the padded card", () => {
    expect(quickCardDress(6, 60)).toBe("padded")
    expect(quickCardDress(6, 8)).toBe("padded")
  })

  test("a window too short for the air drops to the rows alone", () => {
    expect(quickCardDress(6, 7)).toBe("plain")
    expect(quickCardDress(6, 4)).toBe("plain")
  })

  test("every dress fits the room it was chosen for that can hold a row", () => {
    const height = (dress: string) => (dress === "padded" ? 8 : 6)
    for (const room of [6, 7, 8, 9, 10, 12, 20]) {
      expect(height(quickCardDress(6, room))).toBeLessThanOrEqual(room)
    }
  })
})

describe("nextChoice", () => {
  test("a step moves the pick along the list", () => {
    expect(nextChoice(2, 1, 6)).toBe(3)
    expect(nextChoice(2, -1, 6)).toBe(1)
  })

  test("the pick wraps at both ends rather than running off", () => {
    expect(nextChoice(0, -1, 6)).toBe(5)
    expect(nextChoice(5, 1, 6)).toBe(0)
  })
})

describe("the prompts", () => {
  test("each one is a whole question on a row of its own", () => {
    for (const prompt of QUICK_PROMPTS) {
      expect(prompt.length).toBeLessThanOrEqual(PANEL_WIDTH)
      expect(prompt.endsWith("?")).toBe(true)
    }
  })

  test("no two of them are the same", () => {
    expect(new Set(QUICK_PROMPTS).size).toBe(QUICK_PROMPTS.length)
  })
})
