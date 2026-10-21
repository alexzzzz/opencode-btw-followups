// The command, the window and the queue behind it. The thread travels in the prompt
// because session.generate writes nothing back, one question at a time, and every turn
// belongs to the session it was asked in. The reasons are in AGENTS.md; this file is
// where they are paid for.

import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import {
  BorderChars,
  type BoxRenderable,
  createTextAttributes,
  SyntaxStyle,
  type ColorInput,
  type KeyEvent,
  type ScrollBoxRenderable,
  type StyleDefinitionInput,
  type TextareaRenderable,
} from "@opentui/core"
import type { Plugin } from "@opencode/plugin/tui"
import { usePlugin } from "@opencode/plugin/tui"
import { COMPOSER_ROWS, RAIL, transcript } from "./layout.ts"
import { thread } from "./prompt.ts"
import {
  answered,
  change,
  cleared,
  forget,
  movedSince,
  movedUnder,
  stateOf,
  type Reading,
  type SideState,
  type Sides,
} from "./state.ts"

const ID = "btw-followups.tui"

const BOLD = createTextAttributes({ bold: true })

/** The spinner frames, matching the braille cycle the host itself animates. */
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const

/**
 * The dashed stroke of the line between two stretches of the conversation, quieter
 * than the solid stroke a rule would draw by default.
 */
const DASH = "┈"

/** What that line says about itself. */
const MOVED_LABEL = " the session carried on "

/**
 * The two causes of an empty answer, named together. Measured over 22 identical side
 * requests one came back empty, and so did one of 22 ordinary ones, so the fault is not
 * the question's alone and the reader is told what to do either way.
 */
const EMPTY_ANSWER =
  "Nothing came back, so this question was not added to the thread. " +
  "Either the model reached for a tool, which a side question cannot run, " +
  "or the reply was cut short. Rephrase it and ask again."

/**
 * The footer's spacing, shared with the budget that picks a hint wording: the gap between
 * the row's children and the padding on each side. They are read from here rather than
 * written into the layout and the arithmetic separately.
 */
const FOOTER_GAP = 3
const FOOTER_PAD = 2

/**
 * Every key that works while the window is open, longest wording first. The panel picks
 * the first tier that fits rather than abbreviating, which would leave the reader
 * decoding `pgup`. Each hint is a list of pairs: the key bright, the rest muted.
 */
const KEY_HINTS: readonly (readonly (readonly [string, string])[])[] = [
  [
    ["wheel", " scrolls · "],
    ["page up/down", " scroll a page · "],
    ["home/end", " jump · "],
    ["delete", " clear thread · "],
    ["enter", " asks · "],
    ["esc", " closes · "],
    ["ctrl+a/ctrl+e", " move the cursor"],
  ],
  [
    ["wheel", " scrolls · "],
    ["page up/down", " scroll a page · "],
    ["home/end", " jump · "],
    ["delete", " clear thread · "],
    ["enter", " asks · "],
    ["esc", " closes"],
  ],
  [
    ["wheel", " scrolls · "],
    ["page up/down", " scroll · "],
    ["delete", " clear thread"],
  ],
  [
    ["page up/down", " scroll · "],
    ["delete", " clear thread"],
  ],
]

/**
 * The renderer announces a new terminal size with `resize`, but reaches a plugin
 * typed as a bare EventEmitter, so the two members the cap needs are named here.
 */
type Resizable = {
  on(event: "resize", handler: () => void): void
  off(event: "resize", handler: () => void): void
}

/**
 * The scopes that colour a fenced block, mapped from the theme tokens the host itself
 * maps them from, since the host keeps its syntax style private. `spell` and `nospell`
 * carry the plain text of an answer and must stay plain.
 */
function codeStyle(theme: Plugin.Context["theme"], owner: any) {
  const style = (SyntaxStyle as { create(owner?: any): SyntaxStyle }).create(owner)
  const syntax = theme.syntax
  const markdown = theme.markdown
  const put = (scopes: string[], foreground: ColorInput, extra?: StyleDefinitionInput) =>
    scopes.forEach((scope) => style.registerStyle(scope, { fg: foreground, ...extra }))

  put(["default", "spell", "nospell"], theme.text.base)
  put(["comment", "comment.documentation"], syntax.comment, { italic: true })
  put(["string", "symbol", "character", "character.special"], syntax.string)
  put(["number", "boolean", "constant", "float"], syntax.number)
  put(["keyword", "keyword.return", "keyword.conditional", "keyword.repeat"], syntax.keyword, { italic: true })
  put(["keyword.coroutine", "keyword.import", "keyword.export", "string.escape", "string.regexp"], syntax.keyword)
  put(["keyword.type"], syntax.type, { bold: true, italic: true })
  put(["keyword.operator"], syntax.operator)
  put(["function", "function.method", "variable.member"], syntax.function)
  put(["operator", "punctuation.delimiter", "punctuation.special"], syntax.operator)
  put(["variable", "variable.parameter", "property", "field", "parameter"], syntax.variable)
  put(["type", "module", "class", "namespace", "type.definition"], syntax.type, { bold: true })
  put(["punctuation", "punctuation.bracket"], syntax.punctuation)
  put(["tag.attribute"], syntax.keyword)
  put(["markup.heading.1"], markdown.heading, { bold: true, underline: true })
  put(["markup.heading", "markup.heading.2", "markup.heading.3", "markup.heading.4", "markup.heading.5", "markup.heading.6"], markdown.heading, { bold: true })
  put(["markup.bold", "markup.strong"], markdown.strong, { bold: true })
  put(["markup.italic", "markup.emphasis"], markdown.emphasis, { italic: true })
  put(["markup.list", "markup.list.checked"], markdown.listItem)
  put(["markup.quote", "markup.blockQuote"], markdown.blockQuote, { italic: true })
  put(["markup.raw", "markup.raw.block"], markdown.code)
  put(["markup.raw.inline"], markdown.code, { bg: theme.background.base })
  put(["markup.link", "markup.link.url", "string.special", "string.special.url"], markdown.link, { underline: true })
  put(["markup.link.label", "label"], markdown.linkText, { underline: true })
  put(["markup.underline"], theme.text.base, { underline: true })
  put(["markup.strikethrough", "markup.list.unchecked"], theme.text.muted)
  return style
}

