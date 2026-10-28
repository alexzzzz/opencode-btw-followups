export const PANEL_CHROME = 8

export const COMPOSER_ROWS = 6

export const MIN_PANEL = PANEL_CHROME + COMPOSER_ROWS

export const RAIL = "▎"

const TRANSCRIPT_SHARE = 0.6

export const transcriptRows = (terminalRows: number) => {
  const share = Math.floor(terminalRows * TRANSCRIPT_SHARE)
  const leftOver = terminalRows - MIN_PANEL
  return Math.max(0, Math.min(share, leftOver))
}
