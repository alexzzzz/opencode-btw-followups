import { quickMarker } from "./quick.ts"
import type { ReasoningState } from "./reasoning.ts"

export const HEADER_GAP = 2

export const HEADER_PAD = 2

export const HEADER_TITLE = "btw"

export const CLOSE_LABEL = "esc close"

export type HeaderCell = "count" | "reasoning" | "marker" | "above" | "close" | "spacer"

export type HeaderRow = {
  readonly cells: readonly HeaderCell[]
  readonly count: string
  readonly reasoning: string
  readonly above: string
  readonly marker: string
}

const REASONING_LABELS = {
  on: { full: "reasoning on", short: "reason on", least: "on" },
  off: { full: "reasoning off", short: "reason off", least: "off" },
  unsupported: { full: "reasoning n/a", short: "reason n/a", least: "n/a" },
} as const

const reasoningLabel = (state: ReasoningState, wording: keyof (typeof REASONING_LABELS)["on"]) =>
  REASONING_LABELS[state][wording]

const FULL: readonly HeaderCell[] = [
  "count",
  "spacer",
  "reasoning",
  "spacer",
  "marker",
  "spacer",
  "above",
  "close",
]

const WITHOUT_COUNT: readonly HeaderCell[] = [
  "spacer",
  "reasoning",
  "spacer",
  "marker",
  "spacer",
  "above",
  "close",
]

const WITHOUT_REASONING: readonly HeaderCell[] = ["spacer", "marker", "spacer", "above", "close"]

const PLAIN: readonly HeaderCell[] = ["spacer", "marker", "spacer", "close"]

const ONLY_MARKER: readonly HeaderCell[] = ["spacer", "marker", "spacer"]

const TITLE_ONLY: readonly HeaderCell[] = []

const textOf = (row: HeaderRow, cell: HeaderCell) => {
  if (cell === "count") return row.count
  if (cell === "reasoning") return row.reasoning
  if (cell === "marker") return row.marker
  if (cell === "above") return row.above
  if (cell === "close") return CLOSE_LABEL
  return ""
}

const widthOf = (row: HeaderRow) =>
  2 * HEADER_PAD +
  HEADER_TITLE.length +
  row.cells.length * HEADER_GAP +
  row.cells.reduce((width, cell) => width + textOf(row, cell).length, 0)

const compacted = (row: HeaderRow): HeaderRow => ({
  ...row,
  cells: row.cells.filter((cell) => cell === "spacer" || textOf(row, cell) !== ""),
})

export const headerRow = (
  panelWidth: number,
  count: string,
  aboveRows: number,
  promptCount: number,
  open: boolean,
  reasoning: ReasoningState = "on",
): HeaderRow => {
  const above = aboveRows > 0 ? `↑ ${aboveRows} above` : ""
  const full = quickMarker(promptCount, open)
  const short = quickMarker(promptCount, open, "short")
  const number = quickMarker(promptCount, open, "number")
  const rows = [
    {
      cells: FULL,
      count,
      reasoning: reasoningLabel(reasoning, "full"),
      above,
      marker: full,
    },
    {
      cells: WITHOUT_COUNT,
      count,
      reasoning: reasoningLabel(reasoning, "full"),
      above,
      marker: full,
    },
    {
      cells: WITHOUT_COUNT,
      count,
      reasoning: reasoningLabel(reasoning, "short"),
      above,
      marker: full,
    },
    {
      cells: WITHOUT_COUNT,
      count,
      reasoning: reasoningLabel(reasoning, "least"),
      above,
      marker: full,
    },
    { cells: WITHOUT_REASONING, count, reasoning: "", above, marker: full },
    { cells: PLAIN, count, reasoning: "", above, marker: full },
    { cells: PLAIN, count, reasoning: "", above, marker: short },
    { cells: ONLY_MARKER, count, reasoning: "", above, marker: short },
    { cells: ONLY_MARKER, count, reasoning: "", above, marker: number },
    { cells: TITLE_ONLY, count, reasoning: "", above, marker: "" },
  ].map(compacted)

  const fits = rows.find((row) => widthOf(row) <= panelWidth)
  return fits ?? rows.at(-1)!
}
