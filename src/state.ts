// The side thread, one per session.
//
// A thread is about one conversation, and every question resends the earlier turns, so
// a turn kept beside another session's is a turn the model reads as something said
// about a conversation it is not being asked about. The state therefore belongs to a
// session id and is never shared.
//
// Pure like the other two modules, because this is the part that decides whose thread a
// question lands in, so it is the part that has to be checked without a terminal.

import type { Turn } from "./prompt.ts"

/**
 * Why an answer is missing. The question travels with it so a reader can tell which one
 * was lost: a bare complaint about an empty answer is the kind of thing a reader cannot
 * act on.
 */
export type Failure = {
  readonly message: string
  readonly title?: string | undefined
  readonly question?: string | undefined
}

/**
 * Where the reader was in the transcript, and how much of it they were looking at.
 *
 * The extent is kept with the position because a bare row number cannot be put back: a
 * transcript that is still being laid out has a scroll height of its own, and a window
 * restored onto a shorter one would land in the wrong place.
 */
export type Reading = {
  readonly top: number
  readonly height: number
  readonly scrollHeight: number
}

/**
 * One side turn with the count of the session it was answered against.
 *
 * The two travel as one value because a turn without its count says nothing about the
 * conversation it was asked in, and two columns that must stay lined up are two columns
 * that can drift apart.
 */
export type SideTurn = {
  readonly turn: Turn
  readonly mark: number
}

/**
 * Everything one session holds: the thread on screen, the queue behind it, the request
 * in flight, the last thing that went wrong, and what the reader left behind.
 *
 * Held together rather than as separate maps because they are one thing read at once:
 * the dialog draws the thread, the queue and the failure in the same frame.
 *
 * Each turn carries the count of the session it was answered against. The count is kept
 * rather than the decision drawn from it, because the count is what a reader can check
 * and the divider is only a reading of it. They are written together, through `answered`,
 * and dropped together through `cleared`.
 *
 * `draft` and `place` are the reader's own: a question typed and not asked, and a
 * position in the transcript. Both are written when the window goes down.
 */
export type SideState = {
  readonly turns: readonly SideTurn[]
  readonly pending: readonly string[]
  readonly active: string | undefined
  readonly failure: Failure | undefined
  readonly draft: string
  readonly place: Reading | undefined
}

/**
 * A session nothing has been asked in reads as this, rather than as missing.
 *
 * Shared and frozen because it is what every session that has not been asked in yet
 * holds, and nothing ever writes to it: `change` copies before it changes anything.
 */
export const EMPTY: SideState = Object.freeze({
  turns: [],
  pending: [],
  active: undefined,
  failure: undefined,
  draft: "",
  place: undefined,
})

/** The state of every session this process has been asked about. */
export type Sides = ReadonlyMap<string, SideState>

/**
 * One session's state. Never a throw and never `undefined`: a session with no thread is
 * the ordinary case rather than a missing one, and a caller that had to tell the two
 * apart would answer "no thread" for a question asked in a session that simply had none.
 */
export const stateOf = (sides: Sides, sessionID: string): SideState => sides.get(sessionID) ?? EMPTY

/**
 * The same state with some of one session's fields replaced.
 *
 * A new map each time, because the dialog reads through getters holding the map they
 * were read from: a map changed in place would leave them drawing turns that are gone.
 *
 * `turns` is not one of the fields to write this way: a turn and the count of the
 * session it was answered against go in together, through `answered`, and the thread is
 * dropped whole through `cleared`.
 */
export const change = (sides: Sides, sessionID: string, changes: Partial<SideState>): Sides =>
  new Map(sides).set(sessionID, { ...stateOf(sides, sessionID), ...changes })

/**
 * A thread with one more turn on the end of it, and what the session held at that point.
 *
 * The two go in together because a turn without its count cannot be told from one asked
 * at another moment.
 */
export const answered = (sides: Sides, sessionID: string, turn: Turn, mark: number): Sides =>
  change(sides, sessionID, { turns: [...stateOf(sides, sessionID).turns, { turn, mark }] })

/**
 * The thread dropped whole, for a reader who wants the next answer to start from nothing.
 *
 * What goes is what the next question would carry as the side conversation: the turns,
 * and the failure that names a question not in them. What stays is everything the reader
 * did not ask to lose and the model does not read as history: a question typed and not
 * asked, the queue, and the request in flight, whose answer joins the emptied thread.
 */
export const cleared = (sides: Sides, sessionID: string): Sides =>
  change(sides, sessionID, { turns: [], failure: undefined })

/**
 * Whether the session has carried on since the last turn was answered.
 *
 * Read when a question is asked rather than when its answer lands, so the line between
 * two stretches of conversation is drawn while the reader is still waiting for the
 * second one. False on a thread with no turns: there is nothing to have moved on from.
 */
export const movedSince = (turns: readonly SideTurn[], count: number): boolean => {
  const last = turns.at(-1)
  return last !== undefined && count > last.mark
}

/**
 * Whether the line belongs under the turn at this index.
 *
 * The line marks the answer the session moved on from, so it hangs under that answer.
 * The newest turn has no later one to compare counts with, so the session as it stands
 * decides it, which is the same reading `movedSince` gives the question in flight.
 */
export const movedUnder = (turns: readonly SideTurn[], index: number, ahead: boolean): boolean => {
  const now = turns.at(index)
  if (now === undefined) return false
  const next = turns.at(index + 1)
  return next === undefined ? ahead : next.mark > now.mark
}

/**
 * Whether the prompt row of a session carries the badge.
 *
 * The badge says a question is being answered in that session and that the window for
 * it is not up, so it is the one thing the reader can reach while the answer is coming.
 * It belongs to the session the question was asked in, and it is drawn in that
 * session's row: a badge for another session's question would sit under a conversation
 * it is not about.
 */
export const waiting = (
  sides: Sides,
  sessionID: string | undefined,
  windowSession: string | undefined,
): boolean =>
  sessionID !== undefined &&
  stateOf(sides, sessionID).active !== undefined &&
  windowSession !== sessionID

/**
 * The state without one session's thread, for a session that no longer exists.
 *
 * The map it is given is returned unchanged when the session was not in it, so an event
 * for a session this plugin never heard of costs no repaint.
 */
export const forget = (sides: Sides, sessionID: string): Sides => {
  if (!sides.has(sessionID)) return sides
  const next = new Map(sides)
  next.delete(sessionID)
  return next
}