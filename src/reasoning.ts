export type ReasoningModel = {
  readonly providerID: string
  readonly modelID: string
  readonly package?: string
  readonly compatibility?: Record<string, unknown>
  readonly variants?: readonly { readonly settings?: Record<string, unknown> }[]
}

export type ModelRef = {
  readonly providerID: string
  readonly modelID: string
}

export type ReasoningSupport = "supported" | "unsupported"

export type ReasoningState = "on" | "off" | "unsupported" | { readonly level: string }

export type ReasoningDecision =
  | { readonly state: "unchanged" }
  | { readonly state: "unsupported" }
  | { readonly state: "applied"; readonly options: Record<string, unknown> }
  | {
      readonly state: "reduced"
      readonly options: Record<string, unknown>
      readonly level: string
    }

type Family =
  | "anthropic"
  | "effort"
  | "gemini"
  | "cohere"
  | "alibaba"
  | "zai"
  | "venice"
  | "bedrock"
  | "unknown"

const ALWAYS_REASONS = [
  /^o[134](?:$|[-.])/,
  /^gpt-5(?:$|-)/,
  /^gpt-oss(?:$|-)/,
  /^codex(?:$|-)/,
  /^deepseek-(?:r1|reasoner)(?:$|[-.])/,
]

const CLAUDE_REASONER = /claude-(?:opus|sonnet|haiku)-(?:3[.-]7|[4-9])/i

const REASONING_MODELS: Partial<Record<Family, RegExp>> = {
  anthropic: CLAUDE_REASONER,
  bedrock: CLAUDE_REASONER,
  effort: /^(?:gpt-5\.\d|magistral|mistral-large|grok-[3-9])/i,
  gemini: /^gemini-(?:2\.5|[3-9])/i,
  cohere: /^command-a/i,
  alibaba: /^qwen3/i,
  zai: /^glm-(?:4\.[5-9]|[5-9])/i,
}

const DISABLED_THINKING: Record<string, unknown> = { thinking: { type: "disabled" } }

const EFFORT_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const

type EffortLevel = (typeof EFFORT_LEVELS)[number]

const EXPENSIVE_LEVEL = EFFORT_LEVELS.indexOf("high")

const FAMILY_HINTS: readonly { readonly family: Family; readonly words: readonly string[] }[] = [
  { family: "anthropic", words: ["anthropic", "claude"] },
  { family: "bedrock", words: ["bedrock"] },
  { family: "gemini", words: ["google", "gemini", "vertex"] },
  { family: "cohere", words: ["cohere"] },
  { family: "alibaba", words: ["alibaba", "dashscope", "qwen"] },
  { family: "zai", words: ["zai", "zhipu", "glm"] },
  { family: "venice", words: ["venice"] },
  { family: "effort", words: ["openai", "azure", "xai", "mistral", "copilot"] },
]

const familyFrom = (hint: string | undefined): Family | undefined => {
  if (!hint) return undefined
  const name = hint.toLowerCase()
  return FAMILY_HINTS.find((entry) => entry.words.some((word) => name.includes(word)))?.family
}

const familyOf = (model: ReasoningModel): Family =>
  familyFrom(model.package) ?? familyFrom(model.providerID) ?? "unknown"

const knownReasoner = (family: Family, model: ReasoningModel) =>
  REASONING_MODELS[family]?.test(model.modelID) ?? true

const disabledThinking = (): ReasoningDecision => ({
  state: "applied",
  options: { ...DISABLED_THINKING },
})

const decisionFor = (family: Family, model: ReasoningModel): ReasoningDecision => {
  if (!knownReasoner(family, model)) return { state: "unsupported" }
  if (family === "anthropic" || family === "bedrock" || family === "cohere" || family === "zai") {
    return disabledThinking()
  }
  if (family === "gemini") {
    return {
      state: "applied",
      options: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
    }
  }
  if (family === "alibaba") {
    return { state: "applied", options: { enableThinking: false } }
  }
  if (family === "venice") {
    return { state: "applied", options: { reasoning: { enabled: false } } }
  }
  if (family === "effort") {
    return ALWAYS_REASONS.some((pattern) => pattern.test(model.modelID))
      ? { state: "unsupported" }
      : { state: "applied", options: { reasoningEffort: "none" } }
  }
  return { state: "unsupported" }
}

