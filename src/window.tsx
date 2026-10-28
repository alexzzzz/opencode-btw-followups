import { type Accessor, createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js"
import {
  BorderChars,
  createTextAttributes,
  type BoxRenderable,
  type ColorInput,
  type KeyEvent,
  type ScrollBoxRenderable,
  type SyntaxStyle,
  type TextareaRenderable,
} from "@opentui/core"
import type { Plugin } from "@opencode/plugin/tui"
import { usePlugin } from "@opencode/plugin/tui"
import { ctrlDown, ctrlUp, type ListEffect } from "./keys.ts"
import {
  belowLabel,
  clearLabel,
  copyLabel,
  countLabel,
  FOOTER_GAP,
  FOOTER_PAD,
  keyHints,
  type Hint,
} from "./footer.ts"
import { COMPOSER_ROWS, listTranscriptRows, RAIL } from "./layout.ts"
import { HEADER_GAP, HEADER_PAD, HEADER_TITLE, CLOSE_LABEL, headerRow, type HeaderRow } from "./header.ts"
import { NOT_BROWSING, recalled, type Browse } from "./history.ts"
import { QUICK_PROMPTS, nextChoice, quickCardDress, quickCardRows, quickCardWidth } from "./quick.ts"
import { firstShown, nextChunk, REVEAL_MS, shownText } from "./reveal.ts"
import { gapBelow, type Failure, type Reading, type SideState } from "./state.ts"

type Theme = Plugin.Context["theme"]

const BOLD = createTextAttributes({ bold: true })

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

const FRAME_MS = 90

const DASH = "┈"

const MOVED_LABEL = " the session carried on "

const CONFIRM_MS = 4000

const REPEAT_GAP_MS = 300

function modelName(data: Plugin.Context["data"], sessionID: string) {
  const info = data.session.get(sessionID)
  const own = info?.model
  if (!own) return undefined
  const find = (location?: { readonly directory: string }) =>
    data.location.model
      .list(location)
      ?.find((item) => item.providerID === own.providerID && item.modelID === own.id)
  return (find(info.location) ?? find())?.name ?? own.id
}

function useSpinnerFrame(running: () => boolean = () => true) {
  const [frame, setFrame] = createSignal(0)

  createEffect(() => {
    if (!running()) return
    setFrame(0)
    const timer = setInterval(() => setFrame((n) => (n + 1) % FRAMES.length), FRAME_MS)
    onCleanup(() => clearInterval(timer))
  })

  return frame
}

function useAnswerReveal(state: () => SideState, markRevealed: () => void) {
  const start = () => {
    const last = state().turns.at(-1)
    return last === undefined
      ? Number.POSITIVE_INFINITY
      : firstShown(last.revealed, last.turn.answer.length)
  }

  const [shown, setShown] = createSignal(start())
  let timer: ReturnType<typeof setInterval> | undefined

  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }

  createEffect(
    on(
      () => state().turns.length,
      () => {
        stop()
        const last = state().turns.at(-1)
        if (last === undefined) return
        const answer = last.turn.answer
        const first = firstShown(last.revealed, answer.length)
        setShown(first)
        if (first >= answer.length) return
        markRevealed()
        timer = setInterval(() => {
          const next = nextChunk(shown(), answer.length)
          setShown(next)
          if (next >= answer.length) stop()
        }, REVEAL_MS)
      },
    ),
  )

  onCleanup(stop)

  const text = (index: number, answer: string) =>
    index === state().turns.length - 1 && shown() < answer.length
      ? shownText(answer, shown())
      : answer.trimEnd()

  return { shown, text }
}

function useClearConfirm(count: () => number, clear: () => void) {
  const [armed, setArmed] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let armedAt = 0

  const disarm = () => {
    clearTimeout(timer)
    timer = undefined
    setArmed(false)
  }

  const press = () => {
    if (count() === 0) return
    const now = Date.now()
    if (now - armedAt < REPEAT_GAP_MS) return
    armedAt = now
    if (!armed()) {
      setArmed(true)
      timer = setTimeout(disarm, CONFIRM_MS)
      return
    }
    disarm()
    clear()
  }

  onCleanup(disarm)

  return { armed, disarm, press }
}

