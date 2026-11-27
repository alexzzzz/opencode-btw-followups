import { describe, expect, test } from "bun:test"
import { createSessionThread, type GenerateCall, type Notice, type SessionThread } from "../src/thread.ts"
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

type Call = GenerateCall & { readonly reasoning: boolean }

type Harness = {
  readonly thread: SessionThread
  readonly view: (sessionID: string) => SideState
  readonly published: () => Sides
  readonly calls: () => readonly Call[]
  readonly notices: () => readonly Notice[]
  readonly raised: () => readonly string[]
  readonly released: () => readonly string[]
  readonly answer: (text: string) => Promise<void>
  readonly reject: (error: unknown) => Promise<void>
  readonly deleteSession: (sessionID: string) => void
  readonly setCurrent: (sessionID: string | undefined) => void
  readonly setWindow: (sessionID: string | undefined) => void
  readonly setSpoken: (count: number) => void
  readonly setReasoning: (value: boolean) => void
  readonly unsubscribed: () => boolean
}

const harness = (): Harness => {
  let published: Sides = new Map()
  const waiting: Deferred<{ text: string }>[] = []
  const calls: Call[] = []
  const notices: Notice[] = []
  const raised: string[] = []
  const released: string[] = []
  let deleted: ((sessionID: string) => void) | undefined
  let stopped = false
  let currentID: string | undefined
  let windowID: string | undefined
  let spokenCount = 0
  let reasoningOn = true

  const thread = createSessionThread({
    generate(sessionID, prompt, signal, reasoning) {
      calls.push({ sessionID, prompt, signal, reasoning })
      const call = deferred<{ text: string }>()
      waiting.push(call)
      return call.promise
    },
    reasoning: () => reasoningOn,
    onDeleted(handler) {
      deleted = handler
      return () => {
        stopped = true
      }
    },
    spoken: () => spokenCount,
    current: () => currentID,
    windowSession: () => windowID,
    notify(notice) {
      notices.push(notice)
    },
    raise(sessionID) {
      raised.push(sessionID)
    },
    releasePlayback(sessionID) {
      released.push(sessionID)
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
    released: () => released,
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
    setReasoning: (value) => {
      reasoningOn = value
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

  test("a successful queue keeps draining while the window is closed", async () => {
    const h = harness()
    h.setWindow(a)
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    h.setWindow(undefined)

    await h.answer("answer one")
    expect(h.calls()).toHaveLength(2)
    await h.answer("answer two")

    expect(h.view(a).turns.map((item) => item.turn.question)).toEqual(["first", "second"])
    expect(h.view(a).pending).toEqual([])
    expect(h.view(a).paused).toBe(false)
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

describe("the reasoning setting at send time", () => {
  test("the first question carries the value the accessor held when it was sent", async () => {
    const h = harness()
    h.setReasoning(false)
    h.thread.ask(a, "one")

    expect(h.calls()[0]?.reasoning).toBe(false)
    await h.answer("answer one")
  })

  test("a queued question carries the value current when its own send starts", async () => {
    const h = harness()
    h.thread.ask(a, "one")
    h.thread.ask(a, "two")
    expect(h.calls()[0]?.reasoning).toBe(true)

    h.setReasoning(false)
    await h.answer("answer one")

    expect(h.calls()).toHaveLength(2)
    expect(h.calls()[1]?.reasoning).toBe(false)
    await h.answer("answer two")
  })

  test("a request already in flight keeps the value it was sent with", async () => {
    const h = harness()
    h.thread.ask(a, "one")
    h.setReasoning(false)

    expect(h.calls()[0]?.reasoning).toBe(true)
    await h.answer("answer one")
    expect(h.calls()[0]?.reasoning).toBe(true)
  })

  test("a batch of questions asked together carries one value", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    await h.reject(new Error("model went away"))
    h.setReasoning(false)

    h.thread.ask(a, "third")

    expect(h.calls()).toHaveLength(2)
    expect(h.calls()[1]?.reasoning).toBe(false)
    expect(h.view(a).active).toBe("first\nsecond\nthird")
    await h.answer("batched answer")
    expect(h.calls()).toHaveLength(2)
  })

  test("a retry carries the value current at the retry", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    await h.answer("")
    h.setReasoning(false)

    h.thread.retry(a)

    expect(h.calls()).toHaveLength(2)
    expect(h.calls()[1]?.reasoning).toBe(false)
    await h.answer("retried answer")
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

  test("a thrown answer preserves the question and stops the queue", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    await h.reject(new Error("model went away"))

    expect(h.view(a).failure?.message).toBe("model went away")
    expect(h.view(a).failure?.question).toBe("first")
    expect(h.view(a).pending).toEqual(["first", "second"])
    expect(h.view(a).active).toBeUndefined()
    expect(h.calls()).toHaveLength(1)
    expect(h.notices()).toHaveLength(1)
    expect(h.notices()[0]?.message).toContain("first")
  })

  test("an empty answer preserves the failed question and the pending tail", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    await h.answer("")

    expect(h.view(a).failure?.question).toBe("first")
    expect(h.view(a).pending).toEqual(["first", "second"])
    expect(h.view(a).paused).toBe(true)
    expect(h.view(a).active).toBeUndefined()
    expect(h.calls()).toHaveLength(1)
  })

  test("opening a failed queue neither dismisses the failure nor resumes it", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    await h.reject(new Error("model went away"))
    const failed = h.view(a).failure

    h.thread.send(a)

    expect(h.calls()).toHaveLength(1)
    expect(h.view(a).failure).toEqual(failed)
    expect(h.view(a).pending).toEqual(["first", "second"])
    expect(h.view(a).paused).toBe(true)
  })

  test("a new question acknowledges the failure and resumes the preserved queue", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    await h.reject(new Error("model went away"))

    h.thread.ask(a, "third")

    expect(h.calls()).toHaveLength(2)
    expect(h.view(a).failure).toBeUndefined()
    expect(h.view(a).paused).toBe(false)
    expect(h.view(a).active).toBe("first\nsecond\nthird")
    expect(h.calls()[1]?.prompt).toContain("1. first")
    expect(h.calls()[1]?.prompt).toContain("2. second")
    expect(h.calls()[1]?.prompt).toContain("3. third")
  })

  test("an explicit retry resends the failed question ahead of the pending tail", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    await h.answer("")

    h.thread.retry(a)

    expect(h.calls()).toHaveLength(2)
    expect(h.view(a).failure).toBeUndefined()
    expect(h.view(a).paused).toBe(false)
    expect(h.view(a).active).toBe("first\nsecond")
    expect(h.calls()[1]?.prompt).toContain("1. first")
    expect(h.calls()[1]?.prompt).toContain("2. second")
  })

  test("a retry keeps the questions of a failed batch separate", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    h.thread.ask(a, "third")
    await h.answer("answer one")
    await h.reject(new Error("model went away"))

    expect(h.view(a).pending).toEqual(["second", "third"])
    h.thread.retry(a)

    expect(h.calls()).toHaveLength(3)
    expect(h.calls()[2]?.prompt).toContain("New questions, 2 of them asked together")
    expect(h.calls()[2]?.prompt).toContain("1. second")
    expect(h.calls()[2]?.prompt).toContain("2. third")
  })

  test("a thrown answer with the window open preserves the tail without a toast", async () => {
    const h = harness()
    h.setWindow(a)
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    await h.reject(new Error("model went away"))

    expect(h.view(a).pending).toEqual(["first", "second"])
    expect(h.view(a).paused).toBe(true)
    expect(h.calls()).toHaveLength(1)
    expect(h.notices()).toEqual([])
  })

  test("a failed session does not block another session's queue", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    await h.reject(new Error("model went away"))

    h.thread.ask(b, "other session")
    expect(h.calls()).toHaveLength(2)
    await h.answer("other answer")

    expect(h.view(a).pending).toEqual(["first", "second"])
    expect(h.view(a).paused).toBe(true)
    expect(h.view(b).turns.map((item) => item.turn.question)).toEqual(["other session"])
  })

  test("a failure while the window is for that session stays off the toast", async () => {
    const h = harness()
    h.setWindow(a)
    h.thread.ask(a, "quiet")
    h.thread.ask(a, "still waiting")
    await h.answer("")

    expect(h.view(a).failure).toBeDefined()
    expect(h.view(a).pending).toEqual(["quiet", "still waiting"])
    expect(h.view(a).paused).toBe(true)
    expect(h.calls()).toHaveLength(1)
    expect(h.notices()).toEqual([])
  })

  test("a failure in another session still reaches the toast with the queue preserved", async () => {
    const h = harness()
    h.setWindow(b)
    h.thread.ask(a, "loud")
    h.thread.ask(a, "still waiting")
    await h.answer("")

    expect(h.notices()).toHaveLength(1)
    expect(h.view(a).pending).toEqual(["loud", "still waiting"])
    expect(h.view(a).paused).toBe(true)
    expect(h.calls()).toHaveLength(1)
  })
})

