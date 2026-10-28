import { describe, expect, test } from "bun:test"
import {
  EMPTY,
  answered,
  change,
  cleared,
  forget,
  gapBelow,
  markRevealed,
  movedSinceLast,
  showsBadge,
  stateOf,
  type Sides,
} from "../src/state.ts"

const a = "ses_a"
const b = "ses_b"

const turn = (question: string) => ({ question, answer: `${question} answered` })

const lined = (spokenAts: readonly number[]) =>
  spokenAts.map((spokenAt, i) => ({ turn: turn(`t${i}`), spokenAt, revealed: false }))

describe("stateOf", () => {
  test("a session nothing has been asked in reads as empty rather than as missing", () => {
    expect(stateOf(new Map(), a)).toEqual({
      turns: [],
      asked: [],
      pending: [],
      active: undefined,
      failure: undefined,
      draft: "",
      place: undefined,
    })
  })

  test("each session reads back what was written to it", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { turns: [{ turn: turn("first"), spokenAt: 1, revealed: false }] })
    expect(stateOf(sides, a).turns).toEqual([{ turn: turn("first"), spokenAt: 1, revealed: false }])
    expect(stateOf(sides, b).turns).toEqual([])
  })
})

describe("change", () => {
  test("one session's thread does not reach another's", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { turns: [{ turn: turn("about a"), spokenAt: 1, revealed: false }] })
    sides = change(sides, b, { turns: [{ turn: turn("about b"), spokenAt: 2, revealed: false }] })

    expect(stateOf(sides, a).turns.map((item) => item.turn.question)).toEqual(["about a"])
    expect(stateOf(sides, b).turns.map((item) => item.turn.question)).toEqual(["about b"])
  })

  test("a queue and a request in flight belong to the session that asked", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { pending: ["one"], active: "one" })
    sides = change(sides, b, { pending: ["two"] })

    expect(stateOf(sides, a)).toMatchObject({ pending: ["one"], active: "one" })
    expect(stateOf(sides, b)).toMatchObject({ pending: ["two"], active: undefined })
  })

  test("a session asked for the first time starts from empty rather than from nothing", () => {
    const sides = change(new Map(), a, { pending: ["queued"] })
    expect(stateOf(sides, a).turns).toEqual([])
    expect(stateOf(sides, a).pending).toEqual(["queued"])
  })

  test("the state it is given is left alone", () => {
    const before: Sides = new Map()
    const after = change(before, a, { turns: [{ turn: turn("first"), spokenAt: 1, revealed: false }] })

    expect(before.size).toBe(0)
    expect(after).not.toBe(before)
    expect(stateOf(after, a).turns).toHaveLength(1)
    expect(stateOf(after, b)).toBe(EMPTY)
  })

  test("clearing a field really clears it", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { failure: { message: "nothing came back" }, active: "one" })
    sides = change(sides, a, { failure: undefined, active: undefined })

    expect(stateOf(sides, a).failure).toBeUndefined()
    expect(stateOf(sides, a).active).toBeUndefined()
  })

  test("the fields it is not given are kept", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { turns: [{ turn: turn("first"), spokenAt: 1, revealed: false }], draft: "not asked yet" })
    sides = change(sides, a, { pending: ["second"] })

    expect(stateOf(sides, a).turns).toHaveLength(1)
    expect(stateOf(sides, a).draft).toBe("not asked yet")
    expect(stateOf(sides, a).pending).toEqual(["second"])
  })

  test("a session asked anything at all stops reading as the shared empty state", () => {
    const sides = change(new Map(), a, { pending: ["queued"] })
    expect(stateOf(sides, a)).not.toBe(EMPTY)
    expect(EMPTY).toEqual(stateOf(new Map(), b))
  })
})

describe("forget", () => {
  test("the session is gone and the others are not", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { turns: [{ turn: turn("about a"), spokenAt: 1, revealed: false }] })
    sides = change(sides, b, { turns: [{ turn: turn("about b"), spokenAt: 2, revealed: false }] })
    const after = forget(sides, a)

    expect(after.has(a)).toBe(false)
    expect(stateOf(after, a).turns).toEqual([])
    expect(stateOf(after, b).turns).toHaveLength(1)
  })

  test("an event for a session this plugin never heard of costs no repaint", () => {
    const sides: Sides = new Map()
    expect(forget(sides, a)).toBe(sides)
  })
})

