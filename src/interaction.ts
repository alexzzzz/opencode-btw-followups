export const SESSION_OPEN_BIND = "ctrl+up"

export const THREAD_COPY_BIND = "ctrl+shift+c"

export type Hint = readonly [key: string, rest: string]

export type HintId = "list" | "jump" | "clear" | "retry" | "copy" | "queues"

export type InteractionMode = {
  readonly waiting: boolean
  readonly typed: boolean
  readonly listed: boolean
  readonly canClear: boolean
  readonly canRetry: boolean
  readonly canJump: boolean
}

export type FooterMode = "idle" | "idle-typed" | "waiting" | "waiting-typed"

export const footerMode = (mode: InteractionMode): FooterMode => {
  if (mode.waiting) return mode.typed ? "waiting-typed" : "waiting"
  return mode.typed ? "idle-typed" : "idle"
}

export type ListEffect = "open" | "close" | "close-window"

const ctrlUp = (listed: boolean): ListEffect => (listed ? "close" : "open")

const ctrlDown = (listed: boolean): ListEffect => (listed ? "close" : "close-window")

export const opensFromSession = (
  sessionID: string | undefined,
  windowSession: string | undefined,
): boolean => sessionID !== undefined && windowSession === undefined

export type Intent =
  | "page_up"
  | "page_down"
  | "home"
  | "end"
  | "list"
  | "step_down"
  | "clear"
  | "retry"
  | "copy_thread"
  | "recall_older"
  | "recall_newer"
  | "choose_up"
  | "choose_down"
  | "choose"
  | "close_list"
  | "queue"

export type Binding = {
  readonly id: string
  readonly bind: string
  readonly title: string
  readonly intent: Intent
  readonly enabled: () => boolean
  readonly effect: () => ListEffect | undefined
  readonly palette?: true
}

type Key = {
  readonly id: string
  readonly bind: string
  readonly title: string
  readonly intent: Intent
  readonly enabled: (mode: InteractionMode) => boolean
  readonly effect?: (listed: boolean) => ListEffect
  readonly command?: boolean
  readonly palette?: true
}

type HintDef = {
  readonly id: HintId
  readonly rest: string
  readonly live: (mode: InteractionMode) => boolean
}

type Group = {
  readonly keys: readonly Key[]
  readonly hint?: HintDef
}

const always = (_mode: InteractionMode): boolean => true

const GROUPS: readonly Group[] = [
  {
    keys: [
      {
        id: "session.aside.page_up",
        bind: "pageup",
        title: "Page up",
        intent: "page_up",
        enabled: always,
      },
    ],
  },
  {
    keys: [
      {
        id: "session.aside.page_down",
        bind: "pagedown",
        title: "Page down",
        intent: "page_down",
        enabled: always,
      },
    ],
  },
  {
    keys: [
      {
        id: "session.aside.home",
        bind: "ctrl+home",
        title: "First question",
        intent: "home",
        enabled: always,
      },
      {
        id: "session.aside.end",
        bind: "ctrl+end",
        title: "Newest answer",
        intent: "end",
        enabled: always,
      },
    ],
    hint: { id: "jump", rest: " jump", live: (mode) => mode.canJump },
  },
  {
    keys: [
      {
        id: "session.aside.list",
        bind: SESSION_OPEN_BIND,
        title: "Quick prompts",
        intent: "list",
        enabled: always,
        effect: ctrlUp,
      },
      {
        id: "session.aside.step_down",
        bind: "ctrl+down",
        title: "Close the prompt list or the window",
        intent: "step_down",
        enabled: always,
        effect: ctrlDown,
      },
    ],
    hint: { id: "list", rest: " prompts", live: (mode) => !mode.typed },
  },
  {
    keys: [
      {
        id: "session.aside.clear",
        bind: "delete",
        title: "Clear the side thread",
        intent: "clear",
        enabled: (mode) => !mode.waiting && !mode.listed && !mode.typed,
      },
    ],
    hint: {
      id: "clear",
      rest: " clear thread",
      live: (mode) => mode.canClear && !mode.waiting && !mode.listed && !mode.typed,
    },
  },
  {
    keys: [
      {
        id: "session.aside.retry",
        bind: "enter",
        title: "Retry the failed question",
        intent: "retry",
        enabled: (mode) => mode.canRetry && !mode.waiting && !mode.listed && !mode.typed,
      },
    ],
    hint: {
      id: "retry",
      rest: " retry",
      live: (mode) => mode.canRetry && !mode.waiting && !mode.listed && !mode.typed,
    },
  },
  {
    keys: [
      {
        id: "session.aside.copy",
        bind: THREAD_COPY_BIND,
        title: "Copy the whole side thread",
        intent: "copy_thread",
        enabled: (mode) => mode.canClear,
        palette: true,
      },
    ],
    hint: { id: "copy", rest: " copy thread", live: (mode) => mode.canClear },
  },
  {
    keys: [
      {
        id: "session.aside.recall_older",
        bind: "up",
        title: "Earlier question",
        intent: "recall_older",
        enabled: (mode) => !mode.listed,
      },
    ],
  },
  {
    keys: [
      {
        id: "session.aside.recall_newer",
        bind: "down",
        title: "Later question",
        intent: "recall_newer",
        enabled: (mode) => !mode.listed,
      },
    ],
  },
  {
    keys: [
      {
        id: "session.aside.choose_up",
        bind: "up",
        title: "Previous quick prompt",
        intent: "choose_up",
        enabled: (mode) => mode.listed,
      },
    ],
  },
  {
    keys: [
      {
        id: "session.aside.choose_down",
        bind: "down",
        title: "Next quick prompt",
        intent: "choose_down",
        enabled: (mode) => mode.listed,
      },
    ],
  },
  {
    keys: [
      {
        id: "session.aside.choose",
        bind: "enter",
        title: "Ask the picked quick prompt",
        intent: "choose",
        enabled: (mode) => mode.listed,
      },
    ],
  },
  {
    keys: [
      {
        id: "session.aside.close_list",
        bind: "escape",
        title: "Close the prompt list",
        intent: "close_list",
        enabled: (mode) => mode.listed,
      },
    ],
  },
  {
    keys: [
      {
        id: "session.aside.queue",
        bind: "enter",
        title: "",
        intent: "queue",
        enabled: always,
        command: false,
      },
    ],
    hint: {
      id: "queues",
      rest: " queues",
      live: (mode) => mode.waiting && mode.typed,
    },
  },
]

