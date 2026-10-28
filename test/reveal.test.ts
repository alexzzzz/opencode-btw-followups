import { describe, expect, test } from "bun:test"
import { firstChunk, firstShown, nextChunk, revealStep, shownText } from "../src/reveal.ts"

describe("revealStep", () => {
  test("a short answer is revealed in one chunk", () => {
    expect(revealStep(10)).toBe(1)
    expect(revealStep(90)).toBe(1)
  })

  test("a long answer is revealed in about ninety chunks", () => {
    expect(revealStep(900)).toBe(10)
    expect(revealStep(901)).toBe(11)
  })

  test("an empty answer still moves by one", () => {
    expect(revealStep(0)).toBe(1)
  })
})

describe("firstChunk", () => {
  test("the first chunk is on screen in the same tick the answer lands", () => {
    expect(firstChunk(900)).toBe(10)
  })

  test("an answer of a hundred characters or less starts one character in", () => {
    expect(firstChunk(4)).toBe(1)
    expect(firstChunk(90)).toBe(1)
  })

  test("an empty answer shows nothing", () => {
    expect(firstChunk(0)).toBe(0)
  })
})

describe("firstShown", () => {
  test("an answer the reader watched starts at the first chunk", () => {
    expect(firstShown(true, 900)).toBe(firstChunk(900))
  })

  test("an answer that landed with the window down is already whole", () => {
    expect(firstShown(false, 900)).toBe(900)
    expect(firstShown(false, 0)).toBe(0)
  })
})

describe("nextChunk", () => {
  test("the reveal never passes the end of the answer", () => {
    expect(nextChunk(9, 10)).toBe(10)
    expect(nextChunk(10, 10)).toBe(10)
  })

  test("a step is one character until the answer is long", () => {
    expect(nextChunk(5, 10)).toBe(6)
  })

  test("every step forward ends on the last character", () => {
    let shown = firstChunk(901)
    let steps = 0
    while (shown < 901) {
      shown = nextChunk(shown, 901)
      steps += 1
    }
    expect(shown).toBe(901)
    expect(steps).toBe(81)
  })
})

describe("shownText", () => {
  test("a partly revealed answer stops at the cut", () => {
    expect(shownText("abcdef", 3)).toBe("abc")
  })

  test("whitespace at the cut is dropped, so no empty block is drawn", () => {
    expect(shownText("one two\nthree", 8)).toBe("one two")
  })

  test("a fully revealed answer is the whole answer, trimmed", () => {
    expect(shownText("abcdef\n", 6)).toBe("abcdef")
    expect(shownText("abcdef\n", 99)).toBe("abcdef")
  })
})
