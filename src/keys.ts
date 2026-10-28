export type ListEffect = "open" | "close" | "close-window"

export const ctrlUp = (listed: boolean): ListEffect => (listed ? "close" : "open")

export const ctrlDown = (listed: boolean): ListEffect => (listed ? "close" : "close-window")

export const opensFromSession = (
  sessionID: string | undefined,
  windowSession: string | undefined,
): boolean => sessionID !== undefined && windowSession === undefined