export const bindings = (mode: () => InteractionMode): readonly Binding[] =>
  GROUPS.flatMap((group) =>
    group.keys
      .filter((key) => key.command !== false)
      .map((key) => ({
        id: key.id,
        bind: key.bind,
        title: key.title,
        intent: key.intent,
        enabled: () => key.enabled(mode()),
        effect: () => key.effect?.(mode().listed),
        ...(key.palette === true ? { palette: true as const } : {}),
      })),
  )

const TIERS: Record<FooterMode, readonly (readonly HintId[])[]> = {
  idle: [
    ["retry", "list", "jump", "clear", "copy"],
    ["retry", "list", "jump", "clear"],
    ["retry", "list", "jump"],
    ["retry", "list"],
    ["retry", "jump"],
    ["jump"],
  ],
  "idle-typed": [["jump", "copy"], ["jump"]],
  waiting: [["list", "jump", "copy"], ["list", "jump"], ["list"], ["jump"]],
  "waiting-typed": [["queues", "jump", "copy"], ["queues", "jump"], ["queues"]],
}

const SEPARATOR = " · "

type HintOf = { readonly label: string; readonly rest: string; readonly live: (mode: InteractionMode) => boolean }

const combinedLabel = (binds: readonly string[]): string => {
  const first = binds[0] ?? ""
  if (binds.length < 2) return first
  let prefix = 0
  while (prefix < first.length && binds.every((bind) => bind[prefix] === first[prefix])) prefix++
  return first.slice(0, prefix) + binds.map((bind) => bind.slice(prefix)).join("/")
}

const hintsOf = (): Map<HintId, HintOf> => {
  const defs = new Map<HintId, HintOf>()
  for (const group of GROUPS) {
    if (!group.hint) continue
    defs.set(group.hint.id, {
      label: combinedLabel(group.keys.map((key) => key.bind)),
      rest: group.hint.rest,
      live: group.hint.live,
    })
  }
  return defs
}

const separated = (tier: readonly Hint[]): readonly Hint[] =>
  tier.map(([key, rest], index) => [
    key,
    index === tier.length - 1 ? rest : rest + SEPARATOR,
  ])

const widthOf = (tier: readonly Hint[]) =>
  tier.reduce((width, [key, rest]) => width + key.length + rest.length, 0)

export const hints = (mode: InteractionMode, room: number): readonly Hint[] => {
  const defs = hintsOf()
  const tier = TIERS[footerMode(mode)]
    .map((ids) =>
      ids
        .map((id) => defs.get(id))
        .filter((def): def is HintOf => def !== undefined && def.live(mode))
        .map((def): Hint => [def.label, def.rest]),
    )
    .find((candidate) => widthOf(separated(candidate)) <= room)
  return tier === undefined ? [] : separated(tier)
}