export const modelEntry = (
  ref: ModelRef | undefined,
  known: readonly ReasoningModel[] | undefined,
): ReasoningModel | undefined =>
  ref && known?.find((item) => item.providerID === ref.providerID && item.modelID === ref.modelID)

const disablesReasoning = (settings: Record<string, unknown> | undefined): boolean => {
  if (!settings) return false
  const effort = settings.reasoningEffort
  if (typeof effort === "string" && effort.toLowerCase() === "none") return true
  if ((settings.thinking as { readonly type?: unknown } | undefined)?.type === "disabled") return true
  if ((settings.reasoning as { readonly enabled?: unknown } | undefined)?.enabled === false) return true
  if ((settings.thinkingConfig as { readonly thinkingBudget?: unknown } | undefined)?.thinkingBudget === 0)
    return true
  return settings.enableThinking === false
}

const offVariant = (model: ReasoningModel): Record<string, unknown> | undefined =>
  model.variants?.find((variant) => disablesReasoning(variant.settings))?.settings

const levelOf = (value: unknown): EffortLevel | undefined => {
  if (typeof value !== "string") return undefined
  const level = value.toLowerCase() as EffortLevel
  return (EFFORT_LEVELS as readonly string[]).includes(level) ? level : undefined
}

const settingsLevel = (settings: Record<string, unknown>): EffortLevel | undefined => {
  const config = settings.thinkingConfig as
    | { readonly includeThoughts?: unknown; readonly thinkingLevel?: unknown }
    | undefined
  const thinking = settings.thinking as { readonly effort?: unknown } | undefined
  return (
    levelOf(settings.reasoningEffort) ??
    levelOf(settings.effort) ??
    levelOf(thinking?.effort) ??
    (config?.includeThoughts === true ? levelOf(config.thinkingLevel) : undefined)
  )
}

const catalogueDecision = (model: ReasoningModel): ReasoningDecision | undefined => {
  let chosen: { readonly settings: Record<string, unknown>; readonly level: EffortLevel } | undefined
  for (const variant of model.variants ?? []) {
    const settings = variant.settings
    if (!settings) continue
    const level = settingsLevel(settings)
    if (level === undefined) continue
    if (
      chosen === undefined ||
      EFFORT_LEVELS.indexOf(level) < EFFORT_LEVELS.indexOf(chosen.level)
    ) {
      chosen = { settings, level }
    }
  }
  if (chosen === undefined) return undefined
  if (chosen.level === "none") return { state: "applied", options: { ...chosen.settings } }
  if (EFFORT_LEVELS.indexOf(chosen.level) >= EXPENSIVE_LEVEL) return { state: "unsupported" }
  return { state: "reduced", options: { ...chosen.settings }, level: chosen.level }
}

export const reasoningOptions = (model: ReasoningModel, enabled: boolean): ReasoningDecision => {
  if (enabled) return { state: "unchanged" }
  if (model.compatibility?.requireReasoning === true) return { state: "unsupported" }
  const variant = offVariant(model)
  if (variant) return { state: "applied", options: { ...variant } }
  const catalogue = catalogueDecision(model)
  if (catalogue) return catalogue
  return decisionFor(familyOf(model), model)
}

export const reasoningSupport = (model: ReasoningModel): ReasoningSupport => {
  const state = reasoningOptions(model, false).state
  return state === "applied" || state === "reduced" ? "supported" : "unsupported"
}

export const reasoningStateLabel = (decision: ReasoningDecision): ReasoningState => {
  if (decision.state === "unsupported") return "unsupported"
  if (decision.state === "reduced") return { level: decision.level }
  return decision.state === "unchanged" ? "on" : "off"
}
