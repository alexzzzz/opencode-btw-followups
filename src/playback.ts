export type Timer = {
  every(ms: number, tick: () => void): () => void
}

export type PlayableTurn = {
  readonly answer: string
}

export type Playback = {
  readonly text: (index: number) => string
  readonly revealing: () => boolean
  readonly markPlayed: (turn: PlayableTurn) => void
  readonly stop: () => void
}

const REVEAL_MS = 16

const TICKS_PER_REVEAL = 90

const step = (length: number) => Math.max(1, Math.ceil(length / TICKS_PER_REVEAL))

const firstChunk = (length: number) => Math.min(step(length), length)

const nextChunk = (shown: number, length: number) => Math.min(shown + step(length), length)

const firstShown = (alreadyRevealed: boolean, length: number) =>
  alreadyRevealed ? length : firstChunk(length)

const shownText = (answer: string, shown: number) =>
  shown >= answer.length ? answer.trimEnd() : answer.slice(0, shown).trimEnd()

const played = new WeakSet<PlayableTurn>()

export const createPlayback = (
  turns: () => readonly PlayableTurn[],
  timer: Timer,
): Playback => {
  let shown = 0
  let playing: PlayableTurn | undefined
  let cancel: (() => void) | undefined

  const stop = () => {
    cancel?.()
    cancel = undefined
  }

  const ensure = () => {
    const last = turns().at(-1)
    if (last === undefined) {
      stop()
      playing = undefined
      return
    }
    if (playing === last) return
    stop()
    playing = last
    const answer = last.answer
    shown = firstShown(played.has(last), answer.length)
    if (shown >= answer.length) return
    played.add(last)
    cancel = timer.every(REVEAL_MS, () => {
      shown = nextChunk(shown, answer.length)
      if (shown >= answer.length) stop()
    })
  }

  return {
    text(index) {
      ensure()
      const answer = turns()[index]?.answer ?? ""
      return index === turns().length - 1 && shown < answer.length
        ? shownText(answer, shown)
        : answer.trimEnd()
    },
    revealing() {
      ensure()
      const last = turns().at(-1)
      return last !== undefined && shown < last.answer.length
    },
    markPlayed(turn) {
      played.add(turn)
    },
    stop,
  }
}