describe("answered", () => {
  test("the turn and the count it was answered against are stored together", () => {
    const sides = answered(new Map(), a, turn("first"), 12)
    expect(stateOf(sides, a).turns).toEqual([{ turn: turn("first"), spokenAt: 12, revealed: false }])
  })

  test("an answer is owed a reveal until the window plays it", () => {
    const sides = answered(new Map(), a, turn("first"), 12)
    expect(stateOf(sides, a).turns[0]?.revealed).toBe(false)
  })

  test("a second turn adds a second count rather than replacing the first", () => {
    let sides: Sides = new Map()
    sides = answered(sides, a, turn("first"), 12)
    sides = answered(sides, a, turn("second"), 14)

    expect(stateOf(sides, a).turns.map((item) => item.turn.question)).toEqual(["first", "second"])
    expect(stateOf(sides, a).turns.map((item) => item.spokenAt)).toEqual([12, 14])
  })

  test("the queue and the request in flight are not touched by a turn", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { pending: ["queued"], active: "queued" })
    const after = answered(sides, a, turn("first"), 3)

    expect(stateOf(after, a)).toMatchObject({ pending: ["queued"], active: "queued" })
  })
})

describe("markRevealed", () => {
  test("the newest answer is the one the window plays", () => {
    let sides: Sides = new Map()
    sides = answered(sides, a, turn("first"), 1)
    sides = answered(sides, a, turn("second"), 2)

    expect(stateOf(markRevealed(sides, a), a).turns.map((item) => item.revealed)).toEqual([
      false,
      true,
    ])
  })

  test("marking the same answer twice is not a change", () => {
    let sides: Sides = new Map()
    sides = answered(sides, a, turn("first"), 1)
    sides = markRevealed(sides, a)

    expect(markRevealed(sides, a)).toBe(sides)
  })

  test("a session with no answer has nothing to mark", () => {
    const sides: Sides = new Map()
    expect(markRevealed(sides, a)).toBe(sides)
  })
})

describe("cleared", () => {
  test("no turn is left for the next question to resend", () => {
    let sides: Sides = new Map()
    sides = answered(sides, a, turn("first"), 1)
    sides = answered(sides, a, turn("second"), 2)

    expect(stateOf(cleared(sides, a), a).turns).toEqual([])
  })

  test("the failure about a question not in the thread goes with it", () => {
    let sides: Sides = new Map()
    sides = answered(sides, a, turn("first"), 1)
    sides = change(sides, a, { failure: { message: "nothing came back", question: "lost" } })

    expect(stateOf(cleared(sides, a), a).failure).toBeUndefined()
  })

  test("the draft, the queue and the request in flight are kept", () => {
    let sides: Sides = new Map()
    sides = answered(sides, a, turn("first"), 1)
    const place = { top: 4, height: 20, scrollHeight: 40 }
    sides = change(sides, a, { draft: "half a thought", pending: ["queued"], active: "queued", place })

    const after = stateOf(cleared(sides, a), a)
    expect(after.draft).toBe("half a thought")
    expect(after.pending).toEqual(["queued"])
    expect(after.active).toBe("queued")
    expect(after.place).toEqual(place)
  })

  test("one session's thread is cleared without touching another's", () => {
    let sides: Sides = new Map()
    sides = answered(sides, a, turn("about a"), 1)
    sides = answered(sides, b, turn("about b"), 2)

    const after = cleared(sides, a)
    expect(stateOf(after, a).turns).toEqual([])
    expect(stateOf(after, b).turns.map((item) => item.turn.question)).toEqual(["about b"])
  })

  test("a turn asked after the clear starts the thread again", () => {
    let sides: Sides = new Map()
    sides = answered(sides, a, turn("first"), 1)
    sides = cleared(sides, a)
    sides = answered(sides, a, turn("second"), 4)

    expect(stateOf(sides, a).turns).toEqual([{ turn: turn("second"), spokenAt: 4, revealed: false }])
    expect(movedSinceLast(stateOf(sides, a).turns, 4)).toBe(false)
  })

  test("the state it is given is left alone", () => {
    const before = answered(new Map(), a, turn("first"), 1)
    const after = cleared(before, a)

    expect(stateOf(before, a).turns).toHaveLength(1)
    expect(stateOf(after, a).turns).toEqual([])
  })
})

describe("gapBelow", () => {
  test("nothing between two turns means no line", () => {
    expect(gapBelow(lined([12, 12]), 0, false)).toBe(false)
  })

  test("something said between two turns means a line", () => {
    expect(gapBelow(lined([12, 14]), 0, false)).toBe(true)
  })

  test("no line above the first turn, whatever the count", () => {
    expect(gapBelow(lined([40]), 0, false)).toBe(false)
    expect(gapBelow(lined([]), 0, false)).toBe(false)
  })

  test("every turn after a gap carries its own line", () => {
    const spokenAts = [10, 10, 12, 12, 15]
    const turns = lined(spokenAts)
    expect(spokenAts.map((_, index) => gapBelow(turns, index, false))).toEqual([
      false, true, false, true, false,
    ])
  })

  test("a thread whose counts are unknown draws no line rather than one everywhere", () => {
    expect(gapBelow(lined([12, undefined as unknown as number]), 0, false)).toBe(false)
    expect(gapBelow(lined([12]), 1, false)).toBe(false)
  })

  test("a turn the session moved on from carries the line", () => {
    const turns = lined([10, 12, 12])
    expect(turns.map((_, index) => gapBelow(turns, index, false))).toEqual([true, false, false])
  })

  test("the newest answer takes the line from the session as it stands", () => {
    expect(gapBelow(lined([10, 10]), 1, true)).toBe(true)
    expect(gapBelow(lined([10, 10]), 1, false)).toBe(false)
  })

  test("a thread with no turns draws no line", () => {
    expect(gapBelow([], 0, true)).toBe(false)
  })
})

