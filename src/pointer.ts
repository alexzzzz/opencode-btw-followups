import { RAIL } from "./rail.ts"

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

export type AnswerBlock = {
  readonly kind: string
  readonly raw: string
  readonly text: string
  readonly children: readonly AnswerBlock[]
  readonly ordered?: boolean
  readonly start?: number
}

export const answerToken = (block: AnswerBlock): AnswerToken => {
  const children = block.children.map(answerToken)
  switch (block.kind) {
    case "list":
      return {
        type: "list",
        raw: block.raw,
        text: block.text,
        items: children,
        ordered: block.ordered ?? false,
        ...(block.start === undefined ? {} : { start: block.start }),
      }
    case "item":
      return { type: "list_item", raw: block.raw, text: block.text, tokens: children }
    case "table": {
      const rows = block.children.map((row) => row.children.map(answerToken))
      const [header, ...body] = rows
      return {
        type: "table",
        raw: block.raw,
        text: block.text,
        rows: body,
        ...(header === undefined ? {} : { header }),
      }
    }
    case "cell":
      return { type: "text", raw: block.raw, text: block.text, tokens: children }
    case "rule":
      return { type: "hr", raw: block.raw }
    case "quote":
      return { type: "blockquote", raw: block.raw, text: block.text, tokens: children }
    default:
      return { type: block.kind, raw: block.raw, text: block.text, tokens: children }
  }
}

export type PointerEvent = {
  readonly x: number
  readonly y: number
}

export type PointerSurface = {
  readonly answer: unknown
  readonly markdown: unknown
}

export type BlockPlace = {
  readonly top: number
  readonly height: number
}

export type AnswerPointer = {
  readonly place: BlockPlace | undefined
  readonly rail: string
  readonly copy: string
}

export type SelectionGuard = () => boolean

const SNIPPET = 40

export const emptyPointer: AnswerPointer = { place: undefined, rail: "", copy: "" }

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

const blockText = (token: AnswerToken): string | undefined => {
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

type BlockState = {
  readonly token: AnswerToken
  readonly renderable: unknown
}

type BlockOwner = {
  readonly y?: number | undefined
  readonly _blockStates?: readonly BlockState[]
}

type Frame = {
  readonly x?: number
  readonly y: number
  readonly width?: number
  readonly height: number
}

const frameOf = (renderable: unknown) => {
  const frame = renderable as Frame | null | undefined
  if (!frame || typeof frame.y !== "number" || typeof frame.height !== "number") return undefined
  return frame
}

const answerOf = (renderable: unknown) => {
  const frame = frameOf(renderable)
  if (!frame || typeof frame.x !== "number" || typeof frame.width !== "number") return undefined
  return frame as { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
}

const ownerOf = (renderable: unknown): BlockOwner | undefined => {
  const owner = renderable as BlockOwner | null | undefined
  if (!owner || !Array.isArray(owner._blockStates)) return undefined
  return owner
}

const placeOf = (owner: BlockOwner | undefined, state: BlockState) => {
  const frame = frameOf(state.renderable)
  if (frame === undefined) return undefined
  return { top: frame.y - (owner?.y ?? frame.y), height: frame.height }
}

const under = (owner: BlockOwner | undefined, row: number) => {
  for (const state of owner?._blockStates ?? []) {
    const frame = frameOf(state.renderable)
    if (frame && row >= frame.y && row < frame.y + frame.height) {
      const place = placeOf(owner, state)
      if (place) return { place, state }
    }
  }
  return undefined
}

const railOf = (place: BlockPlace) =>
  `${"\n".repeat(place.top)}${`${RAIL}\n`.repeat(place.height).trimEnd()}`

export const pointerAt = (
  event: PointerEvent,
  surface: PointerSurface,
  selecting: SelectionGuard,
  copyable: SelectionGuard = () => true,
): AnswerPointer => {
  if (selecting()) return emptyPointer
  const answer = answerOf(surface.answer)
  if (!answer) return emptyPointer
  const inside =
    event.x >= answer.x &&
    event.x < answer.x + answer.width &&
    event.y >= answer.y &&
    event.y < answer.y + answer.height
  if (!inside) return emptyPointer
  const found = under(ownerOf(surface.markdown), event.y)
  if (!found) return emptyPointer
  return {
    place: found.place,
    rail: railOf(found.place),
    copy: copyable() ? (blockText(found.state.token) ?? "") : "",
  }
}

export const samePointer = (before: AnswerPointer, after: AnswerPointer) =>
  before.place?.top === after.place?.top &&
  before.place?.height === after.place?.height &&
  before.rail === after.rail &&
  before.copy === after.copy

const firstLine = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? ""

export const copiedLabel = (text: string) => {
  const line = firstLine(text)
  if (line === "") return "Copied."
  return line.length > SNIPPET ? `Copied: ${line.slice(0, SNIPPET)}…` : `Copied: ${line}`
}
