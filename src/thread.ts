import { remembered } from "./history.ts"
import { thread as buildPrompt, type Turn } from "./prompt.ts"
import {
  answered as addTurn,
  change,
  cleared,
  forget as forgetState,
  stateOf,
  type SideState,
  type Sides,
  type SideTurn,
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
  readonly variant: string
  readonly title?: string | undefined
  readonly duration?: number | undefined
}

export type ThreadAdapters = {
  readonly generate: (
    sessionID: string,
    prompt: string,
    signal: AbortSignal,
  ) => Promise<{ readonly text: string }>
  readonly onDeleted: (handler: (sessionID: string) => void) => () => void
  readonly spoken: (sessionID: string) => number
  readonly current: () => string | undefined
  readonly windowSession: () => string | undefined
  readonly notify: (
    message: string,
    variant: string,
    title?: string | undefined,
    duration?: number | undefined,
  ) => void
  readonly raise: (sessionID: string) => void
  readonly publish: (sides: Sides) => void
}

export type Thread = {
  ask(sessionID: string, question: string): void
  send(sessionID: string): void
  answered(sessionID: string, turn: Turn, spokenAt: number): void
  failed(
    sessionID: string | undefined,
    message: string,
    title?: string | undefined,
    question?: string | undefined,
  ): void
  clear(sessionID: string): void
  forget(sessionID: string): void
  crash(sessionID: string | undefined, error: unknown): void
  view(sessionID: string): SideState
  dismiss(sessionID: string): void
  remember(sessionID: string, draft: string, place: SideState["place"]): void
  played(item: SideTurn): boolean
  markPlayed(item: SideTurn): void
  spoken(sessionID: string): number
  dispose(): void
}

type Outcome = "answered" | "empty" | "failed" | "dropped"

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const createThread = (adapters: ThreadAdapters): Thread => {
  let sides: Sides = new Map()
  const draining = new Set<string>()
  const inFlight = new Map<string, AbortController>()
  const playedTurns = new WeakSet<SideTurn>()

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
  ) => {
    if (sessionID) {
      edit(sessionID, { failure: { message, title, question } })
      if (adapters.windowSession() === sessionID) return
    }
    adapters.notify(
      question ? `${message}\n\nQuestion: ${question}` : message,
      "error",
      title,
      6000,
    )
  }

  const unexpected = (sessionID: string | undefined, error: unknown) => {
    const named = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    failed(
      sessionID,
      named.trim() || "The side question threw something with no message.",
      "/btw did not run",
    )
  }

  const forget = (sessionID: string) => {
    inFlight.get(sessionID)?.abort()
    inFlight.delete(sessionID)
    commit(forgetState(sides, sessionID))
  }

  const sendNext = async (sessionID: string): Promise<Outcome> => {
    const { pending, turns } = view(sessionID)
    const question = pending.join("\n")
    const earlier = turns.map((item) => item.turn)

    edit(sessionID, { pending: [], active: question })
    const call = new AbortController()
    inFlight.set(sessionID, call)

    try {
      const response = await adapters.generate(sessionID, buildPrompt(earlier, pending), call.signal)
      const answer = response.text.trim()
      if (inFlight.get(sessionID) !== call) return "dropped"
      if (!answer) {
        failed(sessionID, EMPTY_ANSWER, "No answer came back", question)
        return "empty"
      }
      commit(addTurn(sides, sessionID, { question, answer }, adapters.spoken(sessionID)))
      if (adapters.current() === sessionID) adapters.raise(sessionID)
      return "answered"
    } catch (error) {
      if (call.signal.aborted) return "dropped"
      if (!sides.has(sessionID)) return "dropped"
      failed(sessionID, errorMessage(error), undefined, question)
      return "failed"
    } finally {
      if (inFlight.get(sessionID) === call) inFlight.delete(sessionID)
      if (sides.has(sessionID)) edit(sessionID, { active: undefined })
    }
  }

  const send = (sessionID: string) => {
    if (draining.has(sessionID)) return
    draining.add(sessionID)
    void (async () => {
      try {
        while (view(sessionID).pending.length > 0) {
          const outcome = await sendNext(sessionID)
          if (outcome === "answered") continue
          if (outcome === "failed") edit(sessionID, { pending: [] })
          break
        }
      } catch (error) {
        unexpected(sessionID, error)
      } finally {
        draining.delete(sessionID)
        if (view(sessionID).pending.length > 0 && adapters.windowSession() === sessionID) {
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
        pending: [...view(sessionID).pending, asked],
        asked: remembered(view(sessionID).asked, asked),
      })
      send(sessionID)
    },
    send,
    answered(sessionID, turn, spokenAt) {
      commit(addTurn(sides, sessionID, turn, spokenAt))
    },
    failed,
    clear(sessionID) {
      commit(cleared(sides, sessionID))
    },
    forget,
    crash: unexpected,
    view,
    dismiss(sessionID) {
      edit(sessionID, { failure: undefined })
    },
    remember(sessionID, draft, place) {
      edit(sessionID, { draft, place })
    },
    played(item) {
      return playedTurns.has(item)
    },
    markPlayed(item) {
      playedTurns.add(item)
    },
    spoken(sessionID) {
      return adapters.spoken(sessionID)
    },
    dispose() {
      for (const call of inFlight.values()) call.abort()
      inFlight.clear()
      stopDeletes()
    },
  }
}
