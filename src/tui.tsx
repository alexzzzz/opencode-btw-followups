import { createSignal, Show } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"
import {
  answered,
  change,
  cleared,
  forget,
  movedSinceLast,
  showsBadge,
  stateOf,
  type SideState,
  type Sides,
} from "./state.ts"
import { createSyntaxStyle } from "./syntax.ts"
import { transcriptRows } from "./layout.ts"
import { thread } from "./prompt.ts"
import { Badge, ThreadDialog } from "./window.tsx"

const ID = "btw-followups.tui"

const EMPTY_ANSWER =
  "Nothing came back, so this question was not added to the thread. " +
  "Either the model reached for a tool, which a side question cannot run, " +
  "or the reply was cut short. Rephrase it and ask again."

type Resizable = {
  on(event: "resize", handler: () => void): void
  off(event: "resize", handler: () => void): void
}

type SendOutcome = "answered" | "empty" | "failed" | "dropped"

type ToastVariant = "info" | "success" | "warning" | "error"

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export default {
  id: ID,
  setup(context: Plugin.Context) {
    const [sides, setSides] = createSignal<Sides>(new Map())
    const [windowSession, setWindowSession] = createSignal<string | undefined>(undefined)
    const [rows, setRows] = createSignal(context.renderer.terminalHeight)
    const syntax = createSyntaxStyle(context.theme, (context.renderer as any).nativeScene)

    const view = (sessionID: string) => stateOf(sides(), sessionID)
    const edit = (sessionID: string, changes: Partial<SideState>) =>
      setSides((before) => change(before, sessionID, changes))

    const resizeEvents = context.renderer as unknown as Resizable
    const followRows = () => setRows(context.renderer.terminalHeight)
    resizeEvents.on("resize", followRows)

    const draining = new Set<string>()
    const inFlight = new Map<string, AbortController>()

    const spokenCount = (sessionID: string) =>
      context.data.session.message
        .list(sessionID)
        .filter((message) => message.type === "user" || message.type === "assistant").length

    const currentSession = () => {
      const route = context.ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }

    const tell = (message: string, variant: ToastVariant, title = "/btw", duration?: number) => {
      try {
        context.ui.toast.show({
          title,
          message,
          variant,
          ...(duration === undefined ? {} : { duration }),
        })
      } catch {}
    }

    const failed = (
      sessionID: string | undefined,
      message: string,
      title?: string,
      question?: string,
    ) => {
      if (sessionID) {
        edit(sessionID, { failure: { message, title, question } })
        if (windowSession() === sessionID) return
      }
      tell(question ? `${message}\n\nQuestion: ${question}` : message, "error", title, 6000)
    }

    const unexpected = (sessionID: string | undefined, error: unknown) => {
      const named = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      failed(
        sessionID,
        named.trim() || "The side question threw something with no message.",
        "/btw did not run",
      )
    }

    let lowering = false

    const lower = (dropQueue: boolean) => {
      const sessionID = windowSession()
      if (lowering || sessionID === undefined) return
      lowering = true
      try {
        if (dropQueue) edit(sessionID, { pending: [] })
        setWindowSession(undefined)
        context.ui.dialog.clear()
      } finally {
        lowering = false
      }
    }

    const hideWindow = () => lower(false)
    const closeWindow = () => lower(true)

    const copy = () => {
      const sessionID = windowSession()
      if (!sessionID) return
      const turns = view(sessionID).turns
      if (turns.length === 0) return
      const whole = turns
        .map((item) => `Q: ${item.turn.question}\n\nA: ${item.turn.answer}`)
        .join("\n\n")
      const copied = context.renderer.copyToClipboardOSC52(whole)
      tell(
        copied
          ? `Thread copied: ${turns.length} ${turns.length === 1 ? "question" : "questions"}.`
          : "This terminal will not take a clipboard write.",
        copied ? "success" : "warning",
        "/btw",
        2000,
      )
    }

    const showWindow = (sessionID: string) => {
      if (windowSession() === sessionID) return true
      const height = rows()
      if (transcriptRows(height) === 0) {
        failed(
          sessionID,
          `This terminal is ${height} rows tall and too short for the window. Make it taller.`,
        )
        return false
      }
      hideWindow()
      setWindowSession(sessionID)
      context.ui.dialog.show(
        () => (
          <ThreadDialog
            sessionID={sessionID}
            state={() => view(sessionID)}
            syntax={syntax}
            limit={() => transcriptRows(rows())}
            rows={() => rows()}
            sessionMoved={() => movedSinceLast(view(sessionID).turns, spokenCount(sessionID))}
            remember={(draft, place) => edit(sessionID, { draft, place })}
            ask={(question) => ask(sessionID, question)}
            clear={() => setSides((before) => cleared(before, sessionID))}
            close={closeWindow}
            copy={copy}
          />
        ),
        closeWindow,
      )
      context.ui.dialog.set({ size: "large", centered: true })
      return true
    }

    const ask = (sessionID: string, question: string) => {
      const asked = question.trim()
      if (!asked) return
      edit(sessionID, { failure: undefined, pending: [...view(sessionID).pending, asked] })
      drain(sessionID)
    }

    const sendNext = async (sessionID: string): Promise<SendOutcome> => {
      const { pending, turns } = view(sessionID)
      const question = pending.join("\n")
      const earlier = turns.map((item) => item.turn)

      edit(sessionID, { pending: [], active: question })
      const call = new AbortController()
      inFlight.set(sessionID, call)

      try {
        const response = await context.client.session.generate(
          { sessionID, prompt: thread(earlier, pending) },
          { signal: call.signal },
        )
        const answer = response.text.trim()
        if (inFlight.get(sessionID) !== call) return "dropped"
        if (!answer) {
          failed(sessionID, EMPTY_ANSWER, "No answer came back", question)
          return "empty"
        }
        setSides((before) => answered(before, sessionID, { question, answer }, spokenCount(sessionID)))
        if (currentSession() === sessionID) showWindow(sessionID)
        return "answered"
      } catch (error) {
        if (call.signal.aborted) return "dropped"
        failed(sessionID, errorMessage(error))
        return "failed"
      } finally {
        if (inFlight.get(sessionID) === call) inFlight.delete(sessionID)
        if (sides().has(sessionID)) edit(sessionID, { active: undefined })
      }
    }

    const runQueue = async (sessionID: string) => {
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
        if (view(sessionID).pending.length > 0 && windowSession() === sessionID) drain(sessionID)
      }
    }

    const drain = (sessionID: string) => {
      if (draining.has(sessionID)) return
      draining.add(sessionID)
      void runQueue(sessionID)
    }

    const openSession = (sessionID: string | undefined, question?: string) => {
      if (!sessionID) {
        tell("Open a session first", "warning")
        return
      }
      edit(sessionID, { failure: undefined })
      if (showWindow(sessionID) && question?.trim()) ask(sessionID, question)
    }

    const stopWatchingDeletes = context.data.on("session.deleted", (event) => {
      const sessionID = event.data.sessionID
      if (windowSession() === sessionID) hideWindow()
      inFlight.get(sessionID)?.abort()
      inFlight.delete(sessionID)
      setSides((now) => forget(now, sessionID))
    })

    const removeCommand = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          priority: 10,
          commands: [
            {
              id: "session.aside",
              title: "Ask a follow-up question",
              description:
                "A side thread that answers follow-up questions in order without touching the conversation",
              group: "Session",
              palette: true,
              slash: { name: "btw", arguments: true },
              run: (input) => {
                try {
                  openSession(currentSession(), input?.trim())
                } catch (error) {
                  unexpected(currentSession(), error)
                }
              },
            },
          ],
        }))
        return null
      },
    })

    const removeBadge = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => (
        <Show when={showsBadge(sides(), input.sessionID, windowSession())}>
          <Badge
            accent={context.theme.hue.interactive[200]}
            base={context.theme.text.base}
            open={() => {
              if (context.renderer.getSelection()?.getSelectedText()) return
              openSession(input.sessionID)
            }}
          />
        </Show>
      ),
    })

    return () => {
      hideWindow()
      for (const call of inFlight.values()) call.abort()
      inFlight.clear()
      stopWatchingDeletes()
      resizeEvents.off("resize", followRows)
      removeCommand()
      removeBadge()
      syntax.destroy()
    }
  },
} satisfies Plugin.Definition
