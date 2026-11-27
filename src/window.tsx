import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js"
import {
  BorderChars,
  createTextAttributes,
  type BoxRenderable,
  type ColorInput,
  type KeyEvent,
  type MarkdownBlock,
  MarkdownRenderable,
  type MouseEvent,
  type RenderNodeContext,
  type ScrollBoxRenderable,
  type SyntaxStyle,
  type TextareaRenderable,
} from "@opentui/core"
import type { Plugin } from "@opencode/plugin/tui"
import { usePlugin } from "@opencode/plugin/tui"
import {
  bindings,
  retryQuestion,
  type Binding,
  type Hint,
  type InteractionMode,
  type Intent,
  type ListEffect,
} from "./interaction.ts"
import {
  belowLabel,
  clearLabel,
  copyLabel,
  countLabel,
  FOOTER_GAP,
  FOOTER_PAD,
  footerHints,
} from "./footer.ts"
import { COMPOSER_ROWS, listTranscriptRoom, panelHeights } from "./layout.ts"
import { RAIL } from "./rail.ts"
import { createReading, type ReadingView, type Scrollbox } from "./reading.ts"
import { HEADER_GAP, HEADER_PAD, HEADER_TITLE, CLOSE_LABEL, headerRow, type HeaderRow } from "./header.ts"
import {
  answerToken,
  emptyPointer,
  pointerAt,
  samePointer,
  type AnswerPointer,
  type AnswerToken,
  type PointerSurface,
} from "./pointer.ts"
import { NOT_BROWSING, recalled, type Browse } from "./history.ts"
import {
  QUICK_PROMPTS,
  nextChoice,
  quickCardGeometry,
  quickChoiceScroll,
  type QuickCardGeometry,
} from "./quick.ts"
import { createAnswerPlayback, type Timer } from "./playback.ts"
import { gapBelow, type Failure, type Reading, type SideState } from "./state.ts"

type Theme = Plugin.Context["theme"]

const BOLD = createTextAttributes({ bold: true })

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

const FRAME_MS = 90

const DASH = "┈"

const MOVED_LABEL = " the session behind btw carried on "

const MODERN_MARKDOWN = "renderBlock" in MarkdownRenderable.prototype

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

