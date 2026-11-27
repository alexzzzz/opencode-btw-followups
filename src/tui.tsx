import { createSignal, Show } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"
import { createSessionThread, type Notice, type SessionThread } from "./thread.ts"
import { copiedLabel } from "./pointer.ts"
import { opensFromSession, SESSION_OPEN_BIND } from "./interaction.ts"
import { createSyntaxStyle } from "./syntax.ts"
import { panelHeights } from "./layout.ts"
import { movedSinceLast, showsBadge, stateOf, type Sides } from "./state.ts"
import { releasePlayback } from "./playback.ts"
import { reasoningSupport } from "./reasoning.ts"
import type { ReasoningState } from "./header.ts"
import contract from "./contract.ts"
import { Badge, ThreadDialog } from "./window.tsx"

const ID = "btw-followups.tui"

type Resizable = {
  on(event: "resize", handler: () => void): void
  off(event: "resize", handler: () => void): void
}

type ToastVariant = Notice["variant"]

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const enabledOf = (answer: unknown) => (answer as { enabled: boolean }).enabled

export default {
  id: ID,
  setup(context: Plugin.Context) {
    const [sides, setSides] = createSignal<Sides>(new Map())
    const [windowSession, setWindowSession] = createSignal<string | undefined>(undefined)
    const [rows, setRows] = createSignal(context.renderer.terminalHeight)
    const [reasoningOn, setReasoningOn] = createSignal(true)
    const syntax = createSyntaxStyle(context.theme, (context.renderer as any).nativeScene)
    const reasoningRpc = context.client.rpc(contract)
    let reasoningWrite: Promise<unknown> | undefined

    const view = (sessionID: string) => stateOf(sides(), sessionID)

    const spoken = (sessionID: string) =>
      context.data.session.message
        .list(sessionID)
        .filter((message) => message.type === "user" || message.type === "assistant").length

    const resizeEvents = context.renderer as unknown as Resizable
    const followRows = () => setRows(context.renderer.terminalHeight)
    resizeEvents.on("resize", followRows)

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

    void reasoningRpc
      .get({})
      .then((answer) => setReasoningOn(enabledOf(answer)))
      .catch(() => {})

    const reasoningState = (): ReasoningState => {
      if (reasoningOn()) return "on"
      const model = context.ui.model.current()
      if (!model) return "unsupported"
      return reasoningSupport(model) === "supported" ? "off" : "unsupported"
    }

    const flipReasoning = () => {
      const enabled = !reasoningOn()
      setReasoningOn(enabled)
      const write = reasoningRpc.set({ enabled })
      reasoningWrite = write
      void write
        .then((answer) => {
          if (reasoningWrite !== write) return
          const stored = enabledOf(answer)
          setReasoningOn(stored)
          tell(`Reasoning in side answers is ${stored ? "on" : "off"}.`, "info", "/btw", 2000)
        })
        .catch((error) => {
          if (reasoningWrite !== write) return
          setReasoningOn(!enabled)
          tell(errorMessage(error), "error")
        })
        .finally(() => {
          if (reasoningWrite === write) reasoningWrite = undefined
        })
    }

    let lowering = false

    const lowerWindow = () => {
      const sessionID = windowSession()
      if (lowering || sessionID === undefined) return
      lowering = true
      try {
        setWindowSession(undefined)
        context.ui.dialog.clear()
      } finally {
        lowering = false
      }
    }

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

    const copyBlock = (text: string) => {
      if (context.renderer.getSelection()?.getSelectedText()) return
      const copied = context.renderer.copyToClipboardOSC52(text)
      tell(
        copied ? copiedLabel(text) : "This terminal will not take a clipboard write.",
        copied ? "success" : "warning",
        "/btw",
        1500,
      )
    }

    const thread: SessionThread = createSessionThread({
      async generate(sessionID, prompt, signal) {
        const write = reasoningWrite
        if (write) await write.catch(() => {})
        return context.client.session.generate({ sessionID, prompt }, { signal })
      },
      reasoning: () => reasoningOn(),
      onDeleted(handler) {
        return context.data.on("session.deleted", (event) => {
          if (windowSession() === event.data.sessionID) lowerWindow()
          handler(event.data.sessionID)
        })
      },
      spoken,
      current: routeSession,
      windowSession: () => windowSession(),
      notify(notice) {
        tell(notice.message, notice.variant, notice.title, notice.duration)
      },
      raise(sessionID) {
        showWindow(sessionID)
      },
      releasePlayback,
      publish(next) {
        setSides(next)
      },
    })

    function showWindow(sessionID: string): boolean {
      if (windowSession() === sessionID) return true
      const height = rows()
      if (
        panelHeights({ rows: height, listed: false, composerRows: 0, needed: 0 }).maxHeight === 0
      ) {
        tell(
          `This terminal is ${height} rows tall and too short for the window. Make it taller.`,
          "warning",
        )
        return false
      }
      lowerWindow()
      setWindowSession(sessionID)
      context.ui.dialog.show(
        () => (
          <ThreadDialog
            sessionID={sessionID}
            state={() => view(sessionID)}
            syntax={syntax}
            rows={() => rows()}
            reasoning={reasoningState}
            onReasoning={flipReasoning}
            sessionMoved={() => movedSinceLast(view(sessionID).turns, spoken(sessionID))}
            remember={(draft, place) => thread.remember(sessionID, draft, place)}
            ask={(question) => thread.ask(sessionID, question)}
            retry={() => thread.retry(sessionID)}
            clear={() => thread.clear(sessionID)}
            close={lowerWindow}
            copy={copy}
            copyBlock={copyBlock}
          />
        ),
        lowerWindow,
      )
      context.ui.dialog.set({ size: "large", centered: true })
      if (view(sessionID).pending.length > 0) thread.send(sessionID)
      return true
    }

    const openSession = (sessionID: string | undefined, question?: string) => {
      if (!sessionID) {
        tell("Open a session first", "warning")
        return
      }
      if (showWindow(sessionID) && question?.trim()) thread.ask(sessionID, question)
    }

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
                  openSession(routeSession(), input?.trim())
                } catch (error) {
                  thread.crash(routeSession(), error)
                }
              },
            },
            {
              id: "session.aside.reasoning",
              title: "Toggle reasoning in side answers",
              description:
                "Send side questions without reasoning when the selected model allows it",
              group: "Session",
              palette: true,
              run: () => {
                try {
                  flipReasoning()
                } catch (error) {
                  thread.crash(routeSession(), error)
                }
              },
            },
          ],
        }))
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "session.aside.open",
              bind: SESSION_OPEN_BIND,
              title: "Open the side thread",
              description: "The follow-up window for this session, with nothing asked",
              group: "Session",
              palette: true,
              enabled: () => opensFromSession(routeSession(), windowSession()),
              run: (_input, event) => {
                event?.preventDefault()
                try {
                  openSession(routeSession())
                } catch (error) {
                  thread.crash(routeSession(), error)
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

    function routeSession() {
      const route = context.ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }

    return () => {
      lowerWindow()
      thread.dispose()
      resizeEvents.off("resize", followRows)
      removeCommand()
      removeBadge()
      syntax.destroy()
    }
  },
} satisfies Plugin.Definition
