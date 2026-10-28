import type { Turn } from "./prompt.ts"

export type Failure = {
  readonly message: string
  readonly title?: string | undefined
  readonly question?: string | undefined
}

export type Reading = {
  readonly top: number
  readonly height: number
  readonly scrollHeight: number
}

export type SideTurn = {
  readonly turn: Turn
  readonly spokenAt: number
}

export type SideState = {
  readonly turns: readonly SideTurn[]
  readonly asked: readonly string[]
  readonly pending: readonly string[]
  readonly active: string | undefined
  readonly failure: Failure | undefined
  readonly draft: string
  readonly place: Reading | undefined
}

export const EMPTY: SideState = Object.freeze({
  turns: [],
  asked: [],
  pending: [],
  active: undefined,
  failure: undefined,
  draft: "",
  place: undefined,
})

export type Sides = ReadonlyMap<string, SideState>

export const stateOf = (sides: Sides, sessionID: string): SideState => sides.get(sessionID) ?? EMPTY

export const change = (sides: Sides, sessionID: string, changes: Partial<SideState>): Sides =>
  new Map(sides).set(sessionID, { ...stateOf(sides, sessionID), ...changes })

export const answered = (sides: Sides, sessionID: string, turn: Turn, spokenAt: number): Sides =>
  change(sides, sessionID, { turns: [...stateOf(sides, sessionID).turns, { turn, spokenAt }] })

export const cleared = (sides: Sides, sessionID: string): Sides =>
  change(sides, sessionID, { turns: [], failure: undefined })

export const forget = (sides: Sides, sessionID: string): Sides => {
  if (!sides.has(sessionID)) return sides
  const next = new Map(sides)
  next.delete(sessionID)
  return next
}

export const showsBadge = (
  sides: Sides,
  sessionID: string | undefined,
  windowSession: string | undefined,
): boolean =>
  sessionID !== undefined &&
  stateOf(sides, sessionID).active !== undefined &&
  windowSession !== sessionID

export const movedSinceLast = (turns: readonly SideTurn[], spoken: number): boolean => {
  const last = turns.at(-1)
  return last !== undefined && spoken > last.spokenAt
}

export const gapBelow = (
  turns: readonly SideTurn[],
  index: number,
  movedSinceLast: boolean,
): boolean => {
  const here = turns[index]
  if (here === undefined) return false
  const next = turns[index + 1]
  return next === undefined ? movedSinceLast : next.spokenAt > here.spokenAt
}
