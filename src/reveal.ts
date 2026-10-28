export const REVEAL_MS = 16

const TICKS_PER_REVEAL = 90

export const revealStep = (length: number) => Math.max(1, Math.ceil(length / TICKS_PER_REVEAL))

export const firstChunk = (length: number) => Math.min(revealStep(length), length)

export const firstShown = (alreadyRevealed: boolean, length: number) =>
  alreadyRevealed ? length : firstChunk(length)

export const nextChunk = (shown: number, length: number) =>
  Math.min(shown + revealStep(length), length)

export const shownText = (answer: string, shown: number) =>
  shown >= answer.length ? answer.trimEnd() : answer.slice(0, shown).trimEnd()
