import { describe, expect, test } from "bun:test"
import { createThread, type GenerateCall, type Notice, type Thread } from "../src/thread.ts"
import { stateOf, type SideState, type Sides } from "../src/state.ts"

const a = "ses_a"
const b = "ses_b"

type Deferred<T> = {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: unknown) => void
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

type Harness = {
  readonly thread: Thread
  readonly view: (sessionID: string) => SideState
  readonly published: () => Sides
  readonly calls: () => readonly GenerateCall[]
  readonly notices: () => readonly Notice[]
  readonly raised: () => readonly string[]
  readonly answer: (text: string) => Promise<void>
  readonly reject: (error: unknown) => Promise<void>
  readonly deleteSession: (sessionID: string) => void
  readonly setCurrent: (sessionID: string | undefined) => void
  readonly setWindow: (sessionID: string | undefined) => void
  readonly setSpoken: (count: number) => void
  readonly unsubscribed: () => boolean
}

const harness = (): Harness => {
  let published: Sides = new Map()
  const waiting: Deferred<{ text: string }>[] = []
  const calls: GenerateCall[] = []
  const notices: Notice[] = []
  const raised: string[] = []
  let deleted: ((sessionID: string) => void) | undefined
  let stopped = false
  let currentID: string | undefined
  let windowID: string | undefined
  let spokenCount = 0

  const thread = createThread({
    generate(sessionID, prompt, signal) {
      calls.push({ sessionID, prompt, signal })
      const call = deferred<{ text: string }>()
      waiting.push(call)
      return call.promise
    },
    onDeleted(handler) {
      deleted = handler
      return () => {
        stopped = true
      }
    },
    spoken: () => spokenCount,
    current: () => currentID,
    windowSession: () => windowID,
    notify(message, variant, title, duration) {
      notices.push({ message, variant, title, duration })
    },
    raise(sessionID) {
      raised.push(sessionID)
    },
    publish(next) {
      published = next
    },
  })

  const settle = async () => {
    await flush()
  }

  return {
    thread,
    view: (sessionID) => stateOf(published, sessionID),
    published: () => published,
    calls: () => calls,
    notices: () => notices,
    raised: () => raised,
    answer: async (text) => {
      const call = waiting.shift()
      if (!call) throw new Error("nothing is waiting for an answer")
      call.resolve({ text })
      await settle()
    },
    reject: async (error) => {
      const call = waiting.shift()
      if (!call) throw new Error("nothing is waiting for an answer")
      call.reject(error)
      await settle()
    },
    deleteSession: (sessionID) => deleted?.(sessionID),
    setCurrent: (sessionID) => {
      currentID = sessionID
    },
    setWindow: (sessionID) => {
      windowID = sessionID
    },
    setSpoken: (count) => {
      spokenCount = count
    },
    unsubscribed: () => stopped,
  }
}

describe("one request in flight, in order", () => {
  test("two questions are answered together in the order they were asked", async () => {
    const h = harness()
    h.thread.ask(a, "one")
    h.thread.ask(a, "two")

    expect(h.calls()).toHaveLength(1)
    await h.answer("answer one")
    expect(h.calls()).toHaveLength(2)

    await h.answer("answer two")
    expect(h.view(a).turns.map((item) => item.turn.question)).toEqual(["one", "two"])
    expect(h.calls()[1]?.prompt).toContain("answer one")
    expect(h.calls()[1]?.prompt).toContain("two")
  })

  test("a question asked while no window is up is still answered", async () => {
    const h = harness()
    h.setWindow(undefined)
    h.setCurrent(undefined)
    h.thread.ask(a, "asked in the dark")

    await h.answer("an answer anyway")
    expect(h.view(a).turns.map((item) => item.turn.question)).toEqual(["asked in the dark"])
    expect(h.raised()).toEqual([])
  })

  test("an answer in the reader's session raises the window for it", async () => {
    const h = harness()
    h.setCurrent(a)
    h.thread.ask(a, "look here")
    await h.answer("look at this")
    expect(h.raised()).toEqual([a])
  })

  test("the message count when the answer landed travels with the turn", async () => {
    const h = harness()
    h.setSpoken(7)
    h.thread.ask(a, "counted")
    await h.answer("counted answer")
    expect(h.view(a).turns[0]?.spokenAt).toBe(7)
  })
})

describe("a failed request", () => {
  test("an empty answer stores nothing but a failure that repeats the question", async () => {
    const h = harness()
    h.thread.ask(a, "why did step two fail")
    await h.answer("   ")

    const state = h.view(a)
    expect(state.turns).toEqual([])
    expect(state.failure?.question).toBe("why did step two fail")
    expect(state.failure?.title).toBe("No answer came back")
    expect(h.notices()[0]?.message).toContain("why did step two fail")
  })

  test("a thrown answer is reported with the question and stops the queue", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    await h.reject(new Error("model went away"))

    expect(h.view(a).failure?.message).toBe("model went away")
    expect(h.view(a).failure?.question).toBe("first")
    expect(h.calls()).toHaveLength(1)
    expect(h.view(a).pending).toEqual([])
  })

  test("a failure while the window is for that session stays off the toast", async () => {
    const h = harness()
    h.setWindow(a)
    h.thread.ask(a, "quiet")
    await h.answer("")

    expect(h.view(a).failure).toBeDefined()
    expect(h.notices()).toEqual([])
  })

  test("a failure in another session still reaches the toast", async () => {
    const h = harness()
    h.setWindow(b)
    h.thread.ask(a, "loud")
    await h.answer("")

    expect(h.notices()).toHaveLength(1)
  })
})

describe("clearing the thread", () => {
  test("a clear keeps the draft, the queue and the request in flight", async () => {
    const h = harness()
    h.thread.remember(a, "half a thought", undefined)
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    h.thread.clear(a)

    const cleared = h.view(a)
    expect(cleared.turns).toEqual([])
    expect(cleared.failure).toBeUndefined()
    expect(cleared.draft).toBe("half a thought")
    expect(cleared.pending).toEqual(["second"])
    expect(cleared.active).toBe("first")

    await h.answer("answer one")
    expect(h.view(a).turns.map((item) => item.turn.question)).toEqual(["first"])
  })
})

describe("a deleted session", () => {
  test("deletion aborts the request and forgets the session", async () => {
    const h = harness()
    h.thread.ask(a, "about to vanish")
    const call = h.calls()[0]

    h.deleteSession(a)
    expect(call?.signal.aborted).toBe(true)
    expect(h.published().has(a)).toBe(false)

    await h.answer("too late")
    expect(h.published().has(a)).toBe(false)
    expect(h.raised()).toEqual([])
  })

  test("dispose aborts what is in flight and stops watching for deletes", () => {
    const h = harness()
    h.thread.ask(a, "in flight")
    const call = h.calls()[0]

    h.thread.dispose()
    expect(call?.signal.aborted).toBe(true)
    expect(h.unsubscribed()).toBe(true)
  })
})
