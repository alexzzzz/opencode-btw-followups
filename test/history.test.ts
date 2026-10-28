import { describe, expect, test } from "bun:test"
import { HISTORY_LIMIT, NOT_BROWSING, recalled, remembered } from "../src/history.ts"

describe("remembered", () => {
  test("a question is kept as the one to recall first", () => {
    expect(remembered([], "why did the second test fail")).toEqual(["why did the second test fail"])
  })

  test("a question asked twice in a row is kept once", () => {
    expect(remembered(["one"], "one")).toEqual(["one"])
  })

  test("the same question asked again later is kept again", () => {
    expect(remembered(["one", "two"], "one")).toEqual(["one", "two", "one"])
  })

  test("a question with nothing in it is not kept", () => {
    expect(remembered(["one"], "   ")).toEqual(["one"])
    expect(remembered([], "")).toEqual([])
  })

  test("a question is kept trimmed, so the recall types nothing extra", () => {
    expect(remembered([], "  why  ")).toEqual(["why"])
  })

  test("the oldest question goes once the list is full", () => {
    const full = Array.from({ length: HISTORY_LIMIT }, (_, index) => `q${index}`)
    const after = remembered(full, "newest")

    expect(after).toHaveLength(HISTORY_LIMIT)
    expect(after[0]).toBe("q1")
    expect(after.at(-1)).toBe("newest")
  })

  test("the list it is given is left alone", () => {
    const before = ["one"]
    const after = remembered(before, "two")

    expect(before).toEqual(["one"])
    expect(after).not.toBe(before)
  })
})

describe("recalled", () => {
  const asked = ["first", "second", "third"]

  test("up on an empty composer brings the newest question", () => {
    const move = recalled(asked, NOT_BROWSING, -1, "", 0)

    expect(move).toEqual({ browse: { index: 2, draft: "" }, text: "third", cursor: 0 })
  })

  test("up again walks back to the one before", () => {
    const move = recalled(asked, { index: 2, draft: "" }, -1, "third", 0)

    expect(move?.text).toBe("second")
    expect(move?.browse.index).toBe(1)
  })

  test("up at the oldest question stays there", () => {
    expect(recalled(asked, { index: 0, draft: "" }, -1, "first", 0)).toBeUndefined()
  })

  test("down walks forward again and lands at the end of the question", () => {
    const move = recalled(asked, { index: 1, draft: "" }, 1, "second", 6)

    expect(move?.text).toBe("third")
    expect(move?.browse.index).toBe(2)
    expect(move?.cursor).toBe("third".length)
  })

  test("down past the newest leaves the composer as empty as it was entered", () => {
    const move = recalled(asked, { index: 2, draft: "" }, 1, "third", 5)

    expect(move).toEqual({ browse: { index: null, draft: "" }, text: "", cursor: 0 })
  })

  test("down does nothing while nothing has been recalled", () => {
    expect(recalled(asked, NOT_BROWSING, 1, "", 0)).toBeUndefined()
  })

  test("a draft of its own keeps up with the composer away from its start", () => {
    expect(recalled(asked, NOT_BROWSING, -1, "why", 3)).toBeUndefined()
    expect(recalled(asked, NOT_BROWSING, -1, "why", 1)).toBeUndefined()
  })

  test("up from the start of a draft recalls and keeps the draft", () => {
    const move = recalled(asked, NOT_BROWSING, -1, "why", 0)

    expect(move?.text).toBe("third")
    expect(move?.browse).toEqual({ index: 2, draft: "why" })
  })

  test("the empty composer is read as the start wherever the cursor is reported", () => {
    expect(recalled(asked, NOT_BROWSING, -1, "", 0)?.text).toBe("third")
    expect(recalled(asked, NOT_BROWSING, -1, "", 1)?.text).toBe("third")
  })

  test("a recalled question takes up and down at its own ends only", () => {
    expect(recalled(asked, { index: 2, draft: "" }, -1, "third", 2)).toBeUndefined()
    expect(recalled(asked, { index: 2, draft: "" }, -1, "third", 0)?.text).toBe("second")
    expect(recalled(asked, { index: 0, draft: "" }, 1, "first", 5)?.text).toBe("second")
  })

  test("a cursor past the end of the text still counts as the end", () => {
    expect(recalled(asked, { index: 0, draft: "" }, 1, "first", 99)?.text).toBe("second")
  })

  test("no question asked yet leaves the keys to the composer", () => {
    expect(recalled([], NOT_BROWSING, -1, "", 0)).toBeUndefined()
    expect(recalled([], NOT_BROWSING, 1, "", 0)).toBeUndefined()
  })

  test("the walk back down puts the draft back at its end", () => {
    const up = recalled(asked, NOT_BROWSING, -1, "half a thought", 0)
    const down = recalled(asked, up!.browse, 1, up!.text, up!.text.length)

    expect(down?.text).toBe("half a thought")
    expect(down?.cursor).toBe("half a thought".length)
    expect(down?.browse.index).toBeNull()
  })

  test("the list and the position it is given are left alone", () => {
    const items = ["one", "two"]
    const browse = { index: 1, draft: "typed" }
    const move = recalled(items, browse, -1, "two", 0)

    expect(items).toEqual(["one", "two"])
    expect(browse).toEqual({ index: 1, draft: "typed" })
    expect(move?.browse).not.toBe(browse)
  })
})