function Clickable(props: {
  readonly base: ColorInput
  readonly muted: ColorInput
  readonly label: string
  readonly onClick: () => void
  readonly wrap: boolean
}) {
  const [hovered, setHovered] = createSignal(false)

  return (
    <text
      fg={hovered() ? props.base : props.muted}
      wrapMode={props.wrap ? "word" : "none"}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseUp={props.onClick}
    >
      {props.label}
    </text>
  )
}

export function Badge(props: {
  readonly accent: ColorInput
  readonly base: ColorInput
  readonly open: () => void
}) {
  const frame = useSpinnerFrame()
  const [hovered, setHovered] = createSignal(false)
  const colour = () => (hovered() ? props.base : props.accent)

  return (
    <box
      flexDirection="row"
      flexShrink={0}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseUp={props.open}
    >
      <text fg={colour()}>{FRAMES[frame()]}</text>
      <text fg={colour()}>btw</text>
    </box>
  )
}

function Turn(props: {
  readonly question: string
  readonly answer?: () => string
  readonly waiting?: boolean
  readonly carriedOn?: () => boolean
  readonly theme: Theme
  readonly syntax: SyntaxStyle
}) {
  const accent = () => props.theme.hue.interactive[200]
  const muted = () => props.theme.text.muted

  return (
    <box flexDirection="column" gap={1} flexShrink={0}>
      <box
        border={["left"]}
        borderColor={props.waiting ? muted() : accent()}
        customBorderChars={{ ...BorderChars.single, vertical: RAIL }}
        paddingLeft={1}
        paddingRight={2}
        flexShrink={0}
      >
        <text fg={props.waiting ? muted() : accent()} wrapMode="word" flexGrow={1}>
          {props.question}
        </text>
      </box>
      <Show when={props.answer}>
        <box flexDirection="column" gap={1} flexShrink={0}>
          <box flexShrink={0} paddingLeft={2} paddingRight={2}>
            <markdown
              syntaxStyle={props.syntax}
              fg={props.theme.markdown.text}
              content={props.answer!()}
              conceal
              streaming
              internalBlockMode="top-level"
              tableOptions={{ style: "grid", cellPaddingX: 1 }}
            />
          </box>
          <Show when={props.carriedOn?.()}>
            <box
              border={["top"]}
              borderColor={muted()}
              customBorderChars={{ ...BorderChars.single, horizontal: DASH, topLeft: DASH, topRight: DASH }}
              title={MOVED_LABEL}
              height={1}
              flexShrink={0}
            />
          </Show>
        </box>
      </Show>
    </box>
  )
}

function WindowHeader(props: {
  readonly theme: Theme
  readonly row: () => HeaderRow
  readonly onToggle: () => void
  readonly onClose: () => void
}) {
  const muted = () => props.theme.text.muted
  const row = () => props.row()

  return (
    <box
      flexDirection="row"
      gap={HEADER_GAP}
      paddingLeft={HEADER_PAD}
      paddingRight={HEADER_PAD}
      flexShrink={0}
    >
      <text fg={props.theme.text.base} attributes={BOLD} wrapMode="none">{HEADER_TITLE}</text>
      <For each={row().cells}>
        {(cell) => {
          if (cell === "spacer") return <text fg={muted()} flexGrow={1} />
          if (cell === "count") return <text fg={muted()} wrapMode="none">{row().count}</text>
          if (cell === "above") return <text fg={muted()} wrapMode="none">{row().above}</text>
          if (cell === "close")
            return (
              <text fg={muted()} onMouseUp={props.onClose} wrapMode="none">{CLOSE_LABEL}</text>
            )
          return (
            <Clickable
              base={props.theme.text.base}
              muted={muted()}
              label={row().marker}
              onClick={props.onToggle}
              wrap={false}
            />
          )
        }}
      </For>
    </box>
  )
}

function QuickRows(props: {
  readonly theme: Theme
  readonly chosen: number
  readonly onChoose: (index: number) => void
  readonly onAsk: (prompt: string) => void
}) {
  const accent = () => props.theme.hue.interactive[200]
  const faint = () => props.theme.text.faint
  const base = () => props.theme.text.base
  const muted = () => props.theme.text.muted

  return (
    <For each={QUICK_PROMPTS}>
      {(prompt, index) => {
        const picked = () => props.chosen === index()
        return (
          <box
            flexDirection="row"
            gap={1}
            flexShrink={0}
            onMouseOver={() => props.onChoose(index())}
            onMouseUp={() => props.onAsk(prompt)}
          >
            <text fg={picked() ? accent() : faint()} wrapMode="none">{`${index() + 1}.`}</text>
            <text fg={picked() ? base() : muted()} wrapMode="word">{prompt}</text>
          </box>
        )
      }}
    </For>
  )
}