describe("clearing the thread", () => {
  test("a clear keeps a paused queue waiting for a new question", async () => {
    const h = harness()
    h.thread.remember(a, "half a thought", undefined)
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    await h.reject(new Error("model went away"))

    h.thread.clear(a)
    h.thread.send(a)

    const cleared = h.view(a)
    expect(cleared.turns).toEqual([])
    expect(cleared.failure).toBeUndefined()
    expect(cleared.pending).toEqual(["first", "second"])
    expect(cleared.paused).toBe(true)
    expect(cleared.draft).toBe("half a thought")
    expect(cleared.asked).toEqual(["first", "second"])
    expect(h.calls()).toHaveLength(1)

    h.thread.ask(a, "third")
    expect(h.calls()).toHaveLength(2)
    expect(h.view(a).active).toBe("first\nsecond\nthird")
  })

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
    expect(cleared.asked).toEqual(["first", "second"])

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
    expect(h.released()).toEqual([a])

    await h.answer("too late")
    expect(h.published().has(a)).toBe(false)
    expect(h.raised()).toEqual([])
  })

  test("deletion forgets a paused queue and its failure", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    await h.reject(new Error("model went away"))

    h.deleteSession(a)

    expect(h.published().has(a)).toBe(false)
    expect(h.calls()).toHaveLength(1)
  })

  test("dispose does not restart pending work after aborting the request", async () => {
    const h = harness()
    h.thread.ask(a, "first")
    h.thread.ask(a, "second")
    const call = h.calls()[0]

    h.thread.dispose()
    await h.answer("too late")

    expect(call?.signal.aborted).toBe(true)
    expect(h.calls()).toHaveLength(1)
    expect(h.view(a).active).toBeUndefined()
    expect(h.view(a).pending).toEqual(["second"])
    expect(h.view(a).failure).toBeUndefined()
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
