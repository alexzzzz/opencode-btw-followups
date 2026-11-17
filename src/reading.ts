import type { Reading } from "./state.ts"

export type Scrollbox = {
  scrollTop: number
  height: number
  scrollHeight: number
  screenY: number
  viewport: { screenY: number }
  stickyScroll: boolean
  scrollTo(top: number): void
}

export type ReadingView = {
  readonly above: number
  readonly below: number
  readonly newAnswers: number
  readonly hold: boolean
  readonly place: Reading | undefined
}

export const createReading = (place: Reading | undefined, turns: number) => {
  let saved = place
  let seen = turns
  let holding = false
  let wasPlaying = false
  let scrolledByHand = false
  let above = 0
  let below = 0
  let newAnswers = 0

  const atEnd = (box: Scrollbox) => box.scrollTop + box.height >= box.scrollHeight - 2

  const readToEnd = (count: number) => {
    seen = count
    newAnswers = 0
  }

  const measure = (box: Scrollbox) => {
    if (saved && box.scrollHeight >= saved.scrollHeight) {
      const bottom = saved.top + saved.height >= saved.scrollHeight - 2
      const target = bottom ? box.scrollHeight : saved.top
      saved = undefined
      box.scrollTo(target)
    }
    const hidden = Math.max(0, box.scrollHeight - box.height)
    const top = Math.max(0, Math.min(hidden, Math.round(box.scrollTop)))
    above = top
    below = hidden - top
  }

  return {
    entered(box: Scrollbox | undefined) {
      if (box) measure(box)
    },
    onFrame(box: Scrollbox | undefined, playing: boolean, held: boolean) {
      if (!box) return
      measure(box)
      if (playing && !wasPlaying) {
        holding = atEnd(box) && held
        scrolledByHand = false
      }
      wasPlaying = playing
      if (playing && holding && !scrolledByHand && held) {
        if (box.stickyScroll) box.stickyScroll = false
        const start = Math.round(box.scrollTop + box.screenY - box.viewport.screenY)
        const most = Math.max(0, box.scrollHeight - box.height)
        box.scrollTo(Math.max(0, Math.min(most, start)))
        return
      }
      if (!box.stickyScroll) box.stickyScroll = true
    },
    onScroll(box: Scrollbox | undefined, count: number) {
      if (!box) return
      scrolledByHand = true
      measure(box)
      if (atEnd(box)) readToEnd(count)
    },
    onAnswer(count: number, box: Scrollbox | undefined) {
      if (count === 0) {
        seen = 0
        newAnswers = 0
        saved = undefined
        return
      }
      if (!box || atEnd(box)) {
        readToEnd(count)
        return
      }
      const missed = count - seen
      if (missed > 0) newAnswers = missed
    },
    view(): ReadingView {
      return { above, below, newAnswers, hold: holding, place: saved }
    },
  }
}
