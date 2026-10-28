import { describe, expect, test } from "bun:test"
import { QUICK_PROMPTS, quickMarker } from "../src/quick.ts"

const PANEL_WIDTH = 88

describe("quickMarker", () => {
  test("the marker says how many prompts are behind it", () => {
    expect(quickMarker(6, false)).toBe("▸ 6 quick prompts")
  })

  test("the marker turns over when the list is open", () => {
    expect(quickMarker(6, true)).toBe("▾ 6 quick prompts")
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