export function Turn(props: {
  readonly question: string
  readonly answer?: () => string
  readonly waiting?: boolean
  readonly carriedOn?: () => boolean
  readonly anchor?: (element: BoxRenderable) => void
  readonly copy: (text: string) => void
  readonly selecting: () => boolean
  readonly copyable?: () => boolean
  readonly theme: Theme
  readonly syntax: SyntaxStyle
}) {
  const accent = () => props.theme.hue.interactive[200]
  const muted = () => props.theme.text.muted

  let blocks: MarkdownRenderable | undefined
  let answer: BoxRenderable | undefined
  const states = new Map<number, { token: AnswerToken; renderable: unknown }>()
  const [pointer, setPointer] = createSignal<AnswerPointer>(emptyPointer, { equals: samePointer })

  const surface = (): PointerSurface => ({ answer, markdown: blocks })
  const canCopy = () => props.copyable?.() ?? true

  const track = (event: MouseEvent) =>
    setPointer(pointerAt(event, surface(), props.selecting, canCopy))

  const rail = () => pointer().rail

  const click = (renderable: NonNullable<ReturnType<RenderNodeContext["defaultRender"]>>) => {
    renderable.onMouseUp = (event: MouseEvent) => {
      const result = pointerAt(event, surface(), props.selecting, canCopy)
      if (result.copy !== "") props.copy(result.copy)
    }
    return renderable
  }

  const clickableToken = (_token: unknown, context: RenderNodeContext) => {
    const renderable = context.defaultRender()
    return renderable ? click(renderable) : renderable
  }

  const clickableBlock = (block: MarkdownBlock, context: RenderNodeContext) => {
    const renderable = context.defaultRender()
    if (!renderable) return renderable
    states.set(block.index, { token: answerToken(block), renderable })
    return click(renderable)
  }

  const currentStates = () => {
    const current = new Set(blocks?.blocks.map((_block, index) => index))
    return [...states]
      .filter(([index]) => current.has(index))
      .sort(([left], [right]) => left - right)
      .map(([, state]) => state)
  }

  return (
    <box flexDirection="column" gap={1} flexShrink={0}>
      <box
        ref={(element) => {
          props.anchor?.(element)
        }}
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
          <box
            ref={(element) => {
              answer = element
            }}
            flexDirection="row"
            flexShrink={0}
            paddingRight={2}
            onMouseMove={track}
            onMouseOut={track}
            onMouseScroll={() => setPointer(emptyPointer)}
          >
            <box width={1} flexShrink={0}>
              <text fg={muted()} wrapMode="none">{rail()}</text>
            </box>
            <box flexShrink={1} flexGrow={1} paddingLeft={1}>
              <markdown
                syntaxStyle={props.syntax}
                fg={props.theme.markdown.text}
                {...(MODERN_MARKDOWN
                  ? { renderBlock: clickableBlock }
                  : { renderNode: clickableToken, internalBlockMode: "top-level" }) as any}
                content={props.answer!()}
                conceal
                streaming
                tableOptions={{ style: "grid", cellPaddingX: 1 }}
                ref={(element) => {
                  blocks = element
                  if (MODERN_MARKDOWN) {
                    Object.defineProperty(element, "_blockStates", {
                      configurable: true,
                      get: currentStates,
                    })
                  }
                }}
              />
            </box>
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
  readonly geometry: QuickCardGeometry
  readonly chosen: number
  readonly onChoose: (index: number) => void
  readonly onAsk: (prompt: string) => void
}) {
  let list: ScrollBoxRenderable | undefined

  createEffect(() => {
    props.chosen
    props.geometry
    queueMicrotask(() => {
      if (!list || list.isDestroyed) return
      list.scrollTo(quickChoiceScroll(props.geometry, props.chosen, list.scrollTop))
    })
  })

  return (
    <box position="absolute" left={0} top={1} width="100%" zIndex={1} alignItems="center">
      <scrollbox
        ref={(element) => {
          list = element
        }}
        width={props.geometry.width}
        height={props.geometry.viewport}
        maxHeight={props.geometry.viewport}
        scrollbarOptions={{ visible: false }}
        contentOptions={{ minHeight: 0 }}
        backgroundColor={props.theme.surface("dialog").background.raised.high}
      >
        <box
          flexDirection="column"
          paddingLeft={2}
          paddingRight={2}
          paddingTop={props.geometry.dress === "padded" ? 1 : 0}
          paddingBottom={props.geometry.dress === "padded" ? 1 : 0}
        >
          <QuickRows
            theme={props.theme}
            chosen={props.chosen}
            onChoose={props.onChoose}
            onAsk={props.onAsk}
          />
        </box>
      </scrollbox>
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
  readonly rows: () => number
  readonly sessionMoved: () => boolean
  readonly remember: (draft: string, place: Reading | undefined) => void
  readonly ask: (question: string) => void
  readonly retry: () => void
  readonly clear: () => void
  readonly close: () => void
  readonly copy: () => void
  readonly copyBlock: (text: string) => void
}) {
  const context = usePlugin()
  const theme = context.theme
  const accent = theme.hue.interactive[200]
  const error = theme.text.feedback.error.base

  let field: TextareaRenderable | undefined
  let scroller: ScrollBoxRenderable | undefined
  let panel: BoxRenderable | undefined
  let held: BoxRenderable | undefined

  const reading = createReading(props.state().place, props.state().turns.length)
  const sameView = (before: ReadingView, now: ReadingView) =>
    before.above === now.above &&
    before.below === now.below &&
    before.newAnswers === now.newAnswers &&
    before.hold === now.hold &&
    before.place === now.place
  const [readingView, setReadingView] = createSignal(reading.view(), { equals: sameView })
  const sync = () => setReadingView(reading.view())
  const device: Scrollbox = {
    get scrollTop() {
      return scroller?.scrollTop ?? 0
    },
    get height() {
      return scroller?.height ?? 0
    },
    get scrollHeight() {
      return scroller?.scrollHeight ?? 0
    },
    get screenY() {
      return held?.screenY ?? 0
    },
    get viewport() {
      return { screenY: scroller?.viewport.screenY ?? 0 }
    },
    get stickyScroll() {
      return scroller?.stickyScroll ?? false
    },
    set stickyScroll(value: boolean) {
      if (scroller) scroller.stickyScroll = value
    },
    scrollTo(top: number) {
      scroller?.scrollTo(top)
    },
  }
  const box = (): Scrollbox | undefined => (scroller ? device : undefined)

  const [revealed, setRevealed] = createSignal(0)
  const timer: Timer = {
    every(ms, tick) {
      const id = setInterval(() => {
        tick()
        setRevealed((n) => n + 1)
      }, ms)
      return () => clearInterval(id)
    },
  }
  const playableTurns = createMemo(() => props.state().turns.map((item) => item.turn))
  const playback = createAnswerPlayback(
    props.sessionID,
    () => playableTurns(),
    timer,
  )
  const answerText = (index: number) => {
    const turns = playableTurns()
    const answer = turns[index]?.answer ?? ""
    if (index !== turns.length - 1) return answer.trimEnd()
    revealed()
    return playback.text(index)
  }
  const frame = useSpinnerFrame(() => Boolean(props.state().active))
  const [width, setWidth] = createSignal(0)
  const [composerRows, setComposerRows] = createSignal(1)
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
    const typed = browse().index === null ? field?.plainText ?? "" : browse().draft
    const scrolled = box()
    props.remember(
      typed,
      scrolled
        ? {
            top: Math.round(scrolled.scrollTop),
            height: scrolled.height,
            scrollHeight: scrolled.scrollHeight,
          }
        : reading.view().place,
    )
  })

  const [typed, setTyped] = createSignal(false)

  const scrollToEnd = () => {
    const scrolled = box()
    if (!scrolled) return
    scrolled.scrollTo(scrolled.scrollHeight)
    reading.onScroll(scrolled, props.state().turns.length)
    sync()
  }

  const onScroll = () => {
    const scrolled = box()
    if (!scrolled) return
    reading.onScroll(scrolled, props.state().turns.length)
    sync()
  }

  const hold = () => {
    const scrolled = box()
    if (!scrolled) return
    reading.onFrame(scrolled, playback.revealing(), held !== undefined)
    sync()
  }

  const noteTyped = () => {
    setTyped((field?.plainText.length ?? 0) > 0)
    setComposerRows(field?.height ?? 1)
  }

  onMount(() => {
    context.renderer.on("frame", hold)
    context.renderer.on("frame", noteTyped)
    queueMicrotask(() => {
      reading.entered(box())
      sync()
    })
  })

  onCleanup(() => {
    context.renderer.off("frame", hold)
    context.renderer.off("frame", noteTyped)
    playback.stop()
  })

  createEffect(() => {
    const count = props.state().turns.length
    if (count === 0) {
      reading.onAnswer(count, box())
      sync()
      return
    }
    queueMicrotask(() => {
      reading.onAnswer(count, box())
      sync()
    })
  })

  const clearing = useClearConfirm(() => props.state().turns.length, () => {
    held = undefined
    reading.onAnswer(0, box())
    props.clear()
    sync()
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
    box.cursorOffset = direction === 1 ? box.plainText.length : 0
  }

  const mode = (): InteractionMode => ({
    waiting: props.state().active !== undefined,
    typed: typed(),
    listed: listed(),
    hasTurns: props.state().turns.length > 0,
    canRetry: props.state().paused && props.state().failure?.question !== undefined,
    canJump: readingView().above > 0 || readingView().below > 0,
  })

  const listRun = (binding: Binding, _input: unknown, event?: KeyEvent) => {
    event?.preventDefault()
    const effect = binding.effect()
    if (effect) applyList(effect)
  }

  const retryFailed = () => {
    if (selecting() || !props.state().failure?.question || !retryQuestion(mode())) return
    clearing.disarm()
    setBrowse(NOT_BROWSING)
    setListed(false)
    scrollToEnd()
    props.retry()
  }

  const runs: Record<Intent, (binding: Binding, input: unknown, event?: KeyEvent) => false | void> = {
    page_up: (_binding, input, event) => moveScroller((box) => box.scrollBy(-1, "viewport"))(input, event),
    page_down: (_binding, input, event) => moveScroller((box) => box.scrollBy(1, "viewport"))(input, event),
    home: (_binding, input, event) => moveScroller((box) => box.scrollTo(0))(input, event),
    end: (_binding, input, event) => moveScroller((box) => box.scrollTo(box.scrollHeight))(input, event),
    list: listRun,
    step_down: listRun,
    clear: (_binding, _input, event) => {
      if ((field?.plainText.length ?? 0) > 0) return false
      event?.preventDefault()
      if (event?.eventType === "repeat" || event?.repeated) return
      clearing.press()
    },
    retry: (_binding, _input, event) => {
      event?.preventDefault()
      retryFailed()
    },
    copy_thread: (_binding, _input, event) => {
      event?.preventDefault()
      copyThread()
    },
    recall_older: (_binding, _input, event) => {
      event?.preventDefault()
      walk(-1)
    },
    recall_newer: (_binding, _input, event) => {
      event?.preventDefault()
      walk(1)
    },
    choose_up: (_binding, _input, event) => {
      event?.preventDefault()
      setChosen((index) => nextChoice(index, -1, QUICK_PROMPTS.length))
    },
    choose_down: (_binding, _input, event) => {
      event?.preventDefault()
      setChosen((index) => nextChoice(index, 1, QUICK_PROMPTS.length))
    },
    choose: (_binding, _input, event) => {
      event?.preventDefault()
      const question = QUICK_PROMPTS[chosen()]
      if (question) askQuick(question)
    },
    close_list: (_binding, _input, event) => {
      event?.preventDefault()
      setListed(false)
    },
    queue: () => {},
  }

  context.keymap.layer(() => ({
    mode: "modal",
    priority: 1,
    commands: bindings(mode).map((binding) => ({
      ...binding,
      group: "Dialog",
      run: (input: unknown, event?: KeyEvent) => runs[binding.intent](binding, input, event),
    })),
  }))

  const askQuick = (question: string) => {
    if (selecting()) return
    clearing.disarm()
    setListed(false)
    scrollToEnd()
    props.ask(question)
  }

  const selecting = () => {
    const selection = context.renderer.getSelection()
    return selection !== null && (selection.isDragging || selection.getSelectedText() !== "")
  }

  const copyThread = () => {
    if (!selecting()) props.copy()
  }

  const turnCount = () => props.state().turns.length

  const countText = () => countLabel(turnCount(), props.state().pending.length)
  const copyText = () => copyLabel(turnCount())
  const rightText = () => belowLabel(readingView().newAnswers, readingView().below)
  const confirmText = () => clearLabel(turnCount(), width())
  const hintTier = () => footerHints(mode(), width(), copyText(), rightText())
  const header = () =>
    headerRow(width(), countText(), readingView().above, QUICK_PROMPTS.length, listed())
  const listRoom = () => listTranscriptRoom(props.rows(), composerRows())
  const card = createMemo(() => quickCardGeometry(QUICK_PROMPTS, width(), listRoom()))
  const heights = () =>
    panelHeights({
      rows: props.rows(),
      listed: listed(),
      composerRows: composerRows(),
      needed: card().rows,
    })

  const activeQuestion = () => props.state().active ?? ""
  const model = () => modelName(context.data, props.sessionID)
  const thinkingText = () => (model() ? `${model()} is thinking...` : "thinking...")
  const placeholder = () =>
    props.state().active
      ? "ask to queue the next"
      : props.state().paused
        ? "ask to resume the queue"
        : "ask a side question"

  return (
    <box
      ref={(element) => {
        panel = element
        setWidth(element.width)
      }}
      onSizeChange={() => {
        setWidth(panel?.width ?? 0)
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
          geometry={card()}
          chosen={chosen()}
          onChoose={(index) => setChosen(index)}
          onAsk={askQuick}
        />
      </Show>

      <scrollbox
        ref={(element) => {
          scroller = element
        }}
        maxHeight={heights().maxHeight}
        minHeight={heights().minHeight}
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
                answer={() => answerText(index())}
                carriedOn={() => gapBelow(props.state().turns, index(), props.sessionMoved())}
                anchor={(element) => {
                  if (index() === turnCount() - 1) held = element
                }}
                copy={props.copyBlock}
                selecting={selecting}
                copyable={() => index() !== turnCount() - 1 || !playback.revealing()}
                theme={theme}
                syntax={props.syntax}
              />
            )}
          </For>

          <Show when={activeQuestion()}>
            <box flexDirection="column" gap={1} flexShrink={0}>
              <Turn
                question={activeQuestion()}
                copy={props.copyBlock}
                selecting={selecting}
                theme={theme}
                syntax={props.syntax}
              />
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
              <Turn
                question={question}
                waiting
                copy={props.copyBlock}
                selecting={selecting}
                theme={theme}
                syntax={props.syntax}
              />
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
                <Show when={retryQuestion(mode()) && failure().question}>
                  <Clickable
                    base={accent}
                    muted={error}
                    label="retry question"
                    onClick={retryFailed}
                    wrap={false}
                  />
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
          setComposerRows(element.height)
        }}
        onTyped={() => {
          if ((field?.plainText.length ?? 0) === 0) return
          clearing.disarm()
          setListed(false)
        }}
        onSubmit={(question) => {
          clearing.disarm()
          setBrowse(NOT_BROWSING)
          setListed(false)
          scrollToEnd()
          props.ask(question)
        }}
      />

      <Footer
        theme={theme}
        armed={clearing.armed()}
        confirm={confirmText}
        copy={copyText}
        onCopy={copyThread}
        hints={hintTier}
        right={rightText}
        highlight={() => readingView().newAnswers > 0}
        onRight={scrollToEnd}
      />
    </box>
  )
}
