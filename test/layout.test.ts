import { describe, expect, test } from "bun:test"
import { CHROME, COMPOSER_ROWS, MIN_PANEL, transcript } from "../src/layout.ts"

describe("transcript", () => {
  /**
   * The panel is centred in the terminal, so anything taller than the terminal writes
   * outside it. Those cells are not repainted when the panel closes, and what is left
   * behind is a session with two copies of half its lines drawn on top of each other.
   */
  test("the panel fits the terminal at every height that can hold it", () => {
    for (let rows = MIN_PANEL; rows <= 200; rows += 1) {
      expect(transcript(rows) + CHROME + COMPOSER_ROWS).toBeLessThanOrEqual(rows)
    }
  })

  test("a tall terminal leaves the panel clear of both edges", () => {
    expect(transcript(100)).toBe(60)
    expect(transcript(50)).toBe(30)
  })

  test("a short terminal gives the panel the room that is left", () => {
    // Below the share, the room left after the chrome wins, so a cramped terminal
    // shrinks the transcript instead of pushing the panel off the screen.
    expect(transcript(20)).toBe(6)
  })

  test("a terminal too short to hold the panel is refused rather than overflowed", () => {
    expect(transcript(MIN_PANEL - 1)).toBe(0)
    expect(transcript(4)).toBe(0)
  })

  /**
   * `MIN_PANEL` itself is the height the panel spends with no transcript at all, so the
   * shortest terminal that opens is the next one up. The README says fifteen rows, which
   * is this number plus one.
   */
  test("the shortest terminal that opens is the one above MIN_PANEL", () => {
    expect(transcript(MIN_PANEL)).toBe(0)
    expect(transcript(MIN_PANEL + 1)).toBe(1)
  })
})