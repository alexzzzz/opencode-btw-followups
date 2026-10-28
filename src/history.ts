export const HISTORY_LIMIT = 200

export type Browse = {
  readonly index: number | null
  readonly draft: string
}

export type Recall = {
  readonly browse: Browse
  readonly text: string
  readonly cursor: number
}

export const NOT_BROWSING: Browse = Object.freeze({ index: null, draft: "" })

export const remembered = (items: readonly string[], question: string): readonly string[] => {
  const asked = question.trim()
  if (!asked) return items
  if (items.at(-1) === asked) return items
  return [...items, asked].slice(-HISTORY_LIMIT)
}

export const recalled = (
  items: readonly string[],
  browse: Browse,
  direction: -1 | 1,
  text: string,
  cursor: number,
): Recall | undefined => {
  if (items.length === 0) return undefined
  const at = Math.max(0, Math.min(cursor, text.length))
  if (direction === -1 ? at !== 0 : at !== text.length) return undefined
  if (browse.index === null) {
    if (direction === 1) return undefined
    const index = items.length - 1
    return { browse: { index, draft: text }, text: items[index]!, cursor: 0 }
  }
  const index = browse.index + direction
  if (index < 0) return undefined
  if (index >= items.length) {
    return { browse: { index: null, draft: browse.draft }, text: browse.draft, cursor: browse.draft.length }
  }
  return {
    browse: { index, draft: browse.draft },
    text: items[index]!,
    cursor: direction === -1 ? 0 : items[index]!.length,
  }
}
