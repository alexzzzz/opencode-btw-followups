import { describe, expect, test } from "bun:test"
import {
  EMPTY,
  answered,
  change,
  cleared,
  forget,
  movedSince,
  movedUnder,
  stateOf,
  type Sides,
} from "../src/state.ts"

const a = "ses_a"
const b = "ses_b"
const turn = (question: string) => ({ question, answer: `${question} answered` })
// A thread as it travels through state: each turn with the count of the session it was
// answered against. Only the count matters for the divider, so the helper keeps the
// turn text out of the way.
const lined = (marks: readonly number[]) => marks.map((mark, i) => ({ turn: turn(`t${i}`), mark }))

describe("stateOf", () => {
  test("a session nothing has been asked in reads as empty rather than as missing", () => {
    expect(stateOf(new Map(), a)).toEqual({
      turns: [],
      pending: [],
      active: undefined,
      failure: undefined,
      draft: "",
      place: undefined,
    })
  })

  test("each session reads back what was written to it", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { turns: [{ turn: turn("first"), mark: 1 }] })
    expect(stateOf(sides, a).turns).toEqual([{ turn: turn("first"), mark: 1 }])
    expect(stateOf(sides, b).turns).toEqual([])
  })
})

/**
 * This is the whole point of the module. A thread resends its earlier turns with every
 * question, so a turn kept beside another session's is a turn the model reads as
 * something said about a conversation it is not being asked about.
 */
describe("change", () => {
  test("one session's thread does not reach another's", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { turns: [{ turn: turn("about a"), mark: 1 }] })
    sides = change(sides, b, { turns: [{ turn: turn("about b"), mark: 2 }] })

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

  /**
   * The dialog reads the state through getters holding the map they were read from, so
   * a map changed in place would leave it drawing turns that are no longer there.
   */
  test("the state it is given is left alone", () => {
    const before: Sides = new Map()
    const after = change(before, a, { turns: [{ turn: turn("first"), mark: 1 }] })

    expect(before.size).toBe(0)
    expect(after).not.toBe(before)
    expect(stateOf(after, a).turns).toHaveLength(1)
    // A session nothing has been asked in still reads as the one shared empty state, so
    // a dialog drawing a thread that has not changed is handed the same array as before
    // rather than a new one on every read.
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
    sides = change(sides, a, { turns: [{ turn: turn("first"), mark: 1 }], draft: "not asked yet" })
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

/**
 * A thread does not outlive the session it belongs to. A deleted session cannot be
 * opened again, so nobody will ever read what was kept for it.
 */
describe("forget", () => {
  test("the session is gone and the others are not", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { turns: [{ turn: turn("about a"), mark: 1 }] })
    sides = change(sides, b, { turns: [{ turn: turn("about b"), mark: 2 }] })
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

/**
 * A turn is stored with how much of the session had been said by then, and the line in
 * the transcript is read off those two numbers. The turn and the count go in together,
 * because a turn without its count cannot be told from one asked at another moment.
 */
describe("answered", () => {
  test("the turn and the count it was answered against are stored together", () => {
    const sides = answered(new Map(), a, turn("first"), 12)
    expect(stateOf(sides, a).turns).toEqual([{ turn: turn("first"), mark: 12 }])
  })

  test("a second turn adds a second count rather than replacing the first", () => {
    let sides: Sides = new Map()
    sides = answered(sides, a, turn("first"), 12)
    sides = answered(sides, a, turn("second"), 14)

    expect(stateOf(sides, a).turns.map((item) => item.turn.question)).toEqual(["first", "second"])
    expect(stateOf(sides, a).turns.map((item) => item.mark)).toEqual([12, 14])
  })

  test("the queue and the request in flight are not touched by a turn", () => {
    let sides: Sides = new Map()
    sides = change(sides, a, { pending: ["queued"], active: "queued" })
    const after = answered(sides, a, turn("first"), 3)

    expect(stateOf(after, a)).toMatchObject({ pending: ["queued"], active: "queued" })
  })
})

/**
 * A cleared thread is the reader asking for a fresh start: the next question resends no
 * earlier turns. Everything the question does not carry is left alone, because the reader
 * asked to drop the history and not the work in progress.
 */
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

    expect(stateOf(sides, a).turns).toEqual([{ turn: turn("second"), mark: 4 }])
    expect(movedSince(stateOf(sides, a).turns, 4)).toBe(false)
  })

  test("the state it is given is left alone", () => {
    const before = answered(new Map(), a, turn("first"), 1)
    const after = cleared(before, a)

    expect(stateOf(before, a).turns).toHaveLength(1)
    expect(stateOf(after, a).turns).toEqual([])
  })
})

/**
 * This is the rule the line in the window is drawn from: two answers separated by
 * nothing but a side question are about the same moment of the conversation, and two
 * with a request or an answer in between are not.
 */
describe("movedUnder", () => {
  test("nothing between two turns means no line", () => {
    expect(movedUnder(lined([12, 12]), 0, false)).toBe(false)
  })

  test("something said between two turns means a line", () => {
    expect(movedUnder(lined([12, 14]), 0, false)).toBe(true)
  })

  test("no line above the first turn, whatever the count", () => {
    expect(movedUnder(lined([40]), 0, false)).toBe(false)
    expect(movedUnder(lined([]), 0, false)).toBe(false)
  })

  test("every turn after a gap carries its own line", () => {
    const marks = [10, 10, 12, 12, 15]
    const turns = lined(marks)
    expect(marks.map((_, index) => movedUnder(turns, index, false))).toEqual([false, true, false, true, false])
  })

  test("a thread whose counts are unknown draws no line rather than one everywhere", () => {
    expect(movedUnder(lined([12, undefined as unknown as number]), 0, false)).toBe(false)
    expect(movedUnder(lined([12]), 1, false)).toBe(false)
  })

  test("a turn the session moved on from carries the line", () => {
    const turns = lined([10, 12, 12])
    expect(turns.map((_, index) => movedUnder(turns, index, false))).toEqual([true, false, false])
  })

  test("the newest answer takes the line from the session as it stands", () => {
    expect(movedUnder(lined([10, 10]), 1, true)).toBe(true)
    expect(movedUnder(lined([10, 10]), 1, false)).toBe(false)
  })

  test("a thread with no turns draws no line", () => {
    expect(movedUnder([], 0, true)).toBe(false)
  })
})

/**
 * The same rule read at the moment a question is asked rather than when its answer
 * lands. Without it the line between two stretches of conversation appears exactly when
 * the reader has stopped needing to know where the split is.
 */
describe("movedSince", () => {
  test("nothing said since the last turn means no line", () => {
    expect(movedSince(lined([12, 14]), 14)).toBe(false)
  })

  test("something said since the last turn means a line", () => {
    expect(movedSince(lined([12, 14]), 16)).toBe(true)
  })

  test("a thread with no turns is never a line away from anything", () => {
    expect(movedSince(lined([]), 40)).toBe(false)
  })

  test("a count that cannot be read draws no line rather than one everywhere", () => {
    expect(movedSince(lined([12, undefined as unknown as number]), 99)).toBe(false)
  })
})

/**
 * What a reader left behind rather than what the plugin did: a question typed and not
 * asked, and a position in the transcript. Both belong to the session they were typed
 * and read in, and both have to survive the window going down and coming back.
 */
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