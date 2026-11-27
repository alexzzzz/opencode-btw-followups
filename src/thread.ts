import { remembered } from "./history.ts"
import { thread as buildPrompt } from "./prompt.ts"
import {
  answered as addTurn,
  change,
  cleared,
  forget as forgetState,
  stateOf,
  type SideState,
  type Sides,
} from "./state.ts"

const EMPTY_ANSWER =
  "Nothing came back, so this question was not added to the thread. " +
  "Either the model reached for a tool, which a side question cannot run, " +
  "or the reply was cut short. Rephrase it and ask again."

export type GenerateCall = {
  readonly sessionID: string
  readonly prompt: string
  readonly signal: AbortSignal
}

export type Notice = {
  readonly message: string
  readonly variant: "info" | "success" | "warning" | "error"
  readonly title?: string | undefined
  readonly duration?: number | undefined
}

export type ThreadAdapters = {
  readonly generate: (
    sessionID: string,
    prompt: string,
    signal: AbortSignal,
    reasoning: boolean,
  ) => Promise<{ readonly text: string }>
  readonly reasoning: () => boolean
  readonly onDeleted: (handler: (sessionID: string) => void) => () => void
  readonly spoken: (sessionID: string) => number
  readonly current: () => string | undefined
  readonly windowSession: () => string | undefined
  readonly notify: (notice: Notice) => void
  readonly raise: (sessionID: string) => void
  readonly releasePlayback: (sessionID: string) => void
  readonly publish: (sides: Sides) => void
}

export type SessionThread = {
  ask(sessionID: string, question: string): void
  retry(sessionID: string): void
  send(sessionID: string): void
  failed(
    sessionID: string | undefined,
    message: string,
    title?: string | undefined,
    question?: string | undefined,
  ): void
  clear(sessionID: string): void
  crash(sessionID: string | undefined, error: unknown): void
  view(sessionID: string): SideState
  remember(sessionID: string, draft: string, place: SideState["place"]): void
  dispose(): void
}

type Outcome = "answered" | "empty" | "failed" | "dropped"

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export const createSessionThread = (adapters: ThreadAdapters): SessionThread => {
  let sides: Sides = new Map()
  let disposed = false
  const draining = new Set<string>()
  const inFlight = new Map<string, AbortController>()

  const commit = (next: Sides) => {
    sides = next
    adapters.publish(next)
  }
  const view = (sessionID: string) => stateOf(sides, sessionID)
  const edit = (sessionID: string, changes: Partial<SideState>) =>
    commit(change(sides, sessionID, changes))

  const failed = (
    sessionID: string | undefined,
    message: string,
    title?: string | undefined,
    question?: string | undefined,
    questions?: readonly string[],
  ) => {
    if (sessionID) {
      const state = view(sessionID)
      edit(sessionID, {
        failure: { message, title, question },
        ...(question === undefined
          ? {}
          : {
              paused: true,
              pending: [...(questions ?? [question]), ...state.pending],
            }),
      })
      if (adapters.windowSession() === sessionID) return
    }
    adapters.notify({
      message: question ? `${message}\n\nQuestion: ${question}` : message,
      variant: "error",
      title,
      duration: 6000,
    })
  }

  const unexpected = (sessionID: string | undefined, error: unknown) => {
    failed(
      sessionID,
      errorMessage(error).trim() || "The side question threw something with no message.",
      "/btw did not run",
    )
  }

  const forget = (sessionID: string) => {
    inFlight.get(sessionID)?.abort()
    inFlight.delete(sessionID)
    adapters.releasePlayback(sessionID)
    commit(forgetState(sides, sessionID))
  }

  const sendNext = async (sessionID: string): Promise<Outcome> => {
    const { pending, turns } = view(sessionID)
    const question = pending.join("\n")
    const earlier = turns.map((item) => item.turn)
    const reasoning = adapters.reasoning()

    edit(sessionID, { pending: [], active: question })
    const call = new AbortController()
    inFlight.set(sessionID, call)

    try {
      const response = await adapters.generate(
        sessionID,
        buildPrompt(earlier, pending),
        call.signal,
        reasoning,
      )
      const answer = response.text.trim()
      if (inFlight.get(sessionID) !== call) return "dropped"
      if (!answer) {
        failed(sessionID, EMPTY_ANSWER, "No answer came back", question, pending)
        return "empty"
      }
      commit(addTurn(sides, sessionID, { question, answer }, adapters.spoken(sessionID)))
      if (adapters.current() === sessionID) adapters.raise(sessionID)
      return "answered"
    } catch (error) {
      if (call.signal.aborted) return "dropped"
      if (!sides.has(sessionID)) return "dropped"
      failed(sessionID, errorMessage(error), undefined, question, pending)
      return "failed"
    } finally {
      if (inFlight.get(sessionID) === call) inFlight.delete(sessionID)
      if (sides.has(sessionID)) edit(sessionID, { active: undefined })
    }
  }

  const send = (sessionID: string) => {
    const state = view(sessionID)
    if (disposed || draining.has(sessionID) || state.paused || state.active !== undefined) return
    draining.add(sessionID)
    void (async () => {
      try {
        while (view(sessionID).pending.length > 0) {
          const outcome = await sendNext(sessionID)
          if (outcome === "answered") continue
          break
        }
      } catch (error) {
        unexpected(sessionID, error)
      } finally {
        draining.delete(sessionID)
        const state = view(sessionID)
        if (!state.paused && state.active === undefined && state.pending.length > 0) {
          send(sessionID)
        }
      }
    })()
  }

  const stopDeletes = adapters.onDeleted((sessionID) => forget(sessionID))

  return {
    ask(sessionID, question) {
      const asked = question.trim()
      if (!asked) return
      edit(sessionID, {
        failure: undefined,
        paused: false,
        pending: [...view(sessionID).pending, asked],
        asked: remembered(view(sessionID).asked, asked),
      })
      send(sessionID)
    },
    retry(sessionID) {
      const state = view(sessionID)
      if (!state.paused || !state.failure?.question) return
      edit(sessionID, { failure: undefined, paused: false })
      send(sessionID)
    },
    send,
    failed,
    clear(sessionID) {
      commit(cleared(sides, sessionID))
    },
    crash: unexpected,
    view,
    remember(sessionID, draft, place) {
      edit(sessionID, { draft, place })
    },
    dispose() {
      disposed = true
      for (const call of inFlight.values()) call.abort()
      inFlight.clear()
      stopDeletes()
    },
  }
}