describe("movedSinceLast", () => {
  test("nothing said since the last turn means no line", () => {
    expect(movedSinceLast(lined([12, 14]), 14)).toBe(false)
  })

  test("something said since the last turn means a line", () => {
    expect(movedSinceLast(lined([12, 14]), 16)).toBe(true)
  })

  test("a thread with no turns is never a line away from anything", () => {
    expect(movedSinceLast(lined([]), 40)).toBe(false)
  })

  test("a count that cannot be read draws no line rather than one everywhere", () => {
    expect(movedSinceLast(lined([12, undefined as unknown as number]), 99)).toBe(false)
  })
})

describe("what the reader left", () => {
  test("a session never asked in has neither a draft nor a place", () => {
    const state = stateOf(new Map(), a)
    expect(state.draft).toBe("")
    expect(state.place).toBeUndefined()
  })

  test("a draft and a place are kept apart from the thread and from each other", () => {
    let sides: Sides = new Map()
    sides = answered(sides, a, turn("first"), 4)
    const place = { top: 12, height: 20, scrollHeight: 60 }
    sides = change(sides, a, { draft: "why did step 2 fail", place })

    expect(stateOf(sides, a).draft).toBe("why did step 2 fail")
    expect(stateOf(sides, a).place).toEqual(place)
    expect(stateOf(sides, a).turns).toHaveLength(1)
  })

  test("clearing a draft leaves the thread alone", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { draft: "half a thought" })
    sides = change(sides, a, { draft: "" })

    expect(stateOf(sides, a).draft).toBe("")
    expect(stateOf(sides, a).turns).toEqual([])
  })

  test("one session's draft is not another session's", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { draft: "about a" })
    sides = change(sides, b, { draft: "about b" })

    expect(stateOf(sides, a).draft).toBe("about a")
    expect(stateOf(sides, b).draft).toBe("about b")
  })

  test("a thread written while the window was down leaves the draft alone", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { draft: "not asked yet" })
    const after = answered(sides, a, turn("first"), 1)

    expect(stateOf(after, a).draft).toBe("not asked yet")
  })
})

describe("what the reader asked before", () => {
  test("a thread never asked in has nothing to recall", () => {
    expect(stateOf(new Map(), a).asked).toEqual([])
  })

  test("clearing the thread keeps what was asked", () => {
    let sides: Sides = new Map()
    sides = answered(sides, a, turn("first"), 1)
    sides = change(sides, a, { asked: ["first"] })

    expect(stateOf(cleared(sides, a), a).asked).toEqual(["first"])
  })

  test("one session's questions are not another's to recall", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { asked: ["about a"] })
    sides = change(sides, b, { asked: ["about b"] })

    expect(stateOf(sides, a).asked).toEqual(["about a"])
    expect(stateOf(sides, b).asked).toEqual(["about b"])
  })
})

describe("showsBadge", () => {
  test("a question in flight with no window up is a badge", () => {
    const sides = change(new Map(), a, { active: "one" })
    expect(showsBadge(sides, a, undefined)).toBe(true)
  })

  test("no question in flight is no badge", () => {
    expect(showsBadge(new Map(), a, undefined)).toBe(false)
  })

  test("a queued question alone is no badge", () => {
    const sides = change(new Map(), a, { pending: ["one"] })
    expect(showsBadge(sides, a, undefined)).toBe(false)
  })

  test("the window already up for that session is no badge", () => {
    const sides = change(new Map(), a, { active: "one" })
    expect(showsBadge(sides, a, a)).toBe(false)
  })

  test("a window up for another session leaves the badge where it is", () => {
    const sides = change(new Map(), a, { active: "one" })
    expect(showsBadge(sides, a, b)).toBe(true)
  })

  test("a row with no session of its own carries no badge", () => {
    expect(showsBadge(new Map(), undefined, undefined)).toBe(false)
  })

  test("another session's question does not put a badge in this one's row", () => {
    const sides = change(new Map(), b, { active: "one" })
    expect(showsBadge(sides, a, undefined)).toBe(false)
  })
})