/**
 * The name the reader knows the model of a session by.
 *
 * The catalogue is tried in the session's own location first and the TUI's second, since
 * it is cached per location and a session can live in another worktree. A model the
 * catalogue does not know falls back to its own id: a reader is owed which one it is.
 */
function modelName(data: Plugin.Context["data"], sessionID: string) {
  const info = data.session.get(sessionID)
  const own = info?.model
  if (!own) return undefined
  const find = (location?: { readonly directory: string }) =>
    data.location.model.list(location)?.find((item) => item.providerID === own.providerID && item.modelID === own.id)
  return (find(info.location) ?? find())?.name ?? own.id
}

/**
 * The window is handed the session it belongs to rather than reading the route, because
 * a question typed with the window up for a session the reader has left would otherwise
 * go to the wrong one.
 */
type ThreadProps = {
  /** The session this window belongs to. */
  readonly sessionID: string
  readonly state: () => SideState
  readonly syntax: SyntaxStyle
  /** How tall the transcript may be, read as it goes: a resize while the window is
   *  open has to move the cap, or the panel outgrows the terminal it is drawn in. */
  readonly limit: () => number
  /** Whether the session has carried on since the last turn, read as it goes
   *  rather than once when the window went up. The line under the newest answer and
   *  the one over the question in flight are both about the session as it stands. */
  readonly ahead: () => boolean
  readonly remember: (draft: string, place: Reading | undefined) => void
  readonly ask: (question: string) => void
  /** Drops the thread this window draws, so the next question resends nothing. */
  readonly clear: () => void
  readonly close: () => void
  readonly copy: () => void
}

/**
 * How long a warning stands before it stops waiting for the second press. Long enough to
 * read one row, short enough that a press remembered from a minute ago does nothing.
 */
const CONFIRM_MS = 4000

/**
 * The closest two presses may be and still count as two.
 *
 * A terminal that does not speak the kitty protocol reports a held key as the same press
 * over and over, with nothing to tell a repeat from a second decision. Keyboard autorepeat
 * is far quicker than this, so a held Delete can never confirm the warning it just armed.
 */
const REPEAT_GAP_MS = 300

/**
 * A braille frame advancing while `active` is true, disposed with the component that
 * reads it. OpenTUI's `spinner` is not in the catalogue a plugin may use.
 */
function useFrames(active?: () => boolean) {
  const [frame, setFrame] = createSignal(0)

  createEffect(() => {
    if (active && !active()) return
    setFrame(0)
    const timer = setInterval(() => setFrame((n) => (n + 1) % FRAMES.length), 90)
    onCleanup(() => clearInterval(timer))
  })

  return frame
}

/**
 * The prompt row's sign that a question is being answered in this session.
 *
 * The accent is handed over rather than read from the plugin context, which throws where
 * it is not an ancestor. A row: a box lays its children in a column unless told
 * otherwise, and no gap makes the row the four cells `/btw` measures.
 */
function Waiting(props: { readonly accent: ColorInput }) {
  const frame = useFrames()

  return (
    <box flexDirection="row" flexShrink={0}>
      <text fg={props.accent}>{FRAMES[frame()]}</text>
      <text fg={props.accent}>btw</text>
    </box>
  )
}

