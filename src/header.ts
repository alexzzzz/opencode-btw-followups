import { quickMarker } from "./quick.ts"

export const HEADER_GAP = 2

export const HEADER_PAD = 2

export const HEADER_TITLE = "btw"

export const CLOSE_LABEL = "esc close"

export type HeaderCell = "count" | "marker" | "above" | "close" | "spacer"

export type HeaderRow = {
  readonly cells: readonly HeaderCell[]
  readonly count: string
  readonly above: string
  readonly marker: string
}

const FULL: readonly HeaderCell[] = ["count", "spacer", "marker", "spacer", "above", "close"]

const WITHOUT_COUNT: readonly HeaderCell[] = ["spacer", "marker", "spacer", "above", "close"]

const PLAIN: readonly HeaderCell[] = ["spacer", "marker", "spacer", "close"]

const ONLY_MARKER: readonly HeaderCell[] = ["spacer", "marker", "spacer"]

const TITLE_ONLY: readonly HeaderCell[] = []

const textOf = (row: HeaderRow, cell: HeaderCell) => {
  if (cell === "count") return row.count
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
): HeaderRow => {
  const above = aboveRows > 0 ? `↑ ${aboveRows} above` : ""
  const full = quickMarker(promptCount, open)
  const short = quickMarker(promptCount, open, "short")
  const number = quickMarker(promptCount, open, "number")
  const rows = [
    { cells: FULL, count, above, marker: full },
    { cells: WITHOUT_COUNT, count, above, marker: full },
    { cells: PLAIN, count, above, marker: full },
    { cells: PLAIN, count, above, marker: short },
    { cells: ONLY_MARKER, count, above, marker: short },
    { cells: ONLY_MARKER, count, above, marker: number },
    { cells: TITLE_ONLY, count, above, marker: "" },
  ].map(compacted)

  const fits = rows.find((row) => widthOf(row) <= panelWidth)
  return fits ?? compacted({ cells: TITLE_ONLY, count, above, marker: "" })
}
