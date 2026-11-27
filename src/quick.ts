export const QUICK_PROMPTS = [
  "How's it going?",
  "What's left to do?",
  "What else does this touch?",
  "What are you least confident about?",
  "What am I missing?",
  "What's new since your last answer?",
] as const

const WORDINGS = { full: " quick prompts", short: " prompts", number: "" } as const

export const quickMarker = (
  count: number,
  open: boolean,
  wording: keyof typeof WORDINGS = "full",
) => `${open ? "▾" : "▸"} ${count}${WORDINGS[wording]}`

const CARD_MARGIN_X = 1

const ROW_GAP = 1

const CARD_PAD_X = 2

const CARD_PAD_Y = 1

export type QuickPlace = {
  readonly top: number
  readonly height: number
}

export type QuickCardGeometry = {
  readonly width: number
  readonly rows: number
  readonly dress: "padded" | "plain"
  readonly viewport: number
  readonly places: readonly QuickPlace[]
}

export const quickNumberColumn = (count: number) => `${count}.`.length

export const quickCardWidth = (prompts: readonly string[]) =>
  Math.max(...prompts.map((prompt) => prompt.length)) +
  quickNumberColumn(prompts.length) +
  ROW_GAP +
  2 * CARD_PAD_X

const wrappedRows = (text: string, width: number) => {
  let rows = 1
  let used = 0
  for (const word of text.split(" ")) {
    if (used > 0 && used + 1 + word.length <= width) {
      used += 1 + word.length
      continue
    }
    if (used > 0) rows += 1
    if (word.length <= width) {
      used = word.length
      continue
    }
    const chunks = Math.ceil(word.length / width)
    rows += chunks - 1
    used = word.length - (chunks - 1) * width
  }
  return rows
}

export const quickCardGeometry = (
  prompts: readonly string[],
  panelWidth: number,
  room: number,
): QuickCardGeometry => {
  const width = Math.max(
    0,
    Math.min(quickCardWidth(prompts), Math.floor(panelWidth) - 2 * CARD_MARGIN_X),
  )
  const textWidth = Math.max(1, width - 2 * CARD_PAD_X - quickNumberColumn(prompts.length) - ROW_GAP)
  const heights = prompts.map((prompt) => wrappedRows(prompt, textWidth))
  const plainRows = heights.reduce((sum, height) => sum + height, 0)
  const dress = room >= plainRows + 2 * CARD_PAD_Y ? "padded" : "plain"
  const rows = plainRows + (dress === "padded" ? 2 * CARD_PAD_Y : 0)
  let top = dress === "padded" ? CARD_PAD_Y : 0
  const places = heights.map((height) => {
    const place = { top, height }
    top += height
    return place
  })
  return {
    width,
    rows,
    dress,
    viewport: Math.max(0, Math.min(rows, Math.floor(room))),
    places,
  }
}

export const quickChoiceScroll = (
  card: QuickCardGeometry,
  chosen: number,
  current: number,
) => {
  if (card.viewport === 0) return 0
  const place = card.places[chosen]
  if (place === undefined) return current
  const max = Math.max(0, card.rows - card.viewport)
  const scroll = Math.max(0, Math.min(max, Math.floor(current)))
  if (place.height >= card.viewport) return Math.max(0, Math.min(max, place.top))
  if (place.top < scroll) return place.top
  if (place.top + place.height > scroll + card.viewport) {
    return Math.max(0, Math.min(max, place.top + place.height - card.viewport))
  }
  return scroll
}

export const nextChoice = (chosen: number, step: number, count: number) =>
  (chosen + step + count) % count