export function ThreadDialog(props: ThreadProps) {
  const context = usePlugin()
  const theme = context.theme
  const muted = theme.text.muted
  const accent = theme.hue.interactive[200]
  let field: TextareaRenderable | undefined

  // The dialog is mounted before the terminal has focus to give away, so the focus is
  // taken on the next tick, with the draft going in beside it.
  onMount(() =>
    queueMicrotask(() => {
      field?.focus()
      if (props.state().draft) field?.setText(props.state().draft)
    }),
  )

  /**
   * The reading position, held until the transcript is tall enough to put it back on.
   *
   * A window mounts before its transcript is laid out, so a position restored on the
   * first tick is clamped against a scroll height of nothing and lands at the top.
   */
  let place: Reading | undefined = props.state().place

  // What the reader left behind. Written on the way out rather than on every keystroke,
  // because nothing can read it while the window is closed, and the composer and the
  // scroll box are both gone by then.
  onCleanup(() => {
    const scrolled = scroller
    props.remember(
      field?.plainText ?? "",
      scrolled
        ? {
            top: Math.round(scrolled.scrollTop),
            height: scrolled.height,
            scrollHeight: scrolled.scrollHeight,
          }
        : place,
    )
  })

  // The window's own spinner, alive only while a question is in flight.
  const frame = useFrames(() => Boolean(props.state().active))

  /**
   * `session.generate` returns the finished text in one response, so the answer cannot
   * arrive token by token and the newest one is revealed by character instead, which
   * reads as writing. Older turns stay whole: only the newest line is being watched.
   */
  const newest = () => props.state().turns.length - 1
  // Which answer has already been revealed, by how many turns the thread held, so the
  // effect below does not re-animate it. A count rather than the answer's own text:
  // two answers that read the same are still two answers, and comparing the text would
  // leave the second one landing with no reveal at all.
  let revealed = props.state().turns.length

  /**
   * How much of the newest answer is on screen. Seeded with Infinity so a window
   * reopened over an existing thread shows whole answers, never a partial reveal that
   * would leave markdown's control characters on screen. A new answer replaces it with
   * a real count through the effect below; `revealed` stops that re-animating turns
   * already on screen.
   */
  const [shown, setShown] = createSignal(Number.POSITIVE_INFINITY)
  let revealTimer: ReturnType<typeof setInterval> | undefined

  const stopReveal = () => {
    if (revealTimer) clearInterval(revealTimer)
    revealTimer = undefined
  }

  createEffect(() => {
    const count = props.state().turns.length
    if (count === revealed) return
    const last = props.state().turns[count - 1]
    // A cleared thread has nothing left to write out, and a timer left running would
    // keep counting characters against an answer that is no longer on screen.
    if (!last) {
      revealed = count
      stopReveal()
      return
    }
    revealed = count
    stopReveal()
    // Long enough to read as typing, short enough not to be a wait.
    const step = Math.max(1, Math.ceil(last.turn.answer.length / 90))
    // The first chunk lands in the same tick the answer arrives. Starting at zero left
    // a gap between the spinner going out and the first character, and if the timer
    // never ran the question kept an empty space under it forever.
    setShown(Math.min(step, last.turn.answer.length))
    if (last.turn.answer.length <= step) return
    revealTimer = setInterval(() => {
      const next = shown() + step
      if (next >= last.turn.answer.length) {
        stopReveal()
        setShown(last.turn.answer.length)
        return
      }
      setShown(next)
    }, 16)
  })

  onCleanup(stopReveal)

  /**
   * How much of an answer is on screen, as a reactive accessor: the newest row grows as
   * the timer advances. Whitespace is cut at the cut point, since a reveal stopping on
   * a newline would render as an empty block under the answer.
   */
  const visible = (index: number, answer: string) => () =>
    index === newest() && shown() < answer.length ? answer.slice(0, shown()).trimEnd() : answer.trimEnd()

  /**
   * `stickyScroll` follows new content only from the bottom, so a reader in the middle
   * gets no sign that an answer arrived. The position is tracked here too, and the
   * footer says so out loud.
   */
  let scroller: ScrollBoxRenderable | undefined
  const [announced, setAnnounced] = createSignal(0)

  /**
   * How many answers the reader has already been shown. Answers arrived since then, not
   * the total: a reader parked above the newest has seen the older ones.
   */
  let seen = props.state().turns.length

  const parked = () => {
    if (!scroller) return true
    const bottom = scroller.scrollTop + scroller.height
    return bottom >= scroller.scrollHeight - 2
  }

  // The bars are hidden, so these two numbers are the only way to tell a thread ending
  // a screen below from one ending on the next line: rows read, rows to come.
  const [above, setAbove] = createSignal(0)
  const [below, setBelow] = createSignal(0)

  const measure = () => {
    if (!scroller) return
    // The position goes back only once the transcript is tall enough to hold it: against
    // a shorter one it would be clamped to the top, the one place a reader who scrolled
    // away would never want to land. A reader at the end stays at the end; one further
    // up keeps their row, since the transcript only ever grows at the end.
    if (place && scroller.scrollHeight >= place.scrollHeight) {
      const saved = place
      place = undefined
      scroller.scrollTo(
        saved.top + saved.height >= saved.scrollHeight - 2 ? scroller.scrollHeight : saved.top,
      )
    }
    const hidden = Math.max(0, scroller.scrollHeight - scroller.height)
    const top = Math.max(0, Math.min(hidden, Math.round(scroller.scrollTop)))
    setAbove(top)
    setBelow(Math.max(0, hidden - top))
  }

  // Content changes and resizes move the counts, and neither is a scroll, so the
  // measurement follows the transcript rather than the wheel: every field that can put
  // a row into it is read here, the failure included. The first measurement of a
  // reopened window is where the reading position goes back.
  createEffect(() => {
    props.state().turns.length
    props.state().active
    props.state().pending.length
    props.state().failure
    props.limit()
    shown()
    queueMicrotask(measure)
  })

  const caughtUp = () => {
    seen = props.state().turns.length
    setAnnounced(0)
  }

  const jumpToEnd = () => {
    if (!scroller) return
    scroller.scrollTo(Math.max(0, scroller.scrollHeight))
    caughtUp()
    measure()
  }

  // Reading the transcript by hand clears the notice, so the footer never nags a
  // reader who has already found the answer themselves.
  const onScroll = () => {
    measure()
    if (parked()) caughtUp()
  }

  /**
   * The four moves, as commands the host resolves rather than keys handed over: only a
   * modal keymap layer can take a key from the composer, and the host binds these four
   * exactly this way. `preventDefault` stops the composer also moving its own cursor.
   * One table so there is no body to forget in three of four copies.
   */
  const moves = [
    { id: "session.aside.page_up", bind: "pageup", title: "Page up", page: -1 },
    { id: "session.aside.page_down", bind: "pagedown", title: "Page down", page: 1 },
    { id: "session.aside.home", bind: "home", title: "First question", to: 0 },
    { id: "session.aside.end", bind: "end", title: "Newest answer", to: "end" },
  ] as const

  /**
   * Delete empties the thread, and a thread is not something a stray press may throw
   * away: the composer already takes Delete as a forward delete, so the key is in the
   * reader's fingers. One press only says what the next one would drop, the warning goes
   * away by itself, and the thread is dropped on the second press.
   */
  const [armed, setArmed] = createSignal(false)
  let disarmTimer: ReturnType<typeof setTimeout> | undefined
  let pressedAt = 0

  const disarm = () => {
    if (disarmTimer) clearTimeout(disarmTimer)
    disarmTimer = undefined
    setArmed(false)
  }

  const clearThread = () => {
    const asked = props.state().turns.length
    if (asked === 0) return
    const now = Date.now()
    // The repeat that a held key sends on a plain terminal is the press that armed the
    // warning, so a second press has to come after the key would have been let go.
    if (now - pressedAt < REPEAT_GAP_MS) return
    pressedAt = now
    if (!armed()) {
      setArmed(true)
      disarmTimer = setTimeout(disarm, CONFIRM_MS)
      return
    }
    disarm()
    // A position saved for a reopened window has nothing left to point at, and putting
    // it back after the thread has started again would land the reader in the wrong place.
    place = undefined
    props.clear()
  }

  onCleanup(() => {
    if (disarmTimer) clearTimeout(disarmTimer)
  })

  context.keymap.layer(() => ({
    mode: "modal",
    // Above the host's own prompt layer, which is `mode: "global"` and would otherwise
    // win by registration order. The host's dialogs give their layers priority 1 too.
    priority: 1,
    commands: [
      ...moves.map((move) => ({
        id: move.id,
        bind: move.bind,
        title: move.title,
        group: "Dialog",
        run: (_input: unknown, event?: KeyEvent) => {
          if (!scroller) return
          if ("page" in move) scroller.scrollBy(move.page, "viewport")
          else scroller.scrollTo(move.to === "end" ? scroller.scrollHeight : move.to)
          event?.preventDefault()
          onScroll()
        },
      })),
      {
        id: "session.aside.clear",
        bind: "delete",
        title: "Clear the side thread",
        group: "Dialog",
        run: (_input: unknown, event?: KeyEvent) => {
          event?.preventDefault()
          // A held key arrives again and again, and a repeat is still the one press that
          // armed the warning: letting it through would make the warning confirm itself.
          if (event?.eventType === "repeat" || event?.repeated) return
          clearThread()
        },
      },
    ],
  }))

  // An answer landing is the moment the reader has to be told about, and only that
  // moment: a question asked or queued changes nothing offscreen.
  createEffect(() => {
    const count = props.state().turns.length
    // A cleared thread takes the notice with it: the answers it counted are gone, and a
    // reader must not be told about them over an empty transcript.
    if (count === 0) {
      seen = 0
      setAnnounced(0)
      return
    }
    queueMicrotask(() => {
      if (parked()) {
        caughtUp()
        return
      }
      const missed = count - seen
      if (missed > 0) setAnnounced(missed)
    })
  })

  /**
   * A question and an answer cannot be told apart by colour here: `text.base` and
   * `markdown.text` both resolve to `$hue.neutral.200`. So the question is marked
   * structurally with a left accent bar. `moved` is an accessor because the line
   * appears the moment a question is asked, without the thread changing.
   */
  const turn = ({
    question,
    answer,
    waiting,
    moved,
  }: {
    question: string
    answer?: () => string
    waiting?: boolean
    moved?: () => boolean
  }) => (
    <box flexDirection="column" gap={1} flexShrink={0}>
      {/* The rail is a border, not a character in a one-cell box: a character sits on
          the first row only, so a wrapped question carried one mark and blank rows
          beside it. The border plus its padding is the answer's own inset, and both
          sides pad right so a question and a reply stop equally short of the edge. */}
      <box
        border={["left"]}
        borderColor={waiting ? muted : accent}
        customBorderChars={{ ...BorderChars.single, vertical: RAIL }}
        paddingLeft={1}
        paddingRight={2}
        flexShrink={0}
      >
        <text
          fg={waiting ? muted : accent}
          wrapMode="word"
          flexGrow={1}
        >
          {question}
        </text>
      </box>
      <Show when={answer}>
        {/* The answer and the line that may follow it are one block, a single blank row
            apart: close enough to belong to this answer, set off enough not to look like
            part of its last paragraph. The next question's blank row is the column gap. */}
        <box flexDirection="column" gap={1} flexShrink={0}>
          {/* No margin above the answer: the column gap is the one blank row. The left
              inset matches the question's, the right padding inside its rule. */}
          <box flexShrink={0} paddingLeft={2} paddingRight={2}>
            {/* Streaming stays on for every answer: it is the only path here that
                formats prose. With it off the host falls back to the raw markdown
                source when the highlighter misses, so `**`, `#` and backticks land on
                screen. The cost is that an unclosed fence at the end of a cut-short
                answer is left as text rather than as a code block.

                The style comes before the content on purpose. The renderer builds its
                blocks when the content lands, and a block built without a style keeps
                none: the highlighter then fails on it and the raw source is drawn.
                The host's own markdown is written the same way, and the order here is
                what the measurement in the design notes rests on. */}
            <markdown
              syntaxStyle={props.syntax}
              fg={theme.markdown.text}
              content={answer!()}
              conceal
              streaming
              internalBlockMode="top-level"
              tableOptions={{ style: "grid", cellPaddingX: 1 }}
            />
          </box>
          <Show when={moved?.()}>
            {/* A border, not a row of characters: it spans whatever width the host
                gives without wrapping, and prints its title into the border row. */}
            <box
              border={["top"]}
              borderColor={muted}
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

  // A question is never empty, so an empty string stands for "nothing in flight".
  const activeText = () => props.state().active ?? ""

  const status = () => {
    const asked = props.state().turns.length
    const queued = props.state().pending.length
    if (asked === 0) return queued === 0 ? "" : `${queued} waiting`
    return queued === 0 ? `${asked} answered` : `${asked} answered, ${queued} waiting`
  }

  /**
   * How wide the panel is, so the footer can pick a wording that fits rather than one
   * that is cut off. The host chooses the width, so it is measured on the dialog's own
   * root box after every layout, which also covers a terminal narrowed while the window
   * is open.
   */
  let panel: BoxRenderable | undefined
  const [width, setWidth] = createSignal(0)

  const copyLabel = () => (props.state().turns.length === 0 ? "nothing to copy" : "copy thread")

  /**
   * What the footer says while a cleared thread waits for its second press. It is not a
   * hint about a key that works, it is a question, so it takes the whole row. The shorter
   * wording is for a panel too narrow to hold the reassurance beside the number.
   */
  const confirmLabel = () => {
    const asked = props.state().turns.length
    const long = `delete again to clear ${asked} question${asked === 1 ? "" : "s"} · esc keeps them`
    return width() >= long.length + 2 * FOOTER_PAD ? long : `delete again to clear ${asked}`
  }

  /**
   * Which model is writing the answer, read from the session the window belongs to:
   * `session.generate` is answered by that session's model, and the prompt's own
   * selection follows the route the reader may have walked away from.
   */
  const model = () => modelName(context.data, props.sessionID)
  const thinking = () => (model() ? `${model()} is thinking...` : "thinking...")

  /**
   * The one thing the footer can put on the right: how much of the thread is below, or
   * the newer answer with the way down to it. Whichever it is, it is what the hints
   * have to fit beside, so both the footer and the budget read it from here.
   */
  const rightLabel = () =>
    announced() > 0
      ? `↓ ${announced()} new answer${announced() === 1 ? "" : "s"}, click to read`
      : below() > 0
        ? `↓ ${below()} below`
        : ""

  const hints = () => {
    // Everything on the row that is not the hints: the padding on both sides, the copy
    // item, the right-hand label, and the gap between each pair of children. The spacer
    // is always there, so four children mean three gaps and three children mean two.
    const right = rightLabel()
    const children = right ? 4 : 3
    const used = 2 * FOOTER_PAD + copyLabel().length + right.length + FOOTER_GAP * (children - 1)
    const room = Math.max(0, width() - used)
    const span = (hint: readonly (readonly [string, string])[]) =>
      hint.reduce((sum, [key, rest]) => sum + key.length + rest.length, 0)
    return KEY_HINTS.find((hint) => span(hint) <= room) ?? KEY_HINTS.at(-1)!
  }

  return (
    /* Opaque and clipped. The host paints a dimmed backdrop and a panel of its own,
       but a dialog that fills its panel exactly has no room left to spill into, and
       cells written outside the panel are not repainted when the panel closes. */
    <box
      ref={(element) => {
        panel = element
        setWidth(element.width)
      }}
      onSizeChange={() => setWidth(panel?.width ?? 0)}
      flexDirection="column"
      gap={1}
      paddingBottom={1}
      overflow="hidden"
      backgroundColor={theme.surface("dialog").background.base}
    >
      <box flexDirection="row" gap={2} paddingLeft={2} paddingRight={2} flexShrink={0}>
        <text fg={theme.text.base} attributes={BOLD}>btw</text>
        <text fg={muted}>{status()}</text>
        <text fg={muted} flexGrow={1} />
        <Show when={above() > 0}>
          <text fg={muted} wrapMode="none">{`↑ ${above()} above`}</text>
        </Show>
        <text fg={muted} onMouseUp={props.close} wrapMode="none">esc close</text>
      </box>

      {/* The host gives a dialog no height limit, so the transcript is capped against
          the terminal. Bars hidden, wheel scrolls either way, `stickyScroll` from the
          bottom: a new answer follows for a reader at the end and stays put for one
          who has scrolled up. */}
      <scrollbox
        ref={(element) => {
          scroller = element
        }}
        maxHeight={props.limit()}
        stickyScroll
        stickyStart="bottom"
        contentOptions={{ minHeight: 0 }}
        scrollbarOptions={{ visible: false }}
        onMouseScroll={onScroll}
      >
        <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2}>
          <For each={props.state().turns}>
            {(item, index) =>
              turn({
                question: item.turn.question,
                answer: visible(index(), item.turn.answer),
                /* The line goes under the answer the session moved on from, and the
                   newest answer is read against the session as it stands, so the line
                   lands the moment a question is asked. */
                moved: () => movedUnder(props.state().turns, index(), props.ahead()),
              })
            }
          </For>

          <Show when={activeText()}>
            {/* The turn carries its own gap, so the note sits directly under it: a
                second margin here would put two blank rows above it. */}
            <box flexDirection="column" gap={1} flexShrink={0}>
              {turn({ question: activeText() })}
              <box flexDirection="row" gap={1} paddingLeft={2} flexShrink={0}>
                <text fg={accent} wrapMode="none">{FRAMES[frame()]}</text>
                <text fg={muted} wrapMode="none">{thinking()}</text>
              </box>
            </box>
          </Show>

          <For each={props.state().pending}>{(question) => turn({ question, waiting: true })}</For>

          <Show when={props.state().failure}>
            {/* A block of its own because the point is the reason: a reader told only
                that nothing came back has nothing to do next. */}
            <box flexDirection="column" gap={1} flexShrink={0}>
              <Show when={props.state().failure?.title}>
                <text fg={theme.text.feedback.error.base} attributes={BOLD} wrapMode="word">
                  {props.state().failure?.title}
                </text>
              </Show>
              <text fg={theme.text.feedback.error.base} wrapMode="word">
                {props.state().failure?.message}
              </text>
              <Show when={props.state().failure?.question}>
                {/* Repeated rather than left to the turn above, which has already been
                    taken back down: the reader has to see what was lost without
                    scrolling to find it. */}
                <text fg={muted} wrapMode="word">{`Asked: ${props.state().failure?.question}`}</text>
              </Show>
            </box>
          </Show>
        </box>
      </scrollbox>

      {/* The composer is built like the session composer: a rail down the left, a
          textarea that grows with the text. The margin of two keeps the rail off the
          panel edge; padding would sit inside it. The textarea measures its own wrapped
          text, capped by `maxHeight`: setting `height` would pin it and it would never
          grow. */}
      <box
        border={["left"]}
        borderColor={accent}
        customBorderChars={{ ...BorderChars.single, vertical: RAIL }}
        marginLeft={2}
        paddingLeft={1}
        paddingRight={2}
        flexShrink={0}
      >
        <textarea
          ref={(element) => {
            field = element
          }}
          focused
          width="100%"
          minHeight={1}
          maxHeight={COMPOSER_ROWS}
          wrapMode="word"
          placeholder={props.state().active ? "ask to queue the next" : "ask a side question"}
          placeholderColor={muted}
          textColor={theme.text.base}
          focusedTextColor={theme.text.base}
          onSubmit={() => {
            if (!field) return
            const value = field.plainText
            field.setText("")
            // A question is a decision, and it takes the row back from a clear that was
            // only being considered.
            disarm()
            props.ask(value)
          }}
        />
      </box>

      {/* One row, one job at a time: while a clear waits on its second press the row is
          the question, because a warning read beside four hints is not read at all. */}
      <box flexDirection="row" gap={FOOTER_GAP} paddingLeft={FOOTER_PAD} paddingRight={FOOTER_PAD} flexShrink={0}>
        <Show
          when={armed()}
          fallback={
            <>
              {/* The copy item is a click rather than a letter because the composer
                  holds the focus: a letter typed to copy would land in the question. */}
              <text fg={muted} onMouseUp={props.copy} wrapMode="none">
                {copyLabel()}
              </text>
              {/* One pair of nodes per hint, key bright and the rest muted, as the host
                  writes its own status line. */}
              <box flexDirection="row" flexShrink={1} overflow="hidden">
                <For each={hints()}>
                  {(hint) => (
                    <>
                      <text fg={theme.text.base} wrapMode="none">{hint[0]}</text>
                      <text fg={muted} wrapMode="none">{hint[1]}</text>
                    </>
                  )}
                </For>
              </box>
              <text fg={muted} flexGrow={1} />
              {/* A reader parked above the newest answer is told so and offered the way
                  down, since the transcript deliberately does not move for them. Both
                  wordings come from `rightLabel`, which is also what the hints are
                  fitted around, so the two cannot say different things. */}
              <Show when={rightLabel()}>
                <text fg={announced() > 0 ? accent : muted} wrapMode="none" onMouseUp={jumpToEnd}>
                  {rightLabel()}
                </text>
              </Show>
            </>
          }
        >
          <text fg={theme.text.feedback.error.base} wrapMode="none">
            {confirmLabel()}
          </text>
        </Show>
      </box>
    </box>
  )
}

