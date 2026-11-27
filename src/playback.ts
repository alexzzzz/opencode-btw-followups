export type Timer = {
  every(ms: number, tick: () => void): () => void
}

export type PlayableTurn = {
  readonly answer: string
}

export type AnswerPlayback = {
  readonly text: (index: number) => string
  readonly revealing: () => boolean
  readonly markPlayed: (turn: PlayableTurn) => void
  readonly stop: () => void
}

const REVEAL_MS = 16

const TICKS_PER_REVEAL = 90

const step = (length: number) => Math.max(1, Math.ceil(length / TICKS_PER_REVEAL))

const firstChunk = (length: number) => Math.min(step(length), length)

const unitsOf = (answer: string): readonly string[] => {
  if (typeof Intl.Segmenter !== "function") return Array.from(answer)
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  return Array.from(segmenter.segment(answer), (part) => part.segment)
}

const playedBySession = new Map<string, WeakSet<PlayableTurn>>()

const memoryFor = (sessionID: string) => {
  let memory = playedBySession.get(sessionID)
  if (memory === undefined) {
    memory = new WeakSet<PlayableTurn>()
    playedBySession.set(sessionID, memory)
  }
  return memory
}

export const releasePlayback = (sessionID: string) => {
  playedBySession.delete(sessionID)
}

export const createAnswerPlayback = (
  sessionID: string,
  turns: () => readonly PlayableTurn[],
  timer: Timer,
): AnswerPlayback => {
  const played = memoryFor(sessionID)
  let units: readonly string[] = []
  let raw = ""
  let visible = ""
  let shown = 0
  let playing: PlayableTurn | undefined
  let cancel: (() => void) | undefined

  const stop = () => {
    cancel?.()
    cancel = undefined
  }

  const ensure = (items: readonly PlayableTurn[]) => {
    const last = items.at(-1)
    if (last === undefined) {
      stop()
      playing = undefined
      units = []
      raw = ""
      visible = ""
      shown = 0
      return
    }
    if (playing === last) return
    stop()
    playing = last
    const answer = last.answer
    units = unitsOf(answer)
    shown = firstChunk(units.length)
    if (played.has(last)) shown = units.length
    raw = units.slice(0, shown).join("")
    visible = raw.trimEnd()
    if (shown >= units.length) return
    played.add(last)
    cancel = timer.every(REVEAL_MS, () => {
      const next = Math.min(shown + step(units.length), units.length)
      raw += units.slice(shown, next).join("")
      shown = next
      visible = raw.trimEnd()
      if (shown >= units.length) stop()
    })
  }

  return {
    text(index) {
      const items = turns()
      ensure(items)
      const answer = items[index]?.answer ?? ""
      return index === items.length - 1 && playing === items[index] ? visible : answer.trimEnd()
    },
    revealing() {
      const items = turns()
      ensure(items)
      const last = items.at(-1)
      return last !== undefined && playing === last && shown < units.length
    },
    markPlayed(turn) {
      played.add(turn)
    },
    stop,
  }
}
