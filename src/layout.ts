// The measurements the dialog keeps itself inside.
//
// The dialog is drawn over the session as a panel, and the panel is centred in the
// terminal. Every number here exists to keep the panel off the terminal edges,
// because a cell written outside the panel is not repainted when the panel closes
// and the session behind it is left with two copies of half its lines.

/**
 * The rows the dialog spends outside the transcript.
 *
 * The panel is `transcript` plus three gaps, the header, the footer and a row of bottom
 * padding, which is six rows, plus the panel's own top row from the host. The composer
 * is counted separately. One row is left over, so the panel never reaches the edge.
 */
export const CHROME = 8

/**
 * The tallest the question composer grows before it starts scrolling. It shares the
 * panel with the transcript, so the cap below pays for it up front.
 */
export const COMPOSER_ROWS = 6

/**
 * The rows the panel spends when the transcript is given none: the chrome plus the
 * tallest composer.
 *
 * A terminal exactly this tall has nothing left to divide, so the shortest one the
 * window opens on is this plus one, which is where `transcript` stops returning zero.
 * The README calls that fifteen rows, and the caller refuses anything shorter.
 */
export const MIN_PANEL = CHROME + COMPOSER_ROWS

/**
 * How tall the transcript may be on a terminal of the given height, or zero when the
 * terminal is too short to hold the panel at all.
 *
 * Two limits apply and the smaller wins: a share of the height, so the panel never
 * reaches an edge, and the room left over once the chrome and the tallest composer are
 * paid for. A cap that ignored the composer let the panel grow past the bottom of the
 * terminal, and a panel taller than the terminal writes cells the renderer never
 * repaints.
 */
export const transcript = (rows: number) => {
  const share = Math.floor(rows * 0.6)
  const room = rows - MIN_PANEL
  return Math.max(0, Math.min(share, room))
}

/**
 * The mark down the left of a question, a reply and the composer.
 *
 * A left one-quarter block rather than `│`: the box-drawing character draws its
 * stroke down the middle of the cell, while the block fills the left quarter, so the
 * rule sits against the text the way a margin does. The composer draws it as a
 * border rather than as a character, which is what keeps it one unbroken line
 * however many rows the field has grown to.
 */
export const RAIL = "▎"