function QuickList(props: {
  readonly theme: Theme
  readonly width: number
  readonly room: number
  readonly chosen: number
  readonly onChoose: (index: number) => void
  readonly onAsk: (prompt: string) => void
}) {
  const padded = () => quickCardDress(QUICK_PROMPTS.length, props.room) === "padded"

  return (
    <box position="absolute" left={0} top={1} width="100%" zIndex={1} alignItems="center">
      <box
        flexDirection="column"
        width={Math.min(quickCardWidth(QUICK_PROMPTS), Math.max(0, props.width - 2))}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={padded() ? 1 : 0}
        paddingBottom={padded() ? 1 : 0}
        backgroundColor={props.theme.surface("dialog").background.raised.high}
      >
        <QuickRows
          theme={props.theme}
          chosen={props.chosen}
          onChoose={props.onChoose}
          onAsk={props.onAsk}
        />
      </box>
    </box>
  )
}

function Composer(props: {
  readonly theme: Theme
  readonly placeholder: () => string
  readonly onReady: (field: TextareaRenderable) => void
  readonly onTyped: () => void
  readonly onSubmit: (question: string) => void
}) {
  let field: TextareaRenderable | undefined

  const submit = () => {
    if (!field) return
    const question = field.plainText
    field.setText("")
    props.onSubmit(question)
  }

  return (
    <box
      border={["left"]}
      borderColor={props.theme.hue.interactive[200]}
      customBorderChars={{ ...BorderChars.single, vertical: RAIL }}
      marginLeft={2}
      paddingLeft={1}
      paddingRight={2}
      flexShrink={0}
    >
      <textarea
        ref={(element) => {
          field = element
          props.onReady(element)
        }}
        focused
        width="100%"
        minHeight={1}
        maxHeight={COMPOSER_ROWS}
        wrapMode="word"
        placeholder={props.placeholder()}
        placeholderColor={props.theme.text.muted}
        textColor={props.theme.text.base}
        focusedTextColor={props.theme.text.base}
        onContentChange={props.onTyped}
        onSubmit={submit}
      />
    </box>
  )
}

function Footer(props: {
  readonly theme: Theme
  readonly armed: boolean
  readonly confirm: () => string
  readonly copy: () => string
  readonly onCopy: () => void
  readonly hints: () => readonly Hint[]
  readonly right: () => string
  readonly highlight: () => boolean
  readonly onRight: () => void
}) {
  const muted = () => props.theme.text.muted
  const error = () => props.theme.text.feedback.error.base

  return (
    <box
      flexDirection="row"
      gap={FOOTER_GAP}
      paddingLeft={FOOTER_PAD}
      paddingRight={FOOTER_PAD}
      flexShrink={0}
    >
      <Show
        when={props.armed}
        fallback={
          <>
            <text fg={muted()} onMouseUp={props.onCopy} wrapMode="none">
              {props.copy()}
            </text>
            <box flexDirection="row" flexShrink={1} overflow="hidden">
              <For each={props.hints()}>
                {(hint) => (
                  <>
                    <text fg={props.theme.text.base} wrapMode="none">
                      {hint[0]}
                    </text>
                    <text fg={muted()} wrapMode="none">
                      {hint[1]}
                    </text>
                  </>
                )}
              </For>
            </box>
            <text fg={muted()} flexGrow={1} />
            <Show when={props.right()}>
              <text
                fg={props.highlight() ? props.theme.hue.interactive[200] : muted()}
                wrapMode="none"
                onMouseUp={props.onRight}
              >
                {props.right()}
              </text>
            </Show>
          </>
        }
      >
        <text fg={error()} wrapMode="none">
          {props.confirm()}
        </text>
      </Show>
    </box>
  )
}