export default {
  id: ID,
  setup(context: Plugin.Context) {
    const [sides, setSides] = createSignal<Sides>(new Map())
    const [rows, setRows] = createSignal(context.renderer.terminalHeight)
    const syntax = codeStyle(context.theme, (context.renderer as any).nativeScene)

    // A thread is about one conversation, so both of these take the session id.
    const view = (sessionID: string) => stateOf(sides(), sessionID)
    const edit = (sessionID: string, changes: Partial<SideState>) =>
      setSides((before) => change(before, sessionID, changes))

    // The cap follows the terminal, so a resize has to move it.
    const resizable = context.renderer as unknown as Resizable
    const onResize = () => setRows(context.renderer.terminalHeight)
    resizable.on("resize", onResize)

    /** One question at a time, in the order asked, is what makes a thread. */
    const pumping = new Set<string>()

    /**
     * Which session's transcript window is up. The session decides which thread is on
     * screen, which session the composer asks against, and what `copy thread` takes.
     */
    const [windowSession, setWindowSession] = createSignal<string | undefined>(undefined)

    /** The call in flight for each session, so a deleted session can call its work off. */
    const inFlight = new Map<string, AbortController>()

    /**
     * How much of the session has been said, to compare two moments by.
     *
     * Only `user` and `assistant` messages count: an idle marker or a shell call is
     * something the session did, not something anyone said, and counting those would
     * draw a line between two questions with no word in between. Read from the host's
     * own cache, which a side question never moves.
     */
    const said = (sessionID: string) =>
      context.data.session.message
        .list(sessionID)
        .filter((message) => message.type === "user" || message.type === "assistant").length

    /** Whether the session has carried on since the last turn was answered. */
    const ahead = (sessionID: string) => movedSince(view(sessionID).turns, said(sessionID))

    /**
     * The session the reader is looking at, if any. Never held in a signal, because
     * `router.current` is a plain read rather than a reactive one.
     */
    const current = () => {
      const route = context.ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }

    /** The variants the host's toasts take, named here because the terminal entrypoint
     *  re-exports the context but not that type. */
    type ToastVariant = "info" | "success" | "warning" | "error"

    /**
     * A toast, put where the reader can see it.
     *
     * Every path that shows one has either already written what matters into the
     * session's state or has nothing else to say it with, so a host that refuses the
     * toast must not take the message down with it. A throw from a click handler would
     * replace the thing the reader needed to see with one they cannot act on.
     *
     * `duration` is left out rather than passed as undefined where there is none, so
     * the host's own default stands.
     */
    const tell = (message: string, variant: ToastVariant, title = "/btw", duration?: number) => {
      try {
        context.ui.toast.show({
          title,
          message,
          variant,
          ...(duration === undefined ? {} : { duration }),
        })
      } catch {
        // Nothing left to say it with.
      }
    }

    /**
     * Where a failure goes: into that session's window when it is up, and a toast
     * otherwise, since a window up for another session cannot show it. The failure waits
     * in the session for the next time it is opened.
     */
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

    /**
     * A throw no path here expected, put where the reader can see it: `pump` is called
     * and forgotten, so anything outside its own catch would otherwise vanish. The
     * message is the error's own, with its name in front of it.
     */
    const unexpected = (sessionID: string | undefined, error: unknown) => {
      const named = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      failed(sessionID, named.trim() || "The side question threw something with no message.", "/btw did not run")
    }

    const pump = async (sessionID: string) => {
      if (pumping.has(sessionID)) return
      pumping.add(sessionID)
      try {
        while (view(sessionID).pending.length > 0) {
          // Everything asked while the last answer was being written goes out as one
          // request: the questions stay a list so the prompt can number them, and only
          // become one block of text for the transcript.
          const asked = view(sessionID).pending
          const question = asked.join("\n")
          // The history is read here, not when the question was asked, so each question
          // is written against the answers that came before it.
          const history = view(sessionID).turns.map((item) => item.turn)
          edit(sessionID, { pending: [], active: question })
          const call = new AbortController()
          inFlight.set(sessionID, call)
          try {
            const response = await context.client.session.generate(
              { sessionID, prompt: thread(history, asked) },
              { signal: call.signal },
            )
            const answer = response.text.trim()
            // The session was deleted while this was being written, so the call was
            // taken out of `inFlight` and there is no conversation left to answer in.
            // Only a delete does that, and a delete leaves no queue behind, so there is
            // nothing for the loop to go round for.
            if (inFlight.get(sessionID) !== call) break
            if (!answer) {
              // The question rides along because nothing goes into the thread here: a turn
              // with no answer under it is a hole, and a hole the reader cannot see at all
              // is worse.
              failed(sessionID, EMPTY_ANSWER, "No answer came back", question)
              break
            }
            // The turn goes in with how much of the session had been said by then, so
            // the next turn can be told apart from it by whether anything was said in
            // between: that is what puts a line between them in the transcript. The
            // thread is kept whole, since the reader knows what a side conversation
            // should cost them.
            setSides((before) => answered(before, sessionID, { question, answer }, said(sessionID)))
            // An answer raises the window for a reader still in this session with none
            // up. One who has walked to another conversation gets nothing raised over
            // it, and finds the answer waiting next time they run the command there.
            if (current() === sessionID) raise(sessionID)
          } catch (error) {
            // A deleted session calls its request off, and that is not a fault to report:
            // there is no conversation left to answer about. The loop carries on rather
            // than breaking, because a question asked after it is waiting in the queue and
            // breaking here would leave it there with nobody to send it.
            if (call.signal.aborted) continue
            // A failed answer leaves the thread out of step with the queue, so the
            // queue stops rather than answering questions against a gap.
            failed(sessionID, error instanceof Error ? error.message : String(error))
            edit(sessionID, { pending: [] })
          } finally {
            if (inFlight.get(sessionID) === call) inFlight.delete(sessionID)
            // A deleted session is forgotten whole, and writing to it here would put an
            // empty state back in the map for a conversation nobody can open again.
            if (sides().has(sessionID)) edit(sessionID, { active: undefined })
          }
        }
      } finally {
        pumping.delete(sessionID)
        // A question asked while this was still winding down found the session busy,
        // went into the queue and was sent by nothing. One tick wide, and it strands
        // the question for good, so the queue is drained here rather than trusted.
        //
        // The window may be down, and a window that is not there to take a question is
        // not one to send: the reader closed it, which stops what has not gone out.
        if (view(sessionID).pending.length > 0 && windowSession() === sessionID) run(sessionID)
      }
    }

    /** Sends a session's queue, reporting anything that escapes `pump`'s own catch. */
    const run = (sessionID: string) => void pump(sessionID).catch((error) => unexpected(sessionID, error))

    /**
     * A question, against the session it belongs to. The session is an argument rather
     * than read off the route because the composer asks for the session whose thread is
     * on screen, which is not the one on the route once the reader has walked away.
     */
    const ask = (sessionID: string, raw: string) => {
      const question = raw.trim()
      if (!question) return
      // A new question is a new decision to keep working, so the last failure is cleared.
      edit(sessionID, {
        failure: undefined,
        pending: [...view(sessionID).pending, question],
      })
      run(sessionID)
    }

    const copy = () => {
      const sessionID = windowSession()
      if (!sessionID) return
      const turns = view(sessionID).turns
      const whole = turns.map((item) => `Q: ${item.turn.question}\n\nA: ${item.turn.answer}`).join("\n\n")
      if (!whole) return
      const copied = context.renderer.copyToClipboardOSC52(whole)
      tell(
        copied
          ? `Thread copied: ${turns.length} question${turns.length === 1 ? "" : "s"}.`
          : "This terminal will not take a clipboard write.",
        copied ? "success" : "warning",
        "/btw",
        2000,
      )
    }

    /**
     * Closing the window, from every path that can close it. Passed as the dialog's
     * `onClose` so the host's Escape and Ctrl+C run it too, and re-entrant, because the
     * host's `clear` calls `onClose` for every entry it is closing and this one closes
     * the dialog again. Without the guard it would call itself.
     */
    let closing = false

    /**
     * Takes the panel down without ending anything: the thread, the request in flight
     * and the queue stay in their conversation, to be read next time that window opens.
     *
     * `clearQueue` empties what has not gone out, and is set when the reader closes the
     * window: a question left waiting would push the window open again when it landed,
     * with nobody there to have asked for it. A request already out is not called off:
     * the cost is spent, the reader asked, and the answer lands in the thread.
     *
     * The dialog is only cleared while this window is the one that is up. The host's
     * `clear` closes the active dialog and does not ask whose it is, so calling it with
     * no window of ours open would take down whatever dialog the reader has in front of
     * them. `windowSession` is what says a window of ours exists, and the guard that
     * makes this re-entrant is reset even if the clear throws, since one left standing
     * would stop the window ever opening again.
     */
    const lower = (clearQueue: boolean) => {
      if (closing) return
      closing = true
      try {
        const sessionID = windowSession()
        if (sessionID === undefined) return
        if (clearQueue) edit(sessionID, { pending: [] })
        setWindowSession(undefined)
        context.ui.dialog.clear()
      } finally {
        closing = false
      }
    }

    const drop = () => lower(false)
    const close = () => lower(true)

    /**
     * One window serves one session at a time, so this takes it over: a window up for
     * another session comes down first, and one already up for this session is left
     * alone. A terminal too short to hold the panel is refused, since a panel taller
     * than the terminal writes cells the renderer never repaints.
     *
     * Returns whether the window is up for this session, which is what tells the
     * command that there is a composer to ask into. The height is settled before the
     * window that is up is taken down, so a terminal too short to hold the panel costs
     * the reader the message and not the window they had.
     */
    function raise(sessionID: string) {
      if (windowSession() === sessionID) return true
      const height = rows()
      if (transcript(height) === 0) {
        failed(
          sessionID,
          `This terminal is ${height} rows tall and too short for the window. Make it taller.`,
        )
        return false
      }
      drop()
      setWindowSession(sessionID)
      context.ui.dialog.show(
        () => {
          const live = () => view(sessionID)
          return (
            <ThreadDialog
              sessionID={sessionID}
              state={live}
              syntax={syntax}
              limit={() => transcript(rows())}
              ahead={() => ahead(sessionID)}
              remember={(draft, place) => edit(sessionID, { draft, place })}
              ask={(question) => ask(sessionID, question)}
              // The thread is dropped through `cleared` rather than by writing an empty
              // `turns` here: the turns and the counts they carry go together.
              clear={() => setSides((before) => cleared(before, sessionID))}
              close={close}
              copy={copy}
            />
          )
        },
        close,
      )
      context.ui.dialog.set({ size: "large", centered: true })
      return true
    }

    const open = (first?: string) => {
      const sessionID = current()
      if (!sessionID) {
        tell("Open a session first", "warning")
        return
      }
      edit(sessionID, { failure: undefined })
      // A question is asked into a window, and only into one that is up. On a terminal
      // too short to hold the panel the reader is told why instead: asking anyway would
      // write the answer into a thread they have no way to read.
      if (!raise(sessionID)) return
      // `/btw why did step 2 fail` is asked at once; a bare `/btw` leaves the field.
      if (first?.trim()) ask(sessionID, first)
    }

    /**
     * A thread does not outlive the session it belongs to: a deleted session cannot be
     * opened again, so its window comes down, its request is called off and its thread
     * is dropped.
     */
    const stopWatchingDeletes = context.data.on("session.deleted", (event) => {
      const sessionID = event.data.sessionID
      if (windowSession() === sessionID) drop()
      inFlight.get(sessionID)?.abort()
      inFlight.delete(sessionID)
      setSides((now) => forget(now, sessionID))
    })

    // A keymap layer is owned by a component, so the command is registered from a
    // slot render rather than from setup. The priority lifts it above the built-in
    // command it replaces, which stays loaded when the disable directive is missed.
    const removeKeymapSlot = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          priority: 10,
          commands: [
            {
              id: "session.aside",
              title: "Ask a follow-up question",
              description: "A side thread that answers follow-up questions in order without touching the conversation",
              group: "Session",
              palette: true,
              slash: { name: "btw", arguments: true },
              // The host hands `run` whatever followed the command name and nothing at
              // all when there were no arguments, and it does not wait on what is
              // returned, so a throw on the way to the window is caught here rather
              // than left to it and reported like any other failure.
              run: (input) => {
                try {
                  open(input?.trim())
                } catch (error) {
                  // There may be no session to write this into, which is the case where
                  // the throw came from a route that is not one. The toast is all there
                  // is for that, and it is enough.
                  unexpected(current(), error)
                }
              },
            },
          ],
        }))
        return null
      },
    })

    /**
     * The prompt row's wait, for the one the window cannot show: a question being
     * answered in this session while its window is up for another, or before any window
     * exists. Asked of the session the slot hands over, never another one.
     */
    const waiting = (sessionID?: string) =>
      sessionID !== undefined && view(sessionID).active !== undefined && windowSession() !== sessionID

    const removeFooterSlot = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => (
        <Show when={waiting(input.sessionID)}>
          <Waiting accent={context.theme.hue.interactive[200]} />
        </Show>
      ),
    })

    return () => {
      // The dialog belongs to the host's own stack, not to this plugin, so a hot
      // reload leaves it there drawing from signals and handlers that no longer
      // exist. Nothing repaints it away either: a resize lays the tree out again but
      // keeps the same broken node, and only a fresh process drops it. It has to be
      // closed from here.
      drop()
      for (const call of inFlight.values()) call.abort()
      inFlight.clear()
      stopWatchingDeletes()
      resizable.off("resize", onResize)
      removeKeymapSlot()
      removeFooterSlot()
      syntax.destroy()
    }
  },
} satisfies Plugin.Definition
