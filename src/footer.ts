import { hints, type Hint, type InteractionMode } from "./interaction.ts"

export const FOOTER_GAP = 3

export const FOOTER_PAD = 2

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

export const countLabel = (answered: number, queued: number) => {
  if (answered === 0) return queued === 0 ? "" : `${queued} waiting`
  return queued === 0 ? `${answered} answered` : `${answered} answered, ${queued} waiting`
}

export const copyLabel = (answered: number) => (answered === 0 ? "nothing to copy" : "copy thread")

export const belowLabel = (newAnswers: number, rowsBelow: number) => {
  if (newAnswers > 0)
    return `↓ ${newAnswers} new ${plural(newAnswers, "answer", "answers")}, click to read`
  return rowsBelow > 0 ? `↓ ${rowsBelow} below` : ""
}

export const clearLabel = (answered: number, panelWidth: number) => {
  const long = `delete again to clear ${answered} ${plural(answered, "question", "questions")} · esc keeps them`
  return panelWidth >= long.length + 2 * FOOTER_PAD ? long : `delete again to clear ${answered}`
}

export const footerHints = (
  mode: InteractionMode,
  panelWidth: number,
  copy: string,
  right: string,
): readonly Hint[] => {
  const children = right ? 4 : 3
  const used = 2 * FOOTER_PAD + copy.length + right.length + FOOTER_GAP * (children - 1)
  return hints(mode, Math.max(0, panelWidth - used))
}
