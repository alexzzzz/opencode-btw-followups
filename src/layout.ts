export const COMPOSER_ROWS = 6

const PANEL_CHROME = 8

const MIN_PANEL = PANEL_CHROME + COMPOSER_ROWS

const TRANSCRIPT_SHARE = 0.6

const transcriptRows = (terminalRows: number) => {
  const share = Math.floor(terminalRows * TRANSCRIPT_SHARE)
  const leftOver = terminalRows - MIN_PANEL
  return Math.max(0, Math.min(share, leftOver))
}

export const listTranscriptRoom = (terminalRows: number, composerRows: number) => {
  const share = Math.floor(terminalRows * TRANSCRIPT_SHARE)
  const leftOver = terminalRows - PANEL_CHROME - composerRows
  return Math.max(0, Math.min(share, leftOver))
}

const listTranscriptRows = (terminalRows: number, composerRows: number, needed: number) =>
  Math.max(
    transcriptRows(terminalRows),
    Math.min(needed, listTranscriptRoom(terminalRows, composerRows)),
  )

export type PanelInput = {
  readonly rows: number
  readonly listed: boolean
  readonly composerRows: number
  readonly needed: number
}

export type PanelGeometry = {
  readonly maxHeight: number
  readonly minHeight: number
}

export const panelHeights = (input: PanelInput): PanelGeometry => {
  const max = input.listed
    ? listTranscriptRows(input.rows, input.composerRows, input.needed)
    : transcriptRows(input.rows)
  return { maxHeight: max, minHeight: input.listed ? Math.min(input.needed, max) : 0 }
}
