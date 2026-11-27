import { describe, expect, test } from "bun:test"
import {
  QUICK_PROMPTS,
  nextChoice,
  quickCardGeometry,
  quickCardWidth,
  quickChoiceScroll,
  quickMarker,
} from "../src/quick.ts"
import { listTranscriptRoom } from "../src/layout.ts"

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

describe("quickCardGeometry", () => {
  test("a wide panel keeps one row per prompt and the air above and below", () => {
    const card = quickCardGeometry(QUICK_PROMPTS, PANEL_WIDTH, 60)
    expect(card.width).toBe(42)
    expect(card.dress).toBe("padded")
    expect(card.rows).toBe(8)
    expect(card.viewport).toBe(8)
    expect(card.places.map((place) => place.height)).toEqual([1, 1, 1, 1, 1, 1])
    expect(card.places[0]?.top).toBe(1)
  })

  test("a narrow panel wraps prompts and counts every wrapped row", () => {
    const card = quickCardGeometry(QUICK_PROMPTS, 30, 60)
    expect(card.width).toBe(28)
    expect(card.dress).toBe("padded")
    expect(card.rows).toBe(11)
    expect(card.places.map((place) => place.height)).toEqual([1, 1, 2, 2, 1, 2])
  })

  test("a phone-width panel gives long questions several rows", () => {
    const card = quickCardGeometry(QUICK_PROMPTS, 20, 60)
    expect(card.width).toBe(18)
    expect(card.rows).toBe(19)
    expect(card.places.map((place) => place.height)).toEqual([2, 2, 3, 4, 2, 4])
  })

  test("a short transcript drops the air before it starts hiding prompts", () => {
    const card = quickCardGeometry(QUICK_PROMPTS, 30, 10)
    expect(card.dress).toBe("plain")
    expect(card.rows).toBe(9)
    expect(card.places[0]?.top).toBe(0)
  })

  test("a seventeen-row terminal with a six-row composer limits the list to three rows", () => {
    const room = listTranscriptRoom(17, 6)
    const card = quickCardGeometry(QUICK_PROMPTS, 30, room)
    expect(room).toBe(3)
    expect(card.rows).toBe(9)
    expect(card.viewport).toBe(3)
  })

  test("the viewport never grows past the transcript room", () => {
    for (let width = 12; width <= 88; width += 1) {
      for (let room = 0; room <= 30; room += 1) {
        const card = quickCardGeometry(QUICK_PROMPTS, width, room)
        expect(card.width).toBeLessThanOrEqual(Math.max(0, width - 2))
        expect(card.viewport).toBeLessThanOrEqual(room)
        expect(card.viewport).toBeLessThanOrEqual(card.rows)
      }
    }
  })
})

describe("quickChoiceScroll", () => {
  const card = quickCardGeometry(QUICK_PROMPTS, 20, 8)

  test("a pick below the viewport scrolls until the whole row is visible", () => {
    const scroll = quickChoiceScroll(card, 5, 0)
    const picked = card.places[5]
    expect(scroll).toBe(9)
    expect(picked).toBeDefined()
    expect(picked!.top).toBeGreaterThanOrEqual(scroll)
    expect(picked!.top + picked!.height).toBeLessThanOrEqual(scroll + card.viewport)
  })

  test("a pick above the viewport scrolls back to its first row", () => {
    expect(quickChoiceScroll(card, 0, 9)).toBe(0)
  })

  test("a visible pick leaves the reading position alone", () => {
    expect(quickChoiceScroll(card, 2, 0)).toBe(0)
  })

  test("a row taller than the viewport keeps its first row visible", () => {
    const short = quickCardGeometry(QUICK_PROMPTS, 20, 2)
    const scroll = quickChoiceScroll(short, 3, 0)
    const picked = short.places[3]!
    expect(picked.height).toBeGreaterThan(short.viewport)
    expect(picked.top).toBeGreaterThanOrEqual(scroll)
    expect(picked.top).toBeLessThan(scroll + short.viewport)
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
