export const FOOTER_GAP = 3

export const FOOTER_PAD = 2

export type Hint = readonly [key: string, rest: string]

const SCROLLS: Hint = ["wheel", " scrolls"]

const SCROLLS_A_PAGE: Hint = ["page up/down", " scroll a page"]

const SCROLLS_A_PAGE_SHORT: Hint = ["page up/down", " scroll"]

const JUMPS: Hint = ["ctrl+home/end", " jump"]

const CLEARS: Hint = ["delete", " clear thread"]

const ASKS: Hint = ["enter", " asks"]

const CLOSES: Hint = ["esc", " closes"]

const TIERS: readonly (readonly Hint[])[] = [
  [SCROLLS, SCROLLS_A_PAGE, JUMPS, CLEARS, ASKS, CLOSES],
  [SCROLLS, SCROLLS_A_PAGE_SHORT, JUMPS, CLEARS],
  [SCROLLS, SCROLLS_A_PAGE_SHORT, CLEARS],
  [SCROLLS_A_PAGE_SHORT, CLEARS],
  [CLEARS],
]

const SEPARATOR = " · "

const separated = (tier: readonly Hint[]): readonly Hint[] =>
  tier.map(([key, rest], index) => [
    key,
    index === tier.length - 1 ? rest : rest + SEPARATOR,
  ])

const widthOf = (hints: readonly Hint[]) =>
  hints.reduce((width, [key, rest]) => width + key.length + rest.length, 0)

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

export const keyHints = (panelWidth: number, copy: string, right: string): readonly Hint[] => {
  const children = right ? 4 : 3
  const used = 2 * FOOTER_PAD + copy.length + right.length + FOOTER_GAP * (children - 1)
  const room = Math.max(0, panelWidth - used)
  const tier = TIERS.find((candidate) => widthOf(separated(candidate)) <= room)
  return tier === undefined ? [] : separated(tier)
}
