export const FOOTER_GAP = 3

export const FOOTER_PAD = 2

export type Hint = readonly [key: string, rest: string]

export type FooterMode = "idle" | "idle-typed" | "waiting" | "waiting-typed"

export const footerMode = (waiting: boolean, typed: boolean): FooterMode => {
  if (waiting) return typed ? "waiting-typed" : "waiting"
  return typed ? "idle-typed" : "idle"
}

const CLEARS: Hint = ["delete", " clear thread"]

const LIST: Hint = ["ctrl+up/down", " prompts"]

const QUEUES: Hint = ["enter", " queues"]

const JUMPS: Hint = ["ctrl+home/end", " jump"]

const TIERS: Record<FooterMode, readonly (readonly Hint[])[]> = {
  idle: [[LIST, JUMPS, CLEARS], [LIST, JUMPS], [LIST], [JUMPS]],
  "idle-typed": [[JUMPS]],
  waiting: [[LIST, JUMPS], [LIST], [JUMPS]],
  "waiting-typed": [[QUEUES, JUMPS], [QUEUES]],
}

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

export type HintInput = {
  readonly panelWidth: number
  readonly copy: string
  readonly right: string
  readonly mode: FooterMode
  readonly canClear: boolean
  readonly canJump: boolean
}

const live = (hint: Hint, input: HintInput) => {
  if (hint === CLEARS) return input.canClear
  if (hint === JUMPS) return input.canJump
  return true
}

export const keyHints = (input: HintInput): readonly Hint[] => {
  const children = input.right ? 4 : 3
  const used =
    2 * FOOTER_PAD +
    input.copy.length +
    input.right.length +
    FOOTER_GAP * (children - 1)
  const room = Math.max(0, input.panelWidth - used)
  const tier = TIERS[input.mode]
    .map((candidate) => candidate.filter((hint) => live(hint, input)))
    .find((candidate) => widthOf(separated(candidate)) <= room)
  return tier === undefined ? [] : separated(tier)
}
