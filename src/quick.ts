export const QUICK_PROMPTS = [
  "How's it going?",
  "What's left to do?",
  "What else does this touch?",
  "How do I verify this?",
  "What are you least confident about?",
  "What am I missing?",
] as const

const WORDINGS = { full: " quick prompts", short: " prompts", number: "" } as const

export const quickMarker = (
  count: number,
  open: boolean,
  wording: keyof typeof WORDINGS = "full",
) => `${open ? "▾" : "▸"} ${count}${WORDINGS[wording]}`

const ROW_GAP = 1

const CARD_PAD_X = 2

const CARD_PAD_Y = 1

export const quickNumberColumn = (count: number) => `${count}.`.length

export const quickCardWidth = (prompts: readonly string[]) =>
  Math.max(...prompts.map((prompt) => prompt.length)) +
  quickNumberColumn(prompts.length) +
  ROW_GAP +
  2 * CARD_PAD_X

export const quickCardRows = (count: number) => count + 2 * CARD_PAD_Y

export const quickCardDress = (count: number, room: number): "padded" | "plain" =>
  room >= quickCardRows(count) ? "padded" : "plain"

export const nextChoice = (chosen: number, step: number, count: number) =>
  (chosen + step + count) % count