export function ThreadDialog(props: {
  readonly sessionID: string
  readonly state: () => SideState
  readonly syntax: SyntaxStyle
  readonly limit: () => number
  readonly rows: () => number
  readonly sessionMoved: () => boolean
  readonly markRevealed: () => void
  readonly remember: (draft: string, place: Reading | undefined) => void
  readonly ask: (question: string) => void
  readonly clear: () => void
  readonly close: () => void
  readonly copy: () => void
}) {
  const context = usePlugin()
  const theme = context.theme
  const accent = theme.hue.interactive[200]
  const error = theme.text.feedback.error.base

  let field: TextareaRenderable | undefined
  let scroller: ScrollBoxRenderable | undefined
  let panel: BoxRenderable | undefined
  let place = props.state().place

  const reveal = useAnswerReveal(props.state, props.markRevealed)
  const frame = useSpinnerFrame(() => Boolean(props.state().active))
  const [width, setWidth] = createSignal(0)
  const [height, setHeight] = createSignal(0)
  const [listed, setListed] = createSignal(false)
  const [chosen, setChosen] = createSignal(0)
  const [browse, setBrowse] = createSignal<Browse>(NOT_BROWSING)

  onMount(() =>
    queueMicrotask(() => {
      field?.focus()
      if (props.state().draft) field?.setText(props.state().draft)
    }),
  )

  onCleanup(() => {
    const box = scroller
    const typed = browse().index === null ? field?.plainText ?? "" : browse().draft
    props.remember(
      typed,
      box
        ? { top: Math.round(box.scrollTop), height: box.height, scrollHeight: box.scrollHeight }
        : place,
    )
  })

  const [above, setAbove] = createSignal(0)
  const [below, setBelow] = createSignal(0)
  const [newAnswers, setNewAnswers] = createSignal(0)
  let seen = props.state().turns.length

  const atEnd = () => {
    const box = scroller
    return box === undefined || box.scrollTop + box.height >= box.scrollHeight - 2
  }

  const readToEnd = () => {
    seen = props.state().turns.length
    setNewAnswers(0)
  }

  const measure = () => {
    setHeight(panel?.height ?? 0)
    const box = scroller
    if (!box) return
    const saved = place
    if (saved && box.scrollHeight >= saved.scrollHeight) {
      place = undefined
      box.scrollTo(saved.top + saved.height >= saved.scrollHeight - 2 ? box.scrollHeight : saved.top)
    }
    const hidden = Math.max(0, box.scrollHeight - box.height)
    const top = Math.max(0, Math.min(hidden, Math.round(box.scrollTop)))
    setAbove(top)
    setBelow(hidden - top)
  }

  const scrollToEnd = () => {
    const box = scroller
    if (!box) return
    box.scrollTo(Math.max(0, box.scrollHeight))
    readToEnd()
    measure()
  }

  const onScroll = () => {
    measure()
    if (atEnd()) readToEnd()
  }

  createEffect(() => {
    props.state()
    props.limit()
    reveal.shown()
    queueMicrotask(measure)
  })

  createEffect(() => {
    const count = props.state().turns.length
    if (count === 0) {
      seen = 0
      setNewAnswers(0)
      return
    }
    queueMicrotask(() => {
      if (atEnd()) {
        readToEnd()
        return
      }
      const missed = count - seen
      if (missed > 0) setNewAnswers(missed)
    })
  })

  const clearing = useClearConfirm(() => props.state().turns.length, () => {
    place = undefined
    props.clear()
  })

  const moveScroller =
    (move: (box: ScrollBoxRenderable) => void) => (_input: unknown, event?: KeyEvent) => {
      const box = scroller
      if (!box) return
      move(box)
      event?.preventDefault()
      onScroll()
    }

  const recall = (direction: -1 | 1): boolean => {
    const box = field
    if (!box) return false
    const move = recalled(props.state().asked, browse(), direction, box.plainText, box.cursorOffset)
    if (!move) return false
    setBrowse(move.browse)
    box.setText(move.text)
    box.cursorOffset = move.cursor
    queueMicrotask(measure)
    return true
  }

  const applyList = (effect: ListEffect) => {
    if (effect === "close-window") {
      props.close()
      return
    }
    if (effect === "open") {
      setChosen(0)
      setListed(true)
      return
    }
    setListed(false)
    field?.focus()
  }

  const walk = (direction: -1 | 1) => {
    const box = field
    if (!box) return
    const before = box.cursorOffset
    if (direction === -1) box.moveCursorUp()
    else box.moveCursorDown()
    if (box.cursorOffset !== before) return
    if (recall(direction)) return
    if (direction === 1) {
      if (box.cursorOffset >= box.plainText.length) {
        setChosen(0)
        setListed(true)
        return
      }
      box.cursorOffset = box.plainText.length
      return
    }
    box.cursorOffset = 0
  }

  context.keymap.layer(() => ({
    mode: "modal",
    priority: 1,
    commands: [
      {
        id: "session.aside.page_up",
        bind: "pageup",
        title: "Page up",
        group: "Dialog",
        run: moveScroller((box) => box.scrollBy(-1, "viewport")),
      },
      {
        id: "session.aside.page_down",
        bind: "pagedown",
        title: "Page down",
        group: "Dialog",
        run: moveScroller((box) => box.scrollBy(1, "viewport")),
      },
      {
        id: "session.aside.home",
        bind: "ctrl+home",
        title: "First question",
        group: "Dialog",
        run: moveScroller((box) => box.scrollTo(0)),
      },
      {
        id: "session.aside.end",
        bind: "ctrl+end",
        title: "Newest answer",
        group: "Dialog",
        run: moveScroller((box) => box.scrollTo(box.scrollHeight)),
      },
      {
        id: "session.aside.list",
        bind: "ctrl+up",
        title: "Quick prompts",
        group: "Dialog",
        run: (_input: unknown, event?: KeyEvent) => {
          event?.preventDefault()
          applyList(ctrlUp(listed()))
        },
      },
      {
        id: "session.aside.step_down",
        bind: "ctrl+down",
        title: "Close the prompt list or the window",
        group: "Dialog",
        run: (_input: unknown, event?: KeyEvent) => {
          event?.preventDefault()
          applyList(ctrlDown(listed()))
        },
      },
      {
        id: "session.aside.clear",
        bind: "delete",
        title: "Clear the side thread",
        group: "Dialog",
        enabled: () => !listed(),
        run: (_input: unknown, event?: KeyEvent) => {
          if ((field?.plainText.length ?? 0) > 0) return false
          event?.preventDefault()
          if (event?.eventType === "repeat" || event?.repeated) return
          clearing.press()
        },
      },
      {
        id: "session.aside.recall_older",
        bind: "up",
        title: "Earlier question",
        group: "Dialog",
        enabled: () => !listed(),
        run: (_input: unknown, event?: KeyEvent) => {
          event?.preventDefault()
          walk(-1)
        },
      },
      {
        id: "session.aside.recall_newer",
        bind: "down",
        title: "Later question",
        group: "Dialog",
        enabled: () => !listed(),
        run: (_input: unknown, event?: KeyEvent) => {
          event?.preventDefault()
          walk(1)
        },
      },
      {
        id: "session.aside.choose_up",
        bind: "up",
        title: "Previous quick prompt",
        group: "Dialog",
        enabled: () => listed(),
        run: (_input: unknown, event?: KeyEvent) => {
          event?.preventDefault()
          if (chosen() === 0) {
            setListed(false)
            field?.focus()
            return
          }
          setChosen((index) => nextChoice(index, -1, QUICK_PROMPTS.length))
        },
      },
      {
        id: "session.aside.choose_down",
        bind: "down",
        title: "Next quick prompt",
        group: "Dialog",
        enabled: () => listed(),
        run: (_input: unknown, event?: KeyEvent) => {
          event?.preventDefault()
          setChosen((index) => nextChoice(index, 1, QUICK_PROMPTS.length))
        },
      },
      {
        id: "session.aside.choose",
        bind: "enter",
        title: "Ask the picked quick prompt",
        group: "Dialog",
        enabled: () => listed(),
        run: (_input: unknown, event?: KeyEvent) => {
          event?.preventDefault()
          const question = QUICK_PROMPTS[chosen()]
          if (question) askQuick(question)
        },
      },
      {
        id: "session.aside.close_list",
        bind: "escape",
        title: "Close the prompt list",
        group: "Dialog",
        enabled: () => listed(),
        run: (_input: unknown, event?: KeyEvent) => {
          event?.preventDefault()
          setListed(false)
        },
      },
    ],
  }))

  const askQuick = (question: string) => {
    if (context.renderer.getSelection()?.getSelectedText()) return
    setListed(false)
    props.ask(question)
  }

  const turnCount = () => props.state().turns.length
  const countText = () => countLabel(turnCount(), props.state().pending.length)
  const copyText = () => copyLabel(turnCount())
  const rightText = () => belowLabel(newAnswers(), below())
  const confirmText = () => clearLabel(turnCount(), width())
  const hintTier = () => keyHints(width(), copyText(), rightText())
  const header = () => headerRow(width(), countText(), above(), QUICK_PROMPTS.length, listed())
  const listRoom = () => Math.max(0, height() - 2)
  const cardRows = () => quickCardRows(QUICK_PROMPTS.length)
  const transcriptCap = () =>
    listed()
      ? listTranscriptRows(props.rows(), field?.height ?? 1, cardRows())
      : props.limit()

  const activeQuestion = () => props.state().active ?? ""
  const model = () => modelName(context.data, props.sessionID)
  const thinkingText = () => (model() ? `${model()} is thinking...` : "thinking...")
  const placeholder = () =>
    props.state().active ? "ask to queue the next" : "ask a side question"

  return (
    <box
      ref={(element) => {
        panel = element
        setWidth(element.width)
        setHeight(element.height)
      }}
      onSizeChange={() => {
        setWidth(panel?.width ?? 0)
        setHeight(panel?.height ?? 0)
      }}
      flexDirection="column"
      gap={1}
      paddingBottom={1}
      overflow="hidden"
      backgroundColor={theme.surface("dialog").background.base}
    >
      <WindowHeader
        theme={theme}
        row={header}
        onToggle={() => {
          setChosen(0)
          setListed(!listed())
        }}
        onClose={props.close}
      />

      <Show when={listed()}>
        <QuickList
          theme={theme}
          width={width()}
          room={listRoom()}
          chosen={chosen()}
          onChoose={(index) => setChosen(index)}
          onAsk={askQuick}
        />
      </Show>

      <scrollbox
        ref={(element) => {
          scroller = element
        }}
        maxHeight={transcriptCap()}
        minHeight={listed() ? Math.min(cardRows(), transcriptCap()) : 0}
        stickyScroll
        stickyStart="bottom"
        contentOptions={{ minHeight: 0 }}
        scrollbarOptions={{ visible: false }}
        onMouseScroll={onScroll}
      >
        <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2}>
          <For each={props.state().turns}>
            {(item, index) => (
              <Turn
                question={item.turn.question}
                answer={() => reveal.text(index(), item.turn.answer)}
                carriedOn={() => gapBelow(props.state().turns, index(), props.sessionMoved())}
                theme={theme}
                syntax={props.syntax}
              />
            )}
          </For>

          <Show when={activeQuestion()}>
            <box flexDirection="column" gap={1} flexShrink={0}>
              <Turn question={activeQuestion()} theme={theme} syntax={props.syntax} />
              <box flexDirection="row" gap={1} paddingLeft={2} flexShrink={0}>
                <text fg={accent} wrapMode="none">
                  {FRAMES[frame()]}
                </text>
                <text fg={theme.text.muted} wrapMode="none">
                  {thinkingText()}
                </text>
              </box>
            </box>
          </Show>

          <For each={props.state().pending}>
            {(question) => (
              <Turn question={question} waiting theme={theme} syntax={props.syntax} />
            )}
          </For>

          <Show when={props.state().failure}>
            {(failure: Accessor<Failure>) => (
              <box flexDirection="column" gap={1} flexShrink={0}>
                <Show when={failure().title}>
                  <text fg={error} attributes={BOLD} wrapMode="word">
                    {failure().title}
                  </text>
                </Show>
                <text fg={error} wrapMode="word">
                  {failure().message}
                </text>
                <Show when={failure().question}>
                  <text fg={theme.text.muted} wrapMode="word">
                    {`Asked: ${failure().question}`}
                  </text>
                </Show>
              </box>
            )}
          </Show>
        </box>
      </scrollbox>

      <Composer
        theme={theme}
        placeholder={placeholder}
        onReady={(element) => {
          field = element
        }}
        onTyped={() => {
          if ((field?.plainText.length ?? 0) > 0) clearing.disarm()
        }}
        onSubmit={(question) => {
          clearing.disarm()
          setBrowse(NOT_BROWSING)
          props.ask(question)
        }}
      />

      <Footer
        theme={theme}
        armed={clearing.armed()}
        confirm={confirmText}
        copy={copyText}
        onCopy={props.copy}
        hints={hintTier}
        right={rightText}
        highlight={() => newAnswers() > 0}
        onRight={scrollToEnd}
      />
    </box>
  )
}
