export type AnswerToken = {
  readonly type: string
  readonly raw?: string
  readonly text?: string
  readonly ordered?: boolean
  readonly start?: number | ""
  readonly items?: readonly AnswerToken[]
  readonly tokens?: readonly AnswerToken[]
  readonly header?: readonly AnswerToken[]
  readonly rows?: readonly (readonly AnswerToken[])[]
}

const SNIPPET = 40

const LEAVES = new Set(["text", "escape", "codespan", "html"])

const WRAPPERS = new Set(["link", "image", "strong", "em", "del"])

const inline = (token: AnswerToken): string => {
  if (LEAVES.has(token.type)) return token.text ?? token.raw ?? ""
  if (token.type === "br") return "\n"
  if (WRAPPERS.has(token.type))
    return (token.tokens ?? []).map(inline).join("") || token.text || ""
  return token.text ?? ""
}

const inlineOf = (tokens: readonly AnswerToken[] | undefined) =>
  (tokens ?? []).map(inline).join("")

const textOf = (tokens: readonly AnswerToken[] | undefined, separator: string) =>
  (tokens ?? [])
    .map(blockText)
    .filter((text): text is string => text !== undefined)
    .join(separator)

const indented = (text: string, pad: string) =>
  text
    .split("\n")
    .map((line, index) => (index === 0 || line === "" ? line : pad + line))
    .join("\n")

const itemText = (item: AnswerToken, marker: string) =>
  indented(textOf(item.tokens, "\n"), " ".repeat(marker.length))
    .split("\n")
    .map((line, index) => (index === 0 ? marker + line : line))
    .join("\n")
    .trimEnd()

const listText = (list: AnswerToken) => {
  const start = typeof list.start === "number" ? list.start : 1
  const marker = (index: number) => (list.ordered === true ? `${start + index}. ` : "- ")
  return (list.items ?? [])
    .map((item, index) => itemText(item, marker(index)))
    .join("\n")
}

const cellText = (cell: AnswerToken | undefined) =>
  cell === undefined ? "" : inlineOf(cell.tokens) || cell.text || ""

const rowText = (row: readonly AnswerToken[] | undefined) =>
  (row ?? []).map(cellText).join(" | ")

const tableText = (table: AnswerToken) => {
  const header = table.header === undefined ? [] : [rowText(table.header)]
  const rows = (table.rows ?? []).map(rowText)
  return [...header, ...rows].join("\n")
}

export const blockText = (token: AnswerToken): string | undefined => {
  switch (token.type) {
    case "space":
    case "hr":
      return undefined
    case "code":
    case "html":
      return token.text?.trim() || undefined
    case "paragraph":
    case "heading":
      return inlineOf(token.tokens).trim() || token.text?.trim() || undefined
    case "blockquote":
      return textOf(token.tokens, "\n\n") || undefined
    case "list":
      return listText(token) || undefined
    case "table":
      return tableText(token) || undefined
    default:
      return token.raw?.trim() || undefined
  }
}

const firstLine = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? ""

export type BlockState = {
  readonly token: AnswerToken
  readonly renderable: unknown
}

export type BlockFrame = {
  readonly y: number
  readonly height: number
}

export type BlockOwner = {
  readonly y?: number | undefined
  readonly _blockStates?: readonly BlockState[]
}

export type BlockPlace = {
  readonly top: number
  readonly height: number
}

const frameOf = (renderable: unknown) => {
  const frame = renderable as BlockFrame | null | undefined
  if (!frame || typeof frame.y !== "number" || typeof frame.height !== "number") return undefined
  return frame
}

const placeOf = (owner: BlockOwner | null | undefined, state: BlockState) => {
  const frame = frameOf(state.renderable)
  if (frame === undefined) return undefined
  return { top: frame.y - (owner?.y ?? frame.y), height: frame.height }
}

export const blockTextOf = (
  owner: BlockOwner | null | undefined,
  renderable: unknown,
  fallback: string,
) => {
  const state = owner?._blockStates?.find((item) => item.renderable === renderable)
  if (state === undefined) return fallback
  return blockText(state.token) ?? fallback
}

export const blockPlace = (owner: BlockOwner | null | undefined, renderable: unknown) => {
  const state = owner?._blockStates?.find((item) => item.renderable === renderable)
  return state === undefined ? undefined : placeOf(owner, state)
}

export const blockRow = (owner: BlockOwner | null | undefined, row: number) => {
  const state = owner?._blockStates?.find((item) => {
    const frame = frameOf(item.renderable)
    return frame !== undefined && row >= frame.y && row < frame.y + frame.height
  })
  return state === undefined ? undefined : placeOf(owner, state)
}

export const copiedLabel = (text: string) => {
  const line = firstLine(text)
  if (line === "") return "Copied."
  return line.length > SNIPPET ? `Copied: ${line.slice(0, SNIPPET)}…` : `Copied: ${line}`
}
